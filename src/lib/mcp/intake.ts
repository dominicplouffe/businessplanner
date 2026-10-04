import {
  INTAKE_STEPS,
  PURPOSES,
  REVENUE_MODELS,
  type DriverField,
} from "@/lib/content/intake";
import { INDUSTRY_BENCHMARKS } from "@/lib/finance/benchmarks";
import type { Provenance, RevenueStreamKind } from "@/lib/finance/types";
import type { IntakeState, ProvenanceState } from "@/lib/content/intake-mapper";
import { defaultsForIndustry, revenueSeedsFor } from "@/lib/content/intake-defaults";

/* ==========================================================================
   The intake, for a machine.
   --------------------------------------------------------------------------
   `INTAKE_STEPS` is one list with one renderer so the wizard cannot drift from
   the engine. This is a second renderer of the same list, not a second list:
   the questions an MCP client is asked, and the checks its answers face, are
   the wizard's own.

   What a client supplies here is an assumption — a driver the engine builds
   the statements from. No statement figure can be written through this
   surface, which is what keeps the one rule in CLAUDE.md true when the author
   is another model.
   ========================================================================== */

export const REVENUE_KINDS = REVENUE_MODELS.map((m) => m.kind) as [
  RevenueStreamKind,
  ...RevenueStreamKind[],
];

const DEFAULT_KIND: RevenueStreamKind = "retail-footfall";

/** Every field the intake asks for a business of this kind, keyed. */
export function fieldsFor(kind: RevenueStreamKind): Map<string, DriverField> {
  const state = { "rev.kind": kind };
  const fields = new Map<string, DriverField>();
  for (const step of INTAKE_STEPS) {
    for (const field of step.fields(state)) fields.set(field.key, field);
  }
  return fields;
}

/** The kind an answer set describes, defaulting as the mapper does. */
export function kindOf(state: Record<string, unknown>): RevenueStreamKind {
  const kind = state["rev.kind"];
  return REVENUE_KINDS.includes(kind as RevenueStreamKind)
    ? (kind as RevenueStreamKind)
    : DEFAULT_KIND;
}

type FieldDescription = {
  key: string;
  label: string;
  type: DriverField["kind"];
  required: boolean;
  hint?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  /** True when the value is a driver whose source is printed in the plan. */
  tracksSource: boolean;
};

function describeField(field: DriverField): FieldDescription {
  return {
    key: field.key,
    label: field.label,
    type: field.kind,
    required: Boolean(field.required),
    ...(field.hint ? { hint: field.hint } : {}),
    ...(field.min !== undefined ? { min: field.min } : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    // The industry list is returned once, below, rather than in every copy.
    ...(field.options && field.key !== "company.industryKey" ? { options: field.options } : {}),
    tracksSource: Boolean(field.provenance),
  };
}

/** The questionnaire, step by step, for one revenue model. */
export function describeIntake(kind?: RevenueStreamKind) {
  const state = { "rev.kind": kind ?? DEFAULT_KIND };
  return {
    conventions: [
      "Answers are keyed by `key`. Send only keys listed here.",
      "Percent fields are 0–100 (enter 12.5 for 12.5%), not 0–1.",
      "Currency fields are plain numbers in US dollars.",
      "`month` fields are yyyy-mm.",
      "The revenue step's questions depend on `rev.kind`; ask for the questions again with that model to see them.",
    ],
    revenueModels: REVENUE_MODELS,
    purposes: PURPOSES,
    industries: INDUSTRY_BENCHMARKS.map((b) => ({ value: b.key, label: b.label })),
    revenueModel: state["rev.kind"],
    steps: INTAKE_STEPS.map((step) => ({
      key: step.key,
      title: step.title,
      lede: step.lede,
      fields: step.fields(state).map(describeField),
    })),
  };
}

export type AnswerError = { key: string; message: string };

/**
 * Checks a set of answers against the fields their revenue model asks for.
 * Valid answers come back normalised; each invalid one comes back named, so a
 * client can correct exactly that answer rather than resending everything.
 */
export function validateAnswers(
  answers: Record<string, unknown>,
  current: Record<string, unknown> = {},
): { accepted: IntakeState; errors: AnswerError[]; warnings: AnswerError[] } {
  const kind = kindOf({ ...current, ...answers });
  const fields = fieldsFor(kind);
  const accepted: IntakeState = {};
  const errors: AnswerError[] = [];
  const warnings: AnswerError[] = [];

  for (const [key, raw] of Object.entries(answers)) {
    const field = fields.get(key);
    if (!field) {
      errors.push({
        key,
        message: `Not a question for a ${kind} business. Ask for the questions to see the keys it uses.`,
      });
      continue;
    }
    const result = normalise(field, raw);
    if ("error" in result) {
      errors.push({ key, message: result.error });
      continue;
    }
    accepted[key] = result.value;
    /* The likeliest slip from a model: a rate written as a fraction. 0.05 is
       accepted — 0.05% is a legal answer — but it is said back, because a
       churn of 0.05% where 5% was meant is a plan that never loses a
       customer, and every figure downstream would look reasonable. */
    if (field.kind === "percent" && typeof result.value === "number" && result.value > 0 && result.value < 1) {
      warnings.push({
        key,
        message: `Recorded as ${result.value}%. Percent fields are 0–100; if you meant ${+(result.value * 100).toFixed(4)}%, send ${+(result.value * 100).toFixed(4)}.`,
      });
    }
  }
  return { accepted, errors, warnings };
}

function normalise(field: DriverField, raw: unknown): { value: string | number } | { error: string } {
  switch (field.kind) {
    case "number":
    case "currency":
    case "percent": {
      const value = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,%\s]/g, ""));
      if (!Number.isFinite(value)) return { error: `${field.label} needs a number.` };
      if (field.min !== undefined && value < field.min) {
        return { error: `${field.label} cannot be below ${field.min}.` };
      }
      if (field.max !== undefined && value > field.max) {
        return { error: `${field.label} cannot be above ${field.max}.` };
      }
      return { value };
    }
    case "select": {
      const value = String(raw);
      const allowed = field.options?.map((o) => o.value) ?? [];
      return allowed.includes(value)
        ? { value }
        : { error: `${field.label} must be one of: ${allowed.join(", ")}.` };
    }
    case "month": {
      const value = String(raw);
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
        ? { value }
        : { error: `${field.label} must be a month as yyyy-mm.` };
    }
    case "text":
    case "textarea": {
      const value = String(raw ?? "").trim();
      const limit = field.kind === "text" ? 120 : 2000;
      if (field.required && !value) return { error: `${field.label} cannot be empty.` };
      return value.length <= limit
        ? { value }
        : { error: `${field.label} is limited to ${limit} characters.` };
    }
  }
}

