import "server-only";
import { db } from "@/lib/db";
import {
  entitlementsFor,
  isSubscriptionLive,
  type Entitlements,
  type GrantState,
  type SubscriptionState,
} from "./entitlements";

export * from "./entitlements";
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

/**
 * Grants in force for one plan.
 *
 * Scoping is the `where` clause — workspace, then this plan or the
 * workspace-wide grants that carry no plan id. Whether a grant has expired or
 * been withdrawn is left to `entitlementsFor`, so that decision is made against
 * the same injected clock as everything else and stays testable without a
 * database.
 */
export async function getGrants(workspaceId: string, planId?: string): Promise<GrantState[]> {
  const rows = await db.grant.findMany({
    where: {
      workspaceId,
      OR: [{ planId: null }, ...(planId ? [{ planId }] : [])],
    },
    select: { kind: true, expiresAt: true, revokedAt: true },
  });
  return rows;
}

/** What this workspace may do with this plan, right now. */
export async function getEntitlements(input: {
  workspaceId: string;
  plan: { id?: string; unlockedAt: Date | null };
}): Promise<Entitlements> {
  const [subscription, grants] = await Promise.all([
    getSubscription(input.workspaceId),
    getGrants(input.workspaceId, input.plan.id),
  ]);
  return entitlementsFor({ plan: input.plan, subscription, grants });
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
 * Records that an event was seen, and says whether this is the first time.
 *
 * Purchases are idempotent through their own unique index; everything else
 * needs this. It also doubles as the audit trail for "why did my entitlement
 * change", which is a question that eventually gets asked.
 */
export async function recordWebhookEvent(input: {
  stripeEventId: string;
  type: string;
  outcome?: "processed" | "ignored" | "failed";
  note?: string;
}): Promise<{ firstDelivery: boolean }> {
  try {
    await db.webhookEvent.create({
      data: {
        stripeEventId: input.stripeEventId,
        type: input.type,
        outcome: input.outcome ?? "processed",
        note: input.note ?? "",
      },
    });
    return { firstDelivery: true };
  } catch (error) {
    if (isUniqueViolation(error)) return { firstDelivery: false };
    throw error;
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

/**
 * Gives access without a payment, and records who did it and why.
 *
 * This is the third writer of entitlement state, beside `grantUnlock` and the
 * subscription mirror, and it is the only one a human drives. It does not touch
 * `Plan.unlockedAt` or write a Purchase — the webhook owns both, and forging
 * either is what makes an entitlement unexplainable later.
 */
export async function grantAccess(input: {
  workspaceId: string;
  /** Null grants every plan in the workspace, present and future. */
  planId?: string | null;
  kind: "unlock" | "live";
  reason: string;
  grantedById: string;
  expiresAt?: Date | null;
}) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A grant needs a reason: it is the only thing that explains it later.");

  // Checked rather than trusted, exactly as the webhook checks Stripe metadata:
  // a plan-scoped grant must name a plan in the workspace it is granted to.
  if (input.planId) {
    const plan = await db.plan.findFirst({
      where: { id: input.planId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!plan) throw new Error("That plan does not belong to that workspace.");
  }

  return db.grant.create({
    data: {
      workspaceId: input.workspaceId,
      planId: input.planId ?? null,
      kind: input.kind,
      reason,
      grantedById: input.grantedById,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

/** Withdraws a grant. Never deletes it: a grant that really did confer access
 *  for a fortnight still has to explain that fortnight. */
export async function revokeGrant(grantId: string, at: Date = new Date()) {
  return db.grant.update({
    where: { id: grantId },
    data: { revokedAt: at },
  });
}

export async function listGrants(workspaceId?: string) {
  return db.grant.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, title: true } },
      workspace: { select: { id: true, name: true } },
      grantedBy: { select: { id: true, email: true, name: true } },
    },
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
