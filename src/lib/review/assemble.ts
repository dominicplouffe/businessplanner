import type { Assumptions } from "@/lib/finance/types";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import {
  buildCitedIndex,
  buildMarketIndex,
  buildModelIndex,
  buildResilienceIndex,
  checkPlan,
} from "@/lib/ai/consistency";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { MarketSizingSchema } from "@/lib/market/sizing";
import { ResilienceSchema } from "@/lib/market/resilience";
import { buildValidationContext } from "./context";
import { asPlanPurpose, scorePlan, type MarketEvidence } from "./rubric";
import { buildFixQueue } from "./queue";

/* ==========================================================================
   Assembling a review.
   --------------------------------------------------------------------------
   Three pages need the same answer — the plan page shows a summary, the review
   page shows the whole thing, and export will gate on it. Assembling it in one
   place is what stops them drifting apart, which is the same reason the
   validation context is built in one place.
   ========================================================================== */

export type ReviewablePlan = {
  id: string;
  purpose: string;
  marketJson: string;
  resilienceJson: string;
  sections: { key: string; contentText: string }[];
  competitors: { url: string | null; priceDate: string | null; priceLabel: string }[];
  citations: { url: string | null; sourceDate: string; claim: string }[];
};

export function assembleReview(plan: ReviewablePlan, assumptions: Assumptions) {
  const purpose = asPlanPurpose(plan.purpose);
  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);

  const sections = PLAN_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    text: plan.sections.find((s) => s.key === section.key)?.contentText ?? "",
  }));

  // Citations vouch for figures the model does not hold, so they are supplied
  // alongside the model index: citing a market statistic correctly must not be
  // reported as fabricating one.
  const sizing = parseSizingJson(plan.marketJson);
  const resilience = parseResilienceJson(plan.resilienceJson);

  const consistency = checkPlan(
    sections,
    [
      ...buildModelIndex(model, metrics, assumptions),
      // The market build's figures are computed too, so quoting them is not
      // an unsupported claim.
      ...buildMarketIndex(sizing, model),
      ...buildResilienceIndex(resilience),
    ],
    // A competitor's price is evidence in exactly the way a citation is: an
    // observation with a date on it. Undated ones are excluded, which is the
    // same bar the competitor matrix holds them to.
    buildCitedIndex([
      ...plan.citations.map((c) => c.claim),
      ...plan.competitors.filter((c) => c.priceDate).map((c) => c.priceLabel),
    ]),
  );
  const evidencedCompetitorCount = plan.competitors.filter((c) => c.url && c.priceDate).length;
  const followableCitationCount = plan.citations.filter((c) => c.url && c.sourceDate).length;

  const validation = validateModel(
    model,
    metrics,
    buildValidationContext({
      purpose,
      assumptions,
      consistency,
      market: { sizing, competitors: plan.competitors },
      model,
    }),
  );

  const market: MarketEvidence = {
    sizingComplete: MarketSizingSchema.safeParse(sizing).success && isComplete(sizing),
    competitorCount: plan.competitors.length,
    evidencedCompetitorCount,
    citationCount: plan.citations.length,
    followableCitationCount,
    // A figure with no near neighbour in the model is an outside claim, and
    // what it is missing is a source rather than a correction.
    uncitedFigureCount: consistency.findings.filter((f) => !f.nearest).length,
  };

  const readiness = scorePlan({
    purpose,
    assumptions,
    model,
    metrics,
    validation,
    consistency,
    sectionsWritten: sections.filter((s) => s.text.trim().length > 0).map((s) => s.key),
    sectionsExpected: sections.map((s) => s.key),
    market,
  });

  return {
    purpose,
    model,
    metrics,
    sections,
    consistency,
    validation,
    readiness,
    queue: buildFixQueue(plan.id, validation, consistency, assumptions.company.currency),
  };
}

function parseSizingJson(json: string) {
  try {
    return MarketSizingSchema.parse(json ? JSON.parse(json) : {});
  } catch {
    return MarketSizingSchema.parse({});
  }
}

function isComplete(sizing: ReturnType<typeof parseSizingJson>): boolean {
  return sizing.populationCount > 0 && sizing.annualSpendPerCustomer > 0 && sizing.targetShare > 0;
}

function parseResilienceJson(json: string) {
  try {
    return ResilienceSchema.parse(json ? JSON.parse(json) : {});
  } catch {
    return ResilienceSchema.parse({});
  }
}
