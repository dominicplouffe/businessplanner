#!/usr/bin/env bash
#
# Venturelly on AWS Lightsail, connected to getventurely.com.
#
#   scripts/lightsail.sh init      create deploy/.env.production with generated secrets
#   scripts/lightsail.sh up        create the server, static IP, firewall, DNS; then deploy
#   scripts/lightsail.sh deploy    build the app, ship it, migrate, restart
#   scripts/lightsail.sh status    what exists, where DNS points, whether the site answers
#   scripts/lightsail.sh ssh       a shell on the server
#   scripts/lightsail.sh logs      follow the app's logs
#   scripts/lightsail.sh backup    download a database dump now
#   scripts/lightsail.sh allow-ssh let SSH in from your current IP address
#   scripts/lightsail.sh destroy   remove it all, after a backup and a final snapshot
#
# Everything is safe to run twice: each step checks what exists first.
# Settings (environment variables, with defaults):
#   AWS_PROFILE=dplouffe  REGION=us-east-1  DOMAIN=getventurely.com
#   NAME=venturelly       BUNDLE=small_3_0 (2 GB RAM, 2 vCPU, ~$12/month)
#
# See deploy/README.md.

set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-dplouffe}"
REGION="${REGION:-us-east-1}"
DOMAIN="${DOMAIN:-getventurely.com}"
NAME="${NAME:-venturelly}"
BUNDLE="${BUNDLE:-small_3_0}"
BLUEPRINT="${BLUEPRINT:-ubuntu_24_04}"
ZONE="${REGION}a"
STATIC_IP_NAME="${NAME}-ip"
KEY_NAME="${NAME}-key"
REMOTE_DIR="/opt/venturelly"
REMOTE_USER="ubuntu"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT/deploy"
ENV_FILE="$DEPLOY_DIR/.env.production"
BACKUP_DIR="$DEPLOY_DIR/backups"
KEY_FILE="$HOME/.ssh/${KEY_NAME}.pem"
KNOWN_HOSTS="$HOME/.ssh/${NAME}_known_hosts"

export AWS_PROFILE
export AWS_PAGER=""

# ------------------------------------------------------------------ output

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

ls_() { aws lightsail --region "$REGION" "$@"; }

# ------------------------------------------------------------------ checks

