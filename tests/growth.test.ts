import { describe, expect, it } from "vitest";
import { annualGrowthOf, monthsToShareOfCeiling, projectVolume } from "@/lib/finance/growth";
import type { GrowthCurve } from "@/lib/finance/growth";

/* ==========================================================================
   The curve that replaced unbounded compounding.
   --------------------------------------------------------------------------
   The regression these tests exist for is at the bottom: a user entered 50%
   monthly growth and the engine returned $4.3 trillion of year-five revenue.
   Everything above it is the behaviour that makes that impossible.
   ========================================================================== */

const shop: GrowthCurve = {
  start: 300,
  ceiling: 1400,
  monthlyRate: 0.08,
  terminalAnnualRate: 0.025,
};

describe("projectVolume", () => {
  it("starts where the author said it starts", () => {
    expect(projectVolume(shop, 60)[0]).toBeCloseTo(shop.start, 6);
  });

  it("grows the first month at exactly the rate the author typed", () => {
    // The number in the box has to be the number on the page. A curve that
    // silently delivers 6.2% when someone asked for 8% is the same class of
    // defect as the one this module replaced, just quieter.
    for (const monthlyRate of [0.02, 0.08, 0.15]) {
      const series = projectVolume({ ...shop, monthlyRate, terminalAnnualRate: 0 }, 12);
      const implied = (series[1]! - series[0]!) / series[0]!;
      expect(implied, `${monthlyRate * 100}% a month`).toBeCloseTo(monthlyRate, 9);
    }
  });

  it("decelerates immediately after that first month", () => {
    const series = projectVolume({ ...shop, terminalAnnualRate: 0 }, 12);
    const monthOne = (series[1]! - series[0]!) / series[0]!;
    const monthTwo = (series[2]! - series[1]!) / series[1]!;
    expect(monthTwo).toBeLessThan(monthOne);
  });

  it("saturates at once when asked to grow faster than there is room for", () => {
    // 60% a month into 15% of headroom. The honest answer is that capacity
    // arrives immediately, not that the business invents room it does not have.
    const series = projectVolume(
      { start: 100, ceiling: 115, monthlyRate: 0.6, terminalAnnualRate: 0 },
      6,
    );
    expect(series[0]!).toBeCloseTo(100, 6);
    series.slice(1).forEach((v, i) => expect(v, `month ${i + 2}`).toBeCloseTo(115, 6));
  });

  it("rises without ever turning back", () => {
    const series = projectVolume(shop, 60);
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!, `month ${i + 1}`).toBeGreaterThanOrEqual(series[i - 1]!);
    }
  });

  it("never exceeds the ceiling, beyond the terminal drift the ceiling itself has", () => {
    const series = projectVolume(shop, 60);
    series.forEach((value, t) => {
      const driftedCeiling = shop.ceiling * Math.pow(1 + shop.terminalAnnualRate, t / 12);
      expect(value, `month ${t + 1}`).toBeLessThanOrEqual(driftedCeiling);
    });
  });

  it("decelerates every year — the property the old engine could not have", () => {
    const growth = annualGrowthOf(shop, 60).filter((g): g is number => g !== null);
    expect(growth.length).toBe(4);
    for (let i = 1; i < growth.length; i++) {
      expect(growth[i]!, `year ${i + 2} vs year ${i + 1}`).toBeLessThan(growth[i - 1]!);
    }
  });

  it("approaches the ceiling rather than stopping short of it", () => {
    const series = projectVolume({ ...shop, terminalAnnualRate: 0 }, 120);
    expect(series[119]!).toBeGreaterThan(shop.ceiling * 0.99);
    expect(series[119]!).toBeLessThanOrEqual(shop.ceiling);
  });

  it("says when capacity is reached", () => {
    const month = monthsToShareOfCeiling(shop, 60);
    expect(month).not.toBeNull();
    expect(month!).toBeGreaterThan(1);
    expect(month!).toBeLessThanOrEqual(60);
    // A business that never gets close reports honestly rather than guessing.
    expect(monthsToShareOfCeiling({ ...shop, monthlyRate: 0.001 }, 60)).toBeNull();
  });
});

