# Venturally — working notes

AI business-planning platform: a public marketing site and an application, in one
Next.js app. Positioned against bizplanner.ai, LivePlan and Upmetrics, but
competing on the things that category leaves unsolved — the numbers, the
sourcing, the review, and the document craft.

## The one rule that matters

**The AI never writes a number that appears in a financial statement.**

`src/lib/finance/` is a deterministic, pure-TypeScript engine with no I/O. The AI
proposes *assumptions*; the engine computes; the AI then narrates what the engine
produced. If you find yourself letting a model emit a figure that lands in a
statement, stop — that is the failure mode the whole product is designed against.

## Commands

```
pnpm dev          # dev server
pnpm build        # production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest — the engine suite is the quality gate
pnpm e2e          # real browser through the purchase journey; needs a server on :3000
pnpm db:push      # apply the schema locally (migrations are what production runs)
```

## Architecture

- `src/app/(marketing)/` — public site, light theme, statically rendered.
- `src/app/(app)/` — the authenticated product (later phase).
- `src/lib/finance/` — the engine. Pure, deterministic, heavily tested.
- `src/lib/content/regulatory/` — **dated** regulatory config. See below.
- `src/components/ui/` — primitives. Components reference semantic tokens
  (`bg-surface`, `text-secondary`), never a ramp step directly.

## Conventions that are load-bearing

**Never hardcode a regulatory value.** DSCR thresholds, EB-5 investment minimums,
Section 179 limits, the FICA wage base — all live in
`src/lib/content/regulatory/` with an effective-date range, a source, and a
`confidence` field. Read them through `inForce()`. This is not hypothetical: SOP
50 10 8.1 takes effect 2026-10-01, and the EB-5 thresholds adjust 2027-01-01.

**Round at the edge, never in the ledger.** Rounding inside the amortisation
schedule once made principal repayments differ from the amount drawn, which broke
the balance sheet. `roundScheduleForDisplay()` exists for presentation; the model
stays at full precision.

**Flows sum, stocks close.** `src/lib/finance/statements.ts` shapes engine
output into table rows, and the annual view of a *flow* (revenue, interest) is
the year's sum while a *stock* (cash, debt, any balance-sheet line) is the
closing month's value. Summing a stock like a flow overstates it about twelvefold
and still ties, so nothing downstream catches it. `flow()` and `stock()` exist so
the choice is explicit at every row.

**Never clamp a balance to hide an inconsistency.** `debtBalance` is deliberately
not `Math.max(0, …)`. A clamp there silently absorbs exactly the class of bug the
balance-sheet tie exists to catch.

**A benchmark band declares its own cost basis.** The engine carries direct
labour in cost of sales, but the published figures disagree with each other about
that: a restaurant's gross margin is quoted on food cost alone, a cleaning
contractor's after the cleaners' wages, because the wages *are* the cost of the
service. `grossMarginBasis` on each `IndustryBenchmark` says which, and
`validate.ts` reads `materialsMarginByYear` or `grossMarginByYear` to match.
Comparing the wrong pair is wrong in both directions — it reported a margin
shortfall on every hospitality plan (the intake flags service staff as direct by
default) and extraordinary profit on every labour business.

**Benchmarks warn, they never overwrite.** Substituting an industry median
destroys the specificity that makes a plan credible. Flag the out-of-band value
with its source and let the author justify it.

**A citation is evidence; a memory is not.** Competitor prices and sources
carry their own date column, and anything undated is excluded from the
blocking count rather than quietly accepted. The same rule runs through the
consistency checker: `buildCitedIndex()` lets a cited claim vouch for a figure
the model does not hold, so citing a market statistic correctly is not
reported as fabricating one.

**Provenance is a feature.** Every driver is tagged `known` / `estimated` /
`benchmark_default` and that tag is rendered in the output. Distinguishing "the
owner told us this" from "we used the industry median" is the cheapest trust
signal available.

**Use the semantic token, not the ramp step.** `text-brass-600` cleared AA on
warm paper and measured 3.46:1 on the app's dark chrome — it was in six files
before anyone noticed. It is now `text-marker`, defined per theme. When a
colour needs to work on both surfaces it needs a token, not a class.

**Colour never carries meaning alone.** The chart palette in `globals.css` was
validated with the dataviz skill's `validate_palette.js` against both surfaces —
don't hand-edit those values. Note the diverging pair is blue↔terracotta, *not*
emerald↔terracotta: green/red measures ΔE 0.8 under protanopia, i.e.
indistinguishable. Positive/negative deltas always carry an arrow and a sign.

## Design language

"Institutional Editorial". Newsreader serif for display, Inter for UI, IBM Plex
Mono for figures. Deep ink navy on warm paper, emerald and brass accents.
Deliberately *not* the purple-gradient AI-startup look every competitor uses.
Hairlines rather than shadows; motion under 200ms and reduced-motion aware.