need_tools() {
  local missing=()
  for tool in aws jq ssh scp openssl "$@"; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  [ ${#missing[@]} -eq 0 ] || die "Missing: ${missing[*]}. Install them and run again."
}

# The daemon, not the client: `docker --version` contacts nothing and succeeds
# on a machine whose socket this user cannot open.
need_docker() {
  local server
  server="$(docker version --format '{{.Server.Version}}' 2>&1)" \
    || die "Docker is installed but its daemon cannot be reached: $server
  Start Docker, or add yourself to the docker group (sudo usermod -aG docker \$USER, then log in again)."
  ok "Docker daemon $server"
}

# Which account and zone this is about to change, said before anything is.
check_aws() {
  local who
  who="$(aws sts get-caller-identity --query '[Account,Arn]' --output text 2>&1)" \
    || die "AWS profile '$AWS_PROFILE' cannot sign in: $who"
  ok "AWS profile $AWS_PROFILE → $(echo "$who" | awk '{print $2}')"
  ZONE_ID="$(hosted_zone_id)"
  [ -n "$ZONE_ID" ] || die "No Route 53 hosted zone named $DOMAIN in profile $AWS_PROFILE. Set AWS_PROFILE to the profile that holds it."
  ok "Route 53 zone $DOMAIN ($ZONE_ID)"
}

hosted_zone_id() {
  # Exact name match: a name search returns the next zone alphabetically
  # when the one asked for is absent.
  aws route53 list-hosted-zones-by-name --dns-name "$DOMAIN" --max-items 1 \
    --query "HostedZones[?Name=='${DOMAIN}.' && Config.PrivateZone==\`false\`].Id | [0]" --output text \
    | sed 's|/hostedzone/||; s|^None$||'
}

instance_json() { ls_ get-instance --instance-name "$NAME" 2>/dev/null || true; }
instance_exists() { [ -n "$(instance_json)" ]; }

# Only an instance this script made — tagged app=venturelly — is ever changed.
instance_is_ours() {
  instance_json | jq -e --arg n "$NAME" '.instance.tags // [] | any(.key=="app" and .value==$n)' >/dev/null
}

static_ip() {
  ls_ get-static-ip --static-ip-name "$STATIC_IP_NAME" --query 'staticIp.ipAddress' --output text 2>/dev/null || true
}

my_ip() { curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]'; }

env_value() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- || true; }

# The settings the app refuses to start without (assertProductionEnv() in
# src/lib/env.ts), checked here so a deploy fails on your laptop with a
# sentence rather than on the server in a log.
check_env() {
  [ -f "$ENV_FILE" ] || die "No $ENV_FILE yet. Run: scripts/lightsail.sh init"
  local missing=()
  for key in DATABASE_URL POSTGRES_PASSWORD BETTER_AUTH_SECRET BETTER_AUTH_URL NEXT_PUBLIC_SITE_URL \
             STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_UNLOCK STRIPE_PRICE_LIVE \
             ACME_EMAIL ADMIN_EMAILS; do
    [ -n "$(env_value "$key")" ] || missing+=("$key")
  done
  [ ${#missing[@]} -eq 0 ] || die "Missing in $ENV_FILE: ${missing[*]}
  The app refuses to start without them, and Caddy without ACME_EMAIL. See deploy/README.md."

  case "$(env_value STRIPE_SECRET_KEY)" in
    pk_*) die "STRIPE_SECRET_KEY is a publishable key (pk_…). It needs the secret key (sk_live_…)." ;;
    sk_test_*|rk_test_*) warn "STRIPE_SECRET_KEY is a test-mode key: checkout will not take real money." ;;
  esac
  case "$(env_value STRIPE_WEBHOOK_SECRET)" in
    whsec_*) ;;
    *) die "STRIPE_WEBHOOK_SECRET does not look like a signing secret (whsec_…). Create the endpoint in Stripe first: https://$DOMAIN/api/stripe/webhook" ;;
  esac
  [ "$(env_value NEXT_PUBLIC_SITE_URL)" = "https://$DOMAIN" ] \
    || warn "NEXT_PUBLIC_SITE_URL is $(env_value NEXT_PUBLIC_SITE_URL), but DOMAIN is $DOMAIN: canonicals and Stripe redirects will name the other one."
  [ -n "$(env_value ANTHROPIC_API_KEY)" ] || warn "ANTHROPIC_API_KEY is empty: plans will be written by the fixture generator."
  ok "Settings in deploy/.env.production"
}

# ------------------------------------------------------------------ ssh

ssh_() {
  local ip
  ip="$(static_ip)"
  [ -n "$ip" ] && [ "$ip" != "None" ] || die "No static IP yet. Run: scripts/lightsail.sh up"
  ssh -i "$KEY_FILE" -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=10 -o ServerAliveInterval=30 -o BatchMode=yes "$REMOTE_USER@$ip" "$@"
}

scp_() {
  local ip
  ip="$(static_ip)"
  scp -i "$KEY_FILE" -o UserKnownHostsFile="$KNOWN_HOSTS" -o StrictHostKeyChecking=accept-new -q "$@" "$REMOTE_USER@$ip:$REMOTE_DIR/"
}

wait_for_ssh() {
  step "Waiting for the server to finish setting up (Docker install, a few minutes)"
  for _ in $(seq 1 90); do
    if ssh_ 'test -f /var/lib/venturelly-ready' 2>/dev/null; then
      ok "Server is ready"
      return
    fi
    sleep 10
  done
  die "The server did not become ready in 15 minutes. Check it in the Lightsail console."
}

# ------------------------------------------------------------------ init

cmd_init() {
  need_tools
  if [ -f "$ENV_FILE" ]; then
    warn "$ENV_FILE already exists; leaving it as it is (its secrets must not change)."
    return
  fi
  step "Creating deploy/.env.production"
  cp "$DEPLOY_DIR/env.production.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  local pw
  # Hex, so the password needs no escaping inside DATABASE_URL.
  pw="$(openssl rand -hex 24)"
  set_env POSTGRES_PASSWORD "$pw"
  set_env DATABASE_URL "postgresql://venturelly:${pw}@postgres:5432/venturelly"
  set_env BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
  set_env NEXT_PUBLIC_SITE_URL "https://$DOMAIN"
  set_env BETTER_AUTH_URL "https://$DOMAIN"
  # The Anthropic key from your local settings, when it is there. Stripe is
  # not copied: production needs the live keys, set on purpose.
  if [ -f "$ROOT/.env.local" ] || [ -f "$ROOT/.env" ]; then
    local value
    value="$(cat "$ROOT/.env.local" "$ROOT/.env" 2>/dev/null | grep -E "^ANTHROPIC_API_KEY=" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)"
    [ -n "$value" ] && set_env ANTHROPIC_API_KEY "$value" && ok "Copied ANTHROPIC_API_KEY from your local settings"
  fi
  ok "Secrets generated. Fill in Stripe (live) and ACME_EMAIL in $ENV_FILE."
  bold "Keep a copy of this file somewhere safe (a password manager). It is not in git."
}