describe("projectVolume — the degenerate cases", () => {
  const cases: [string, GrowthCurve, (series: number[]) => void][] = [
    [
      "nothing to grow from",
      { start: 0, ceiling: 1000, monthlyRate: 0.1, terminalAnnualRate: 0 },
      (s) => expect(s.every((v) => v === 0)).toBe(true),
    ],
    [
      "no ceiling worth the name",
      { start: 100, ceiling: 0, monthlyRate: 0.1, terminalAnnualRate: 0 },
      (s) => expect(s.every((v) => v === 0)).toBe(true),
    ],
    [
      "already at capacity",
      { start: 100, ceiling: 100, monthlyRate: 0.1, terminalAnnualRate: 0 },
      (s) => s.forEach((v, i) => expect(v, `month ${i + 1}`).toBeCloseTo(100, 6)),
    ],
    [
      "no growth claimed",
      { start: 100, ceiling: 1000, monthlyRate: 0, terminalAnnualRate: 0 },
      (s) => s.forEach((v, i) => expect(v, `month ${i + 1}`).toBeCloseTo(100, 6)),
    ],
    [
      "a declining business",
      { start: 100, ceiling: 1000, monthlyRate: -0.05, terminalAnnualRate: 0 },
      (s) => {
        for (let i = 1; i < s.length; i++) expect(s[i]!, `month ${i + 1}`).toBeLessThan(s[i - 1]!);
        expect(s[s.length - 1]!).toBeGreaterThanOrEqual(0);
      },
    ],
    [
      "trading above sustainable capacity",
      { start: 500, ceiling: 100, monthlyRate: 0.1, terminalAnnualRate: 0 },
      (s) => {
        // Reverts down toward the ceiling rather than away from it.
        expect(s[0]!).toBeCloseTo(500, 6);
        for (let i = 1; i < s.length; i++) expect(s[i]!, `month ${i + 1}`).toBeLessThan(s[i - 1]!);
        expect(s[s.length - 1]!).toBeGreaterThan(99);
      },
    ],
  ];

  it.each(cases)("%s", (_label, curve, assert) => {
    const series = projectVolume(curve, 24);
    expect(series.length).toBe(24);
    series.forEach((v, i) => expect(Number.isFinite(v), `month ${i + 1}`).toBe(true));
    assert(series);
  });

  it("returns nothing for a horizon of nothing", () => {
    expect(projectVolume(shop, 0)).toEqual([]);
  });

  it("produces finite numbers for a rate at the floor", () => {
    // -100% a month is the schema floor. It must not produce a log of zero.
    const series = projectVolume({ ...shop, monthlyRate: -1 }, 12);
    series.forEach((v, i) => expect(Number.isFinite(v), `month ${i + 1}`).toBe(true));
  });
});

describe("the regression this module exists for", () => {
  /* The reported plan: 50% monthly growth, compounded across 60 months, which
     the old engine turned into $4,302,537,004,633 of year-five revenue — about
     fifteen per cent of US GDP. The fix is not a clamp on the rate. It is that
     the rate can no longer decide the destination. */
  const absurdRate: GrowthCurve = { ...shop, monthlyRate: 0.5 };

  it("makes an optimistic rate harmless", () => {
    const series = projectVolume(absurdRate, 60);
    const yearOne = series.slice(0, 12).reduce((s, v) => s + v, 0);
    const yearFive = series.slice(48, 60).reduce((s, v) => s + v, 0);

    // Year five is a small multiple of year one, not a trillion-fold one.
    expect(yearFive / yearOne).toBeLessThan(3);
    // And it lands where the ceiling says, not where the rate says. The bound
    // is the drifted ceiling summed month by month, because the ceiling itself
    // moves within the year.
    let ceilingYear = 0;
    for (let t = 48; t < 60; t++) {
      ceilingYear += shop.ceiling * Math.pow(1 + shop.terminalAnnualRate, t / 12);
    }
    expect(yearFive).toBeLessThanOrEqual(ceilingYear);
  });

  it("puts the destination in the ceiling, not the rate", () => {
    const fifth = (rate: number) =>
      projectVolume({ ...shop, monthlyRate: rate }, 60)
        .slice(48, 60)
        .reduce((s, v) => s + v, 0);

    const modest = fifth(0.05);
    const bullish = fifth(0.15);
    const absurd = fifth(0.5);

    // Ten times the growth rate moves year five by a few per cent, because the
    // ceiling is doing the work.
    expect(absurd / bullish).toBeLessThan(1.05);
    expect(bullish).toBeGreaterThan(modest);
  });
});
