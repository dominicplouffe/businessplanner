# Deploying Venturelly

Everything in this repository is ready to deploy. What follows is the part that
needs a human with AWS access, because it needs credentials and a domain.

**Rough cost at rest: $90–130/month.** The NAT gateway (~$33) and the Multi-AZ
`db.t4g.small` (~$50) are most of it. Both are deliberate and both are one flag
away from cheaper — see *Making it cheaper* at the end.

---

## What you need before you start

- An AWS account, and credentials with admin rights **for the one-time setup
  only**. The ongoing deploys use a scoped role. Check them with
  `aws sts get-caller-identity` before anything else; nothing below works until
  that prints an account.
- `getventurely.com` in Route 53 as a **hosted zone in that same account**. If
  the domain is registered elsewhere, point its nameservers at the Route 53
  zone and wait for that to propagate before creating the infrastructure —
  certificate validation will otherwise sit pending forever.
- Node 22, the AWS CLI v2, and Docker — and nothing else. `jq` and `openssl` are
  *not* needed: `scripts/deploy.mjs` does both jobs with `JSON.stringify` and
  `crypto.randomBytes`. Nor is pnpm; run the script with `node` directly.
- A Stripe account. Test mode is fine to start.

**`.env` has nothing to do with any of this.** It is gitignored, it is not
copied into the image, and neither the AWS CLI nor CDK reads it. Every variable
the running container sees comes from the ECS task definition, which CDK writes:
four values from Secrets Manager, `DATABASE_URL` assembled from the
RDS-managed secret, and the rest derived from the domain. Fill `.env` only to
run `pnpm dev` or the image locally.

---

## 1. The domain — settled

**`getventurely.com`. This is decided and every default in the repo now reads
it.** Nothing in this step needs doing; it is here so the next person does not
reopen it.

Two things follow from it that are worth knowing:

The brand word is **Venturelly** and the domain is **getventurely.com** — one
`l` apart, which is as close as they can be without being identical. Everything
user-visible reads from `src/lib/brand.ts` and the origin from
`NEXT_PUBLIC_SITE_URL` (falling back to the production domain in
`src/lib/env.ts`), so neither is written twice. Registering the near misses —
`getventurally`, `getventuraly`, `getventurelly`, all `.com` — as redirects to
the apex costs about $36 a year and is worth more than that in traffic that would
otherwise bounce.

To confirm nothing has drifted:

```bash
# should print the correct spelling only, and never getventuraly/getventurally
rg -n "getventur[a-z]*\.com|getventur[a-z]*" --glob '!node_modules' --glob '!cdk.out'
```

The places that carry a default are `src/lib/env.ts`, `Dockerfile`,
`infra/bin/infra.ts`, `.github/workflows/{ci,deploy}.yml` and `public/llms.txt`.
A staging deployment overrides all of it with `NEXT_PUBLIC_SITE_URL` and
`--context domainName=`, so nothing here is a hardcode in the sense the
project's rules forbid.

## 2. Run it

```bash
node scripts/deploy.mjs
```

From the repository root, not from `infra/`. `pnpm deploy:aws` is an alias for
the same thing if you have pnpm; the script deliberately has no dependencies, so
it should never be the reason you need to install a package manager. It needs
`node`, the `aws` CLI, `docker`, and `npx` — which comes with npm.

That is the whole deploy. It asks for everything it needs, checks what has
already been done before doing anything, and can be run again after a failure —
which matters, because the longest step takes twenty-five minutes and the first
real run of it failed ten minutes in.

```
node scripts/deploy.mjs --dry-run    # every question and every command, writing nothing
node scripts/deploy.mjs --from=5     # resume at a step
node scripts/deploy.mjs --help
```

It asks: region, domain, production or staging sizing, `BETTER_AUTH_SECRET`
(offering to generate one), `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY` (which may
be empty), the image tag, and later the `STRIPE_WEBHOOK_SECRET` and the GitHub
repository. The account and the hosted zone it works out for itself and asks you
to confirm.

Three things it does that a runbook cannot:

- **It checks the deploy before starting it.** The database configuration is read
  out of the synthesised template and put to
  `aws rds describe-orderable-db-instance-options`. `Cannot find version 17.2
  for postgres` — the failure that cost the first attempt ten minutes — becomes
  two seconds, and it prints the versions that *are* available.
- **It cleans up after a failed attempt**, including the two resources that
  survive a rollback and then collide silently. See the next section.
- **It never writes a secret down.** Answers persist to `.deploy.json` (ignored
  by git) so a re-run does not re-ask; the four secret values are held in memory,
  written straight to Secrets Manager, and redacted even from `--dry-run`
  output. `tests/deploy.test.ts` asserts that mechanically, because "we are
  careful" is not a guarantee.

