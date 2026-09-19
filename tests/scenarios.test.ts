import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/finance/engine";
import { AssumptionsSchema } from "@/lib/finance/types";
import { buildScenarios, driversMoved, sensitivity, SCENARIOS } from "@/lib/finance/scenarios";
import { saasPlan } from "./fixtures";

const parsed = () => AssumptionsSchema.parse(saasPlan);
const finalRevenue = (m: ReturnType<typeof buildModel>) =>
  m.annual.at(-1)?.revenue ?? 0;

describe("buildScenarios", () => {
  it("orders the three cases by revenue", () => {
    const s = buildScenarios(parsed());
    expect(finalRevenue(s.downside)).toBeLessThan(finalRevenue(s.base));
    expect(finalRevenue(s.base)).toBeLessThan(finalRevenue(s.upside));
  });

  it("keeps every scenario's balance sheet tied", () => {
    const s = buildScenarios(parsed());
    for (const model of [s.base, s.upside, s.downside]) {
      expect(model.checks.balanceSheetTie.passes).toBe(true);
    }
  });

  it("makes the downside cut spend as well as revenue — a cost response", () => {
    const s = buildScenarios(parsed());
    const baseOpex = s.base.annual.at(-1)!.totalOpex;
    const downOpex = s.downside.annual.at(-1)!.totalOpex;
    expect(downOpex).toBeLessThan(baseOpex);
  });

  it("holds committed costs fixed in the downside", () => {
    const a = parsed();
    const s = buildScenarios(a);
    const rentOf = (m: ReturnType<typeof buildModel>) =>
      m.pnl.opexByCategory.find((c) => c.category === "rent")?.values[0] ?? 0;
    // Rent is contractually committed, so it does not flex with the scenario.
    expect(rentOf(s.downside)).toBeCloseTo(rentOf(s.base), 6);
  });

  it("delays the revenue ramp in the downside", () => {
    const s = buildScenarios(parsed());
    const firstRevenueMonth = (m: ReturnType<typeof buildModel>) =>
      m.pnl.revenue.findIndex((v) => v > 0);
    expect(firstRevenueMonth(s.downside)).toBe(firstRevenueMonth(s.base) + 3);
  });

  it("counts the drivers each scenario moves", () => {
    expect(driversMoved(SCENARIOS.base.adjustment)).toBe(0);
    // The validator requires a downside to move at least five drivers.
    expect(driversMoved(SCENARIOS.downside.adjustment)).toBeGreaterThanOrEqual(5);
  });
});

describe("sensitivity", () => {
  it("ranks drivers by their effect on the outcome", () => {
    const rows = sensitivity(parsed(), (m) => m.annual.at(-1)?.ebitda ?? 0);
    expect(rows.length).toBe(5);
    // Sorted by spread, descending.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.spread).toBeGreaterThanOrEqual(rows[i]!.spread);
    }
  });

  it("brackets the base case between the low and high runs", () => {
    const rows = sensitivity(parsed(), (m) => m.annual.at(-1)?.revenue ?? 0);
    const volume = rows.find((r) => r.driver === "volume")!;
    expect(volume.low).toBeLessThan(volume.base);
    expect(volume.high).toBeGreaterThan(volume.base);
  });

  it("shows revenue drivers mattering more than cost drivers for this plan", () => {
    const rows = sensitivity(parsed(), (m) => m.annual.at(-1)?.ebitda ?? 0);
    const topTwo = rows.slice(0, 2).map((r) => r.driver);
    expect(topTwo).toContain("volume");
  });
});