/** Required questions this answer set has not answered yet. */
export function missingRequired(state: Record<string, unknown>): { key: string; label: string }[] {
  const missing: { key: string; label: string }[] = [];
  for (const field of fieldsFor(kindOf(state)).values()) {
    if (!field.required) continue;
    const value = state[field.key];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.push({ key: field.key, label: field.label });
    }
  }
  return missing;
}

/**
 * Answers still carrying an industry median rather than anything the author
 * said. They are printed as such in the plan, and a client should put each one
 * to the person it is writing for rather than let it stand by default.
 */
export function benchmarkDefaults(state: IntakeState, provenance: ProvenanceState) {
  const fields = fieldsFor(kindOf(state));
  return Object.entries(provenance)
    .filter(([key, tag]) => tag === "benchmark_default" && fields.has(key) && fields.get(key)!.provenance)
    .map(([key]) => ({ key, label: fields.get(key)!.label, value: state[key] }));
}

/**
 * The provenance each accepted answer is recorded with. A driver is
 * `estimated` unless the caller says the person stated it; only fields whose
 * source the plan prints carry a tag at all, as in the wizard.
 */
export function provenanceFor(
  accepted: IntakeState,
  declared: Record<string, Provenance> = {},
  kind: RevenueStreamKind,
): ProvenanceState {
  const fields = fieldsFor(kind);
  const out: ProvenanceState = {};
  for (const key of Object.keys(accepted)) {
    if (!fields.get(key)?.provenance) continue;
    out[key] = declared[key] === "known" ? "known" : "estimated";
  }
  return out;
}

export type IntakeAnswers = { state: IntakeState; provenance: ProvenanceState };

/**
 * A new plan's starting answers: the industry's seeds, every one tagged
 * `benchmark_default` until somebody says otherwise — the same start the
 * wizard gives a person.
 */
export function seedIntake(industryKey: string, kind?: RevenueStreamKind): IntakeAnswers {
  const seeds = defaultsForIndustry(industryKey);
  const provenance: ProvenanceState = {};
  for (const key of Object.keys(seeds)) provenance[key] = "benchmark_default";
  const seeded = { state: seeds as IntakeState, provenance };
  return kind && kind !== seeds["rev.kind"] ? switchModel(seeded, kind) : seeded;
}

/**
 * Applies validated answers the way the wizard does.
 *
 * Changing the revenue model clears the old model's drivers before seeding the
 * new one's: several share a key (`rev.monthlyGrowthRate` belongs to four), so
 * keeping them would carry a shop's growth rate into a marketplace unasked.
 * Changing the industry re-seeds only what is still an industry median — never
 * an answer somebody gave, and never a decision such as the plan's purpose.
 */
export function mergeAnswers(
  current: IntakeAnswers,
  accepted: IntakeState,
  declared: Record<string, Provenance> = {},
): IntakeAnswers {
  let next: IntakeAnswers = { state: { ...current.state }, provenance: { ...current.provenance } };

  const newKind = accepted["rev.kind"] as RevenueStreamKind | undefined;
  if (newKind && newKind !== kindOf(next.state)) next = switchModel(next, newKind);

  const newIndustry = accepted["company.industryKey"];
  if (typeof newIndustry === "string" && newIndustry !== next.state["company.industryKey"]) {
    const seeds = defaultsForIndustry(newIndustry);
    const fields = fieldsFor(kindOf(next.state));
    for (const [key, value] of Object.entries(seeds)) {
      if (fields.get(key)?.provenance && next.provenance[key] === "benchmark_default") {
        next.state[key] = value;
      }
    }
  }

  next.state = { ...next.state, ...accepted };
  next.provenance = { ...next.provenance, ...provenanceFor(accepted, declared, kindOf(next.state)) };
  return next;
}

function switchModel(current: IntakeAnswers, kind: RevenueStreamKind): IntakeAnswers {
  const state: IntakeState = {};
  const provenance: ProvenanceState = {};
  for (const [key, value] of Object.entries(current.state)) {
    if (!key.startsWith("rev.")) state[key] = value;
  }
  for (const [key, value] of Object.entries(current.provenance)) {
    if (!key.startsWith("rev.")) provenance[key] = value;
  }
  for (const [key, value] of Object.entries(revenueSeedsFor(kind))) {
    state[key] = value;
    provenance[key] = "benchmark_default";
  }
  state["rev.kind"] = kind;
  return { state, provenance };
}
