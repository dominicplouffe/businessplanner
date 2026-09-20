import { describe, expect, it } from "vitest";
import { scorePlan, type PlanPurpose, type ReviewInput } from "@/lib/review/rubric";
import { buildFixQueue } from "@/lib/review/queue";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { AssumptionsSchema } from "@/lib/finance/types";
import { buildModelIndex, checkPlan } from "@/lib/ai/consistency";
import { buildValidationContext } from "@/lib/review/context";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { restaurantPlan, saasPlan } from "./fixtures";

const ALL_SECTIONS = PLAN_SECTIONS.map((s) => s.key);

function inputFor(
  plan = restaurantPlan,
  purpose: PlanPurpose = "sba-loan",
  overrides: Partial<ReviewInput> = {},
): ReviewInput {
  const assumptions = AssumptionsSchema.parse(plan);
  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);
  const index = buildModelIndex(model, metrics, assumptions);
  const consistency = checkPlan([], index);
  return {
    purpose,
    assumptions,
    model,
    metrics,
    validation: validateModel(model, metrics, buildValidationContext({ purpose, assumptions })),
    consistency,
    sectionsWritten: ALL_SECTIONS,
    sectionsExpected: ALL_SECTIONS,
    ...overrides,
  };
}

describe("scorePlan", () => {
  it("names every check it scored, so the number is never the only output", () => {
    const readiness = scorePlan(inputFor());
    expect(readiness.dimensions).toHaveLength(5);
    for (const dimension of readiness.dimensions) {
      expect(dimension.checks.length).toBeGreaterThan(0);
      for (const check of dimension.checks) {
        expect(check.label.length).toBeGreaterThan(0);
        expect(check.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("weights sum to one for every purpose, so scores are comparable", () => {
    for (const purpose of ["sba-loan", "investor", "immigration", "internal"] as PlanPurpose[]) {
      const readiness = scorePlan(inputFor(restaurantPlan, purpose));
      const total = readiness.dimensions.reduce((sum, d) => sum + d.weight, 0);
      expect(total, purpose).toBeCloseTo(1, 6);
    }
  });

  it("asks a different reader's question for each purpose", () => {
    const lender = scorePlan(inputFor(restaurantPlan, "sba-loan"));
    const investor = scorePlan(inputFor(saasPlan, "investor"));
    const adjudicator = scorePlan(inputFor(restaurantPlan, "immigration"));

    const readerLabels = (r: ReturnType<typeof scorePlan>) =>
      r.dimensions.find((d) => d.key === "reader")!.checks.map((c) => c.label).join(" ");

    expect(readerLabels(lender)).toMatch(/Coverage clears/);
    expect(readerLabels(investor)).toMatch(/Lifetime value/);
    expect(readerLabels(adjudicator)).toMatch(/Household size/);
  });

  it("holds the score below passing whenever anything is blocking", () => {
    const input = inputFor();
    const blocked: ReviewInput = {
      ...input,
      validation: {
        findings: [
          {
            id: "statements-do-not-tie",
            severity: "blocking",
            title: "x",
            detail: "x",
            remedy: "x",
          },
        ],
        blockingCount: 1,
        warningCount: 0,
        canExport: false,
      },
    };
    const readiness = scorePlan(blocked);
    expect(readiness.score).toBeLessThan(60);
    expect(readiness.band).toBe("not-ready");
    expect(readiness.verdict).toMatch(/must be resolved/);
  });

  it("scores an unwritten plan below a written one", () => {
    // Scored as internal, the one purpose the fixture raises nothing blocking
    // for — otherwise both sit on the blocking cap and the comparison is moot.
    const written = scorePlan(inputFor(restaurantPlan, "internal"));
    const empty = scorePlan(inputFor(restaurantPlan, "internal", { sectionsWritten: [] }));
    expect(empty.score).toBeLessThan(written.score);
    expect(
      empty.dimensions.find((d) => d.key === "document")!.score,
    ).toBe(0);
  });

  it("does not claim sourcing it has not got", () => {
    // Until grounded research lands, the evidence dimension must say so rather
    // than score a plan as sourced.
    const readiness = scorePlan(inputFor());
    const evidence = readiness.dimensions.find((d) => d.key === "evidence")!;
    const sourcing = evidence.checks.find((c) => c.label.match(/dated source/))!;
    expect(sourcing.passed).toBe(false);
    expect(sourcing.detail).toMatch(/not built yet/);
  });

  it("never scores above 100 or below 0", () => {
    for (const plan of [restaurantPlan, saasPlan]) {
      for (const purpose of ["sba-loan", "investor", "immigration", "internal"] as PlanPurpose[]) {
        const readiness = scorePlan(inputFor(plan, purpose));
        expect(readiness.score).toBeGreaterThanOrEqual(0);
        expect(readiness.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("buildFixQueue", () => {
  const assumptions = AssumptionsSchema.parse(restaurantPlan);
  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);
  const index = buildModelIndex(model, metrics, assumptions);

  it("expands unreconciled figures into individually actionable items", () => {
    const consistency = checkPlan(
      [{ key: "market", title: "Market analysis", text: "Revenue reaches $9,400,000 by year two." }],
      index,
    );
    const validation = validateModel(model, metrics, { purpose: "sba-loan" });
    const queue = buildFixQueue("p1", validation, consistency, "USD");

    const item = queue.find((q) => q.source === "consistency");
    expect(item).toBeDefined();
    expect(item!.title).toContain("$9,400,000");
    expect(item!.href).toBe("/plans/p1/sections/market");
    expect(item!.remedy.length).toBeGreaterThan(0);
  });

  it("suggests the nearest computed value when there is one", () => {
    const revenue = model.annual[0]!.revenue;
    const consistency = checkPlan(
      [
        {
          key: "financials",
          title: "Financial plan",
          text: `Revenue of $${Math.round(revenue * 1.03).toLocaleString("en-US")} in year one.`,
        },
      ],
      index,
    );
    const validation = validateModel(model, metrics, { purpose: "sba-loan" });
    const queue = buildFixQueue("p1", validation, consistency, "USD");
    const item = queue.find((q) => q.source === "consistency")!;
    expect(item.remedy).toMatch(/closest computed value/);
  });

  it("does not also list the roll-up the queue exists to expand", () => {
    const validation = validateModel(model, metrics, {
      purpose: "sba-loan",
      unreconciledFigureCount: 3,
    });
    expect(validation.findings.map((f) => f.id)).toContain("narrative-model-mismatch");

    const queue = buildFixQueue("p1", validation, checkPlan([], index), "USD");
    expect(queue.map((q) => q.id)).not.toContain("narrative-model-mismatch");
  });

  it("puts blocking items first and gives everything somewhere to go", () => {
    const validation = validateModel(model, metrics, { purpose: "sba-loan" });
    const queue = buildFixQueue("p1", validation, checkPlan([], index), "USD");
    const firstWarning = queue.findIndex((q) => q.severity === "warning");
    const lastBlocking = queue.map((q) => q.severity).lastIndexOf("blocking");
    if (firstWarning !== -1 && lastBlocking !== -1) {
      expect(lastBlocking).toBeLessThan(firstWarning);
    }
    for (const item of queue) {
      expect(item.remedy.length).toBeGreaterThan(0);
    }
  });
});

describe("buildValidationContext", () => {
  const assumptions = AssumptionsSchema.parse(restaurantPlan);

  it("tells the validator about the downside the product actually ships", () => {
    // Without this the validator reports "no coherent downside" on a plan whose
    // financials page renders one moving six drivers.
    const ctx = buildValidationContext({ purpose: "sba-loan", assumptions });
    expect(ctx.downsideScenarioDriverCount).toBeGreaterThanOrEqual(5);

    const model = buildModel(assumptions);
    const metrics = computeMetrics(model);
    const ids = validateModel(model, metrics, ctx).findings.map((f) => f.id);
    expect(ids).not.toContain("no-coherent-downside");
  });

  it("derives the SBA programme from the request size", () => {
    expect(buildValidationContext({ purpose: "sba-loan", assumptions }).sbaProgramme).toBe("7a-small");
  });

  it("passes the unreconciled count through only once figures have been checked", () => {
    expect(buildValidationContext({ purpose: "sba-loan", assumptions }).unreconciledFigureCount)
      .toBeUndefined();

    const model = buildModel(assumptions);
    const index = buildModelIndex(model, computeMetrics(model), assumptions);
    const consistency = checkPlan(
      [{ key: "market", title: "Market", text: "Revenue of $9,400,000." }],
      index,
    );
    expect(
      buildValidationContext({ purpose: "sba-loan", assumptions, consistency })
        .unreconciledFigureCount,
    ).toBe(1);
  });
});
