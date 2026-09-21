# Venturelly — working notes

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

**Write a section through `writeSection()`, never `updateMany`.** `createPlan`
seeds the skeleton, so a section added to `PLAN_SECTIONS` afterwards exists on
no plan created before it — and an `updateMany` matching zero rows is not an
error, so the page rendered, took the text, said "Saved" and kept nothing.
`writeSection` upserts on `@@unique([planId, key])`, which makes adding a
section safe for existing plans. The one `updateMany` left is the guarded
`status: "generating"` reset, and `tests/section-writes.test.ts` keeps it that
way.

**Never hardcode a regulatory value.** DSCR thresholds, EB-5 investment minimums,
Section 179 limits, the FICA wage base — all live in
`src/lib/content/regulatory/` with an effective-date range, a source, and a
`confidence` field. Read them through `inForce()`. This is not hypothetical: SOP
50 10 8.1 takes effect 2026-10-01, and the EB-5 thresholds adjust 2027-01-01.

`inForce()` returns `stale: true` when nothing is in force and it has fallen
back to the last entry on record. It does not throw — going down on a date
nobody wrote down is worse — but every surface that shows a regulatory figure
must say so, and `staleSeries()` names any series that has run out. The
comparison is made in `America/New_York`, because these are US federal
effective dates and UTC turns a threshold over up to seven hours early.

The payroll load is one of these values, not a constant in the schema:
`PayrollSchema` takes its defaults from `PAYROLL_LOAD` and `FICA_WAGE_BASE`
through `inForce()`, as *functions* so the date is not frozen at import. An
author's own figure still wins.

**Growth has a ceiling, always.** `src/lib/finance/growth.ts` projects volume
logistically toward a capacity the author has to name, and every stream carries
a `GrowthCurve`. A constant rate compounded for sixty months is what produced
$4.3 trillion of year-five revenue on one employee, and it validated clean
because every cost line is a percentage of revenue so the margins stayed in
band at any scale. The ceiling decides year five; the rate only decides how
fast you get there. `unbounded` exists as a declared shape purely so the
validator can name it back — it is a blocking finding, not an option.

Three things about that module are load-bearing. It is written with `Math.pow`
and never `Math.exp` or `Math.log`, because `xlsx.ts` emits the same projection
as a live Excel formula and the evaluator has `POWER` and no `EXP` — the
TypeScript and the spreadsheet have to be the same expression. The intrinsic
rate is *solved for* so the first month grows at exactly the rate the author
typed; feeding the rate in directly gives 6.2% to someone who asked for 8%. And
the degenerate cases are branches rather than guards: a negative rate declines
geometrically rather than accelerating into a floor, and a business above its
ceiling reverts to it, which is where the textbook logistic has a pole and
returns negative revenue around month 46.

**Payroll follows the business.** The loaded cost is computed inside the month
loop, roles carry a raise indexed from their own start month, and a role can
derive its headcount from volume. Heads round *up* and ratchet by default —
without the ratchet a seasonal business dismisses its crew every February.
`hourly-services` used to grow billable heads to produce revenue and charge
nothing for them; a role staffed by `billable-heads` now pays for them.

The load is charged in two parts because only one of them is capped. Benefits
and the Medicare half apply to every dollar; the OASDI half stops once a head
has earned `taxableWageBase` within a **calendar** year, which is why the
accumulator resets on the calendar rather than on the model's own year one. A
flat `1 + payrollTaxRate + benefitsRate` invented roughly $7k a year of
employer tax on every high earner. `xlsx.ts` emits the same piecewise
arithmetic — a capped engine against a flat workbook is the two disagreeing on
the first big salary, which is exactly what `tests/xlsx.test.ts` exists to
catch.

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
constraint is the lock; `WebhookEvent` is the audit trail for "why did my
entitlement change", and it deliberately does **not** decide whether a delivery
runs. It once did — `if (!seen.firstDelivery) return 200` — and because the row
is written *before* the handler, a handler that threw answered 500 to make
Stripe retry and the retry then matched the row its own failure had written.
One transient database error took the money and left the plan locked, for good.
`shouldHandleDelivery()` skips a delivery only on a terminal outcome
(`processed`, `ignored`); `failed`, `pending` and anything unrecognised run
again, because every handler is idempotent and the two failure modes are not
symmetric.

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