**The Stripe webhook is a two-pass affair and cannot be otherwise.** Stripe
issues the signing secret when the endpoint is created, the endpoint needs the
live URL, and the app refuses to boot without *some* value — so the script writes
a marked placeholder, brings the service up, prints the endpoint and the four
events, waits, then stores the real secret and forces a new deployment. It does
not report success while the placeholder is in place: the webhook is the only
code that grants an entitlement, so a deploy stuck there takes money and
delivers nothing.

Everything from here down is what the script does, step by step, in case you
want to do it by hand or a step needs unpicking.

---

## If an earlier attempt failed

A stack in `ROLLBACK_COMPLETE` cannot be updated — it has to be deleted. And
deleting it exposes **two resources that survive the delete** and then collide on
the next create, neither with an error that mentions the rollback:

| Resource | Why it survives | What you see next time |
|---|---|---|
| ECR repository `venturelly` | `removalPolicy: RETAIN`, fixed name | `… with identifier 'venturelly' already exists` |
| Secret `getventurely.com/app` | CloudFormation deletes a secret with a 30-day recovery window, and the name is fixed | `… a secret with this name is already scheduled for deletion` |

The script detects all three and offers to clear them, one confirmation
each. By hand, in this order — the stack first, because deleting it is what
strands the other two:

```bash
aws cloudformation delete-stack --stack-name VenturellySite --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name VenturellySite --region us-east-1

# Only if they are there. --force is needed if the repository holds images.
aws ecr delete-repository --repository-name venturelly --region us-east-1
aws secretsmanager restore-secret --secret-id getventurely.com/app --region us-east-1
aws secretsmanager delete-secret --secret-id getventurely.com/app \
  --force-delete-without-recovery --region us-east-1
```

`VenturellyCertificate` is a separate stack; if it succeeded, leave it alone.

A stack in `DELETE_FAILED`, `ROLLBACK_FAILED` or `UPDATE_ROLLBACK_FAILED` is
different: it needs `--retain-resources` and a decision about what to keep, so
the script refuses to guess and hands it back with the command that shows what
failed.

**Two things are worth synthesising before a deploy**, with no AWS credentials.
The AZ lookup needs context, so put it in `infra/cdk.context.json` (gitignored)
as `"availability-zones:account=<id>:region=<region>": ["<id>a", "<id>b", "<id>c"]`:

```bash
cd infra
npx cdk synth VenturellySite --context account=<ACCOUNT_ID> \
  --context hostedZoneId=<ZONE_ID> --context domainName=getventurely.com \
  --context imageTag=bootstrap --quiet
# → DesiredCount 0, no AWS::ApplicationAutoScaling::ScalableTarget
#   with a real tag instead: DesiredCount 2, one target, MinCapacity 2
```

The scalable target is the half of that pair that is easy to miss: Application
Auto Scaling *enforces* `minCapacity`, so a target registered during the
bootstrap deploy would raise the count straight back to 2 and the service would
hang exactly as it did before.

**Never pin a minor engine version.** `infra/lib/site-stack.ts` asks for
`PostgresEngineVersion.VER_17` — the major version only — so RDS uses whatever
minor is current. It was briefly `VER_17_2`, which AWS had retired, and a pinned
minor is a deploy that stops working on a date nobody wrote down.
`tests/deploy.test.ts` fails on any pin narrower than a major version.

---

## 3. Bootstrap CDK

Once per account and region. Uses your admin credentials.

**Set the account first.** `cdk bootstrap` synthesises the app before it
bootstraps anything, and both stacks resolve a Route 53 hosted zone, which
needs a concrete account and region. The `export` lines used to come *after*
this command rather than before it, which meant following these instructions
exactly produced an error on the very first one.

```bash
cd infra
npm ci

aws sts get-caller-identity          # must print your account before anything else

export AWS_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=<ACCOUNT_ID>

npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

If `get-caller-identity` fails, nothing below will work — configure credentials
first. If the account is not set, the app stops with a message saying so rather
than a page of CDK internals.

**Skipping the lookup.** Every command here accepts
`--context hostedZoneId=<ZONE_ID>`, which names the zone instead of looking it
up. Worth using: a lookup against a zone that does not exist yet does not fail,
it returns a placeholder and lets the deploy run until certificate validation
hangs with nothing to explain it. `aws route53 list-hosted-zones` has the id.

## 4. Create the infrastructure

The first run takes about 25 minutes — most of it is RDS and CloudFront. ACM
validates against Route 53 automatically because the stack owns the DNS records.

```bash
cd infra
npx cdk deploy VenturellyCertificate VenturellySite \
  --context domainName=getventurely.com \
  --context imageTag=bootstrap