Regenerate colour ramps with `node scripts/generate-tokens.mjs`.

**Charts are hand-built SVG** (`src/components/charts/`), not a library. If a
chart renders blank in the browser, check hydration first: Next's dev server
blocks its dev resources when the host looks cross-origin, which silently stops
every client component from hydrating and makes any measurement-based component
look broken. `allowedDevOrigins` in `next.config.ts` covers 127.0.0.1 and
localhost.

## The AI layer

`src/lib/ai/` has two generators behind one interface. `AnthropicGenerator` calls
`claude-opus-5` with adaptive thinking and a byte-stable cached system prompt.
`FixtureGenerator` composes prose deterministically from engine output and runs
whenever `ANTHROPIC_API_KEY` is absent.

The fixture path is **not** a stub. It writes real sentences around the same
computed figures, which means the product demos with no key and no spend, and
the end-to-end tests are free and deterministic.

`buildFactsBlock()` in `context.ts` assembles the only numbers a generator may
use. The system prompt forbids inventing any others. `tests/ai.test.ts` enforces
this mechanically: every currency figure appearing in generated prose must trace
to a value the engine computed. That test is the seed of the consistency checker.

`consistency.ts` reconciles written prose against the engine: it extracts every
figure carrying an explicit marker (currency symbol, percent sign, × , or an
employment noun) and requires each to match a value in `buildModelIndex()`.
Two rules keep it from crying wolf, which would be worse than not checking:
tolerance is derived from how precisely the figure was written ("$623.2K" was
rounded to the nearest hundred, so it matches within fifty), and bare numbers
are never checked — they are years and street numbers far more often than
claims. Anything the facts block licenses the generator to use must be in the
index too, benchmarks and payroll loading included, or the check reports the
generator's honest citations as fabrications. `tests/consistency.test.ts` runs
the real generator over every section of two business models and requires zero
findings.

Validation context is built in one place, `src/lib/review/context.ts`. Every
page that validates goes through it — the plan page and the review page
reporting different verdicts on the same plan would destroy trust in both.

`src/lib/research/` has the same two-implementation shape and the opposite
default. `AnthropicResearcher` runs a live web search; `OfflineResearcher`
returns **nothing at all** and says why. That asymmetry with the generator is
deliberate: prose composed from figures the engine already computed invents
nothing, but a citation cannot be composed from nothing, and a fabricated
source in a product whose headline guarantee is zero uncited claims would be
the worst defect in it. `keepVerifiable()` drops anything without an http URL
and an ISO date even when the model returns it — a guarantee that depends on
the model following an instruction is not a guarantee.

Keep `SYSTEM_PROMPT` byte-stable — it carries the cache breakpoint, so a date or
a reordered rule invalidates the cached prefix on every request. Per-plan content
goes in the user message, after the breakpoint.

## Billing

`src/lib/billing/` has the same two-implementation shape as the AI and research
layers, with one critical difference. `FixtureGenerator` is a first-class mode —
composing prose from computed figures is a real thing to do. A fake payment
provider is not: `DevBilling` grants entitlements with no money involved, so it
**throws in its constructor** when `NODE_ENV === "production"`, and
`/billing/simulate` 404s there rather than rendering a disabled screen.

**Only the webhook grants an entitlement.** Not a page, not a server action, not
the redirect back from checkout — a browser that can reach the success URL can
reach it without paying. `grantUnlock()` is called from
`/api/stripe/webhook` and nowhere else, and `Plan.unlockedAt` is written only
there. The development checkout posts a synthetic event to that same handler, so
the dev path exercises the real grant instead of going round it.

**Idempotency is the unique index, not a check.** Stripe retries anything that is
not answered 2xx, for days. `Purchase.stripeEventId` is unique and that
constraint is the lock; `WebhookEvent` does the same job for every other event
type and doubles as the audit trail for "why did my entitlement change".

**An event we will never handle gets a 200.** Returning an error makes Stripe
retry forever. A cross-workspace grant, missing metadata or an unknown type is
recorded with its reason and answered 200. Relatedly, `learnCustomer()` swallows
its own failures: remembering a Stripe customer is a convenience for opening the
portal, and it must not be able to poison an event that grants something.

**The two gates are never merged.** A plan can be blocked because it has not been
paid for (402) or because it has not passed review (409). `entitlementsFor()` is
pure and knows nothing about the validator; the export route reports whichever
applies and names it. Collapsing them tells somebody who has just paid that their
export failed for an unrelated reason.

`entitlements.ts` treats `past_due` as live and runs a cancelled subscription to
the end of the paid period. Cutting somebody off on the first decline is the
behaviour this category is criticised for.

## Versioning

