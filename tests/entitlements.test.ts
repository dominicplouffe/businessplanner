import { describe, expect, it } from "vitest";
import {
  describeSubscription,
  entitlementsFor,
  isSubscriptionLive,
} from "@/lib/billing/entitlements";

/* The entitlement rules decide whether somebody who has paid can have what
   they paid for, so they are tested directly rather than through Stripe. */

const NOW = new Date("2026-09-20T12:00:00Z");

describe("plan entitlements", () => {
  it("locks export and share until the unlock is paid", () => {
    const e = entitlementsFor({ plan: { unlockedAt: null }, asOf: NOW });
    expect(e.unlocked).toBe(false);
    expect(e.canExport).toBe(false);
    expect(e.canShare).toBe(false);
    expect(e.blockedReason).toMatch(/unlock/i);
    // Reading on screen is free, and the message has to say so or the page is
    // selling something it does not need to.
    expect(e.blockedReason).toMatch(/free/i);
  });

  it("unlocks both once it is paid", () => {
    const e = entitlementsFor({ plan: { unlockedAt: new Date("2026-09-01") }, asOf: NOW });
    expect(e.canExport).toBe(true);
    expect(e.canShare).toBe(true);
    expect(e.blockedReason).toBeNull();
  });

  it("does not honour an unlock dated in the future", () => {
    const e = entitlementsFor({ plan: { unlockedAt: new Date("2026-12-01") }, asOf: NOW });
    expect(e.unlocked).toBe(false);
  });

  it("keeps a subscription separate from a plan unlock", () => {
    // Paying monthly must not unlock a plan, and owning a plan must not imply
    // a subscription. Conflating them loses somebody a document they bought.
    const subscribed = entitlementsFor({
      plan: { unlockedAt: null },
      subscription: { status: "active", currentPeriodEnd: new Date("2026-10-20"), cancelAtPeriodEnd: false },
      asOf: NOW,
    });
    expect(subscribed.liveSubscription).toBe(true);
    expect(subscribed.canExport).toBe(false);

    const unlocked = entitlementsFor({ plan: { unlockedAt: new Date("2026-01-01") }, asOf: NOW });
    expect(unlocked.canExport).toBe(true);
    expect(unlocked.liveSubscription).toBe(false);
  });
});

describe("subscription liveness", () => {
  const end = new Date("2026-10-20T00:00:00Z");

  it("treats active and trialing as live", () => {
    for (const status of ["active", "trialing"]) {
      expect(isSubscriptionLive({ status, currentPeriodEnd: end, cancelAtPeriodEnd: false }, NOW)).toBe(true);
    }
  });

  it("keeps access through a failed payment while Stripe retries", () => {
    // Cutting somebody off on the first decline, before they have been told, is
    // the behaviour this category is criticised for.
    expect(
      isSubscriptionLive({ status: "past_due", currentPeriodEnd: end, cancelAtPeriodEnd: false }, NOW),
    ).toBe(true);
  });

  it("runs a cancelled subscription to the end of the paid period", () => {
    expect(isSubscriptionLive({ status: "canceled", currentPeriodEnd: end, cancelAtPeriodEnd: true }, NOW)).toBe(true);
    const past = new Date("2026-08-01T00:00:00Z");
    expect(isSubscriptionLive({ status: "canceled", currentPeriodEnd: past, cancelAtPeriodEnd: true }, NOW)).toBe(false);
  });

  it("is not live with no subscription at all", () => {
    expect(isSubscriptionLive(null, NOW)).toBe(false);
    expect(isSubscriptionLive(undefined, NOW)).toBe(false);
  });
});

describe("how the subscription reads on the billing page", () => {
  it("never says the plan is gone while it still works", () => {
    const end = new Date("2026-10-20T00:00:00Z");
    const cancelled = describeSubscription(
      { status: "canceled", currentPeriodEnd: end, cancelAtPeriodEnd: true },
      NOW,
    );
    expect(cancelled.label).toBe("Cancelled");
    expect(cancelled.detail).toMatch(/already paid for/);

    const pastDue = describeSubscription(
      { status: "past_due", currentPeriodEnd: end, cancelAtPeriodEnd: false },
      NOW,
    );
    expect(pastDue.detail).toMatch(/Access continues/);
  });

  it("says unlocked plans are unaffected when there is no subscription", () => {
    const none = describeSubscription(null, NOW);
    expect(none.detail).toMatch(/stay yours/i);
  });
});