set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^"k"=" {print k"="v; done=1; next} {print} END{if(!done) print k"="v}' "$ENV_FILE" >"$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

# ------------------------------------------------------------------ up

cmd_up() {
  need_tools docker curl
  need_docker
  check_aws
  check_env
  bold "About to create in $REGION: instance '$NAME' ($BUNDLE), static IP, firewall, and point $DOMAIN at it."
  confirm_word "yes" "Type yes to continue"

  step "SSH key"
  mkdir -p "$HOME/.ssh"
  if ls_ get-key-pair --key-pair-name "$KEY_NAME" >/dev/null 2>&1; then
    [ -f "$KEY_FILE" ] || die "Key pair $KEY_NAME exists in Lightsail but $KEY_FILE is missing. Restore the file, or delete the key pair in the console."
    ok "Key pair $KEY_NAME (using $KEY_FILE)"
  else
    ls_ create-key-pair --key-pair-name "$KEY_NAME" --query privateKeyBase64 --output text >"$KEY_FILE"
    chmod 600 "$KEY_FILE"
    ok "Created key pair $KEY_NAME → $KEY_FILE"
  fi

  step "Server"
  if instance_exists; then
    instance_is_ours || die "An instance named $NAME exists but was not made by this script (no app=$NAME tag). Refusing to touch it."
    ok "Instance $NAME already exists"
  else
    local userdata
    userdata="$(mktemp)"
    cat >"$userdata" <<'USERDATA'
#!/bin/bash
set -eux
# Swap, so a PDF render beside Postgres never meets the out-of-memory killer.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Docker and the compose plugin, from Docker's own repository.
curl -fsSL https://get.docker.com | sh
mkdir -p /etc/docker
# Container logs rotate, so they cannot fill the disk.
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
JSON
systemctl restart docker
usermod -aG docker ubuntu
mkdir -p /opt/venturelly && chown ubuntu:ubuntu /opt/venturelly
touch /var/lib/venturelly-ready
USERDATA
    ls_ create-instances --instance-names "$NAME" --availability-zone "$ZONE" \
      --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" --key-pair-name "$KEY_NAME" \
      --user-data "file://$userdata" --tags "key=app,value=$NAME" >/dev/null
    rm -f "$userdata"
    ok "Creating instance $NAME"
    for _ in $(seq 1 60); do
      [ "$(instance_json | jq -r '.instance.state.name')" = "running" ] && break
      sleep 5
    done
    ok "Instance is running"
  fi

  step "Static IP"
  if [ -z "$(static_ip)" ] || [ "$(static_ip)" = "None" ]; then
    ls_ allocate-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null
    ok "Allocated $STATIC_IP_NAME"
  fi
  local attached
  attached="$(ls_ get-static-ip --static-ip-name "$STATIC_IP_NAME" --query 'staticIp.attachedTo' --output text)"
  if [ "$attached" != "$NAME" ]; then
    ls_ attach-static-ip --static-ip-name "$STATIC_IP_NAME" --instance-name "$NAME" >/dev/null
  fi
  local ip
  ip="$(static_ip)"
  ok "$STATIC_IP_NAME = $ip, attached to $NAME"
  # A new server on an IP an old one had: forget the old one's host key.
  ssh-keygen -f "$KNOWN_HOSTS" -R "$ip" >/dev/null 2>&1 || true

  step "Firewall"
  open_ports "$(my_ip)"

  step "Daily snapshots"
  ls_ enable-add-on --resource-name "$NAME" \
    --add-on-request '{"addOnType":"AutoSnapshot","autoSnapshotAddOnRequest":{"snapshotTimeOfDay":"07:00"}}' >/dev/null 2>&1 \
    && ok "Automatic daily snapshot at 07:00 UTC (kept 7 days)" \
    || warn "Could not turn on automatic snapshots; turn them on in the console."

  step "DNS"
  upsert_dns "$ip"

  wait_for_ssh
  cmd_deploy_inner
  cmd_status
}

