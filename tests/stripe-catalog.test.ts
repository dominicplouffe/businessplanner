import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain-Node script module, deliberately untyped like deploy-config.mjs
import { EXPECTED_PRICES, pricingFromSource, problemsWith } from "../scripts/lib/stripe-catalog.mjs";

/* ==========================================================================
   The Stripe catalogue guard.
   --------------------------------------------------------------------------
   Checkout stopped building a price inline and started naming one in Stripe,
   which is what lets revenue be grouped by what was sold — and it put the
   amount in two places. `pricing` in `brand.ts` is rendered to the customer;
   the Stripe price is what their card is charged.

   `scripts/stripe-verify.mjs` reconciles them, and needs the network. What is
   tested here is the half that does not: that it can still read `brand.ts`,
   and that it actually objects when the two disagree. Those are the two ways a
   guard like this fails — by reading nothing and reporting success, or by
   comparing and not caring.
   ========================================================================== */

const brand = () => readFileSync("src/lib/brand.ts", "utf8");

describe("reading what the site advertises", () => {
  it("finds a price for every id checkout names", () => {
    const pricing = pricingFromSource(brand());
    for (const { pricingKey } of EXPECTED_PRICES) {
      expect(pricing[pricingKey], `pricing.${pricingKey}.price`).toBeGreaterThan(0);
    }
  });

  it("agrees with the pricing the app itself exports", async () => {
    /* The regex and the real module have to see the same numbers. Importing
       `brand.ts` here is what makes this more than the parser agreeing with
       itself — if the shape changes so the regex reads a stale or wrong value,
       this is what notices. */
    const { pricing: real } = await import("@/lib/brand");
    const parsed = pricingFromSource(brand());
    expect(parsed.unlock).toBe(real.unlock.price);
    expect(parsed.live).toBe(real.live.price);
  });

  it("refuses rather than reporting success when it cannot read the source", () => {
    // The failure that matters: a guard that finds nothing to compare and is
    // therefore always happy.
    expect(() => pricingFromSource("export const somethingElse = {};")).toThrow(/pricing/);
    expect(() => pricingFromSource(brand().replace(/price: \d+,/g, ""))).toThrow(/price/);
  });
});

describe("objecting to a catalogue that has drifted", () => {
  const price = (over: Record<string, unknown> = {}) => ({
    unit_amount: 19900,
    currency: "usd",
    active: true,
    recurring: null,
    ...over,
  });
  const check = (over?: Record<string, unknown>, expectedDollars = 199, interval: string | null = null) =>
    problemsWith({
      name: "STRIPE_PRICE_UNLOCK",
      price: price(over),
      expectedDollars,
      expectedInterval: interval,
    }) as string[];

  it("passes a price that matches", () => {
    expect(check()).toEqual([]);
  });

  it("catches the amount disagreeing, in either direction", () => {
    expect(check({ unit_amount: 24900 }).join()).toMatch(/charges 24900 but the site advertises 19900/);
    expect(check({ unit_amount: 9900 }).join()).toMatch(/charges 9900/);
  });

  it("catches an archived price, which fails only at checkout", () => {
    expect(check({ active: false }).join()).toMatch(/archived/);
  });

  it("catches a one-time price that became a subscription, and the reverse", () => {
    expect(check({ recurring: { interval: "month" } }).join()).toMatch(/interval is month/);
    expect(check({}, 199, "month").join()).toMatch(/interval is one-time, expected month/);
  });

  it("catches the wrong currency", () => {
    // The account's default is CAD, so charging the wrong one is a live risk.
    expect(check({ currency: "cad" }).join()).toMatch(/currency is cad/);
  });
});