**A snapshot is the plan, not the prose.** It carries the assumptions, the
registry and the intake context as well as the sections, and `restorePayload()`
writes all four back in one transaction. Restoring only the prose put the
document and the model into disagreement — the thing this product exists to
prevent — and because the sentence diff cannot see a change in the numbers, the
history page reports `modelChanged` separately so a model-only snapshot can
still be restored. A field absent from an older snapshot is left alone rather
than written as a blank.

The safety snapshot a restore takes first carries `reason: "restore"`, and
`pickRevertTarget()` skips it. Without that, "Undo last change" grabbed the
snapshot it had just created and a second click redid the thing you undid.

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
overrides both and advertises its own canonicals.

**The brand word is Venturelly and the domain is getventurely.com.** They differ
by one `l` and that is correct — do not "fix" either to match the other. Earlier
spellings (the brand with an `a`, the domain with an `a`, the domain with a
double `l`) were each fixed by hand and each came back, because a rename is a
hundred small edits and the survivors hide in copy nobody re-reads. So
`tests/site.test.ts` fails on any of them now. If that test fires, the spelling
is the bug, not the test.

The one exemption is the ECR repository name in the two workflow files, which an
agent session cannot edit — see the note at the end of this section.

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

That CLI is installed separately, with npm, in the image's `migrator` stage, and
lives in its own tree at `/app/migrate`. It cannot be copied out of the pnpm
tree: pnpm's `node_modules` is a symlink farm, and the CLI's own dependencies sit
beside it in the virtual store rather than at the top level, so a `COPY` of
`node_modules/prisma` yields a CLI that dies on `Cannot find module
'@prisma/config'`. For the same reason the image ships `docker/prisma.config.js`
in place of the repository's `prisma.config.ts` — a `.ts` config needs the
TypeScript compiler, and `dotenv` has no business in a runtime image whose
environment comes from the task definition.

`instrumentation.ts` calls the boot guard, which is why a missing Stripe key is
a startup failure rather than a runtime fallback to `DevBilling`.

The infrastructure is CDK in `infra/`: ECS Fargate behind an ALB behind
CloudFront, RDS Postgres Multi-AZ, the certificate in its own us-east-1 stack
because CloudFront accepts no other region. `DEPLOY.md` is the runbook and
`node scripts/deploy.mjs` is the runbook made executable — it asks for what it
needs, checks each step against AWS before doing it, and is re-runnable, which is
what a twenty-five-minute step requires. It is Node with no dependencies
specifically so that `jq` and `openssl` are not prerequisites: `JSON.stringify`
and `crypto.randomBytes` do both jobs. **Document it as `node scripts/deploy.mjs`
and not as `pnpm deploy:aws`** — the `package.json` alias exists, but a script
whose whole point is having no dependencies must not require a package manager
to launch it, and the person deploying turned out not to have pnpm installed.

**Pin a major engine version, never a minor.** `VER_17_2` failed the first real
deploy ten minutes in with `Cannot find version 17.2 for postgres` — AWS retires
Postgres minors on a schedule, so a pinned minor is a deploy that stops working
on a date nobody wrote down. `VER_17` renders `EngineVersion: "17"` and RDS uses
the current default. `tests/deploy.test.ts` fails on anything narrower.

**A first deploy must not ask for tasks it cannot start.** The ECR repository is
created by the same stack as the service, so on a first deploy it is necessarily
empty — and CloudFormation blocks until an `AWS::ECS::Service` reaches steady
state, which a service that cannot pull an image never does. With the deployment
circuit breaker on it fails outright, taking twenty-five minutes of RDS and
CloudFront down in the rollback. `BOOTSTRAP_TAG` in `infra/lib/site-stack.ts` is
the answer: a deploy carrying that tag creates the service with
`desiredCount: 0`, which is stable at once, and the second deploy raises it
against an image that exists. The autoscaling block is skipped for the same
deploy and that is the half that is easy to miss — Application Auto Scaling
*enforces* `minCapacity`, so a scalable target registered during the bootstrap
would put the count straight back to 2 and reproduce the hang.

