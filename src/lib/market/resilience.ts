import { z } from "zod";

/* ==========================================================================
   AI-disruption resilience.
   --------------------------------------------------------------------------
   As of March 2026 small-business lenders are asking borrowers how AI could
   disrupt their industry over the life of a ten-year loan, and declining
   businesses that look automatable. No product in this category addresses it,
   which makes it the strongest available wedge and one that is only ownable
   while it is new.

   The answer a lender wants is not reassurance. It is a task-level assessment:
   which parts of this business are exposed, what share of the cost base they
   represent, what is genuinely hard to automate here, and what the owner
   intends to do about it. So the module is structured as those three things,
   and the exposure figure is weighted by cost share rather than counted —
   three exposed tasks worth 4% of the cost base is a different business from
   one exposed task worth 60%.
   ========================================================================== */

export const EXPOSURE_LEVELS = ["low", "moderate", "high"] as const;
export type ExposureLevel = (typeof EXPOSURE_LEVELS)[number];

/** The weight each level contributes. Nothing is zero: "low" means slower, not
 *  never, over a ten-year horizon. */
const EXPOSURE_WEIGHT: Record<ExposureLevel, number> = {
  low: 0.1,
  moderate: 0.5,
  high: 0.9,
};

export const MOAT_KINDS = [
  "physical-presence",
  "licence-or-regulation",
  "trust-and-relationship",
  "proprietary-data",
  "local-network",
  "none-claimed",
] as const;
export type MoatKind = (typeof MOAT_KINDS)[number];

export const MOAT_LABELS: Record<MoatKind, string> = {
  "physical-presence": "Work that has to happen in a place",
  "licence-or-regulation": "A licence or regulatory barrier",
  "trust-and-relationship": "Trust built with named people",
  "proprietary-data": "Data nobody else holds",
  "local-network": "A local network that took time to build",
  "none-claimed": "No structural protection claimed",
};

export const HORIZONS = ["now", "year-1", "years-2-3"] as const;
export type Horizon = (typeof HORIZONS)[number];

export const HORIZON_LABELS: Record<Horizon, string> = {
  now: "Already underway",
  "year-1": "Inside year one",
  "years-2-3": "Years two and three",
};

export const TaskExposureSchema = z.object({
  id: z.string().min(1),
  /** What the business actually does, in the owner's words. */
  task: z.string().default(""),
  /** Share of the cost base this task represents, 0 to 1. */
  shareOfCost: z.number().min(0).max(1).default(0),
  level: z.enum(EXPOSURE_LEVELS).default("moderate"),
  /** Why it is exposed, or why it is not. A level with no reasoning is a guess. */
  rationale: z.string().default(""),
});

export const RoadmapStepSchema = z.object({
  id: z.string().min(1),
  horizon: z.enum(HORIZONS).default("now"),
  action: z.string().default(""),
  /** What it is expected to change, stated so it can be checked later. */
  expectedEffect: z.string().default(""),
});

export const ResilienceSchema = z.object({
  tasks: z.array(TaskExposureSchema).default([]),
  moatKind: z.enum(MOAT_KINDS).default("none-claimed"),
  /** The moat in a sentence, in the owner's own words. */
  moatStatement: z.string().default(""),
  roadmap: z.array(RoadmapStepSchema).default([]),
});

export type TaskExposure = z.infer<typeof TaskExposureSchema>;
export type RoadmapStep = z.infer<typeof RoadmapStepSchema>;
export type Resilience = z.infer<typeof ResilienceSchema>;
export type ResilienceInput = z.input<typeof ResilienceSchema>;

export type ResilienceBand = "low" | "moderate" | "high" | "unassessed";

export type ResilienceResult = {
  /** Cost-weighted exposure, 0 to 1. Null until tasks carry cost shares. */
  exposure: number | null;
  band: ResilienceBand;
  bandLabel: string;
  /** Share of the cost base the assessment actually covers. */
  coverage: number;
  /** The tasks a lender will ask about first. */
  mostExposed: TaskExposure[];
  /** What is missing before this answers the question. */
  gaps: string[];
  complete: boolean;
};

const BAND_LABELS: Record<ResilienceBand, string> = {
  low: "Low exposure",
  moderate: "Moderate exposure",
  high: "High exposure",
  unassessed: "Not assessed",
};

export function assessResilience(input: ResilienceInput): ResilienceResult {
  const r = ResilienceSchema.parse(input);
  const named = r.tasks.filter((t) => t.task.trim().length > 0);
  const coverage = named.reduce((sum, t) => sum + t.shareOfCost, 0);

  // Weighted by cost share, not counted: three exposed tasks worth 4% of the
  // cost base is a different business from one exposed task worth 60%.
  const exposure =
    coverage > 0
      ? named.reduce((sum, t) => sum + t.shareOfCost * EXPOSURE_WEIGHT[t.level], 0) / coverage
      : null;

  const band: ResilienceBand =
    exposure === null ? "unassessed" : exposure >= 0.6 ? "high" : exposure >= 0.3 ? "moderate" : "low";

  const gaps: string[] = [];
  if (named.length === 0) {
    gaps.push("No tasks have been assessed, so there is nothing for a lender to read.");
  }
  if (named.length > 0 && coverage < 0.6) {
    gaps.push(
      `The assessment covers ${Math.round(coverage * 100)}% of the cost base. A lender reads the gap as the part you did not want to talk about.`,
    );
  }
  if (named.some((t) => t.rationale.trim().length === 0)) {
    gaps.push("At least one task carries a rating with no reasoning behind it.");
  }
  if (r.moatKind === "none-claimed" || r.moatStatement.trim().length === 0) {
    gaps.push("No moat is stated. Over a ten-year term this is the question the rating hangs on.");
  }
  if (r.roadmap.filter((s) => s.action.trim().length > 0).length === 0) {
    gaps.push("No adoption steps are planned. Exposure without a response reads as no answer at all.");
  }

  return {
    exposure,
    band,
    bandLabel: BAND_LABELS[band],
    coverage,
    mostExposed: [...named]
      .sort((a, b) => b.shareOfCost * EXPOSURE_WEIGHT[b.level] - a.shareOfCost * EXPOSURE_WEIGHT[a.level])
      .slice(0, 3),
    gaps,
    complete: gaps.length === 0,
  };
}
