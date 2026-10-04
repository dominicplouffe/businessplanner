import "server-only";
import { z } from "zod";
import { db } from "./db";
import {
  getPlan,
  parseAssumptions,
  parseResilience,
  parseSizing,
  snapshotPlan,
  PLAN_SECTIONS,
} from "./plans";
import { buildAssumptions, type IntakeState, type ProvenanceState } from "@/lib/content/intake-mapper";
import { AssumptionsSchema } from "@/lib/finance/types";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import type { GenerationContext } from "@/lib/ai/types";

/* ==========================================================================
   Plan operations, scoped to a workspace.
   --------------------------------------------------------------------------
   What a server action, a route handler and the MCP endpoint all do to a plan,
   written once. Each caller resolves the workspace its own way — a cookie
   session for the app, an OAuth access token for MCP — and everything after
   that is here, so the two surfaces cannot drift into saving the same answer
   two different ways.

   Nothing here revalidates or redirects. Those are the app's concerns and
   stay in the actions that call these.
   ========================================================================== */

export const SaveIntakeSchema = z.object({
  planId: z.string().min(1),
  step: z.number().int().min(0),
  complete: z.boolean().default(false),
  /** Partial Assumptions, merged into what is stored. */
  assumptions: z.record(z.string(), z.unknown()).optional(),
  registry: z.record(z.string(), z.unknown()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional(),
  companyName: z.string().optional(),
  industryKey: z.string().optional(),
  purpose: z.string().optional(),
});

export type SaveIntakeInput = z.input<typeof SaveIntakeSchema>;

/**
 * Merges intake answers into a plan. Merges rather than replaces, so a step
 * that only touches revenue does not blank out the company details captured
 * earlier. Returns null when the plan is not in this workspace.
 */
export async function applyIntake(workspaceId: string, raw: SaveIntakeInput) {
  const input = SaveIntakeSchema.parse(raw);

  const existing = await db.plan.findFirst({
    where: { id: input.planId, workspaceId },
    select: {
      id: true, assumptionsJson: true, registryJson: true,
      contextJson: true, intakeComplete: true,
    },
  });
  if (!existing) return null;

  // Two shapes, two columns — deliberately never merged into one.
  //   contextJson.intakeState : the flat wizard answers, always authoritative
  //   assumptionsJson         : the mapped Assumptions object, only once valid
  // Merging them in a single column let a late autosave write flat keys over a
  // completed model and silently downgrade the plan back to "intake".
  const context = safeParse(existing.contextJson);
  const previousState = (context.intakeState as Record<string, unknown> | undefined) ?? {};
  const intakeState = { ...previousState, ...(input.assumptions ?? {}) };
  const registry = { ...safeParse(existing.registryJson), ...(input.registry ?? {}) };
  const nextContext = { ...context, ...(input.context ?? {}), intakeState };

  // Map on every save, so the plan page can show a model as soon as one is
  // buildable rather than only after the final click.
  let assumptionsJson = existing.assumptionsJson;
  let mappedOk = false;
  try {
    const mapped = buildAssumptions(intakeState as IntakeState, registry as ProvenanceState);
    const parsed = AssumptionsSchema.safeParse(mapped);
    if (parsed.success) {
      assumptionsJson = JSON.stringify(parsed.data);
      mappedOk = true;
    }
  } catch {
    mappedOk = false;
  }

  const complete = input.complete && mappedOk;

  await db.plan.update({
    where: { id: existing.id },
    data: {
      intakeStep: input.step,
      // Never downgrade a completed intake: a late autosave must not undo it.
      intakeComplete: complete || existing.intakeComplete,
      status: complete || existing.intakeComplete ? "ready" : "intake",
      assumptionsJson,
      registryJson: JSON.stringify(registry),
      contextJson: JSON.stringify(nextContext),
      ...(input.title ? { title: input.title.slice(0, 120) } : {}),
      ...(input.companyName !== undefined ? { companyName: input.companyName.slice(0, 120) } : {}),
      ...(input.industryKey ? { industryKey: input.industryKey } : {}),
      ...(input.purpose ? { purpose: input.purpose } : {}),
    },
  });

  if (complete) {
    await snapshotPlan(existing.id, "Intake completed", "intake");
  }

  return {
    planId: existing.id,
    complete,
    intakeComplete: complete || existing.intakeComplete,
    mapped: mappedOk,
  };
}

/** The flat intake answers and their provenance, as the wizard stores them. */
export function readIntake(plan: { contextJson: string; registryJson: string }) {
  const context = safeParse(plan.contextJson);
  return {
    state: ((context.intakeState as IntakeState | undefined) ?? {}) as IntakeState,
    provenance: safeParse(plan.registryJson) as ProvenanceState,
  };
}

/**
 * Everything a generator may know about one section of a plan. Returns a
 * reason instead when the plan cannot be written against yet.
 */
export async function buildGenerationContext(input: {
  workspaceId: string;
  planId: string;
  sectionKey: string;
  instruction?: string;
}): Promise<
  | { ok: true; context: GenerationContext; hadContent: boolean }
  | { ok: false; status: 400 | 404 | 409; error: string }
> {
  const plan = await getPlan(input.planId, input.workspaceId);
  if (!plan) return { ok: false, status: 404, error: "Plan not found" };

  const section = PLAN_SECTIONS.find((s) => s.key === input.sectionKey);
  if (!section) return { ok: false, status: 400, error: "Unknown section" };

  const assumptions = parseAssumptions(plan.assumptionsJson);
  if (!assumptions) {
    return {
      ok: false,
      status: 409,
      error: "Finish the intake before generating — there is no model to write against.",
    };
  }

  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);

  // Earlier sections are supplied so later ones do not contradict them.
  const written = plan.sections
    .filter((s) => s.contentText.trim().length > 0 && s.key !== input.sectionKey)
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ key: s.key, title: s.title, text: s.contentText }));

  const context: GenerationContext = {
    planId: plan.id,
    sectionKey: input.sectionKey,
    sectionTitle: section.title,
    companyName: plan.companyName || plan.title,
    industryKey: plan.industryKey,
    purpose: plan.purpose,
    description: readDescription(plan.contextJson),
    assumptions,
    model,
    metrics,
    ...(input.instruction ? { instruction: input.instruction } : {}),
    written,
    // The market page's evidence travels with the request, which is what lets
    // a market section be written from named competitors and dated sources
    // rather than from adjectives.
    market: {
      sizing: parseSizing(plan.marketJson),
      competitors: plan.competitors.map((c) => ({
        name: c.name,
        url: c.url,
        positioning: c.positioning,
        priceLabel: c.priceLabel,
        priceDate: c.priceDate,
        strengths: c.strengths,
        weaknesses: c.weaknesses,
      })),
      citations: plan.citations.map((c) => ({
        label: c.label,
        url: c.url,
        publisher: c.publisher,
        sourceDate: c.sourceDate,
        claim: c.claim,
      })),
    },
    resilience: parseResilience(plan.resilienceJson),
  };

  const existing = plan.sections.find((s) => s.key === input.sectionKey);
  return { ok: true, context, hadContent: Boolean(existing?.contentText.trim()) };
}

