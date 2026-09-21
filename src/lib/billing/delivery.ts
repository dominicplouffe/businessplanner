/* ==========================================================================
   Whether a webhook delivery should be handled.
   --------------------------------------------------------------------------
   Pure, and in its own module for the same reason `entitlements.ts` is: this
   decides whether somebody who has paid gets what they paid for, so it is
   tested directly rather than through Stripe and a database.

   The rule it replaces was `if (!seen.firstDelivery) return 200`, and that was
   unrecoverable. The `WebhookEvent` row is written *before* the handler runs,
   so a handler that threw answered 500 to make Stripe retry — and the retry
   then matched the row its own failed attempt had written, and returned 200
   without ever running. One transient database error inside `grantUnlock` took
   the customer's money and left the plan locked, permanently, with no path
   back and nothing in the product able to notice.

   The row is the audit trail. The locks are elsewhere and always were: a
   unique index on `Purchase.stripeEventId`, an upsert keyed on
   `stripeSubscriptionId`. That is what CLAUDE.md means by "idempotency is the
   unique index, not a check" — here the check had been promoted to a lock, and
   to a lock that is taken before the work and never released.
   ========================================================================== */

/** What a delivery of this event reached last time, if it has been seen. */
export type DeliveryRecord = {
  firstDelivery: boolean;
  outcome: string;
};

/** Outcomes that mean the delivery genuinely finished. */
const TERMINAL_OUTCOMES = new Set(["processed", "ignored"]);

/**
 * Whether this delivery should be handed to the handler.
 *
 * Skipped only when the previous delivery reached a terminal outcome.
 * `pending` means the process died between writing the row and finishing the
 * work; `failed` means the handler threw. Both are work we started and did not
 * complete, and Stripe is right to be retrying them.
 *
 * An unrecognised outcome is re-handled deliberately. Every handler is
 * idempotent by construction, so re-handling costs a duplicate line in the
 * audit trail, while skipping costs a paid entitlement. The two failure modes
 * are not remotely symmetric, so the unknown case takes the recoverable one.
 */
export function shouldHandleDelivery(record: DeliveryRecord): boolean {
  if (record.firstDelivery) return true;
  return !TERMINAL_OUTCOMES.has(record.outcome);
}
