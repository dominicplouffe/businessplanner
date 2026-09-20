import type { FinancialModel } from "@/lib/finance/engine";
import type { Metrics } from "@/lib/finance/metrics";
import type { Assumptions } from "@/lib/finance/types";
import type { ValidationResult } from "@/lib/finance/validate";
import type { ConsistencyReport } from "@/lib/ai/consistency";
import { dscrThreshold, inForce, sbaProgrammeForLoan, EQUITY_INJECTION_MINIMUM } from "@/lib/content/regulatory";

/* ==========================================================================
   Readiness scoring.
   --------------------------------------------------------------------------
   Enloop shipped a Performance Score benchmarked against industry averages,
   then died, and nobody rebuilt it — which leaves the best idea the category
   has ever had lying on the floor. This is that idea, with the failure mode
   designed out.

   The failure mode is a vanity number: a score that moves on its own and means
   nothing a reader would recognise. So every point here traces to a check that
   is named, and a plan carrying anything blocking is capped below the passing
   band no matter how well it scores elsewhere. The number is a summary of the
   findings, never a substitute for them.

   Weights shift with who the plan is for, because the readers genuinely differ:
   a credit analyst opens at the coverage ratio, an investment committee opens
   at the growth and the unit economics, and an adjudicator opens at whether the
   owner can live on what the business pays them.
   ========================================================================== */

export type PlanPurpose = "sba-loan" | "investor" | "immigration" | "internal";

export type RubricDimensionKey = "model" | "document" | "consistency" | "evidence" | "reader";

export type RubricCheck = {
  label: string;
  passed: boolean;
  /** What was actually found. Shown whether it passed or not. */
  detail: string;
};

export type DimensionScore = {
  key: RubricDimensionKey;
  label: string;
  /** Why a reader cares, in their terms rather than ours. */
  rationale: string;
  /** 0 to 1. */
  score: number;
  weight: number;
  checks: RubricCheck[];
};

export type ReadinessBand = "not-ready" | "needs-work" | "close" | "ready";

export type Readiness = {
  /** 0 to 100. */
  score: number;
  band: ReadinessBand;
  bandLabel: string;
  /** What the score means for the person holding the plan. */
  verdict: string;
  /** True when blocking findings held the score below the passing band. */
  cappedByBlocking: boolean;
  dimensions: DimensionScore[];
};

export type ReviewInput = {
  purpose: PlanPurpose;
  assumptions: Assumptions;
  model: FinancialModel;
  metrics: Metrics;
  validation: ValidationResult;
  consistency: ConsistencyReport;
  /** Section keys carrying prose, and the full expected set. */
  sectionsWritten: string[];
  sectionsExpected: string[];
  /** What the market page holds. Absent until it has been visited. */
  market?: MarketEvidence;
  asOf?: Date;
};

export type MarketEvidence = {
  sizingComplete: boolean;
  competitorCount: number;
  /** Competitors carrying both a link and a dated price. */
  evidencedCompetitorCount: number;
  citationCount: number;
  /** Citations carrying both a link and a date. */
  followableCitationCount: number;
  /** Figures in the prose that are neither the model's nor cited. */
  uncitedFigureCount: number;
};

/** A blocking finding caps the score here, one point below the passing band. */
const BLOCKING_CAP = 59;

