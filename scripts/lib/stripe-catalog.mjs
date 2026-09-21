/* ==========================================================================
   What the site says it charges.
   --------------------------------------------------------------------------
   Split out of `stripe-verify.mjs` for the same reason `deploy-config.mjs` is
   split out of `deploy.mjs`: the half that talks to Stripe cannot be tested
   here, and the half that decides what the answer should be can.

   The parsing is the part worth testing. A guard that reads nothing reports
   success, so `pricingFromSource()` throws rather than returning a partial
   answer, and `tests/stripe-catalog.test.ts` runs it against the real
   `brand.ts` so a restructure there fails in CI rather than the next time
   somebody happens to run the script.
   ========================================================================== */

/** The prices checkout names, and which `pricing` key each must agree with. */
export const EXPECTED_PRICES = [
  { env: "STRIPE_PRICE_UNLOCK", pricingKey: "unlock", interval: null },
  { env: "STRIPE_PRICE_LIVE", pricingKey: "live", interval: "month" },
];

export const CURRENCY = "usd";

/**
 * Read the advertised amounts out of `brand.ts`.
 *
 * Parsed rather than imported because the caller is plain Node and `brand.ts`
 * is TypeScript that pulls in the rest of the app.
 *
 * @param source contents of `src/lib/brand.ts`
 * @returns dollars per pricing key, e.g. `{ unlock: 199, live: 39 }`
 */
export function pricingFromSource(source) {
  const block = /export const pricing = \{([\s\S]*?)\n\} as const;/.exec(source)?.[1];
  if (!block) {
    throw new Error("Could not find `export const pricing` in src/lib/brand.ts — has it moved?");
  }

  const out = {};
  for (const { pricingKey } of EXPECTED_PRICES) {
    const entry = new RegExp(`${pricingKey}: \\{([\\s\\S]*?)\\},`).exec(block)?.[1];
    const price = entry && /price: (\d+)/.exec(entry)?.[1];
    if (!price) {
      throw new Error(`Could not read pricing.${pricingKey}.price from src/lib/brand.ts`);
    }
    out[pricingKey] = Number(price);
  }
  return out;
}

/**
 * Compare one Stripe price against what the site advertises.
 *
 * Pure, so the disagreements are testable without an account.
 *
 * @returns a list of human-readable problems; empty means they agree.
 */
export function problemsWith({ name, price, expectedDollars, expectedInterval }) {
  const problems = [];
  const expected = expectedDollars * 100;

  if (price.unit_amount !== expected) {
    problems.push(
      `${name}: Stripe charges ${price.unit_amount} but the site advertises ${expected}. ` +
        "Change one to match the other.",
    );
  }
  if (price.currency !== CURRENCY) {
    problems.push(`${name}: currency is ${price.currency}, expected ${CURRENCY}.`);
  }
  if (!price.active) {
    problems.push(`${name}: the price is archived, so checkout will fail.`);
  }

  const actualInterval = price.recurring?.interval ?? null;
  if (actualInterval !== expectedInterval) {
    problems.push(
      `${name}: billing interval is ${actualInterval ?? "one-time"}, ` +
        `expected ${expectedInterval ?? "one-time"}.`,
    );
  }
  return problems;
}