open_ports() {
  local mine="$1"
  # SSH from your address and from the Lightsail console's browser SSH;
  # the web to everyone. put-instance-public-ports replaces the whole set.
  ls_ put-instance-public-ports --instance-name "$NAME" --port-infos "$(jq -nc --arg me "${mine}/32" '[
    { fromPort: 22,  toPort: 22,  protocol: "tcp", cidrs: [$me], cidrListAliases: ["lightsail-connect"] },
    { fromPort: 80,  toPort: 80,  protocol: "tcp", cidrs: ["0.0.0.0/0"] },
    { fromPort: 443, toPort: 443, protocol: "tcp", cidrs: ["0.0.0.0/0"] },
    { fromPort: 443, toPort: 443, protocol: "udp", cidrs: ["0.0.0.0/0"] }
  ]')" >/dev/null
  ok "Open: 80, 443 to everyone; 22 only from $mine and the Lightsail console"
}

# The A and AAAA records for the domain and www, as Route 53 holds them.
web_records() {
  aws route53 list-resource-record-sets --hosted-zone-id "$ZONE_ID" --output json \
    | jq --arg d "$DOMAIN." '[ .ResourceRecordSets[]
        | select((.Name == $d or .Name == ("www." + $d)) and (.Type == "A" or .Type == "AAAA")) ]'
}