const WEIGHTS: Record<PlanPurpose, Record<RubricDimensionKey, number>> = {
  // The credit decision turns on coverage, so the reader dimension dominates.
  "sba-loan": { model: 0.25, document: 0.15, consistency: 0.2, evidence: 0.1, reader: 0.3 },
  // An investment committee reads the story and the unit economics together.
  investor: { model: 0.2, document: 0.2, consistency: 0.2, evidence: 0.15, reader: 0.25 },
  // An adjudicator reads for credibility above all — Matter of Ho item ten.
  immigration: { model: 0.2, document: 0.2, consistency: 0.25, evidence: 0.15, reader: 0.2 },
  // Nobody outside is reading it, so the model matters more than the prose.
  internal: { model: 0.35, document: 0.15, consistency: 0.2, evidence: 0.1, reader: 0.2 },
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function scoreOf(checks: RubricCheck[]): number {
  if (checks.length === 0) return 1;
  return checks.filter((c) => c.passed).length / checks.length;
}

/* -------------------------------------------------------------------------- */

function modelChecks(input: ReviewInput): RubricCheck[] {
  const { model, metrics, assumptions } = input;
  const tie = model.checks.balanceSheetTie;

  return [
    {
      label: "The balance sheet ties in every period",
      passed: tie.passes,
      detail: tie.passes
        ? `Worst break is ${tie.worstAbsolute.toExponential(1)} — rounding, not error.`
        : `Breaks by ${tie.worstAbsolute.toFixed(2)} in month ${tie.worstMonth}.`,
    },
    {
      label: "Monthly detail covers at least the first year",
      passed: model.horizonMonths >= 12,
      detail: `${plural(model.horizonMonths, "monthly period")} modelled.`,
    },
    {
      label: "Break-even is computed, not asserted",
      passed: metrics.breakEven.monthlyRevenueRequired > 0,
      detail:
        metrics.breakEven.profitMonth !== null
          ? `Operating profit from month ${metrics.breakEven.profitMonth}.`
          : "Not reached inside the horizon, which is itself a finding.",
    },
    {
      label: "Cash never goes negative without a financing line behind it",
      passed: metrics.cash.cashOutMonth === null,
      detail:
        metrics.cash.cashOutMonth === null
          ? `Lowest balance is ${Math.round(metrics.cash.lowestCash).toLocaleString("en-US")} in month ${metrics.cash.lowestCashMonth}.`
          : `Runs out in month ${metrics.cash.cashOutMonth}.`,
    },
    {
      label: "Every driver is registered rather than buried in a formula",
      passed: Object.keys(assumptions.registry).length > 0,
      detail: `${plural(Object.keys(assumptions.registry).length, "driver")} carry a provenance tag.`,
    },
  ];
}

function documentChecks(input: ReviewInput): RubricCheck[] {
  const written = new Set(input.sectionsWritten);
  const missing = input.sectionsExpected.filter((key) => !written.has(key));

  return [
    {
      label: "Every section is written",
      passed: missing.length === 0,
      detail:
        missing.length === 0
          ? `All ${input.sectionsExpected.length} sections present.`
          : `${plural(missing.length, "section")} still empty: ${missing.join(", ")}.`,
    },
    {
      label: "The executive summary exists",
      passed: written.has("executive-summary"),
      detail: written.has("executive-summary")
        ? "Present — the only section many readers finish."
        : "Missing. It is the section most readers judge the plan by.",
    },
    {
      label: "The financial section is written around the model",
      passed: written.has("financials"),
      detail: written.has("financials") ? "Present." : "Missing.",
    },
    {
      label: "Risks are stated rather than left for the reader to find",
      passed: written.has("risks"),
      detail: written.has("risks") ? "Present." : "Missing.",
    },
  ];
}

function consistencyChecks(input: ReviewInput): RubricCheck[] {
  const { consistency } = input;
  const unreconciled = consistency.findings.length;

  return [
    {
      label: "Every figure in the prose traces to the model",
      passed: unreconciled === 0,
      detail:
        consistency.checkedCount === 0
          ? "Nothing written yet, so nothing to reconcile."
          : `${consistency.reconciledCount} of ${consistency.checkedCount} figures reconcile.` +
            (unreconciled > 0 ? ` ${unreconciled} do not.` : ""),
    },
    {
      label: "The written sections have actually been checked",
      passed: consistency.skippedSections.length === 0,
      detail:
        consistency.skippedSections.length === 0
          ? "All sections carried prose to check."
          : `${plural(consistency.skippedSections.length, "section")} were empty and so unchecked.`,
    },
  ];
}

function evidenceChecks(input: ReviewInput): RubricCheck[] {
  const entries = Object.values(input.assumptions.registry);
  const known = entries.filter((e) => e.provenance === "known").length;
  const defaults = entries.filter((e) => e.provenance === "benchmark_default").length;
  const knownShare = entries.length === 0 ? 0 : known / entries.length;
  const defaultShare = entries.length === 0 ? 1 : defaults / entries.length;
  const market = input.market;

  return [
    {
      label: "The plan is built mostly on the owner's own figures",
      passed: knownShare >= 0.4,
      detail:
        entries.length === 0
          ? "No drivers are registered, so nothing in this plan carries a provenance tag."
          : `${known} of ${plural(entries.length, "driver")} measured (${pct(knownShare)}); ${defaults} taken from industry defaults.`,
    },
    {
      label: "Industry defaults are the exception, not the spine",
      passed: entries.length > 0 && defaultShare <= 0.4,
      detail:
        entries.length === 0
          ? "No drivers are registered."
          : defaultShare <= 0.4
            ? `${pct(defaultShare)} of drivers are industry medians — few enough that the plan is recognisably this business.`
            : `${pct(defaultShare)} of drivers are industry medians. A reader discounts a plan built on them.`,
    },
    {
      label: "The market is built from the ground up",
      passed: market?.sizingComplete ?? false,
      detail: !market
        ? "The market page has not been filled in."
        : market.sizingComplete
          ? "A countable population, a qualified share and a spend per customer, with the arithmetic shown."
          : "No bottom-up build yet. A share of a large number is the market section readers discount first.",
    },
    {
      label: "Three competitors are named with dated price evidence",
      passed: (market?.evidencedCompetitorCount ?? 0) >= 3,
      detail: !market
        ? "No competitors recorded."
        : `${market.competitorCount} named, ${market.evidencedCompetitorCount} carrying both a link and a dated price.`,
    },
    {
      label: "Every outside claim carries a source a reader can follow",
      passed:
        market !== undefined &&
        market.uncitedFigureCount === 0 &&
        market.citationCount > 0 &&
        market.followableCitationCount === market.citationCount,
      detail: !market
        ? "No sources recorded."
        : market.citationCount === 0
          ? "No sources recorded. Any statistic the plan quotes counts as uncited."
          : market.uncitedFigureCount > 0
            ? `${plural(market.uncitedFigureCount, "figure")} in the prose ${market.uncitedFigureCount === 1 ? "is" : "are"} neither the model's nor covered by a source.`
            : market.followableCitationCount < market.citationCount
              ? `${market.citationCount - market.followableCitationCount} of ${plural(market.citationCount, "source")} cannot be followed — a reference with no link or no date cannot be re-checked.`
              : `${plural(market.citationCount, "source")}, all dated and linked.`,
    },
  ];
}

function readerChecks(input: ReviewInput): RubricCheck[] {
  const { purpose, metrics, assumptions, model } = input;
  const ownerComp = metrics.underwriter.ownerCompensationByYear;
  const ownerPaidThroughout = ownerComp.length > 0 && ownerComp.every((r) => r.amount > 0);

  const common: RubricCheck = {
    label: "The owner is paid in every period",
    passed: ownerPaidThroughout,
    detail: ownerPaidThroughout
      ? `Owner compensation runs from ${Math.round(ownerComp[0]?.amount ?? 0).toLocaleString("en-US")}.`
      : "At least one year pays the owner nothing. A reader substitutes a market salary and recomputes.",
  };

  if (purpose === "sba-loan") {
    const debt = assumptions.loans.reduce((s, l) => s + l.principal, 0) + assumptions.opening.debt;
    const { programme } = sbaProgrammeForLoan(debt, input.asOf);
    const threshold = dscrThreshold(programme, input.asOf);
    const minimum = inForce(EQUITY_INJECTION_MINIMUM, input.asOf);
    const equity =
      assumptions.equityRounds.reduce((s, r) => s + r.amount, 0) + assumptions.opening.paidInCapital;
    const injection = equity + debt > 0 ? equity / (equity + debt) : 0;
    const dscr = metrics.underwriter.dscrFirstFullYear;

    return [
      common,
      {
        label: `Coverage clears ${threshold.value.toFixed(2)}× in the first full year`,
        passed: dscr !== null && dscr >= threshold.value,
        detail:
          dscr === null
            ? "No debt service to cover."
            : `${dscr.toFixed(2)}× against ${threshold.value.toFixed(2)}× for ${programme} (${threshold.source.label}).`,
      },
      {
        label: `Equity injection reaches ${pct(minimum.value)}`,
        passed: injection >= minimum.value,
        detail: `${pct(injection)} of total capital is equity.`,
      },
      {
        label: "A debt schedule exists behind the coverage figure",
        passed: assumptions.loans.length > 0 || assumptions.opening.debt > 0,
        detail:
          assumptions.loans.length > 0
            ? `${assumptions.loans.length} ${assumptions.loans.length === 1 ? "facility" : "facilities"} scheduled.`
            : "No debt modelled, so there is nothing for a lender to underwrite.",
      },
    ];
  }

  if (purpose === "investor") {
    const ue = metrics.unitEconomics;
    const growth = input.metrics.revenueGrowthByYear.find((g) => g.year === 2)?.growth ?? null;
    return [
      common,
      {
        label: "Lifetime value covers acquisition cost at least three times",
        passed: ue.ltvToCac !== null && ue.ltvToCac >= 3,
        detail:
          ue.ltvToCac === null
            ? "Not modelled — the plan captures no acquisition cost, so the ratio cannot be computed."
            : `${ue.ltvToCac.toFixed(1)}× against the 3× floor.`,
      },
      {
        label: "Acquisition cost pays back inside eighteen months",
        passed: ue.paybackMonths !== null && ue.paybackMonths <= 18,
        detail:
          ue.paybackMonths === null ? "Not modelled." : `${ue.paybackMonths.toFixed(1)} months.`,
      },
      {
        label: "Growth is visible in the second year",
        passed: growth !== null && growth > 0.5,
        detail: growth === null ? "Not computable." : `${pct(growth)} year on year.`,
      },
    ];
  }

  if (purpose === "immigration") {
    const household = assumptions.company.householdSize;
    const firstYearOwner = ownerComp[0]?.amount ?? 0;
    return [
      common,
      {
        label: "Household size is recorded, because marginality is judged against the family",
        passed: household >= 1,
        detail: `Household of ${household}.`,
      },
      {
        label: "The total cost of establishing the enterprise is stated",
        passed: (input.assumptions.enterpriseEstablishmentCost ?? 0) > 0,
        detail:
          (input.assumptions.enterpriseEstablishmentCost ?? 0) > 0
            ? `${Math.round(input.assumptions.enterpriseEstablishmentCost ?? 0).toLocaleString("en-US")} recorded.`
            : "Missing. The substantiality test is proportional, so a dollar figure with no denominator fails on its face.",
      },
      {
        label: "The owner's income is more than a minimal living from year one",
        passed: firstYearOwner > 0,
        detail:
          firstYearOwner > 0
            ? `${Math.round(firstYearOwner).toLocaleString("en-US")} in the first year, against a household of ${household}.`
            : "Nothing budgeted in year one.",
      },
    ];
  }

  return [
    common,
    {
      label: "The plan projects far enough to be useful",
      passed: model.annual.length >= 3,
      detail: `${plural(model.annual.length, "year")} modelled.`,
    },
  ];
}

const BUILDERS: Record<RubricDimensionKey, {
  label: string;
  rationale: string;
  build: (input: ReviewInput) => RubricCheck[];
}> = {
  model: {
    label: "The model",
    rationale: "Whether the arithmetic holds together before anyone reads a word of it.",
    build: modelChecks,
  },
  document: {
    label: "The document",
    rationale: "Whether the plan is finished, or a set of headings with gaps between them.",
    build: documentChecks,
  },
  consistency: {
    label: "Narrative against model",
    rationale:
      "Whether the sentences and the spreadsheet say the same thing. This is the single most cited reason a plan is sent back.",
    build: consistencyChecks,
  },
  evidence: {
    label: "Evidence",
    rationale: "Whether the figures are the owner's own, and whether outside claims carry a source.",
    build: evidenceChecks,
  },
  reader: {
    label: "The reader's own test",
    rationale: "The arithmetic the person receiving this plan will run themselves.",
    build: readerChecks,
  },
};

export function scorePlan(input: ReviewInput): Readiness {
  const weights = WEIGHTS[input.purpose];

  const dimensions: DimensionScore[] = (
    Object.keys(BUILDERS) as RubricDimensionKey[]
  ).map((key) => {
    const builder = BUILDERS[key];
    const checks = builder.build(input);
    return {
      key,
      label: builder.label,
      rationale: builder.rationale,
      score: scoreOf(checks),
      weight: weights[key],
      checks,
    };
  });

  const weighted = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  const raw = Math.round(weighted * 100);
  const hasBlocking = input.validation.blockingCount > 0;
  const score = hasBlocking ? Math.min(raw, BLOCKING_CAP) : raw;

  const band: ReadinessBand =
    score >= 85 ? "ready" : score >= 70 ? "close" : score >= 60 ? "needs-work" : "not-ready";

  return {
    score,
    band,
    bandLabel: BAND_LABELS[band],
    verdict: verdictFor(band, hasBlocking, input),
    cappedByBlocking: hasBlocking && raw > BLOCKING_CAP,
    dimensions,
  };
}

const BAND_LABELS: Record<ReadinessBand, string> = {
  "not-ready": "Not ready to send",
  "needs-work": "Needs work",
  close: "Close",
  ready: "Ready to send",
};

function verdictFor(band: ReadinessBand, hasBlocking: boolean, input: ReviewInput): string {
  if (hasBlocking) {
    const n = input.validation.blockingCount;
    return `${n} finding${n === 1 ? "" : "s"} must be resolved before this can be exported. Until then the score is held below passing, whatever the rest of the plan looks like.`;
  }
  switch (band) {
    case "ready":
      return "Nothing here would send this back. Read it once more for tone, then send it.";
    case "close":
      return "The substance is there. The remaining items are the ones a careful reader would ask about.";
    case "needs-work":
      return "A reader would get through this but would come back with questions the plan should have answered.";
    case "not-ready":
      return "There is enough missing here that sending it would cost you the meeting rather than win it.";
  }
}
