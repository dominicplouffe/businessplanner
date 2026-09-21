"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { snapshotPlan, writeSection } from "@/lib/plans";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import {
  RESTORE_REASON,
  parseSnapshot,
  pickRevertTarget,
  restorePayload,
} from "@/lib/versions";

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

  await writeSection(plan.id, input.sectionKey, {
    contentText: input.text,
    contentJson: JSON.stringify(toDocument(input.text)),
    status: "edited",
  });

  revalidatePath(`/plans/${plan.id}`);
  // The review reconciles this prose against the model, the export assembles
  // it, and the history diffs it. All three were left stale by a save.
  revalidatePath(`/plans/${plan.id}/review`);
  revalidatePath(`/plans/${plan.id}/export`);
  revalidatePath(`/plans/${plan.id}/versions`);
  return { ok: true as const };
}

/** Restores the last snapshot the author's own work produced.
 *
 *  The restore below takes a safety snapshot of its own before it writes, so
 *  "most recent" is not the right target — it would be the one this action
 *  had just created, and a second click would restore what the first undid.
 *  `pickRevertTarget` skips that bookkeeping. */
export async function revertPlanAction(planId: string) {
  const plan = await scopedPlan(planId);
  const versions = await db.planVersion.findMany({
    where: { planId: plan.id },
    // Two snapshots can land in the same millisecond on SQLite, so the id
    // breaks the tie and the order is deterministic either way.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, reason: true },
  });
  const target = pickRevertTarget(versions);
  if (target.kind === "none") return { ok: false as const, reason: target.reason };
  return restoreVersionAction({ planId, versionId: target.versionId });
}

/**
 * Restores a named snapshot.
 *
 * Takes a snapshot of the current state first, so restoring is itself
 * reversible — an undo you cannot undo is how somebody loses an afternoon's
 * editing to a misclick, which is the exact complaint this feature answers.
 *
 * All of it, in one transaction. A snapshot carries the assumptions, the
 * provenance registry and the intake context as well as the prose; writing
 * back only the prose left the document describing a model that had since
 * changed. And a restore that wrote the sections and then failed before the
 * assumptions would persist exactly that disagreement, so the two cannot be
 * separate writes.
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
  const payload = restorePayload(snapshot, PLAN_SECTIONS.map((s) => s.key));

  await snapshotPlan(plan.id, `Before restoring “${version.label}”`, RESTORE_REASON);

  await db.$transaction(async (tx) => {
    if (Object.keys(payload.plan).length > 0) {
      // `intakeComplete` and `status` are deliberately untouched: restoring an
      // intake snapshot must not push a finished plan back into the wizard.
      await tx.plan.update({ where: { id: plan.id }, data: payload.plan });
    }
    for (const section of payload.sections) {
      await writeSection(
        plan.id,
        section.key,
        {
          status: section.status,
          contentJson: section.contentJson,
          contentText: section.contentText,
        },
        tx,
      );
    }
  });

  revalidatePath(`/plans/${plan.id}`);
  revalidatePath(`/plans/${plan.id}/versions`);
  revalidatePath(`/plans/${plan.id}/review`);
  // The assumptions moved too, and these three read them.
  revalidatePath(`/plans/${plan.id}/financials`);
  revalidatePath(`/plans/${plan.id}/intake`);
  revalidatePath(`/plans/${plan.id}/market`);
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
