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
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://getventuraly.com").replace(
  /\/$/,
  "",
);

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
}
