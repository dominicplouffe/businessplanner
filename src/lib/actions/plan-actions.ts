"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { createPlan } from "@/lib/plans";
import { applyIntake, type SaveIntakeInput } from "@/lib/plan-service";

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

export type { SaveIntakeInput } from "@/lib/plan-service";

/** Autosave for the intake wizard. The merge itself is `applyIntake()`, which
 *  the MCP endpoint shares, so both save an answer the same way. */
export async function saveIntakeAction(raw: SaveIntakeInput) {
  const { workspace } = await currentWorkspace();
  const result = await applyIntake(workspace.id, raw);
  if (!result) throw new Error("Plan not found");

  if (result.complete) revalidatePath(`/plans/${result.planId}`);
  revalidatePath("/dashboard");

  return { ok: true as const, complete: result.complete };
}

export async function deletePlanAction(planId: string) {
  const { workspace } = await currentWorkspace();
  await db.plan.deleteMany({ where: { id: planId, workspaceId: workspace.id } });
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