/**
 * Writes a section's text. Snapshots first when it would overwrite something,
 * so the change is always reversible from the versions page.
 */
export async function writeSection(input: {
  planId: string;
  sectionKey: string;
  sectionTitle: string;
  text: string;
  status: "draft" | "edited";
  hadContent: boolean;
  snapshotLabel: string;
}) {
  if (input.hadContent) {
    await snapshotPlan(input.planId, input.snapshotLabel, "regeneration");
  }
  await db.planSection.updateMany({
    where: { planId: input.planId, key: input.sectionKey },
    data: {
      status: input.status,
      contentText: input.text,
      contentJson: JSON.stringify(toDocument(input.text)),
    },
  });
  await db.plan.update({
    where: { id: input.planId },
    data: { status: "ready", updatedAt: new Date() },
  });
}

function readDescription(contextJson: string): string {
  try {
    const parsed = JSON.parse(contextJson || "{}") as {
      intakeState?: Record<string, unknown>;
      description?: unknown;
    };
    const fromIntake = parsed.intakeState?.["context.description"];
    return String(fromIntake ?? parsed.description ?? "");
  } catch {
    return "";
  }
}

/** Plain text -> a TipTap-shaped document, so the editor can load it directly. */
export function toDocument(text: string) {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => ({
        type: "paragraph",
        content: [{ type: "text", text: para }],
      })),
  };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json || "{}");
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
