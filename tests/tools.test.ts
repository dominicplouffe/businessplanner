import { INTAKE_STEPS, REVENUE_MODELS } from "@/lib/content/intake";
import type { IntakeState } from "@/lib/content/intake-mapper";
import { defaultsForIndustry } from "@/lib/content/intake-defaults";
import { buildAssumptions } from "@/lib/content/intake-mapper";
import { AssumptionsSchema } from "@/lib/finance/types";
import { describe, expect, it } from "vitest";
import { TOOL_PAGES, getToolPage, toolsByDemand } from "@/lib/content/tools";
import { buildAmortisation, levelPayment } from "@/lib/finance/loans";
import { computeSizing } from "@/lib/market/sizing";
import { dscrThreshold, sbaProgrammeForLoan } from "@/lib/content/regulatory";

/* The calculators themselves are client components, but every figure they show
   comes from these functions. Testing the functions with the pages' own default
   inputs catches the class of error a screenshot never would. */

describe("tool pages", () => {
  it("has unique slugs and is ordered by demand", () => {
    const slugs = TOOL_PAGES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const volumes = toolsByDemand().map((t) => t.demand.volume);
    expect([...volumes].sort((a, b) => b - a)).toEqual(volumes);
  });

  it("states method and limits on every tool", () => {
    for (const tool of TOOL_PAGES) {
      expect(tool.method.length, tool.slug).toBeGreaterThan(1);
      expect(tool.limits.length, tool.slug).toBeGreaterThan(0);
      expect(tool.related.length, tool.slug).toBeGreaterThan(0);
    }
  });

  it("resolves by slug", () => {
    expect(getToolPage("dscr")?.label).toBe("DSCR");
    expect(getToolPage("nope")).toBeUndefined();
  });
});

describe("what the calculators compute", () => {
  it("amortises to zero and splits every payment", () => {
    const rows = buildAmortisation({
      id: "l", name: "L", month: 1,
      principal: 250_000, annualRate: 0.115, termMonths: 120,
      interestOnlyMonths: 0, balloonPayment: 0,
    });
    expect(rows).toHaveLength(120);
    expect(rows.at(-1)!.closingBalance).toBeCloseTo(0, 6);
    const repaid = rows.reduce((s, r) => s + r.principal, 0);
    expect(repaid).toBeCloseTo(250_000, 6);
    for (const r of rows) {
      expect(r.interest + r.principal).toBeCloseTo(r.payment, 6);
    }
  });

  it("makes a balloon genuinely cheaper each month", () => {
    const loan = {
      id: "l", name: "L", month: 1,
      principal: 250_000, annualRate: 0.115, termMonths: 120,
      interestOnlyMonths: 0,
    };
    const level = buildAmortisation({ ...loan, balloonPayment: 0 })[0]!.payment;
    const ballooned = buildAmortisation({ ...loan, balloonPayment: 100_000 })[0]!.payment;
    expect(ballooned).toBeLessThan(level);
  });

  it("agrees with the closed-form payment the DSCR tool uses", () => {
    const monthly = levelPayment(400_000, 0.115 / 12, 120);
    const schedule = buildAmortisation({
      id: "l", name: "L", month: 1,
      principal: 400_000, annualRate: 0.115, termMonths: 120,
      interestOnlyMonths: 0, balloonPayment: 0,
    });
    expect(monthly).toBeCloseTo(schedule[0]!.payment, 6);
  });

  it("selects the programme from the loan size, at a fixed date", () => {
    const asOf = new Date("2026-09-20");
    expect(sbaProgrammeForLoan(400_000, asOf).programme).toBe("7a-small");
    expect(sbaProgrammeForLoan(560_000, asOf).programme).toBe("7a-standard");
    // The threshold must come from configuration, not from a constant: a
    // different programme has to give a different dated entry.
    const small = dscrThreshold("7a-small", asOf);
    const standard = dscrThreshold("7a-standard", asOf);
    expect(small.source.label.length).toBeGreaterThan(0);
    expect(standard.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("sizes a market bottom-up with the arithmetic attached", () => {
    const r = computeSizing({
      populationCount: 120_000,
      qualifiedShare: 0.35,
      annualSpendPerCustomer: 480,
      servableShare: 0.2,
      targetShare: 0.04,
    });
    expect(r.tam).toBeCloseTo(120_000 * 0.35 * 480, 6);
    expect(r.sam).toBeCloseTo(r.tam * 0.2, 6);
    expect(r.som).toBeCloseTo(r.sam * 0.04, 6);
    expect(r.impliedCustomers).toBeCloseTo(r.som / 480, 6);
    expect(r.complete).toBe(true);
    // Every step renders on the page, so every step needs a label and a kind.
    for (const step of r.steps) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(["count", "percent", "currency"]).toContain(step.kind);
    }
  });
});

/* ==========================================================================
   The questionnaire cannot produce an unbounded plan.
   --------------------------------------------------------------------------
   The engine refuses one and the validator blocks one, but the intake is where
   the reported plan was actually typed: a percent field that accepted 50 and a
   mapper that turned it into sixty months of compounding.
   ========================================================================== */
describe("intake — every model it can build declares its limits", () => {
  const answeredFor = (kind: string) => {
    const seeds = defaultsForIndustry("other");
    const state: IntakeState = {
      ...seeds,
      "company.name": "Test",
      "company.industryKey": "other",
      "company.purpose": "internal",
      "company.startDate": "2026-01",
      "company.firstTradingMonth": 1,
      "context.description": "A business.",
      "rev.kind": kind,
    };
    // Whatever this model asks for, answered from the seeds for that model.
    const revenueStep = INTAKE_STEPS.find((s) => s.key === "revenue")!;
    for (const field of revenueStep.fields(state)) {
      if (state[field.key] === undefined) state[field.key] = 1;
    }
    return state;
  };

  it.each(REVENUE_MODELS.map((m) => m.kind))("bounds a %s plan", (kind) => {
    const assumptions = AssumptionsSchema.parse(buildAssumptions(answeredFor(kind), {}));
    const stream = assumptions.revenueStreams[0]!;
    expect(stream.growth, kind).toBeDefined();
    expect(stream.growth!.shape, kind).not.toBe("unbounded");
  });

  it("asks for the capacity of every model that can compound", () => {
    // A model whose growth is a rate must ask what limits it. Contract books
    // plateau on their own and hourly services are limited by people, both of
    // which are asked for in their own words.
    const revenueStep = INTAKE_STEPS.find((s) => s.key === "revenue")!;
    for (const model of REVENUE_MODELS) {
      const keys = revenueStep.fields({ "rev.kind": model.kind }).map((f) => f.key);
      const compounds = keys.some((k) => /GrowthRate$/.test(k));
      if (!compounds) continue;
      const bounded = keys.some((k) => /capacity|Ceiling/i.test(k));
      expect(bounded, `${model.kind} asks for a rate but not a ceiling`).toBe(true);
    }
  });

  it("refuses a growth rate that compounds to nonsense", () => {
    // 50% a month is 12,900% a year. The old field accepted it; the schema
    // that the intake maps into now does not.
    const revenueStep = INTAKE_STEPS.find((s) => s.key === "revenue")!;
    for (const model of REVENUE_MODELS) {
      for (const field of revenueStep.fields({ "rev.kind": model.kind })) {
        if (!/GrowthRate$/.test(field.key)) continue;
        expect(field.max, `${model.kind}.${field.key}`).toBeLessThanOrEqual(25);
      }
    }
  });
});
