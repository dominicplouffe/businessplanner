# Deploying Venturelly to Lightsail

One server runs everything: Postgres, the web app (with the Chromium the PDF
export uses), and Caddy for HTTPS. `scripts/lightsail.sh` creates it, points
getventurely.com at it, deploys, and removes it again.

About $12/month for the default 2 GB server, against $90–130 for the
ECS/RDS/CloudFront stack this replaces. That stack's CDK app is deleted;
`node scripts/deploy.mjs --destroy` is kept only to remove it.

## Before the first time

If the CDK stack is still running, tear it down first, so the domain's
CloudFront records are removed by the stack that made them:

    node scripts/deploy.mjs --destroy

`up` refuses to overwrite records it did not create; `REPLACE_DNS=1` overrides
that. Plans in the old RDS database do not move by themselves — restore a dump
into the new server's Postgres if there are any worth keeping.

You need the AWS CLI (signed in as the profile that holds the Route 53 zone),
`jq`, `openssl`, `ssh`, `curl`, and Docker with a running daemon.

## First time

1. **Settings.** `scripts/lightsail.sh init` creates `deploy/.env.production`
   with a generated database password and `BETTER_AUTH_SECRET`, and your
   Anthropic key from `.env.local`. Fill in:
   - `STRIPE_SECRET_KEY` (live).
   - `STRIPE_WEBHOOK_SECRET`. Create the endpoint in the Stripe dashboard
     first — Stripe accepts the URL before anything answers it:
     `https://getventurely.com/api/stripe/webhook`. The webhook is the only
     thing that grants an entitlement.
   - `ACME_EMAIL`, for certificate expiry notices.

   The price ids are filled in; `node scripts/stripe-verify.mjs` checks they
   still charge what the site says. Keep a copy of this file in a password
   manager: the database password is written down nowhere else.

2. **Create it:** `scripts/lightsail.sh up`. It shows the AWS account and
   Route 53 zone it found, asks you to type `yes`, then creates the server,
   a static IP, the firewall, daily snapshots and the DNS records, and
   deploys. The first HTTPS certificate arrives a minute or two after DNS
   updates.

The image is built on your machine for linux/amd64 and streamed to the server
over SSH — there is no registry.

## After that

| Command | Does |
|---|---|
| `scripts/lightsail.sh deploy` | Build, ship, migrate, restart. |
| `scripts/lightsail.sh status` | Server, IP, DNS, and whether `/api/health` answers. |
| `scripts/lightsail.sh logs` | Follow the app and Caddy logs. |
| `scripts/lightsail.sh ssh` | A shell on the server. |
| `scripts/lightsail.sh backup` | Download a database dump to `deploy/backups/`. |
| `scripts/lightsail.sh allow-ssh` | Your IP changed and SSH stopped working. |
| `scripts/lightsail.sh destroy` | Remove it (below). |

Migrations run as their own step before the new release starts, so a failed
one stops the deploy while the previous release is still serving. Redeploying
an older commit does not undo a migration.

## Connecting Claude (the MCP endpoint)

The MCP server ships inside the app, so every deploy carries it; there is
nothing separate to run. Once the site is up, add a custom connector in Claude
(or `claude mcp add --transport http venturelly https://getventurely.com/mcp`
in Claude Code) with the URL

    https://getventurely.com/mcp

The client registers itself, the person signs in and approves it on a
Venturelly consent page, and it can then create and write plans in their
workspace. Settings → Connected apps disconnects one immediately.

Check it after a deploy: `curl -si -X POST https://getventurely.com/mcp` must
answer `401` with a `www-authenticate` header naming
`/.well-known/oauth-protected-resource/mcp`.

## Destroy

Asks you to type the domain name, and only runs at a keyboard. Before
deleting anything it downloads a database dump and takes a final snapshot
of the server's disk. It removes the DNS records only if they still point at
this server, releases the static IP, and deletes the server. The dump, the
snapshot and the SSH key are kept. It never touches a server it did not
create (it checks for its tag).

## Rehearse it locally

`docker compose up --build` at the repository root runs the same image against
a real Postgres with real migrations. If it boots there and `/api/health`
answers, what is left to differ on the server is the settings file and the
network.

## Defaults

`AWS_PROFILE=dplouffe`, `REGION=us-east-1`, `DOMAIN=getventurely.com`,
`NAME=venturelly`, `BUNDLE=small_3_0`. Override any of them on the command
line, e.g. `BUNDLE=medium_3_0 scripts/lightsail.sh up`.

The database lives on the server's disk and is included in its daily
snapshots (kept seven days).

## Known gaps before a real launch

These are not deployment problems, but they are launch problems.

1. **The legal documents have not been reviewed by counsel.** `privacy`, `terms`
   and `dpa` describe what the product actually does, which is the right basis,
   but the wording is not settled. Flagged in `src/lib/content/legal.ts`.
2. **The regulatory verification queue is unverified.** SBA SOP thresholds, the
   guaranty fee schedule and the EB-5 figures were never confirmed against a
   primary source. They are labelled `unverified` in place and published on
   `/learn/methodology`, which is honest, but a lender-facing product should
   close that list. SOP 50 10 8.1 took effect 2026-10-01.
3. **No email delivery.** `RESEND_API_KEY` is unset, so password resets and
   share notifications have no transport. Better Auth is configured with
   `requireEmailVerification: false`, which is why nobody is locked out.
4. **No error tracking.** Add Sentry or equivalent before real traffic; the
   container logs (`scripts/lightsail.sh logs`) are all there is today.
5. **Backups are the server's daily snapshots (kept seven days) and whatever
   `scripts/lightsail.sh backup` has downloaded.** No restore has been tested.
