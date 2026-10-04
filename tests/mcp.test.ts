import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTAKE_STEPS } from "@/lib/content/intake";
import { buildAssumptions } from "@/lib/content/intake-mapper";
import { AssumptionsSchema } from "@/lib/finance/types";
import {
  benchmarkDefaults,
  describeIntake,
  fieldsFor,
  mergeAnswers,
  missingRequired,
  seedIntake,
  validateAnswers,
} from "@/lib/mcp/intake";
import { withNativeLoopbackDefault } from "@/lib/mcp/registration";

/* ==========================================================================
   The MCP endpoint's decisions.
   --------------------------------------------------------------------------
   The endpoint itself needs a server, a browser and an OAuth dance, which is
   what tests/e2e/mcp.mjs does. What it decides about answers, seeds and
   registrations is pure, and is checked here — along with the invariants that
   would fail silently in production if anybody relaxed them.
   ========================================================================== */

describe("the questions a client is asked", () => {
  it("are the wizard's own, field for field", () => {
    /* A second renderer of INTAKE_STEPS, not a second list. If a field is
       added to the wizard and not here, a client could never answer it. */
    const described = describeIntake("subscription").steps.flatMap((s) => s.fields.map((f) => f.key));
    const wizard = INTAKE_STEPS.flatMap((s) => s.fields({ "rev.kind": "subscription" }).map((f) => f.key));
    expect(described).toEqual(wizard);
  });

  it("change with the revenue model", () => {
    const keys = (kind: Parameters<typeof describeIntake>[0]) =>
      describeIntake(kind).steps.find((s) => s.key === "revenue")!.fields.map((f) => f.key);
    expect(keys("subscription")).toContain("rev.monthlyChurnRate");
    expect(keys("unit-sales")).not.toContain("rev.monthlyChurnRate");
  });
});

describe("validating answers", () => {
  it("accepts an answer to a question that exists", () => {
    const { accepted, errors } = validateAnswers({ "rev.pricePerCustomerPerMonth": 49 }, { "rev.kind": "subscription" });
    expect(errors).toEqual([]);
    expect(accepted).toEqual({ "rev.pricePerCustomerPerMonth": 49 });
  });

  it("refuses a key that is not a question — so no figure can be written past the engine", () => {
    /* The one rule: a client supplies drivers, never statement figures. The
       only way in is a key the intake defines. */
    const { accepted, errors } = validateAnswers({ "revenue.year5": 4_300_000, "rev.cpm": 4 }, { "rev.kind": "subscription" });
    expect(accepted).toEqual({});
    expect(errors.map((e) => e.key)).toEqual(["revenue.year5", "rev.cpm"]);
  });

  it("judges revenue keys by the model the same answers set", () => {
    const { errors } = validateAnswers({ "rev.kind": "advertising", "rev.cpm": 4 }, { "rev.kind": "subscription" });
    expect(errors).toEqual([]);
  });

  it("holds numbers to the wizard's limits", () => {
    const { errors } = validateAnswers({ "rev.monthlyChurnRate": 80 }, { "rev.kind": "subscription" });
    expect(errors[0]?.message).toMatch(/cannot be above 50/);
  });

  it("says back a rate that looks like a fraction rather than guessing", () => {
    /* 0.02 is a legal churn — 0.02% — so it is accepted, but a client that
       meant 2% must be told, because nothing downstream would look wrong. */
    const { accepted, warnings } = validateAnswers({ "rev.monthlyChurnRate": 0.02 }, { "rev.kind": "subscription" });
    expect(accepted["rev.monthlyChurnRate"]).toBe(0.02);
    expect(warnings[0]?.message).toMatch(/send 2\b/);
  });

  it("checks choices and months", () => {
    const { errors } = validateAnswers({ "company.purpose": "lottery", "company.startDate": "2026-13" });
    expect(errors.map((e) => e.key).sort()).toEqual(["company.purpose", "company.startDate"]);
  });
});