**Do not retain or protect a database on a deploy that might not finish.** The
RETAIN on the RDS instance exists so a production database is not one `cdk
destroy` away from losing every plan anybody paid for, and it stays — but applied
to a *first* create it turns a failure into a wedge:

    ROLLBACK_FAILED | VenturellySite
    DELETE_FAILED   | DatabaseSecurityGroup, Vpc/dataSubnet1, Vpc/dataSubnet2

Note which resource is absent. RETAIN did what it says: CloudFormation kept the
database, and the retained instance's network interfaces held the isolated
subnets and the security group, so the rollback could not finish. Clearing it
meant deleting by hand a database that had never finished being created. So
`deletionProtection` and `RemovalPolicy.RETAIN` are both conditioned on
`!bootstrapping` — they arrive with the second deploy, which is also the one that
brings the service up, and by then there is something to protect. Both changes
are metadata or an in-place modify; neither replaces the instance.

**A deleted stack is not a clean slate, however it was deleted.** Two resources
outlive one and then collide on the next create: the ECR repository carries
`removalPolicy: RETAIN` with a fixed name, and CloudFormation deletes a Secrets
Manager secret with a recovery window of up to thirty days that keeps the name
reserved. CloudFormation reports the collision as
`[AWS::EarlyValidation::ResourceExistenceCheck]`, which names neither resource
and advises `DescribeEvents` on a stack that may not exist.

So the script checks for both **whenever the stack is about to be created**, not
only when it did the deleting itself. That distinction cost a deploy: the stack
had been deleted by hand — correctly, after a `ROLLBACK_FAILED` the script hands
back — so step 3 said "does not exist yet" and skipped the two functions written
for exactly this. A stack in `update` is the one case that must be left alone: it
owns both, and offering to delete either is offering to break a running service.

`REVIEW_IN_PROGRESS` is the one `_IN_PROGRESS` status that is not in progress. A
change set that fails to create on a new stack parks an empty stack there
indefinitely, so `stackAction` puts it in `recreate` rather than waiting forever
for it to settle.

A `DELETE_FAILED` or `ROLLBACK_FAILED` the script still refuses, because that
needs `--retain-resources` and a decision about what to keep — but it prints the
likely cause and the exact commands.

**The deploy script writes answers down and never secrets.** `.deploy.json`
(gitignored) carries region, account, domain and zone so a re-run does not
re-ask. The four secret values go straight to Secrets Manager and are redacted
even from `--dry-run` output. `answersToPersist()` is an allow-list rather than a
deny-list, so a key added to the prompts later cannot leak by being forgotten,
and `tests/deploy.test.ts` asserts no secret survives serialisation.

**`STRIPE_WEBHOOK_SECRET` is inherently a second pass.** Stripe issues it when
the endpoint is created, the endpoint needs the live URL, and the boot guard
refuses to start without a value — so a marked placeholder goes in first and is
replaced once the service is up. Nothing may report the deploy finished while
that placeholder is in place: the webhook is the only code that grants an
entitlement.

**A key read out of a secret has to be a key that secret contains.** The task
definition asked for `uri` on the database secret and every task died before
starting:

    ResourceInitializationError: unable to pull secrets or registry auth:
    retrieved secret from Secrets Manager did not contain json key uri

There is no such key and there never was. `dbSecret` is generated with
`username` and `password`; attaching it to the instance adds `host`, `port`,
`dbname` and `dbInstanceIdentifier`. Nothing in RDS or Secrets Manager composes
a connection URL. So only `username` and `password` are read as secrets, the
endpoint comes off the `database` construct as plain environment — an address in
an isolated subnet is not a credential — and `docker-entrypoint.sh` assembles
`DATABASE_URL` from the five, letting an explicit one win so `docker-compose`
and every local run are unaffected.

Interpolating the password straight into that URL is safe **by construction**:
`excludeCharacters` on `DbSecret` removes every character significant in a URL.
Relaxing that set without encoding in the entrypoint yields a connection string
that parses and points somewhere else. `tests/deploy.test.ts` checks both — the
keys read against the keys created, and the excluded set.

