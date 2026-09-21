/* ==========================================================================
   Environment.
   --------------------------------------------------------------------------
   Read in one place, validated once, and loud about what is missing.

   The rule here is that a misconfigured production deployment must fail at
   boot rather than at the first request that needs the missing value. A site
   that starts, serves the marketing pages, and then fails at checkout is far
   harder to diagnose than one that refuses to start and says which variable it
   wanted.
   ========================================================================== */

export type Runtime = "development" | "test" | "production";

export const runtime: Runtime =
  (process.env.NODE_ENV as Runtime | undefined) ?? "development";

export const isProduction = runtime === "production";

/** Postgres in production, SQLite locally. Chosen by the URL, not by a flag,
 *  so there is one thing to get right rather than two that can disagree. */
export const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

export const databaseKind: "postgres" | "sqlite" = /^postgres(ql)?:\/\//.test(databaseUrl)
  ? "postgres"
  : "sqlite";

/**
 * The public origin.
 *
 * Every canonical URL, every sitemap entry, every OpenGraph tag and every
 * Stripe redirect derives from this. Hardcoding it means a staging deployment
 * advertises production canonicals and sends Stripe customers to the wrong
 * host, so it is environment-driven with the production domain as the fallback.
 */
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://getventurely.com").replace(
  /\/$/,
  "",
);

/**
 * The Stripe prices checkout charges against.
 *
 * Price ids and not amounts: the amount lives in Stripe, which is what makes
 * the catalogue reportable and lets a promotion code or a tax rule attach to
 * something. The risk that buys is a second copy of the number — `pricing` in
 * `brand.ts` is what the marketing site renders, and Stripe is what the card
 * is actually charged, so the two can disagree and nothing in the app would
 * notice. `node scripts/stripe-verify.mjs` is the check that they have not.
 *
 * Environment rather than source because a price id is mode-specific: the test
 * ids do not exist in live and vice versa, so a hardcoded one is a checkout
 * that works in exactly one of the two.
 */
export const stripePriceUnlock = process.env.STRIPE_PRICE_UNLOCK ?? "";
export const stripePriceLive = process.env.STRIPE_PRICE_LIVE ?? "";

/** What must be present before production traffic is served. */
const REQUIRED_IN_PRODUCTION = [
  ["DATABASE_URL", process.env.DATABASE_URL],
  ["BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET],
  ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL],
] as const;

/**
 * Throws if production is missing something it cannot run correctly without.
 *
 * Called from `instrumentation.ts`, which Next runs once per server start.
 * Deliberately not called at import time: the build imports these modules too,
 * and a build machine legitimately has no database.
 */
export function assertProductionEnv(): void {
  if (!isProduction) return;

  const missing = REQUIRED_IN_PRODUCTION.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Refusing to start: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not set. ` +
        "See .env.example and DEPLOY.md.",
    );
  }

  if (databaseKind !== "postgres") {
    throw new Error(
      "Refusing to start: DATABASE_URL is not a Postgres URL. SQLite is a single file on a " +
        "container filesystem that is discarded on every deploy — using it in production loses " +
        "every plan the moment a task is replaced.",
    );
  }

  // The unlock is the only revenue path. Starting without it means the product
  // silently cannot be bought, which is worse than not starting.
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "Refusing to start: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are both required in " +
        "production. Without them billing falls back to a development provider that grants " +
        "entitlements without payment, which must never run here.",
    );
  }

  /* Same reasoning one level down. Checkout names these prices, so a missing
     one is not a degraded checkout, it is Stripe rejecting the session — and
     it would surface as a customer clicking Buy and getting an error, which is
     the most expensive place to find out. */
  const prices = [
    ["STRIPE_PRICE_UNLOCK", stripePriceUnlock],
    ["STRIPE_PRICE_LIVE", stripePriceLive],
  ] as const;
  const unpriced = prices.filter(([, value]) => !value).map(([name]) => name);
  if (unpriced.length > 0) {
    throw new Error(
      `Refusing to start: ${unpriced.join(", ")} ${unpriced.length === 1 ? "is" : "are"} not set. ` +
        "Checkout charges against a Stripe price id rather than an amount. Create the catalogue " +
        "and read the ids back with `node scripts/stripe-verify.mjs`.",
    );
  }

  /* A live deployment pointed at test prices takes no money and reports no
     error worth reading, so it is worth the two lines to refuse it. */
  const testPrices = prices.filter(([, value]) => value.startsWith("price_test_"));
  if (testPrices.length > 0) {
    throw new Error(
      `Refusing to start: ${testPrices.map(([name]) => name).join(", ")} looks like a test-mode ` +
        "price id. A production checkout against a test price cannot be paid.",
    );
  }
}