```

> The service is created **wanting zero tasks**, and that is the point.
> `imageTag=bootstrap` is a tag nothing has been pushed to — this stack creates
> the repository, so on a first deploy it is necessarily empty. Steps 5 and 6
> fill the secret and push a real image, and step 6's deploy raises the count.
>
> This is not cosmetic. CloudFormation blocks until an `AWS::ECS::Service`
> reaches steady state, and a service that cannot pull an image never does: with
> the deployment circuit breaker on, the resource fails and takes twenty-five
> minutes of RDS and CloudFront down with it. The real failure, before
> `BOOTSTRAP_TAG` existed:
>
> ```
> CREATE_FAILED | AWS::ECS::Service | Service/Service
> "Error occurred during operation 'ECS Deployment Circuit Breaker was triggered'."
> ```
>
> If you are deploying by hand rather than with the script, pass
> `--context imageTag=bootstrap` for the first deploy and a real tag afterwards.
> A stack already blocked on the service can still be rescued by pushing that
> exact tag from another terminal before the circuit breaker gives up — ECS
> retries failed launches, and the repository exists by then.

Write down the outputs. You need `EcrRepositoryUri` and `AppSecretArn`.

## 5. Fill in the application secrets

The stack creates the secret empty on purpose: a value passed through CDK ends
up in CloudFormation's event history and in every `cdk diff` anybody runs
afterwards.

Generate the auth secret, then write all four keys at once:

```bash
node -e 'console.log(require("crypto").randomBytes(48).toString("base64"))'

aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id getventurely.com/app \
  --secret-string '{
    "BETTER_AUTH_SECRET":    "<the 48 bytes above>",
    "STRIPE_SECRET_KEY":     "sk_test_…",
    "STRIPE_WEBHOOK_SECRET": "whsec_…",
    "ANTHROPIC_API_KEY":     "sk-ant-…"
  }'
```

**All four keys must be present**, and only these four. The app **refuses to
start** without the auth secret or either Stripe key — see `src/lib/env.ts`.
That is deliberate: without the Stripe keys the billing layer falls back to a
development provider that grants entitlements with no payment, and it must never
run in production. A key added here that the task definition does not read looks
configured and reaches nothing, which is why `tests/deploy.test.ts` checks this
list against `infra/lib/site-stack.ts` rather than trusting either.

`DATABASE_URL` is **not** one of them. It is assembled from the RDS-managed
secret's `uri` field in the task definition, so there is one copy of the password
and a rotation does not need a second value updating in step.

`ANTHROPIC_API_KEY` may be an empty string. The product then writes prose with
the deterministic generator instead, which is a real mode, not a degraded one.

The webhook secret does not exist yet — see step 7. Put a placeholder here and
come back to it; the app needs *a* value to boot.

A secret is read when a task starts, so changing any of these later means
forcing a new deployment:

```bash
aws ecs update-service --cluster <ClusterName> --service <ServiceName> \
  --force-new-deployment --region us-east-1
```

## 6. Build and push the first image

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

docker build --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_SITE_URL=https://getventurely.com \
  -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/venturelly:first .

docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/venturelly:first

cd infra && npx cdk deploy VenturellySite \
  --context domainName=getventurely.com --context imageTag=first
```

**`--platform linux/amd64` is not optional.** The task definition pins X86_64,
so an image built on an Apple Silicon machine without it runs as arm64 and the
container dies with `exec format error` — which reads as an application fault
and is not one.

The container applies the Prisma migrations on start, before it binds a port.
A failed migration stops the task rather than serving traffic against a schema
it does not match.

## 7. Point Stripe at the webhook

In the Stripe dashboard, add an endpoint at:

```
https://getventurely.com/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Take the signing secret it gives you and put it in the app secret as
`STRIPE_WEBHOOK_SECRET`, then force a new deployment so the tasks pick it up:

```bash
aws ecs update-service --cluster <ClusterName> --service <ServiceName> \
  --force-new-deployment
