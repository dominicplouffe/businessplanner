"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getEntitlements } from "@/lib/billing";

/* ==========================================================================
   Share links.
   --------------------------------------------------------------------------
   A tokenised read-only view with expiry, revocation and per-open tracking —
   DocSend behaviour that no plan tool in this category has. Knowing that an
   investor opened the plan twice and spent eleven minutes in it is worth more
   to a founder than any feature in the editor.

   The token is 32 bytes of real entropy, not a cuid: it is the only thing
   standing between a private plan and the internet, and an id that encodes a
   timestamp is not that.
   ========================================================================== */

async function scopedPlan(planId: string) {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await db.plan.findFirst({
    where: { id: planId, workspaceId: workspace.id },
    select: { id: true, unlockedAt: true },
  });
  if (!plan) throw new Error("Plan not found");
  return { plan, workspaceId: workspace.id };
}

/** Creating a link is a paid action; revoking one never is. Somebody who lets
 *  a subscription lapse must always be able to take a link down. */
async function shareEntitlement(planId: string) {
  const { plan, workspaceId } = await scopedPlan(planId);
  const entitlements = await getEntitlements({ workspaceId, plan });
  return { plan, entitlements };
}

const CreateSchema = z.object({
  planId: z.string().min(1),
  label: z.string().max(120).default(""),
  /** Days until it stops working. Zero means no expiry. */
  expiresInDays: z.number().int().min(0).max(365).default(30),
});

/**
 * Returns the reason rather than throwing it.
 *
 * Next redacts a server action's error message in production and hands the
 * client a digest, so the panel's `catch (cause) { cause.message }` rendered
 * an opaque id where the explanation of *why* sharing is locked should be.
 * A refusal the user is meant to read has to come back as data.
 */
export async function createShareLinkAction(raw: z.input<typeof CreateSchema>) {
  const input = CreateSchema.parse(raw);
  const { plan, entitlements } = await shareEntitlement(input.planId);
  if (!entitlements.canShare) {
    return {
      ok: false as const,
      reason: entitlements.blockedReason ?? "Sharing is not unlocked for this plan.",
    };
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt =
    input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  await db.shareLink.create({
    data: { planId: plan.id, token, label: input.label, expiresAt },
  });

  revalidatePath(`/plans/${plan.id}/export`);
  return { ok: true as const, token };
}

export async function revokeShareLinkAction(raw: { planId: string; id: string }) {
  const planId = z.string().min(1).parse(raw.planId);
  const id = z.string().min(1).parse(raw.id);
  const { plan } = await scopedPlan(planId);

  // Revoked rather than deleted: the view history is the point of the feature,
  // and deleting the link would take the record of who read it with it.
  await db.shareLink.updateMany({
    where: { id, planId: plan.id },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/plans/${plan.id}/export`);
  return { ok: true as const };
}
