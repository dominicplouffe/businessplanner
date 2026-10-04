import { pricing } from "@/lib/brand";

/* ==========================================================================
   Entitlements.
   --------------------------------------------------------------------------
   Pure, and deliberately separate from the review gate.

   A plan can be blocked for two completely different reasons — it has not been
   paid for, or it has not passed review — and collapsing them into one boolean
   is how a product ends up telling somebody who just paid that their export
   failed. They are computed independently here and the caller reports whichever
   applies, naming it.

   Nothing in this file reads the database, the clock or the network: it takes
   state and returns a decision, which is what makes the rules testable without
   a Stripe account.
   ========================================================================== */

export type PlanEntitlementState = {
  /** Set by the webhook when the one-time unlock is paid. */
  unlockedAt: Date | null;
};

export type SubscriptionState = {
  /** Stripe's own status string, mirrored rather than derived. */
  status: string;
  /** Access runs to here even after cancellation. */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Access given without a payment.
 *
 * The caller passes only the grants that already apply to the plan in question
 * — scoping by workspace and plan is a `where` clause, not a rule worth
 * testing. What *is* worth testing, and so lives here, is whether a grant is
 * still in force: expiry and revocation both have to be read against the same
 * injected clock as everything else.
 */
export type GrantState = {
  /** "unlock" | "live" — the purchase it stands in for. */
  kind: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

/** Why access is permitted. Rendered, never inferred — somebody who was comped
 *  must not be shown a receipt they never received, and somebody who paid must
 *  never be told their access was a favour. */
export type AccessSource = "purchase" | "subscription" | "grant";

/** The statuses Stripe considers to be paying, or about to be. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type Entitlements = {
  /** The one-time unlock applies to this plan, however it was come by. */
  unlocked: boolean;
  /** Downloads in all four formats. */
  canExport: boolean;
  /** Tokenised read-only links with read tracking. */
  canShare: boolean;
  /** The ongoing plan: actuals, re-forecasting, lender updates. */
  liveSubscription: boolean;
  /** How each was come by, or null where it was not. */
  unlockSource: AccessSource | null;
  liveSource: AccessSource | null;
  /** Why not, in the user's language. Null when everything is permitted. */
  blockedReason: string | null;
};

/** Whether a grant of this kind is in force. Revoked beats expiry beats kind,
 *  and all three are read against the injected clock. */
function grantInForce(grants: GrantState[] | undefined, kind: string, asOf: Date): boolean {
  return (grants ?? []).some(
    (g) =>
      g.kind === kind &&
      (g.revokedAt === null || g.revokedAt > asOf) &&
      (g.expiresAt === null || g.expiresAt > asOf),
  );
}

/**
 * What this workspace may do with this plan.
 *
 * A live subscription does not unlock a plan, and paying for a plan does not
 * start a subscription. They are different products and conflating them is how
 * somebody ends up losing access to a document they bought outright when they
 * cancel a monthly plan.
 */
export function entitlementsFor(input: {
  plan: PlanEntitlementState;
  subscription?: SubscriptionState | null;
  /** Grants already scoped to this workspace and plan by the caller. */
  grants?: GrantState[];
  /** Injected so the decision is deterministic in a test. */
  asOf?: Date;
}): Entitlements {
  const asOf = input.asOf ?? new Date();

  // A payment outranks a grant as the recorded reason, so that re-granting
  // something already bought never rewrites why the person has it.
  const purchased = input.plan.unlockedAt !== null && input.plan.unlockedAt <= asOf;
  const grantedUnlock = grantInForce(input.grants, "unlock", asOf);
  const unlocked = purchased || grantedUnlock;
  const unlockSource: AccessSource | null = purchased
    ? "purchase"
    : grantedUnlock
      ? "grant"
      : null;

  const subscribed = isSubscriptionLive(input.subscription, asOf);
  const grantedLive = grantInForce(input.grants, "live", asOf);
  const liveSubscription = subscribed || grantedLive;
  const liveSource: AccessSource | null = subscribed
    ? "subscription"
    : grantedLive
      ? "grant"
      : null;

  return {
    unlocked,
    canExport: unlocked,
    canShare: unlocked,
    liveSubscription,
    unlockSource,
    liveSource,
    blockedReason: unlocked
      ? null
      : `Exporting and sharing are part of the ${pricing.unlock.name} unlock — $${pricing.unlock.price}, once, for this plan. Reading it on screen stays free.`,
  };
}

/**
 * Whether a subscription still confers access.
 *
 * `past_due` counts as live on purpose: Stripe retries a failed payment for
 * days, and cutting somebody off on the first decline — before they have even
 * been told — is the behaviour this category is criticised for. A cancelled
 * subscription also keeps access to the end of the period already paid for.
 */
export function isSubscriptionLive(
  subscription: SubscriptionState | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (!subscription) return false;
  if (LIVE_STATUSES.has(subscription.status)) return true;
  if (subscription.status === "canceled" && subscription.currentPeriodEnd) {
    return subscription.currentPeriodEnd > asOf;
  }
  return false;
}

/** How the subscription's state reads on the billing page. */
export function describeSubscription(
  subscription: SubscriptionState | null | undefined,
  asOf: Date = new Date(),
): { label: string; detail: string } {
  if (!subscription) {
    return {
      label: "No subscription",
      detail: `The ${pricing.live.name} plan is optional. Plans you have unlocked stay yours without it.`,
    };
  }
  const ends = subscription.currentPeriodEnd;
  const endsText = ends ? ends.toISOString().slice(0, 10) : "an unknown date";

  if (subscription.status === "past_due") {
    return {
      label: "Payment failed",
      detail: `The last payment did not go through. Access continues while the card is retried — update it and nothing else changes.`,
    };
  }
  if (subscription.status === "canceled") {
    return isSubscriptionLive(subscription, asOf)
      ? { label: "Cancelled", detail: `Access runs to ${endsText}, which you have already paid for.` }
      : { label: "Ended", detail: `Ended ${endsText}. Unlocked plans are unaffected.` };
  }
  if (subscription.cancelAtPeriodEnd) {
    return {
      label: "Cancelling",
      detail: `Runs to ${endsText} and does not renew. Nothing else to do.`,
    };
  }
  if (subscription.status === "trialing") {
    return { label: "Trial", detail: `Billing starts ${endsText}. One click cancels before then.` };
  }
  return { label: "Active", detail: `Renews ${endsText}. One click cancels, any time.` };
}