`snapshotPlan()` runs before every regeneration, when intake completes, and
before a restore — so restoring is itself reversible. `src/lib/versions.ts`
diffs at the **sentence** level with an LCS walk: prose regenerates wholesale, a
word-level diff of two independently written paragraphs is confetti, and a
positional comparison marks an insertion's neighbours as rewritten. A diff people
do not trust is worse than no diff.

## Exports

`src/lib/export/document.ts` assembles one document; `pdf.ts`, `xlsx.ts`,
`docx.ts` and `pptx.ts` each render it. Four builders reading four different
assemblies is how a spreadsheet ends up disagreeing with the PDF exported
beside it, so none of them touches a plan directly.

**The workbook is the model, not a picture of it.** The statements are formulas
over a Drivers sheet, so changing a driver recalculates revenue, margin,
coverage and the debt schedule. `exceljs` writes formulas but never evaluates
them, which means a wrong formula ships looking perfect — so
`tests/helpers/xlsx-eval.ts` is a small evaluator covering exactly the subset
the exporter emits, and `tests/xlsx.test.ts` checks every month of the P&L
against the engine. It has already caught an off-by-one that zeroed interest
from month two onward. If you emit a new Excel function, teach the evaluator
about it — it throws on anything unknown rather than returning zero.

The **Filed** sheet is the workbook's tie row: the engine's figures at export,
and a variance row subtracting them from the live formulas. Zero on open, or
the workbook and the plan disagree.

PDF renders the live `/print/[planId]` route through Chromium with the caller's
own cookies, so it is not a privileged path around authorisation and the
preview is what the reader receives. `CHROMIUM_EXECUTABLE_PATH` overrides the
browser when the installed one does not match Playwright's expected build.

`src/styles/print.css` is shared by the print route **and** `/share/[token]` —
they render the same document, and the shared plan is what investors actually
read. It was briefly shipped unstyled because only the print layout imported it.

## Deployment

The origin is **getventurely.com** and that is settled. Nothing reads it as a
literal: `src/lib/env.ts` exports `siteUrl` from `NEXT_PUBLIC_SITE_URL` with the
production domain as the fallback, `brand.ts` derives `domain` and `url` from
that, and the CDK app takes `--context domainName=`. A staging deployment
overrides both and advertises its own canonicals. The brand word stays
*Venturally*, which is not the same string as the domain — do not "fix" one to
match the other.

`DATABASE_URL` alone decides the driver adapter, so there is no second flag to
get out of step: a `postgres://` URL selects `@prisma/adapter-pg`, anything else
selects better-sqlite3. Production must be Postgres, and
`assertProductionEnv()` refuses to boot on a SQLite URL — a container filesystem
is discarded on every deploy, so the alternative is silently losing every plan.

The image's build stage regenerates the client for Postgres, so it also sets a
placeholder `DATABASE_URL` of the matching shape. Without one the default SQLite
URL picks the SQLite adapter against a Postgres client, and Prisma rejects the
pair while Next is collecting page data — so the error names `/api/health`
rather than the mismatch, which sends you looking in the wrong place.

**Migrations, not `db push`.** `prisma migrate deploy` runs in the container's
entrypoint before it binds a port, so a failed migration stops the task rather
than serving traffic against a schema it does not match.

`instrumentation.ts` calls the boot guard, which is why a missing Stripe key is
a startup failure rather than a runtime fallback to `DevBilling`.

The infrastructure is CDK in `infra/`: ECS Fargate behind an ALB behind
CloudFront, RDS Postgres Multi-AZ, the certificate in its own us-east-1 stack
because CloudFront accepts no other region. `DEPLOY.md` is the runbook.

The workflow files live in `infra/workflows/`, not `.github/workflows/`, and not
by choice: GitHub refuses any push that writes under `.github/workflows/` from a
credential without the `workflow` scope, and the tokens available to this session
— both git and the API — lack it. **Nothing runs on a push until somebody with
that scope moves them**, which is one command in DEPLOY.md. `ci.yml` verifies
every pull request and non-main branch, including a container build, because the
image is the artefact that ships. `deploy.yml` runs on push to `main` and stops
on its first step, naming the missing `AWS_DEPLOY_ROLE_ARN`, until step 7 of
DEPLOY.md has been done.

## Known gaps

`typedRoutes` is off. The route surface is complete now, so the original reason
has gone; what remains is that turning it on retypes every `href` in the app at
once, including the ones built from data (`nav.ts`, the industry and learn
indexes, share and print links). `tests/site.test.ts` covers the same failure
mechanically — every nav link must resolve to a route the build generates — so
this is a cleanup, not a hole.

Regulatory values marked `confidence: "unverified"` must not be presented to a
user as authoritative. See `CONFIG_VINTAGE.verificationQueue`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