```

**This step is not optional.** The webhook is the only code that grants an
entitlement — not the page, not the redirect back from checkout. Without it,
customers will pay and receive nothing.

## 8. Set up the GitHub deploy role

So CI never holds a long-lived key.

```bash
# Once per account: trust GitHub's OIDC issuer.
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Then create a role trusting **only this repository's `main` branch**:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:dominicplouffe/businessplanner:ref:refs/heads/main" }
    }
  }]
}
```

The `sub` condition is the whole security of this arrangement. A wildcard there
lets any repository on GitHub assume the role.

Attach a policy allowing ECR push, CloudFormation, and `sts:AssumeRole` on the
CDK bootstrap roles (`cdk-*-deploy-role-*`, `cdk-*-file-publishing-role-*`).
Then add the role ARN as the `AWS_DEPLOY_ROLE_ARN` repository secret, and create
a `production` environment in GitHub if you want a manual approval gate.

### The workflows — one rename still owed

Both live in `.github/workflows/` and run as committed, but `deploy.yml` still
spells the ECR repository and the two stack names the pre-rename way. The CDK app
now creates them as `venturelly` / `VenturellySite` / `VenturellyCertificate`, so
a deploy would push to a repository that does not exist and then create a second
pair of stacks. An agent session cannot fix it — GitHub refuses a push that writes
under `.github/workflows/` without the `workflow` scope — so it needs one command
from a clone:

<!-- spelling-exempt: the command below has to name the old spelling to replace it -->
```bash
# GNU sed; on macOS use: sed -i ''
sed -i 's/ventur[a]lly/venturelly/g; s/Ventur[a]lly/Venturelly/g' .github/workflows/deploy.yml
git commit -am "Rename the image and stacks in the deploy workflow" && git push
```

The character class is only there so this file passes its own spelling check;
`ventur[a]lly` matches the same text the plain word would. `tests/site.test.ts`
exempts the two workflow files from the brand check, and only from that one.

They could not be put there from an agent session — GitHub refuses a push that
writes under `.github/workflows/` unless the credential carries the `workflow`
scope, and neither the git credential nor the REST API has it. If a future
session needs to change one, that is why it will be refused, and the fix is to
make the edit from a clone rather than to work around it.

Once that secret exists, every push to `main` deploys: verify → build → push →
`cdk deploy` → wait for the service → invalidate the edge → check
`/api/health`. Until it exists the deploy job stops on its first step and says
so; it builds nothing and touches nothing in AWS. A red Deploy run on `main`
before this step is done means exactly that and nothing worse.

---

## Rehearse it locally first

This is worth twenty minutes. It runs the real image against a real Postgres
with real migrations, which is everything except the AWS parts:

```bash
docker compose up --build
open http://localhost:3000
```

If it boots, migrates and serves `/api/health` there, the only things that can
still differ in AWS are the secrets and the network.

The first build takes several minutes longer than you expect, because the deps
stage compiles better-sqlite3 from source — the 12.x that
`@prisma/adapter-better-sqlite3` pulls in ships no prebuilt binding. That is why
the deps stage installs `python3 make g++`. If you see
`gyp ERR! find Python` in a build, that install line has gone missing; nothing
else in the image needs a compiler, and the runtime stage deliberately has none.

The build stage also sets a placeholder `DATABASE_URL`. It has to: the stage
regenerates the Prisma client for Postgres, and `src/lib/db.ts` chooses its
adapter from that variable, so an unset one selects the SQLite adapter and every
route importing the client fails page-data collection with
`not compatible with the provider`. The placeholder is never connected to.

If the container starts, says `Applying migrations…` and then dies on
`Cannot find module '@prisma/config'`, the `migrator` stage has gone missing.
The Prisma CLI that the entrypoint runs is installed separately with npm and
lives at `/app/migrate`, because a pnpm-installed CLI cannot be copied between
images — its dependencies live in the virtual store beside it, not at the top
level of `node_modules`.

---

## Verifying it worked

```bash
curl -I https://getventurely.com                    # 200, HSTS present
curl -s https://getventurely.com/api/health          # {"ok":true}
curl -sI https://getventurely.com/_next/static/…     # cache-control: immutable
curl -s https://getventurely.com/sitemap.xml | head  # absolute URLs on the real domain
```

Then walk one purchase end to end with a Stripe test card (`4242 4242 4242
4242`): sign up, finish an intake, try to export (should refuse with 402), pay,
export. `pnpm e2e` does exactly this against a local server and is the script to
copy from.

---

## Making it cheaper

Two flags, both in `infra/lib/site-stack.ts`:

- `production: false` in `bin/infra.ts` gives a single task, a `db.t4g.micro`,
  no Multi-AZ and no autoscaling. Roughly half the cost. Correct for staging,
  and a bad idea for anything holding plans people have paid for.
- The NAT gateway is the single largest line. Moving the tasks to public subnets
  with `assignPublicIp: true` removes it, at the cost of putting the container
  that renders customer content directly on the internet behind a security
  group. Not recommended.

---

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
   CloudWatch logs are all there is today.
5. **Backups are RDS automated snapshots only**, with 14 days of retention. No
   tested restore procedure exists.
