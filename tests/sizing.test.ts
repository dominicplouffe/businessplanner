import { describe, expect, it } from "vitest";
import { computeSizing, MarketSizingSchema } from "@/lib/market/sizing";
import { buildModel } from "@/lib/finance/engine";
import { AssumptionsSchema } from "@/lib/finance/types";
import { restaurantPlan } from "./fixtures";

const base = {
  populationLabel: "Households within three miles",
  populationCount: 24_000,
  qualifiedShare: 0.35,
  annualSpendPerCustomer: 480,
  servableShare: 0.6,
  targetShare: 0.08,
  populationSource: "Census tract 2026",
};

describe("computeSizing — the bottom-up build", () => {
  it("multiplies through in the order a reader would check", () => {
    const result = computeSizing(base);
    expect(result.tam).toBeCloseTo(24_000 * 0.35 * 480, 6);
    expect(result.sam).toBeCloseTo(result.tam * 0.6, 6);
    expect(result.som).toBeCloseTo(result.sam * 0.08, 6);
    expect(result.impliedCustomers).toBeCloseTo(result.som / 480, 6);
    expect(result.complete).toBe(true);
  });

  it("shows every step, so a reader can disagree with one number not the conclusion", () => {
    const steps = computeSizing(base).steps;
    expect(steps.map((s) => s.key)).toEqual([
      "population", "qualified", "spend", "tam", "sam", "som",
    ]);
    // Each derived line states how it was reached.
    for (const step of steps.filter((s) => ["qualified", "tam", "sam", "som"].includes(s.key))) {
      expect(step.workings, step.key).toBeTruthy();
    }
    expect(steps[0]!.label).toBe("Households within three miles");
    expect(steps[0]!.note).toContain("Census tract 2026");
  });

  it("is incomplete until it has the inputs it needs", () => {
    expect(computeSizing({ ...base, populationCount: 0 }).complete).toBe(false);
    expect(computeSizing({ ...base, annualSpendPerCustomer: 0 }).complete).toBe(false);
    expect(computeSizing({ ...base, targetShare: 0 }).complete).toBe(false);
  });

  it("does not divide by zero when nothing has been entered", () => {
    const result = computeSizing({});
    expect(result.tam).toBe(0);
    expect(result.impliedCustomers).toBe(0);
    expect(result.complete).toBe(false);
  });

  it("renders sub-one-percent shares without rounding them to nothing", () => {
    const step = computeSizing({ ...base, targetShare: 0.002 }).steps.find((s) => s.key === "som")!;
    expect(step.workings).toContain("0.20%");
  });
});

describe("computeSizing — the top-down cross-check", () => {
  it("is absent until a published figure is supplied", () => {
    expect(computeSizing(base).topDown).toEqual({ status: "absent" });
  });

  it("refuses to use a published figure that carries no citation", () => {
    const topDown = computeSizing({ ...base, topDownMarketSize: 40_000_000_000, topDownLabel: "IBISWorld" }).topDown;
    expect(topDown.status).toBe("uncited");
  });

  it("flags a material divergence between the two methods", () => {
    const tam = 24_000 * 0.35 * 480;
    const near = computeSizing({
      ...base, topDownMarketSize: tam * 2, topDownCitationId: "c1",
    }).topDown;
    const far = computeSizing({
      ...base, topDownMarketSize: tam * 12, topDownCitationId: "c1",
    }).topDown;

    expect(near.status === "cited" && near.diverges).toBe(false);
    expect(far.status === "cited" && far.diverges).toBe(true);
    expect(far.status === "cited" && far.divergence).toBeCloseTo(12, 6);
  });

  it("flags divergence in the other direction too", () => {
    const tam = 24_000 * 0.35 * 480;
    const tiny = computeSizing({ ...base, topDownMarketSize: tam / 10, topDownCitationId: "c1" }).topDown;
    expect(tiny.status === "cited" && tiny.diverges).toBe(true);
  });
});

describe("computeSizing — the check against the plan's own model", () => {
  const model = buildModel(AssumptionsSchema.parse(restaurantPlan));

  it("says so plainly when there is nothing to compare against", () => {
    expect(computeSizing(base).modelCheck.status).toBe("unavailable");
    expect(computeSizing({ ...base, targetShare: 0 }, model).modelCheck.status).toBe("unavailable");
  });

  it("catches a model that outruns the market the plan claims", () => {
    const year3 = model.annual[2]!.revenue;
    // An obtainable share a tenth of what the model forecasts.
    const check = computeSizing(
      { ...base, annualSpendPerCustomer: 480, populationCount: 24_000, qualifiedShare: 0.35, servableShare: 0.6, targetShare: (year3 / 10) / (24_000 * 0.35 * 480 * 0.6) },
      model,
    ).modelCheck;

    expect(check.status).toBe("checked");
    if (check.status !== "checked") return;
    expect(check.overruns).toBe(true);
    expect(check.ratio).toBeCloseTo(10, 1);
    expect(check.projectedRevenue).toBeCloseTo(year3, 6);
  });

  it("passes a model that sits inside the obtainable share", () => {
    const year3 = model.annual[2]!.revenue;
    const tamValue = 24_000 * 0.35 * 480 * 0.6;
    const check = computeSizing({ ...base, targetShare: (year3 * 1.1) / tamValue }, model).modelCheck;
    expect(check.status === "checked" && check.overruns).toBe(false);
    expect(check.status === "checked" && check.understates).toBe(false);
  });

  it("notices a plan claiming far more market than it means to serve", () => {
    // A national population behind a single restaurant: the obtainable share
    // dwarfs anything the model forecasts, which is its own kind of unserious.
    const check = computeSizing(
      { ...base, populationCount: 24_000_000, targetShare: 0.5 },
      model,
    ).modelCheck;
    expect(check.status === "checked" && check.understates).toBe(true);
    expect(check.status === "checked" && check.overruns).toBe(false);
  });

  it("falls back to the last modelled year when asked for one beyond the horizon", () => {
    const check = computeSizing({ ...base, compareToYear: 9 }, model).modelCheck;
    expect(check.status === "checked" && check.year).toBe(model.annual.length);
  });
});

describe("MarketSizingSchema", () => {
  it("defaults to an empty build rather than throwing", () => {
    const parsed = MarketSizingSchema.parse({});
    expect(parsed.populationCount).toBe(0);
    expect(parsed.qualifiedShare).toBe(1);
    expect(parsed.compareToYear).toBe(3);
  });

  it("rejects a share outside nought to one, which is the usual paste error", () => {
    expect(() => MarketSizingSchema.parse({ targetShare: 8 })).toThrow();
  });
});
