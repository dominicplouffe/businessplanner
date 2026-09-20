"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { snapshotPlan } from "@/lib/plans";
import { parseSnapshot } from "@/lib/versions";

async function scopedPlan(planId: string) {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await db.plan.findFirst({
    where: { id: planId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!plan) throw new Error("Plan not found");
  return plan;
}

const SaveSchema = z.object({
  planId: z.string().min(1),
  sectionKey: z.string().min(1),
  text: z.string().max(60_000),
});

export async function saveSectionAction(raw: z.input<typeof SaveSchema>) {
  const input = SaveSchema.parse(raw);
  const plan = await scopedPlan(input.planId);

  await db.planSection.updateMany({
    where: { planId: plan.id, key: input.sectionKey },
    data: {
      contentText: input.text,
      contentJson: JSON.stringify(toDocument(input.text)),
      status: "edited",
    },
  });

  revalidatePath(`/plans/${plan.id}`);
  return { ok: true as const };
}

/** Restores the most recent snapshot. Regeneration takes one first, so this is
 *  the way back from an overwrite the author did not want. */
export async function revertPlanAction(planId: string) {
  const plan = await scopedPlan(planId);
  const version = await db.planVersion.findFirst({
    where: { planId: plan.id },
    orderBy: { createdAt: "desc" },
  });
  if (!version) return { ok: false as const, reason: "No snapshot to restore." };
  return restoreVersionAction({ planId, versionId: version.id });
}

/**
 * Restores a named snapshot.
 *
 * Takes a snapshot of the current state first, so restoring is itself
 * reversible — an undo you cannot undo is how somebody loses an afternoon's
 * editing to a misclick, which is the exact complaint this feature answers.
 */
export async function restoreVersionAction(raw: { planId: string; versionId: string }) {
  const planId = z.string().min(1).parse(raw.planId);
  const versionId = z.string().min(1).parse(raw.versionId);
  const plan = await scopedPlan(planId);

  const version = await db.planVersion.findFirst({
    where: { id: versionId, planId: plan.id },
  });
  if (!version) return { ok: false as const, reason: "That snapshot is not on this plan." };

  const snapshot = parseSnapshot(version.snapshotJson);

  await snapshotPlan(plan.id, `Before restoring “${version.label}”`, "manual");

  for (const section of snapshot.sections ?? []) {
    await db.planSection.updateMany({
      where: { planId: plan.id, key: section.key },
      data: {
        status: section.status,
        contentJson: section.contentJson,
        contentText: section.contentText,
      },
    });
  }

  revalidatePath(`/plans/${plan.id}`);
  revalidatePath(`/plans/${plan.id}/versions`);
  revalidatePath(`/plans/${plan.id}/review`);
  return { ok: true as const, label: version.label };
}

/** An explicit checkpoint, taken before the author does something risky. */
export async function createSnapshotAction(raw: { planId: string; label?: string }) {
  const planId = z.string().min(1).parse(raw.planId);
  const plan = await scopedPlan(planId);
  const label = (raw.label ?? "").trim() || "Manual checkpoint";

  await snapshotPlan(plan.id, label.slice(0, 120), "manual");
  revalidatePath(`/plans/${plan.id}/versions`);
  return { ok: true as const };
}

function toDocument(text: string) {
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
}
