import { describe, expect, it } from "vitest";
import { FixtureGenerator } from "@/lib/ai/fixture-generator";
import { buildFactsBlock } from "@/lib/ai/context";
import type { GenerationContext } from "@/lib/ai/types";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { AssumptionsSchema } from "@/lib/finance/types";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { restaurantPlan, saasPlan } from "./fixtures";

function contextFor(sectionKey: string, plan = restaurantPlan): GenerationContext {
  const assumptions = AssumptionsSchema.parse(plan);
  const model = buildModel(assumptions);
  const section = PLAN_SECTIONS.find((s) => s.key === sectionKey)!;
  return {
    planId: "test",
    sectionKey,
    sectionTitle: section.title,
    companyName: assumptions.company.name,
    industryKey: assumptions.company.industryKey,
    purpose: "sba-loan",
    description: "A neighbourhood restaurant.",
    assumptions,
    model,
    metrics: computeMetrics(model),
    written: [],
  };
}

async function collect(ctx: GenerationContext): Promise<string> {
  const generator = new FixtureGenerator();
  let text = "";
  for await (const chunk of generator.generateSection(ctx)) {
    if (chunk.type === "done") text = chunk.text;
  }
  return text;
}

describe("FixtureGenerator", () => {
  it("writes something substantial for every section", async () => {
    for (const section of PLAN_SECTIONS) {
      const text = await collect(contextFor(section.key));
      expect(text.length, `${section.key} produced almost nothing`).toBeGreaterThan(200);
      // It must not leak the template's own scaffolding.
      expect(text).not.toMatch(/undefined|NaN|\[object Object\]/);
    }
  });

  it("names the company and the industry", async () => {
    const text = await collect(contextFor("executive-summary"));
    expect(text).toContain("Rowan & Fig");
    expect(text.toLowerCase()).toContain("restaurant");
  });

  it("works for a different business model without leaking restaurant language", async () => {
    const text = await collect(contextFor("products", saasPlan));
    expect(text).toContain("Northgate Analytics");
    expect(text.toLowerCase()).toMatch(/customers|subscription|month/);
    expect(text.toLowerCase()).not.toContain("footfall");
  });

  it("respects a regeneration instruction being present without breaking", async () => {
    const ctx = { ...contextFor("risks"), instruction: "be blunter" };
    const text = await collect(ctx);
    expect(text.length).toBeGreaterThan(200);
  });
});

describe("generated prose never invents a figure", () => {
  /**
   * The product's central claim is that numbers come from the engine. This
   * asserts it mechanically: every currency amount that appears in generated
   * prose must correspond to a value the engine actually computed.
   *
   * It is also the seed of the narrative-vs-model consistency checker.
   */
  it("every currency figure in the prose traces to an engine value", async () => {
    for (const plan of [restaurantPlan, saasPlan]) {
      const base = contextFor("executive-summary", plan);
      const permitted = permittedAmounts(base);

      for (const section of PLAN_SECTIONS) {
        const ctx = contextFor(section.key, plan);
        const text = await collect(ctx);

        // Intl renders negatives as "-$405,498", so the sign must be captured
        // or a legitimate negative reads as an invented positive.
        const figures = [...text.matchAll(/(-?)\$([\d,]+(?:\.\d+)?)/g)].map(
          (m) => Number(m[1] + m[2]!.replace(/,/g, "")),
        );

        for (const figure of figures) {
          const matched = permitted.some((value) => Math.abs(value - figure) < 1.5);
          expect(
            matched,
            `${section.key}: $${figure.toLocaleString()} does not match any computed value`,
          ).toBe(true);
        }
      }
    }
  });
});

/** Every monetary value the engine computed or was given, rounded as displayed. */
function permittedAmounts(ctx: GenerationContext): number[] {
  const { model, metrics, assumptions } = ctx;
  const values: number[] = [0];

  for (const year of model.annual) {
    values.push(year.revenue, year.grossProfit, year.totalOpex, year.ebitda,
      year.netIncome, year.closingCash, year.closingDebt, year.debtService,
      year.ownerCompensation, year.cogs, year.depreciation, year.interest, year.tax);
  }
  values.push(metrics.cash.lowestCash, metrics.cash.peakFundingNeed,
    metrics.breakEven.averageMonthlyFixedCosts);
  if (metrics.breakEven.monthlyRevenueRequired !== null) {
    values.push(metrics.breakEven.monthlyRevenueRequired);
  }
  if (metrics.unitEconomics.lifetimeValue !== null) values.push(metrics.unitEconomics.lifetimeValue);
  if (metrics.unitEconomics.customerAcquisitionCost !== null) {
    values.push(metrics.unitEconomics.customerAcquisitionCost);
  }
  for (const role of assumptions.roles) values.push(role.annualSalary);
  for (const loan of assumptions.loans) values.push(loan.principal);
  for (const round of assumptions.equityRounds) values.push(round.amount);
  for (const item of assumptions.capex) values.push(item.amount);
  for (const item of assumptions.opex) values.push(item.monthlyAmount);
  for (const stream of assumptions.revenueStreams) {
    for (const value of Object.values(stream)) {
      if (typeof value === "number") values.push(value);
    }
  }
  values.push(
    assumptions.equityRounds.reduce((s, r) => s + r.amount, 0),
    assumptions.loans.reduce((s, l) => s + l.principal, 0),
    assumptions.capex.reduce((s, c) => s + c.amount, 0),
  );

  // Display rounds to whole currency units, so allow the rounded form too.
  return values.flatMap((v) => [v, Math.round(v)]);
}

describe("buildFactsBlock", () => {
  it("carries the figures a section needs to be written honestly", () => {
    const facts = buildFactsBlock(contextFor("financials"));
    expect(facts).toContain("ANNUAL RESULTS");
    expect(facts).toContain("KEY METRICS");
    expect(facts).toContain("PROVENANCE OF THE INPUTS");
    expect(facts).toContain("Rowan & Fig");
    // Benchmarks are supplied with their source, never as bare numbers.
    expect(facts).toMatch(/Source: .+, \d{4}/);
  });

  it("states who the plan is for, because that changes what it must prove", () => {
    const facts = buildFactsBlock(contextFor("executive-summary"));
    expect(facts).toContain("PLAN IS WRITTEN FOR");
  });
});
