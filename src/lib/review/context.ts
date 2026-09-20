import type { Assumptions } from "@/lib/finance/types";
import type { ValidationContext } from "@/lib/finance/validate";
import type { ConsistencyReport } from "@/lib/ai/consistency";
import { SCENARIOS, driversMoved } from "@/lib/finance/scenarios";
import { sbaProgrammeForLoan } from "@/lib/content/regulatory";
import type { PlanPurpose } from "./rubric";

/* ==========================================================================
   One validation context, built one way.
   --------------------------------------------------------------------------
   The validator takes a context describing what exists outside the model —
   which programme applies, whether a coherent downside exists, how many
   figures failed to reconcile. Every page that validates has to supply the
   same answers, or the plan page and the review page report different verdicts
   on the same plan, which destroys trust in both.

   It also fixes a real omission: the product ships a downside scenario moving
   six drivers, and a caller that forgets to say so gets told the plan has no
   downside at all.
   ========================================================================== */

export function buildValidationContext(input: {
  purpose: PlanPurpose;
  assumptions: Assumptions;
  /** Supplied once sections have been written and checked. */
  consistency?: ConsistencyReport;
  /** Named competitors gathered with dated evidence. Grounded research is
   *  not built yet, so this stays absent and the validator says so. */
  competitorCount?: number;
  competitorsHaveDatedEvidence?: boolean;
  asOf?: Date;
}): ValidationContext {
  const { assumptions } = input;
  const debt =
    assumptions.loans.reduce((sum, loan) => sum + loan.principal, 0) + assumptions.opening.debt;

  return {
    purpose: input.purpose,
    sbaProgramme: sbaProgrammeForLoan(debt, input.asOf).programme,
    downsideScenarioDriverCount: driversMoved(SCENARIOS.downside.adjustment),
    ...(input.consistency ? { unreconciledFigureCount: input.consistency.findings.length } : {}),
    ...(input.competitorCount !== undefined ? { competitorCount: input.competitorCount } : {}),
    ...(input.competitorsHaveDatedEvidence !== undefined
      ? { competitorsHaveDatedEvidence: input.competitorsHaveDatedEvidence }
      : {}),
    ...(input.asOf ? { asOf: input.asOf } : {}),
  };
}