upsert_dns() {
  local ip="$1" existing foreign changes
  existing="$(web_records)"
  # Anything that is not already an A record pointing here was put there by
  # somebody — most likely the CloudFront aliases the CDK stack creates. Left
  # in place, an AAAA alias sends every IPv6 visitor to the old site.
  foreign="$(echo "$existing" | jq -r --arg ip "$ip" '[ .[]
      | select(.Type != "A" or .AliasTarget != null or ((.ResourceRecords // []) | map(.Value) != [$ip]))
      | "\(.Name) \(.Type) → \(.AliasTarget.DNSName // ((.ResourceRecords // []) | map(.Value) | join(",")))" ] | .[]')"
  if [ -n "$foreign" ] && [ "${REPLACE_DNS:-}" != "1" ]; then
    die "$DOMAIN already points somewhere else:
$(echo "$foreign" | sed 's/^/    /')
  If that is the CDK stack, tear it down first: node scripts/deploy.mjs --destroy
  To replace these records anyway: REPLACE_DNS=1 scripts/lightsail.sh up"
  fi
  # One atomic batch: remove what is there, then create ours. A DELETE and
  # CREATE pair works whether the old record was an alias or not.
  changes="$(jq -n --argjson old "$existing" --arg d "$DOMAIN" --arg ip "$ip" '
    [ $old[] | { Action: "DELETE", ResourceRecordSet: . } ] +
    [ $d, ("www." + $d) | { Action: "CREATE", ResourceRecordSet: { Name: ., Type: "A", TTL: 300, ResourceRecords: [ { Value: $ip } ] } } ]')"
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --change-batch "$(jq -n --argjson c "$changes" '{Comment: "Venturelly on Lightsail", Changes: $c}')" >/dev/null
  ok "$DOMAIN and www.$DOMAIN → $ip"
}

# ------------------------------------------------------------------ deploy

cmd_deploy() {
  need_tools docker
  need_docker
  check_env
  instance_exists || die "No server yet. Run: scripts/lightsail.sh up"
  cmd_deploy_inner
}

cmd_deploy_inner() {
  local tag image
  tag="$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet || echo -dirty)"
  image="venturelly:$tag"

  # linux/amd64 is not optional: the server is x86, and an arm64 image dies
  # with `exec format error`, which reads as an application fault.
  step "Building $image for linux/amd64 (the first build takes a while)"
  docker buildx build --platform linux/amd64 --build-arg "NEXT_PUBLIC_SITE_URL=$(env_value NEXT_PUBLIC_SITE_URL)" \
    -t "$image" --load "$ROOT"
  ok "Built $image"

  step "Shipping it to the server"
  docker save "$image" | gzip | ssh_ 'gunzip | docker load' >/dev/null
  ok "Loaded $image on the server"

  step "Configuration"
  local compose_env
  compose_env="$(mktemp)"
  {
    echo "IMAGE=$image"
    echo "POSTGRES_PASSWORD=$(env_value POSTGRES_PASSWORD)"
    echo "DOMAIN=$DOMAIN"
    echo "ACME_EMAIL=$(env_value ACME_EMAIL)"
  } >"$compose_env"
  scp_ "$DEPLOY_DIR/docker-compose.yml" "$DEPLOY_DIR/Caddyfile"
  local ip; ip="$(static_ip)"
  scp -i "$KEY_FILE" -o UserKnownHostsFile="$KNOWN_HOSTS" -q "$compose_env" "$REMOTE_USER@$ip:$REMOTE_DIR/.env"
  scp -i "$KEY_FILE" -o UserKnownHostsFile="$KNOWN_HOSTS" -q "$ENV_FILE" "$REMOTE_USER@$ip:$REMOTE_DIR/app.env"
  rm -f "$compose_env"
  ssh_ "chmod 600 $REMOTE_DIR/.env $REMOTE_DIR/app.env"
  ok "Compose file, Caddyfile and settings in place"

  # The image's entrypoint migrates before it serves. Running it once on its
  # own, with `true` as the command, makes a failed migration stop the deploy
  # here, with its output, while the previous release is still serving.
  # A migration is the one step a redeploy of an older tag does not undo.
  step "Database migrations"
  ssh_ "cd $REMOTE_DIR && docker compose up -d --wait postgres && docker compose run --rm --no-deps web true"
  ok "Migrated"

  step "Starting the app and Caddy"
  # --wait: until the image's own health check (/api/health, which touches
  # the database) passes, so "Running" means serving.
  ssh_ "cd $REMOTE_DIR && docker compose up -d --wait --wait-timeout 180 --remove-orphans && docker image prune -f >/dev/null" \
    || die "The app did not become healthy. See: scripts/lightsail.sh logs"
  ok "Running $image"
}

# ------------------------------------------------------------------ status

cmd_status() {
  need_tools curl
  step "Status"
  local state ip resolved code
  state="$(instance_json | jq -r '.instance.state.name // empty')"
  ip="$(static_ip)"
  [ -n "$state" ] && ok "Instance $NAME: $state" || warn "No instance named $NAME in $REGION"
  [ -n "$ip" ] && [ "$ip" != "None" ] && ok "Static IP: $ip" || warn "No static IP $STATIC_IP_NAME"
  resolved="$(dig +short "$DOMAIN" A 2>/dev/null | tail -1 || true)"
  if [ -n "$resolved" ]; then
    [ "$resolved" = "$ip" ] && ok "$DOMAIN resolves to $resolved" || warn "$DOMAIN resolves to $resolved, not $ip (DNS may still be updating)"
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/api/health" || true)"
  case "$code" in
    2*) ok "https://$DOMAIN/api/health answers ($code)" ;;
    *) warn "https://$DOMAIN/api/health is not answering yet ($code). The first HTTPS certificate can take a minute after DNS updates." ;;
  esac
  # An unauthenticated call must be challenged with a pointer to the OAuth
  # metadata; that pointer is how an MCP client finds where to sign in.
  if curl -s -D - -o /dev/null --max-time 10 -X POST "https://$DOMAIN/mcp" 2>/dev/null \
      | grep -qi '^www-authenticate:.*oauth-protected-resource/mcp'; then
    ok "https://$DOMAIN/mcp challenges for OAuth (MCP clients can connect)"
  else
    warn "https://$DOMAIN/mcp is not answering with an OAuth challenge."
  fi
}

# ------------------------------------------------------------------ small ones

cmd_ssh() { ssh_ "$@"; }

cmd_logs() { ssh_ "cd $REMOTE_DIR && docker compose logs --tail=200 -f web caddy"; }

cmd_allow_ssh() {
  instance_exists || die "No server."
  open_ports "$(my_ip)"
}

cmd_backup() {
  mkdir -p "$BACKUP_DIR"
  local file="$BACKUP_DIR/venturelly-$(date -u +%Y%m%dT%H%M%SZ).dump"
  step "Downloading a database dump"
  ssh_ "cd $REMOTE_DIR && docker compose exec -T postgres pg_dump -U venturelly -Fc venturelly" >"$file"
  [ -s "$file" ] || { rm -f "$file"; die "The dump came back empty."; }
  ok "Saved $file ($(du -h "$file" | cut -f1))"
}

