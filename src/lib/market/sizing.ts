import { z } from "zod";
import type { FinancialModel } from "@/lib/finance/engine";

/* ==========================================================================
   Market sizing.
   --------------------------------------------------------------------------
   "A 1% share of a $40 billion market" is the classic unfundable market
   section, and it is unfundable because there is nothing in it a reader can
   check. So the primary path here is bottom-up: a countable population, the
   share of it that plausibly buys, what each one spends. Every step is shown,
   which means a reader can disagree with one number rather than with the
   conclusion.

   Top-down is supported but demoted. It is only admissible with a citation,
   and it is used as a cross-check on the bottom-up figure rather than as the
   answer — if the two diverge by more than about three times, one of them is
   wrong and the plan should say which.

   The check nobody else runs is the third one: the obtainable share is
   compared against what the financial model itself projects. A plan claiming
   0.2% of its market while forecasting eight times that in revenue is
   contradicting itself in a way no amount of prose repairs.
   ========================================================================== */

export const MarketSizingSchema = z.object({
  /** What is being counted, in the owner's own words. */
  populationLabel: z.string().default(""),
  /** How many of them there are. */
  populationCount: z.number().min(0).default(0),
  /** The share who are plausible buyers at all. */
  qualifiedShare: z.number().min(0).max(1).default(1),
  /** What one of them spends on this category in a year. */
  annualSpendPerCustomer: z.number().min(0).default(0),
  /** The share our geography, channel and capacity can actually serve. */
  servableShare: z.number().min(0).max(1).default(1),
  /** The share of that we expect to hold by the end of the horizon. */
  targetShare: z.number().min(0).max(1).default(0),
  /** Where the population figure came from. */
  populationSource: z.string().default(""),

  /** Optional published market size, for the cross-check. Inadmissible
   *  without a citation, which is enforced below rather than trusted. */
  topDownMarketSize: z.number().min(0).optional(),
  topDownLabel: z.string().default(""),
  /** Id of the citation backing the published figure. */
  topDownCitationId: z.string().optional(),
  /** Which year of the model the obtainable share is compared against. */
  compareToYear: z.number().int().min(1).max(10).default(3),
});

export type MarketSizing = z.infer<typeof MarketSizingSchema>;
export type MarketSizingInput = z.input<typeof MarketSizingSchema>;

/** One line of the arithmetic, so the whole calculation reads as a derivation
 *  rather than a result. */
export type SizingStep = {
  key: string;
  label: string;
  /** Rendered by the caller, which knows the currency. */
  value: number;
  kind: "count" | "percent" | "currency";
  /** How this line was reached from the one above it. */
  workings?: string;
  note?: string;
};

export type TopDownCheck =
  | { status: "absent" }
  | { status: "uncited"; value: number; label: string }
  | {
      status: "cited";
      value: number;
      label: string;
      citationId: string;
      /** Top-down over bottom-up. Above three, one of them is wrong. */
      divergence: number;
      diverges: boolean;
    };

export type ModelCheck =
  | { status: "unavailable"; reason: string }
  | {
      status: "checked";
      year: number;
      /** What the engine projects for that year. */
      projectedRevenue: number;
      /** What the obtainable share implies. */
      obtainableRevenue: number;
      /** Projected over obtainable. */
      ratio: number;
      /** True when the model outruns the market the plan claims. */
      overruns: boolean;
      /** True when the plan claims far more market than it means to serve. */
      understates: boolean;
    };

export type MarketSizingResult = {
  /** True once the bottom-up build has the inputs it needs. */
  complete: boolean;
  tam: number;
  sam: number;
  som: number;
  /** Customers the obtainable share implies, which is the number an operator
   *  can sanity-check against their own capacity. */
  impliedCustomers: number;
  steps: SizingStep[];
  topDown: TopDownCheck;
  modelCheck: ModelCheck;
};

/** Divergence beyond this means the two methods disagree materially. */
const DIVERGENCE_LIMIT = 3;
/** The model may exceed the obtainable share by this much before it is a
 *  contradiction rather than rounding. */
