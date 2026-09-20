# Deploying Venturally

Everything in this repository is ready to deploy. What follows is the part that
needs a human with AWS access, because it needs credentials and a domain.

**Rough cost at rest: $90–130/month.** The NAT gateway (~$33) and the Multi-AZ
`db.t4g.small` (~$50) are most of it. Both are deliberate and both are one flag
away from cheaper — see *Making it cheaper* at the end.

---

## What you need before you start

- An AWS account, and credentials with admin rights **for the one-time setup
  only**. The ongoing deploys use a scoped role.
- `getventurely.com` in Route 53 as a **hosted zone in that same account**. If
  the domain is registered elsewhere, point its nameservers at the Route 53
  zone and wait for that to propagate before step 3 — certificate validation
  will otherwise sit pending forever.
- Node 22 and the AWS CLI v2 locally.
- A Stripe account. Test mode is fine to start.

---

## 1. The domain — settled

**`getventurely.com`. This is decided and every default in the repo now reads
it.** Nothing in this step needs doing; it is here so the next person does not
reopen it.

Two things follow from it that are worth knowing:

The brand word is **Venturally** and the domain is **getventurely.com** — they
are not the same string. Everything user-visible reads from `src/lib/brand.ts`,
and the origin from `NEXT_PUBLIC_SITE_URL` (falling back to the production
domain in `src/lib/env.ts`), so the two never have to agree in code — but a
person typing one from memory of the other will land nowhere. Registering the
two obvious misspellings — `getventuraly` and `getventurally`, both `.com` — as
redirects to the apex costs about $24 a year and is worth more than that in
traffic that would otherwise bounce.

To confirm nothing has drifted:

```bash
# should print the correct spelling only, and never getventuraly/getventurally
rg -n "getventur[a-z]*\.com|getventur[a-z]*" --glob '!node_modules' --glob '!cdk.out'
```

The places that carry a default are `src/lib/env.ts`, `Dockerfile`,
`infra/bin/infra.ts`, `infra/workflows/{ci,deploy}.yml` and `public/llms.txt`.
A staging deployment overrides all of it with `NEXT_PUBLIC_SITE_URL` and
`--context domainName=`, so nothing here is a hardcode in the sense the
project's rules forbid.

## 2. Bootstrap CDK

Once per account and region. Uses your admin credentials.

```bash
cd infra
npm ci
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

## 3. Create the infrastructure

The first run takes about 25 minutes — most of it is RDS and CloudFront. ACM
validates against Route 53 automatically because the stack owns the DNS records.

```bash
cd infra
export AWS_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=<ACCOUNT_ID>

npx cdk deploy VenturallyCertificate VenturallySite \
  --context domainName=getventurely.com \
  --context imageTag=bootstrap
```

> The service will not start yet. It is pointed at an image tag that does not
> exist, and the secrets below are empty. Both are fixed in the next two steps.
> Expect the ECS service to sit at 0/2 healthy tasks until then — that is
> correct, not a failure.

Write down the outputs. You need `EcrRepositoryUri` and `AppSecretArn`.

## 4. Fill in the application secrets

The stack creates the secret empty on purpose: a value passed through CDK ends
up in CloudFormation's event history and in every `cdk diff` anybody runs
afterwards.

```bash
aws secretsmanager put-secret-value \
  --secret-id getventurely.com/app \
  --secret-string "$(jq -n \
      --arg auth "$(openssl rand -base64 48)" \
      --arg stripe "sk_test_…" \
      --arg whsec "whsec_…" \
      --arg anthropic "sk-ant-…" \
      '{BETTER_AUTH_SECRET:$auth, STRIPE_SECRET_KEY:$stripe, STRIPE_WEBHOOK_SECRET:$whsec, ANTHROPIC_API_KEY:$anthropic}')"
```

All four keys must be present. The app **refuses to start** without the auth
secret or either Stripe key — see `src/lib/env.ts`. That is deliberate: without
the Stripe keys the billing layer falls back to a development provider that
grants entitlements with no payment, and it must never run in production.

`ANTHROPIC_API_KEY` may be an empty string. The product then writes prose with
the deterministic generator instead, which is a real mode, not a degraded one.

## 5. Build and push the first image

```bash
aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

docker build \
  --build-arg NEXT_PUBLIC_SITE_URL=https://getventurely.com \
  -t <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/venturally:first .

docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/venturally:first

cd infra && npx cdk deploy VenturallySite \
  --context domainName=getventurely.com --context imageTag=first
```

The container applies the Prisma migrations on start, before it binds a port.
A failed migration stops the task rather than serving traffic against a schema
it does not match.

## 6. Point Stripe at the webhook

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

## 7. Set up the GitHub deploy role

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

### Move the workflows into place

The workflow files are in `infra/workflows/` rather than `.github/workflows/`,
because the token that wrote them lacked GitHub's `workflow` scope and GitHub
rejects such a push outright. One command fixes it:

```bash
mkdir -p .github/workflows
cp infra/workflows/ci.yml infra/workflows/deploy.yml .github/workflows/
git add .github/workflows && git commit -m "Add CI and deploy workflows" && git push
```

After that, every push to `main` deploys: verify → build → push → `cdk deploy` →
wait for the service → invalidate the edge → check `/api/health`.

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
