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
  for (const key of ["NODE_ENV", "DATABASE_URL", "BETTER_AUTH_SECRET", "NEXT_PUBLIC_SITE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

const COMPLETE = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.internal:5432/venturally",
  BETTER_AUTH_SECRET: "a-real-secret",
  NEXT_PUBLIC_SITE_URL: "https://example.com",
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
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
});

describe("derived values", () => {
  it("reads the site origin from the environment and strips a trailing slash", async () => {
    setEnv({ ...COMPLETE, NEXT_PUBLIC_SITE_URL: "https://staging.example.com/" });
    vi.resetModules();
    const { siteUrl } = await import("@/lib/env");
    expect(siteUrl).toBe("https://staging.example.com");
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
