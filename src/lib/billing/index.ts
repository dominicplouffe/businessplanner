import "server-only";
import { db } from "@/lib/db";
import {
  entitlementsFor,
  isSubscriptionLive,
  type Entitlements,
  type SubscriptionState,
} from "./entitlements";
import type { DeliveryRecord } from "./delivery";

export * from "./entitlements";
export { shouldHandleDelivery, type DeliveryRecord } from "./delivery";
export { getBilling, billingIsLive, stripeClient, type Billing } from "./provider";

/* ==========================================================================
   Reading and granting entitlements.
   --------------------------------------------------------------------------
   Two functions matter here and they are deliberately asymmetric.

   Reading is cheap and happens on every page that might show a download
   button. Granting happens in exactly one place — `grantUnlock`, called only
   from the webhook handler — and is idempotent on the Stripe event id, because
   Stripe retries any delivery that does not return 2xx and will happily send
   the same event a dozen times.
   ========================================================================== */

/** The workspace's current subscription, or null. */
export async function getSubscription(workspaceId: string): Promise<SubscriptionState | null> {
  const rows = await db.subscription.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
  // A workspace can accumulate cancelled rows; the live one wins, and the most
  // recent is the fallback so the billing page can explain what happened.
  const live = rows.find((r) => isSubscriptionLive(r));
  const chosen = live ?? rows[0];
  if (!chosen) return null;
  return {
    status: chosen.status,
    currentPeriodEnd: chosen.currentPeriodEnd,
    cancelAtPeriodEnd: chosen.cancelAtPeriodEnd,
  };
}

/** What this workspace may do with this plan, right now. */
export async function getEntitlements(input: {
  workspaceId: string;
  plan: { unlockedAt: Date | null };
}): Promise<Entitlements> {
  const subscription = await getSubscription(input.workspaceId);
  return entitlementsFor({ plan: input.plan, subscription });
}

/**
 * Records a payment and unlocks the plan.
 *
 * Idempotent by construction: the Purchase row's unique `stripeEventId` is the
 * lock. A redelivery hits the unique constraint, the transaction rolls back,
 * and the caller still returns 2xx — which is what stops Stripe retrying
 * forever. `unlockedAt` is only ever set here.
 */
export async function grantUnlock(input: {
  stripeEventId: string;
  workspaceId: string;
  planId: string;
  amount: number;
  currency: string;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  at?: Date;
}): Promise<{ granted: boolean; reason?: string }> {
  const existing = await db.purchase.findUnique({
    where: { stripeEventId: input.stripeEventId },
  });
  if (existing) return { granted: false, reason: "already recorded" };

  // The plan must belong to the workspace that paid. Stripe metadata is ours,
  // but it round-trips through a third party, so it is checked rather than
  // trusted.
  const plan = await db.plan.findFirst({
    where: { id: input.planId, workspaceId: input.workspaceId },
    select: { id: true, unlockedAt: true },
  });
  if (!plan) return { granted: false, reason: "plan does not belong to that workspace" };

  const at = input.at ?? new Date();
  try {
    await db.$transaction([
      db.purchase.create({
        data: {
          workspaceId: input.workspaceId,
          planId: input.planId,
          kind: "unlock",
          amount: input.amount,
          currency: input.currency,
          stripeEventId: input.stripeEventId,
          stripeSessionId: input.stripeSessionId ?? null,
          stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        },
      }),
      // Left alone if already unlocked: the first payment is the one that
      // counts, and overwriting the date would rewrite history for no reason.
      ...(plan.unlockedAt
        ? []
        : [db.plan.update({ where: { id: input.planId }, data: { unlockedAt: at } })]),
    ]);
  } catch (error) {
    // A concurrent redelivery can lose the race to the unique index. That is
    // the mechanism working, not a failure.
    if (isUniqueViolation(error)) return { granted: false, reason: "already recorded" };
    throw error;
  }
  return { granted: true };
}

/** Mirrors Stripe's subscription state. Stripe is the source of truth. */
export async function upsertSubscription(input: {
  workspaceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  await db.subscription.upsert({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
    create: input,
    update: {
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    },
  });
}

/**
 * Records that an event was seen, and reports what happened to it last time.
 *
 * The row is the audit trail for "why did my entitlement change" — it is not
 * the lock. Purchases are idempotent through their own unique index and
 * subscriptions through an upsert, which is what CLAUDE.md means by
 * "idempotency is the unique index, not a check".
 *
 * It is written `pending` and updated once the handler has finished, because
 * the row is taken before the work: a row that still says `pending` means the
 * process died in between, not that the event was handled.
 */
export async function recordWebhookEvent(input: {
  stripeEventId: string;
  type: string;
  outcome?: "processed" | "ignored" | "failed";
  note?: string;
}): Promise<DeliveryRecord> {
  const outcome = input.outcome ?? "pending";
  try {
    await db.webhookEvent.create({
      data: {
        stripeEventId: input.stripeEventId,
        type: input.type,
        outcome,
        note: input.note ?? "",
      },
    });
    return { firstDelivery: true, outcome };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await db.webhookEvent.findUnique({
      where: { stripeEventId: input.stripeEventId },
      select: { outcome: true },
    });
    return { firstDelivery: false, outcome: existing?.outcome ?? "processed" };
  }
}


/** The workspace's Stripe customer, created lazily and stored once. */
export async function rememberStripeCustomer(
  workspaceId: string,
  stripeCustomerId: string,
): Promise<void> {
  await db.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId },
  });
}

export async function listPurchases(workspaceId: string) {
  return db.purchase.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { id: true, title: true, companyName: true } } },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
