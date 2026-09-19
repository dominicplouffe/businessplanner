# Venturally

Investor- and lender-grade business plans, built on a real financial model.

Most AI business-plan tools generate plausible prose over invented numbers. The
most commonly cited reason plans get rejected is not bad writing — it is
unsourced market claims and figures that don't reconcile. So this product is
built the other way round: a deterministic financial engine computes every
number, every market claim carries a dated source, and the narrative is
reconciled to the statements before anything can be exported.

## What's here

| | |
|---|---|
| **Financial engine** | Three linked statements, monthly across 36 or 60 periods, with a balance-sheet tie asserted in every period. Seven revenue-build patterns, loan amortisation, depreciation, working capital, scenarios, sensitivity, cap table. |
| **Underwriter ratios** | DSCR, coverage, current ratio, debt-to-equity, owner compensation — the arithmetic a credit analyst runs, computed before they run it. |
| **Validator** | Twelve blocking checks and eight warnings that gate export. Owner compensation, cash adequacy, statement integrity, cited statistics, narrative/model reconciliation. |
| **Benchmarks** | Industry bands that warn on out-of-band assumptions without overwriting them. |
| **Design system** | "Institutional Editorial" — a validated, colourblind-safe chart palette and a typographic system shared by the site, the app and the exported PDF. |

## Getting started

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Nothing requires an API key to run. Without `ANTHROPIC_API_KEY` the generation
layer falls back to recorded fixtures, so the whole product is demoable and
testable at zero cost.

```bash
pnpm test        # 76 tests; the engine suite is the quality gate
pnpm typecheck
pnpm build
```

## Status

Foundation, design system and financial engine are complete and tested. The
marketing site, application, AI generation layer and export pipeline follow in
the phases described in the project plan.

## Licence

Proprietary. All rights reserved.
