# Venturelly

Investor- and lender-grade business plans, built on a real financial model.

**getventurely.com**

Most AI business-plan tools generate plausible prose over invented numbers. The
most commonly cited reason plans get rejected is not bad writing — it is
unsourced market claims and figures that don't reconcile. So this product is
built the other way round: a deterministic financial engine computes every
number, every market claim carries a dated source, and the narrative is
reconciled to the statements before anything can be exported.

**The rule the architecture enforces: the AI never writes a number that appears
in a financial statement.** It proposes assumptions, the engine computes, and
the model then narrates what the engine produced. A test fails the build if a
currency figure in generated prose cannot be traced to a value the engine holds.

## What's here

| | |
|---|---|
| **Financial engine** | Three linked statements, monthly across 36 or 60 periods, with a balance-sheet tie asserted in every period. Seven revenue-build patterns, loan amortisation, depreciation, working capital, scenarios, sensitivity, cap table. Pure TypeScript, no I/O. |
| **Underwriter ratios** | DSCR, coverage, current ratio, debt-to-equity, owner compensation — the arithmetic a credit analyst runs, computed before they run it. Thresholds come from dated regulatory config, never a constant. |
| **Validator** | Twelve blocking checks and eight warnings that gate export. Owner compensation, cash adequacy, statement integrity, cited statistics, narrative/model reconciliation. |
| **Consistency checker** | Extracts every marked figure from the written plan and requires it to match a value the engine computed, with tolerance derived from how precisely the figure was written. |
| **Research layer** | Live web search with citations; `keepVerifiable()` drops anything lacking an http URL and an ISO date. With no key it returns nothing and says why, rather than composing a source. |
| **Benchmarks** | Industry bands that warn on out-of-band assumptions without overwriting them. Each band declares its own gross-margin cost basis. |
| **Exports** | PDF (Chromium through the live print route), DOCX, PPTX, and an XLSX workbook that is the model rather than a picture of it — the statements are formulas over a Drivers sheet. |
| **Commerce** | Stripe one-time unlock and optional subscription. Only the webhook grants an entitlement; idempotency is a unique index, not a check. |
| **Versioning** | A snapshot before every regeneration and before every restore, with a sentence-level diff. |
| **Marketing site** | Home with a live in-browser generation demo, product and solutions pages, 15 industry pages with worked models, 7 free calculators, a Learn hub, a glossary, sample plans, comparison pages, methodology and legal. |
| **Design system** | "Institutional Editorial" — a validated, colourblind-safe chart palette and a typographic system shared by the site, the app and the exported PDF. Hand-built SVG charts, no chart library. |

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Nothing requires an API key to run.

- Without `ANTHROPIC_API_KEY`, generation composes prose deterministically from
  engine output. That path is a real mode, not a stub — the product demos with
  no key and no spend, and the end-to-end tests are free and repeatable.
- Without `STRIPE_SECRET_KEY`, checkout is simulated at `/billing/simulate`,
  which posts a synthetic event to the same webhook handler a real payment does.
  The grant is exercised rather than bypassed. That route refuses to exist under
  `NODE_ENV=production`.
- `DATABASE_URL` decides the driver adapter, so one value picks SQLite or
  Postgres. The default is a local SQLite file.

## Commands

```bash
pnpm dev          # dev server
pnpm build        # production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest — 415 tests; the engine suite is the quality gate
pnpm e2e          # real browser: sign up → intake → generate → pay → export
pnpm db:push      # apply the Prisma schema to the local database
```

`pnpm e2e` expects a server on `localhost:3000`; it drives the whole purchase
journey and then posts directly to the webhook to cover replay, forgery and
cross-workspace grants, which the UI cannot reach.

## Layout

```
src/app/(marketing)/   public site, light theme
src/app/(app)/         the authenticated product
src/app/api/           route handlers, including the Stripe webhook
src/lib/finance/       the engine — pure, deterministic, heavily tested
src/lib/ai/            generators, cached prompts, the consistency checker
src/lib/research/      cited market research
src/lib/export/        one document assembly, four renderers
src/lib/content/       industries, learn, glossary, and dated regulatory config
infra/                 AWS CDK: ECS Fargate, RDS, CloudFront, ACM, Route 53
```

`CLAUDE.md` holds the conventions that are load-bearing — the ones where getting
it wrong produces a plausible-looking wrong answer rather than an error. Read it
before changing the engine, the statement shaping, or the token layer.

## Deploying

```
pnpm deploy:aws              # the whole deploy, one question at a time
pnpm deploy:aws --dry-run    # every question and command, writing nothing
```

`scripts/deploy.mjs` walks the whole thing: preflight, CDK bootstrap, the stacks,
the application secret, the image, the Stripe endpoint and the GitHub OIDC deploy
role. It asks for every value it needs, checks each step against AWS before doing
it — so a re-run resumes rather than repeating — and validates the database
configuration against `describe-orderable-db-instance-options` before starting a
twenty-five-minute deploy. Answers persist to `.deploy.json`; the four secret
values never touch disk, which `tests/deploy.test.ts` asserts.

`DEPLOY.md` is the same ground by hand, plus the recovery path for a failed first
create and what is still open before a real launch — counsel review of the legal
documents, and the regulatory verification queue.

`.env` is for local development only. Nothing in the deploy reads it: the
container's environment comes from the ECS task definition.

## Licence

Proprietary. All rights reserved.
