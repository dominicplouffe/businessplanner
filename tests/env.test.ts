import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ==========================================================================
   The production boot guard.
   --------------------------------------------------------------------------
   This is the check that stands between a production deployment and a billing
   provider that grants entitlements without payment. It is worth testing
   directly rather than trusting that nobody will ever deploy with an empty
   environment.

   The module reads process.env at import time, so each case resets the module
   registry and imports it fresh.
   ========================================================================== */

const ORIGINAL = { ...process.env };

function setEnv(values: Record<string, string | undefined>) {
  for (const key of ["NODE_ENV", "DATABASE_URL", "BETTER_AUTH_SECRET", "NEXT_PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_UNLOCK", "STRIPE_PRICE_LIVE"]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

const COMPLETE = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.internal:5432/venturelly",
  BETTER_AUTH_SECRET: "a-real-secret",
  NEXT_PUBLIC_SITE_URL: "https://example.com",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_PRICE_UNLOCK: "price_live_unlock",
  STRIPE_PRICE_LIVE: "price_live_monthly",
};

async function assertWith(values: Record<string, string | undefined>) {
  setEnv(values);
  vi.resetModules();
  const { assertProductionEnv } = await import("@/lib/env");
  return () => assertProductionEnv();
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("assertProductionEnv", () => {
  it("accepts a fully configured production environment", async () => {
    expect(await assertWith(COMPLETE)).not.toThrow();
  });

  it("does nothing outside production", async () => {
    // Development runs with no database URL and no keys at all, on purpose.
    expect(await assertWith({ NODE_ENV: "development" })).not.toThrow();
  });

  it.each(["DATABASE_URL", "BETTER_AUTH_SECRET", "NEXT_PUBLIC_SITE_URL"])(
    "refuses to start when %s is missing",
    async (missing) => {
      const run = await assertWith({ ...COMPLETE, [missing]: undefined });
      expect(run).toThrow(new RegExp(missing));
    },
  );

  it("refuses SQLite in production", async () => {
    // SQLite on a container filesystem is discarded on every deploy, which
    // loses every plan the moment a task is replaced.
    const run = await assertWith({ ...COMPLETE, DATABASE_URL: "file:./prisma/dev.db" });
    expect(run).toThrow(/Postgres/);
  });

  it.each(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])(
    "refuses to start without %s",
    async (missing) => {
      // Without these the billing layer falls back to a provider that grants
      // entitlements with no payment. Not starting is the safe failure.
      const run = await assertWith({ ...COMPLETE, [missing]: undefined });
      expect(run).toThrow(/without payment/);
    },
  );

  it.each(["STRIPE_PRICE_UNLOCK", "STRIPE_PRICE_LIVE"])(
    "refuses to start without %s",
    async (missing) => {
      /* Checkout names a price rather than an amount, so a missing one is not
         a degraded checkout — it is Stripe rejecting the session at the moment
         a customer clicks Buy, which is the worst place to discover it. */
      const run = await assertWith({ ...COMPLETE, [missing]: undefined });
      expect(run).toThrow(new RegExp(missing));
    },
  );

  it("refuses a test-mode price in production", async () => {
    // A live deployment pointed at test prices takes no money and says nothing
    // useful about why.
    const run = await assertWith({ ...COMPLETE, STRIPE_PRICE_UNLOCK: "price_test_abc" });
    expect(run).toThrow(/test-mode price/);
  });
});

describe("derived values", () => {
  it("reads the site origin from the environment and strips a trailing slash", async () => {
    setEnv({ ...COMPLETE, NEXT_PUBLIC_SITE_URL: "https://staging.example.com/" });
    vi.resetModules();
    const { siteUrl } = await import("@/lib/env");
    expect(siteUrl).toBe("https://staging.example.com");
  });

  it("falls back to the production origin, spelled the one agreed way", async () => {
    // The domain was settled once and three near-misses were in the repo before
    // it was. A comment does not stop the fourth; this does.
    setEnv({ ...COMPLETE, NEXT_PUBLIC_SITE_URL: undefined });
    vi.resetModules();
    const { siteUrl } = await import("@/lib/env");
    expect(siteUrl).toBe("https://getventurely.com");
  });

  it("picks the database driver from the URL rather than a separate flag", async () => {
    setEnv({ ...COMPLETE, DATABASE_URL: "postgres://u:p@h:5432/d" });
    vi.resetModules();
    expect((await import("@/lib/env")).databaseKind).toBe("postgres");

    setEnv({ NODE_ENV: "development", DATABASE_URL: "file:./prisma/dev.db" });
    vi.resetModules();
    expect((await import("@/lib/env")).databaseKind).toBe("sqlite");
  });
});

/* ==========================================================================
   The admin allowlist.
   --------------------------------------------------------------------------
   This decides who can give away paid access, so the case that matters most is
   the unconfigured one: an admin surface that is open because nobody set the
   variable is the failure worth a test.
   ========================================================================== */
describe("admin allowlist", () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  });

  it("admits nobody when it is not configured", async () => {
    const { isAdminEmail } = await import("@/lib/env");
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("anyone@example.com")).toBe(false);

    process.env.ADMIN_EMAILS = "";
    expect(isAdminEmail("anyone@example.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("matches regardless of case or surrounding space", async () => {
    const { isAdminEmail } = await import("@/lib/env");
    process.env.ADMIN_EMAILS = " Owner@Example.com , second@example.com ";
    expect(isAdminEmail("owner@example.com")).toBe(true);
    expect(isAdminEmail("  OWNER@EXAMPLE.COM ")).toBe(true);
    expect(isAdminEmail("second@example.com")).toBe(true);
  });

  it("admits nobody else", async () => {
    const { isAdminEmail } = await import("@/lib/env");
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminEmail("intruder@example.com")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    // Not a prefix, suffix or substring match.
    expect(isAdminEmail("owner@example.com.evil.test")).toBe(false);
    expect(isAdminEmail("notowner@example.com")).toBe(false);
  });
});
