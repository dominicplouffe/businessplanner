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

**Never clamp a balance to hide an inconsistency.** `debtBalance` is deliberately
not `Math.max(0, …)`. A clamp there silently absorbs exactly the class of bug the
balance-sheet tie exists to catch.

**Benchmarks warn, they never overwrite.** Substituting an industry median
destroys the specificity that makes a plan credible. Flag the out-of-band value
with its source and let the author justify it.

**Provenance is a feature.** Every driver is tagged `known` / `estimated` /
`benchmark_default` and that tag is rendered in the output. Distinguishing "the
owner told us this" from "we used the industry median" is the cheapest trust
signal available.

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

## Known gaps

`typedRoutes` is off until the route surface is complete — nav data points at
pages that arrive in the content phase. Re-enable in the polish phase.

Regulatory values marked `confidence: "unverified"` must not be presented to a
user as authoritative. See `CONFIG_VINTAGE.verificationQueue`.