describe("seeding and merging answers the way the wizard does", () => {
  it("starts from the industry's values, every one marked as a default", () => {
    const seeded = seedIntake("saas");
    expect(seeded.state["rev.kind"]).toBe("subscription");
    expect(Object.values(seeded.provenance).every((p) => p === "benchmark_default")).toBe(true);
  });

  it("records an answer as estimated unless the person stated it", () => {
    const merged = mergeAnswers(
      seedIntake("saas"),
      { "rev.pricePerCustomerPerMonth": 49, "rev.monthlyChurnRate": 2 },
      { "rev.pricePerCustomerPerMonth": "known" },
    );
    expect(merged.provenance["rev.pricePerCustomerPerMonth"]).toBe("known");
    expect(merged.provenance["rev.monthlyChurnRate"]).toBe("estimated");
  });

  it("clears the old model's drivers when the model changes", () => {
    /* rev.monthlyGrowthRate belongs to four models; carrying a shop's rate into
       a marketplace unasked is the bug the wizard fixed. */
    const shop = mergeAnswers(seedIntake("retail"), { "rev.monthlyGrowthRate": 9 }, { "rev.monthlyGrowthRate": "known" });
    const market = mergeAnswers(shop, { "rev.kind": "marketplace" });
    expect(market.state["rev.dailyTraffic"]).toBeUndefined();
    expect(market.provenance["rev.monthlyGrowthRate"]).toBe("benchmark_default");
    expect(market.state["rev.takeRate"]).toBeDefined();
  });

  it("re-seeds only defaults when the industry changes, never an answer or a decision", () => {
    const start = mergeAnswers(
      seedIntake("restaurant"),
      { "costs.rent": 9000, "company.purpose": "sba-loan" },
      { "costs.rent": "known" },
    );
    const moved = mergeAnswers(start, { "company.industryKey": "salon" });
    expect(moved.state["costs.rent"]).toBe(9000);
    expect(moved.state["company.purpose"]).toBe("sba-loan");
    expect(moved.state["costs.cogsPercent"]).not.toBe(start.state["costs.cogsPercent"]);
  });

  it("produces answers the engine accepts, as the wizard's do", () => {
    const merged = mergeAnswers(seedIntake("saas"), {
      "company.name": "Ledgerline",
      "context.description": "Bookkeeping software for cafes.",
    });
    expect(missingRequired(merged.state)).toEqual([]);
    expect(AssumptionsSchema.safeParse(buildAssumptions(merged.state, merged.provenance)).success).toBe(true);
  });

  it("lists the defaults still standing, so a client can put each one to the person", () => {
    const merged = mergeAnswers(seedIntake("saas"), { "rev.pricePerCustomerPerMonth": 49 });
    const standing = benchmarkDefaults(merged.state, merged.provenance).map((d) => d.key);
    expect(standing).not.toContain("rev.pricePerCustomerPerMonth");
    expect(standing).toContain("rev.monthlyChurnRate");
    // Decisions are not drivers and are not printed with a source.
    expect(standing).not.toContain("company.purpose");
    expect(standing.every((key) => fieldsFor("subscription").get(key)?.provenance)).toBe(true);
  });
});

describe("client registration", () => {
  it("records a loopback-only client as native when it did not say", () => {
    expect(withNativeLoopbackDefault({ redirect_uris: ["http://localhost:6274/callback"] })).toMatchObject({
      application_type: "native",
    });
    expect(withNativeLoopbackDefault({ redirect_uris: ["http://127.0.0.1:9/cb", "http://[::1]:9/cb"] })).toMatchObject({
      application_type: "native",
    });
  });

  it("leaves everything else to the library", () => {
    const web = { redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] };
    expect(withNativeLoopbackDefault(web)).toBe(web);
    const mixed = { redirect_uris: ["http://localhost:1/cb", "https://example.com/cb"] };
    expect(withNativeLoopbackDefault(mixed)).toBe(mixed);
    const declared = { application_type: "web", redirect_uris: ["http://localhost:1/cb"] };
    expect(withNativeLoopbackDefault(declared)).toBe(declared);
    // Not loopback, however it is spelled.
    const lookalike = { redirect_uris: ["http://localhost.example.com/cb"] };
    expect(withNativeLoopbackDefault(lookalike)).toBe(lookalike);
  });
});

describe("invariants that would only fail in production", () => {
  it("encodes lists as text on every database", () => {
    /* Told "postgresql", the adapter hands Prisma native arrays for the OAuth
       tables' scope and redirect columns. SQLite would never notice; the first
       client registration in production would fail. */
    expect(readFileSync("src/lib/auth.ts", "utf8")).toMatch(/prismaAdapter\(db, \{ provider: "sqlite" \}\)/);
    expect(readFileSync("prisma/schema.prisma", "utf8")).not.toMatch(/\b(String|Int)\[\]/);
  });

  it("refuses every write to a read-only connection", () => {
    /* Each tool that is not marked read-only must check for plans:write before
       it does anything. A tool added without the check would let a token the
       person granted for reading change their plans. */
    const source = readFileSync("src/lib/mcp/tools.ts", "utf8");
    const tools = source.split("server.registerTool(").slice(1);
    expect(tools.length).toBeGreaterThan(10);
    for (const tool of tools) {
      const name = /"([a-z_]+)"/.exec(tool)![1];
      if (tool.includes("readOnlyHint: true")) continue;
      expect(tool, name).toMatch(/const denied = needsWrite\(\);\s*if \(denied\) return denied;/);
    }
  });

  it("requires a live consent, not just a valid signature", () => {
    expect(readFileSync("src/lib/mcp/auth.ts", "utf8")).toMatch(/oauthConsent\.findFirst/);
  });
});