# ------------------------------------------------------------------ destroy

confirm_word() {
  local word="$1" prompt="$2" answer
  [ -t 0 ] || die "This needs you at the keyboard: run it in a terminal."
  read -r -p "  $prompt: " answer
  [ "$answer" = "$word" ] || die "Stopped. Nothing was changed by this step."
}

cmd_destroy() {
  need_tools
  check_aws
  if instance_exists && ! instance_is_ours; then
    die "The instance named $NAME was not made by this script (no app=$NAME tag). Refusing to touch it."
  fi
  local ip; ip="$(static_ip)"; [ "$ip" = "None" ] && ip=""

  bold "This removes Venturelly from $DOMAIN:"
  echo "  • instance $NAME ($REGION) — its disk holds the database: every plan and every purchase"
  [ -n "$ip" ] && echo "  • static IP $STATIC_IP_NAME ($ip)"
  echo "  • the A records for $DOMAIN and www.$DOMAIN, if they still point at that IP"
  bold "Kept: a database dump on this laptop, a final snapshot of the server's disk, the SSH key."
  confirm_word "$DOMAIN" "Type the domain name ($DOMAIN) to continue"

  local stamp; stamp="$(date -u +%Y%m%dT%H%M%SZ)"

  if instance_exists; then
    step "Final database dump"
    # In a subshell, so a failed dump comes back here to ask rather than
    # ending the script half way.
    if ! (cmd_backup); then
      warn "The database dump failed."
      confirm_word "destroy without a dump" "Type 'destroy without a dump' to go on with only the snapshot"
    fi

    step "Final snapshot of the server's disk"
    local snap="${NAME}-final-${stamp}"
    ls_ create-instance-snapshot --instance-name "$NAME" --instance-snapshot-name "$snap" >/dev/null
    for _ in $(seq 1 120); do
      [ "$(ls_ get-instance-snapshot --instance-snapshot-name "$snap" --query 'instanceSnapshot.state' --output text)" = "available" ] && break
      sleep 10
    done
    [ "$(ls_ get-instance-snapshot --instance-snapshot-name "$snap" --query 'instanceSnapshot.state' --output text)" = "available" ] \
      || die "The snapshot $snap did not finish in 20 minutes. Nothing has been deleted. Run destroy again once it shows as available."
    ok "Snapshot $snap (restore it from the Lightsail console; about \$0.05 per GB a month while kept)"
  fi

  step "DNS"
  remove_dns_if_ours "$ip"

  if [ -n "$ip" ]; then
    step "Static IP"
    ls_ release-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null
    ok "Released $STATIC_IP_NAME"
  fi

  if instance_exists; then
    step "Instance"
    ls_ delete-instance --instance-name "$NAME" --force-delete-add-ons >/dev/null
    ok "Deleted $NAME"
  fi

  bold "Done. Kept: $BACKUP_DIR, the final snapshot, and $KEY_FILE."
}

remove_dns_if_ours() {
  local ip="$1" changes
  [ -n "$ip" ] || { ok "No static IP, so no records of ours to remove"; return; }
  # Deleted only when they still point at this server's IP: records pointed
  # somewhere else since are somebody's decision and are left alone.
  changes="$(web_records | jq --arg ip "$ip" '[ .[]
    | select(.Type == "A" and (.ResourceRecords // [] | length == 1) and .ResourceRecords[0].Value == $ip)
    | { Action: "DELETE", ResourceRecordSet: . } ]')"
  if [ "$(echo "$changes" | jq length)" -eq 0 ]; then
    ok "No A records point at $ip; DNS left as it is"
    return
  fi
  aws route53 change-resource-record-sets --hosted-zone-id "$ZONE_ID" \
    --change-batch "$(jq -n --argjson c "$changes" '{Comment: "Venturelly removed", Changes: $c}')" >/dev/null
  ok "Removed $(echo "$changes" | jq -r '[.[].ResourceRecordSet.Name] | join(", ")')"
}

# ------------------------------------------------------------------ main

usage() { sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; }

case "${1:-}" in
  init) cmd_init ;;
  up) cmd_up ;;
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  ssh) shift; cmd_ssh "$@" ;;
  logs) cmd_logs ;;
  backup) cmd_backup ;;
  allow-ssh) cmd_allow_ssh ;;
  destroy) cmd_destroy ;;
  *) usage; exit 1 ;;
esac