**A readline interface swallows Ctrl-C.** On a TTY, with no `SIGINT` listener
attached, it emits `pause` on the stream rather than letting the signal reach the
process. That was harmless while `scripts/deploy.mjs` created and closed an
interface around each question; keeping one open for the whole run — which is
what made piped input work — left no way out of a five-minute wait.
`process.on("SIGINT")` does not help on its own, because readline consumes the
signal first: the listener has to be on the interface as well. The handler names
the step, says what the interrupt cost there, and prints the `--from=` to resume
with.

**Check the daemon, not the client.** `docker --version` prints the client's own
version and contacts nothing, so it succeeded on a machine where the socket was
root-only — `✓ Docker version 29.7.2` printed immediately before `permission
denied while trying to connect to the docker API`. `docker version --format
{{.Server.Version}}` is the probe. The same shape as the RDS preflight that never
ran: a check that cannot fail is not a check.

How Docker is invoked is resolved once, into `DOCKER`, and login, build and push
all go through it. That is not tidiness — `docker login` writes credentials into
the home directory of whoever runs it, so prefixing `sudo` on the build alone
leaves the push authenticating as root against a config written by the user, and
the resulting denial reads as an ECR fault.

`--platform linux/amd64` on `docker build` is not optional. The task definition
pins X86_64, and an arm64 image dies with `exec format error`, which reads as an
application fault.

`.github/workflows/ci.yml` verifies every pull request and non-main branch,
including a container build, because the image is the artefact that ships — a
broken Dockerfile should fail on a branch rather than during a deploy.
`deploy.yml` runs on push to `main` and stops on its first step, naming the
missing `AWS_DEPLOY_ROLE_ARN`, until the GitHub deploy role step of DEPLOY.md
has been done. After that a push to `main` *is* the deploy: verify, build, push,
`cdk deploy`, wait for the service, invalidate, check `/api/health`.
`node scripts/deploy.mjs --from=6` is the same thing by hand.

**A migration is the only irreversible part of an update.** The service rolls
forward with no downtime and the circuit breaker reverts a bad image by itself,
but redeploying an earlier tag does not undo `prisma migrate deploy` — it already
ran in the entrypoint before the port was bound. Nothing reviews a migration
before it applies.

**You cannot edit either file from an agent session.** GitHub refuses a push that
writes under `.github/workflows/` unless the credential carries the `workflow`
scope, and neither the git credential nor the REST API available here has it.
Both routes fail late, after the commit looks fine locally. A change to a workflow
has to be made from a clone; there is no workaround worth building, and parking
the files elsewhere so a push succeeds means the repository has no CI.

## Known gaps

`typedRoutes` is off. The route surface is complete now, so the original reason
has gone; what remains is that turning it on retypes every `href` in the app at
once, including the ones built from data (`nav.ts`, the industry and learn
indexes, share and print links). `tests/site.test.ts` covers the same failure
mechanically — every nav link must resolve to a route the build generates — so
this is a cleanup, not a hole.

Regulatory values marked `confidence: "unverified"` must not be presented to a
user as authoritative. See `CONFIG_VINTAGE.verificationQueue`.

`revenuePerEmployee` exists on only two of the twenty-one benchmarks, so the
revenue-per-employee rule blocks on an absolute sanity bound and warns only
where a sourced band exists. Populating the other nineteen needs real sources,
not estimates — a band that names no source is the thing this project does not
do.

**Two dated values the config names and does not yet hold.** There is no
2026-10-01 entry in `DSCR_THRESHOLDS` for SOP 50 10 8.1, and no Section 179 or
bonus-depreciation config at all, although both are named above and in
`CONFIG_VINTAGE.verificationQueue`. Neither can be filled from an estimate. The
EB-5 minimums expire 2027-01-01 with no successor published; `inForce()` now
reports that as `stale` rather than serving the old figure as current, which is
the honest interim.

`cap-table.ts` is reachable from no page or action. Its arithmetic is correct
and tested — SAFEs convert on a post-money cap against the converted table, and
the priced investor gets the percentage it negotiated — but nothing renders it
yet, so read the tests before wiring it up.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