const OVERRUN_LIMIT = 1.25;

export function computeSizing(
  input: MarketSizingInput,
  model?: FinancialModel,
): MarketSizingResult {
  const s = MarketSizingSchema.parse(input);

  const qualified = s.populationCount * s.qualifiedShare;
  const tam = qualified * s.annualSpendPerCustomer;
  const sam = tam * s.servableShare;
  const som = sam * s.targetShare;
  const impliedCustomers =
    s.annualSpendPerCustomer > 0 ? som / s.annualSpendPerCustomer : 0;

  const complete =
    s.populationCount > 0 && s.annualSpendPerCustomer > 0 && s.targetShare > 0;

  const steps: SizingStep[] = [
    {
      key: "population",
      label: s.populationLabel || "Population",
      value: s.populationCount,
      kind: "count",
      ...(s.populationSource ? { note: `Source: ${s.populationSource}` } : {}),
    },
    {
      key: "qualified",
      label: "Of whom are plausible buyers",
      value: qualified,
      kind: "count",
      workings: `${formatShare(s.qualifiedShare)} of ${formatCount(s.populationCount)}`,
    },
    {
      key: "spend",
      label: "Spend each per year",
      value: s.annualSpendPerCustomer,
      kind: "currency",
    },
    {
      key: "tam",
      label: "Total addressable market",
      value: tam,
      kind: "currency",
      workings: `${formatCount(qualified)} × spend`,
    },
    {
      key: "sam",
      label: "Serviceable, given where and how we sell",
      value: sam,
      kind: "currency",
      workings: `${formatShare(s.servableShare)} of the total`,
    },
    {
      key: "som",
      label: "Obtainable inside the plan horizon",
      value: som,
      kind: "currency",
      workings: `${formatShare(s.targetShare)} of serviceable`,
      note:
        impliedCustomers > 0
          ? `${formatCount(impliedCustomers)} customers at this spend`
          : undefined,
    },
  ];

  return {
    complete,
    tam,
    sam,
    som,
    impliedCustomers,
    steps,
    topDown: checkTopDown(s, tam),
    modelCheck: checkAgainstModel(s, som, model),
  };
}

function checkTopDown(s: MarketSizing, tam: number): TopDownCheck {
  if (s.topDownMarketSize === undefined || s.topDownMarketSize <= 0) {
    return { status: "absent" };
  }
  // A published figure with no citation is a number someone remembered. It is
  // reported back rather than used.
  if (!s.topDownCitationId) {
    return { status: "uncited", value: s.topDownMarketSize, label: s.topDownLabel };
  }
  const divergence = tam > 0 ? s.topDownMarketSize / tam : Infinity;
  return {
    status: "cited",
    value: s.topDownMarketSize,
    label: s.topDownLabel,
    citationId: s.topDownCitationId,
    divergence,
    diverges: divergence > DIVERGENCE_LIMIT || divergence < 1 / DIVERGENCE_LIMIT,
  };
}

function checkAgainstModel(
  s: MarketSizing,
  som: number,
  model?: FinancialModel,
): ModelCheck {
  if (!model) return { status: "unavailable", reason: "No financial model to compare against." };
  if (som <= 0) {
    return { status: "unavailable", reason: "The obtainable share has not been set yet." };
  }
  const year = model.annual[s.compareToYear - 1] ?? model.annual.at(-1);
  if (!year) return { status: "unavailable", reason: "The model has no annual results." };

  const ratio = year.revenue / som;
  return {
    status: "checked",
    year: model.annual.indexOf(year) + 1,
    projectedRevenue: year.revenue,
    obtainableRevenue: som,
    ratio,
    overruns: ratio > OVERRUN_LIMIT,
    understates: ratio < 0.1,
  };
}

/* -------------------------------------------------------------------------- */

function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function formatShare(n: number): string {
  const percent = n * 100;
  const decimals = percent > 0 && percent < 1 ? 2 : percent % 1 === 0 ? 0 : 1;
  return `${percent.toFixed(decimals)}%`;
}
