"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { createPlan, snapshotPlan } from "@/lib/plans";
import { buildAssumptions, type IntakeState, type ProvenanceState } from "@/lib/content/intake-mapper";
import { AssumptionsSchema } from "@/lib/finance/types";
import { PLAN_PURPOSES } from "@/lib/review/rubric";

/** Resolves the caller's workspace, or throws. Every action starts here so an
 *  id in a request body is never treated as authorisation. */
async function currentWorkspace() {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  return { user, workspace };
}

export async function createPlanAction(formData: FormData) {
  const { user, workspace } = await currentWorkspace();
  const title = String(formData.get("title") ?? "").trim() || "Untitled plan";

  const plan = await createPlan({
    workspaceId: workspace.id,
    userId: user.id,
    title: title.slice(0, 120),
  });

  revalidatePath("/dashboard");
  redirect(`/plans/${plan.id}/intake`);
}

const SaveIntakeSchema = z.object({
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
  // An enum, not a string. The wizard only offers these four, but a server
  // action is directly invocable and the rubric indexes its weights by this
  // value — so an unrecognised one used to be written straight to the column
  // and then throw on every page that scores the plan.
  purpose: z.enum(PLAN_PURPOSES).optional(),
});

export type SaveIntakeInput = z.input<typeof SaveIntakeSchema>;

/**
 * Autosave for the intake wizard. Merges rather than replaces, so a step that
 * only touches revenue does not blank out the company details captured earlier.
 */
export async function saveIntakeAction(raw: SaveIntakeInput) {
  const { workspace } = await currentWorkspace();
  const input = SaveIntakeSchema.parse(raw);

  const existing = await db.plan.findFirst({
    where: { id: input.planId, workspaceId: workspace.id },
    select: {
      id: true, assumptionsJson: true, registryJson: true,
      contextJson: true, intakeComplete: true,
    },
  });
  if (!existing) throw new Error("Plan not found");

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
    revalidatePath(`/plans/${existing.id}`);
  }
  revalidatePath("/dashboard");

  return { ok: true as const, complete };
}

/**
 * Takes a plan off the dashboard without destroying it.
 *
 * Archive rather than delete, and that is the whole point. `listPlans` and
 * the app layout already filter on `status != "archived"`, so the shape was
 * always intended — but the only action was a hard `deleteMany`, and it had
 * no caller anywhere in the UI. Deleting cascades the versions and the
 * sections, and `Purchase.planId` is `SetNull`, so somebody who paid $199
 * would be left with a payment record pointing at nothing and no way back.
 * Nothing about "remove this from my list" justifies that.
 */
export async function archivePlanAction(planId: string) {
  const { workspace } = await currentWorkspace();
  await db.plan.updateMany({
    where: { id: planId, workspaceId: workspace.id },
    data: { status: "archived" },
  });
  revalidatePath("/dashboard");
  revalidatePath(`/plans/${planId}`);
  redirect("/dashboard");
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json || "{}");
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
