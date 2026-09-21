import type { Assumptions } from "@/lib/finance/types";
import type { FinancialModel } from "@/lib/finance/engine";
import type { ValidationContext } from "@/lib/finance/validate";
import type { ConsistencyReport } from "@/lib/ai/consistency";
import { SCENARIOS, driversMoved } from "@/lib/finance/scenarios";
import { sbaProgrammeForLoan } from "@/lib/content/regulatory";
import { computeSizing, type MarketSizingInput } from "@/lib/market/sizing";
import type { PlanPurpose } from "./rubric";

/* ==========================================================================
   One validation context, built one way.
   --------------------------------------------------------------------------
   The validator takes a context describing what exists outside the model —
   which programme applies, whether a coherent downside exists, whether the
   market was built from the ground up, how many figures failed to reconcile.
   Every page that validates has to supply the same answers, or the plan page
   and the review page report different verdicts on the same plan, which
   destroys trust in both.

   It also fixes a real omission: the product ships a downside scenario moving
   six drivers, and a caller that forgets to say so gets told the plan has no
   downside at all.
   ========================================================================== */

export type MarketEvidence = {
  sizing: MarketSizingInput;
  competitors: { url: string | null; priceDate: string | null }[];
};

export function buildValidationContext(input: {
  purpose: PlanPurpose;
  assumptions: Assumptions;
  /** Supplied once sections have been written and checked. */
  consistency?: ConsistencyReport;
  /** Supplied once the market page has anything on it. */
  market?: MarketEvidence;
  /**
   * Needed for the market comparison below, which cannot run without it.
   * Optional so callers that only inspect the other fields keep working.
   */
  model?: FinancialModel;
  asOf?: Date;
}): ValidationContext {
  const { assumptions } = input;
  const debt =
    assumptions.loans.reduce((sum, loan) => sum + loan.principal, 0) + assumptions.opening.debt;

  return {
    purpose: input.purpose,
    sbaProgramme: sbaProgrammeForLoan(debt, input.asOf).programme,
    // Against this plan, not against the constant. Passing the adjustment
    // alone made the count a compile-time 6, so the `< 5` gate below it
    // could never close on anything.
    downsideScenarioDriverCount: driversMoved(SCENARIOS.downside.adjustment, assumptions),
    ...consistencyFields(input.consistency),
    ...marketFields(input.market, input.model),
    ...(input.asOf ? { asOf: input.asOf } : {}),
  };
}

/**
 * Splits unreconciled figures into the two things they can be.
 *
 * A figure with a near neighbour in the model is a contradiction of the model:
 * the prose says $641,000 where the engine says $623,247, and one of them is
 * wrong. A figure with nothing near it is not a model error at all — it is an
 * outside claim, and the thing missing is a source. The remedies differ, so
 * the validator is told which is which rather than being handed one number.
 */
function consistencyFields(report?: ConsistencyReport): Partial<ValidationContext> {
  if (!report) return {};
  let unreconciled = 0;
  let uncited = 0;
  for (const finding of report.findings) {
    if (finding.nearest) unreconciled++;
    else uncited++;
  }
  return { unreconciledFigureCount: unreconciled, uncitedStatisticCount: uncited };
}

function marketFields(
  market?: MarketEvidence,
  model?: FinancialModel,
): Partial<ValidationContext> {
  if (!market) return {};

  /* The model goes in.

     `computeSizing` has always been able to compare what the plan projects
     against the share of the market it says it can obtain — the module's own
     header calls it "the check nobody else runs". It was right, and for the
     wrong reason: this call passed no model, so `modelCheck` returned
     "unavailable" every time and the check had never run once in production. */
  const sizing = computeSizing(market.sizing, model);
  // Only a competitor carrying both a link and a dated price counts. The check
  // exists because undated evidence is the thing readers discount.
  const evidenced = market.competitors.filter((c) => c.url && c.priceDate).length;

  return {
    competitorCount: market.competitors.length,
    competitorsHaveDatedEvidence: market.competitors.length > 0 && evidenced >= 3,
    hasBottomUpMarketSizing: sizing.complete,
    ...(sizing.topDown.status === "cited"
      ? { tamDivergence: sizing.topDown.divergence }
      : {}),
    ...(sizing.modelCheck.status === "checked" ? { marketModelCheck: sizing.modelCheck } : {}),
  };
}
