import { describe, expect, it } from "vitest";
import {
  annualGrowthOf,
  ceilingAt,
  projectCurve,
  projectSeries,
  saturationAt,
} from "@/lib/finance/growth";
import type { GrowthCurve } from "@/lib/finance/growth";

/* ==========================================================================
   The curve that replaced unbounded compounding.
   --------------------------------------------------------------------------
   The regression these tests exist for is at the bottom: a user entered 50%
   monthly growth and the engine returned $4.3 trillion of year-five revenue.
   Everything above it is the behaviour that makes that impossible.
   ========================================================================== */

const START = 300;
const shop = {
  shape: "saturating",
  ceiling: 1400,
  monthlyRate: 0.08,
  terminalAnnualRate: 0.025,
} as const satisfies GrowthCurve;

describe("projectCurve — saturating", () => {
  it("starts where the author said it starts", () => {
    expect(projectCurve(shop, START, 0)).toBeCloseTo(START, 9);
  });

  it("grows the first month at exactly the rate the author typed", () => {
    // The number in the box has to be the number on the page. A curve that
    // silently delivers 6.2% when someone asked for 8% is the same class of
    // defect as the one this module replaced, just quieter.
    for (const monthlyRate of [0.02, 0.08, 0.15, 0.25]) {
      const curve = { ...shop, monthlyRate, terminalAnnualRate: 0 };
      const implied = projectCurve(curve, START, 1) / projectCurve(curve, START, 0) - 1;
      expect(implied, `${monthlyRate * 100}% a month`).toBeCloseTo(monthlyRate, 9);
    }
  });

  it("decelerates immediately after that first month", () => {
    const s = projectSeries({ ...shop, terminalAnnualRate: 0 }, START, 12);
    const first = s[1]! / s[0]! - 1;
    const second = s[2]! / s[1]! - 1;
    expect(second).toBeLessThan(first);
  });

  it("rises without ever turning back", () => {
    const s = projectSeries(shop, START, 60);
    for (let i = 1; i < s.length; i++) {
      expect(s[i]!, `month ${i + 1}`).toBeGreaterThanOrEqual(s[i - 1]!);
    }
  });

  it("never exceeds the capacity in force", () => {
    projectSeries(shop, START, 60).forEach((v, t) => {
      expect(v, `month ${t + 1}`).toBeLessThanOrEqual(ceilingAt(shop, t)!);
    });
  });

  it("decelerates every year — the property the old engine could not have", () => {
    const growth = annualGrowthOf(shop, START, 60).filter((g): g is number => g !== null);
    expect(growth.length).toBe(4);
    for (let i = 1; i < growth.length; i++) {
      expect(growth[i]!, `year ${i + 2} vs year ${i + 1}`).toBeLessThan(growth[i - 1]!);
    }
  });

  it("approaches the ceiling rather than stopping short of it", () => {
    const flatCeiling = { ...shop, terminalAnnualRate: 0 };
    const far = projectCurve(flatCeiling, START, 1200);
    expect(far).toBeGreaterThan(shop.ceiling * 0.999);
    expect(far).toBeLessThanOrEqual(shop.ceiling);
  });

  it("reports how much room is left", () => {
    expect(saturationAt(shop, START, 0)).toBeCloseTo(START / shop.ceiling, 9);
    expect(saturationAt(shop, START, 59)!).toBeGreaterThan(0.9);
    expect(saturationAt({ shape: "unbounded", monthlyRate: 0.05 }, START, 12)).toBeNull();
  });
});

describe("projectCurve — the other shapes", () => {
  it("holds flat", () => {
    const curve: GrowthCurve = { shape: "flat" };
    for (const t of [0, 1, 59]) expect(projectCurve(curve, 42, t), `month ${t}`).toBe(42);
    expect(ceilingAt(curve, 0)).toBeNull();
  });

  it("adds people a month, up to a maximum", () => {
    const curve: GrowthCurve = { shape: "linear", perMonth: 0.25, max: 8 };
    expect(projectCurve(curve, 5, 0)).toBe(5);
    expect(projectCurve(curve, 5, 4)).toBe(6);
    // The cap binds rather than being exceeded — a firm that says it will not
    // go past eight billable people does not go past eight.
    expect(projectCurve(curve, 5, 200)).toBe(8);
    expect(ceilingAt(curve, 0)).toBe(8);
  });

  it("is exactly the arithmetic it replaced when a stream declares no bound", () => {
    // Bit-identical, not merely close: this is what lets the curve be
    // introduced without moving a single existing number.
    for (const monthlyRate of [-0.02, 0, 0.012, 0.07]) {
      for (const t of [0, 1, 13, 59]) {
        const curve: GrowthCurve = { shape: "unbounded", monthlyRate };
        expect(projectCurve(curve, 420, t), `${monthlyRate} at month ${t}`).toBe(
          420 * Math.pow(1 + monthlyRate, t),
        );
      }
    }
  });
});

describe("projectCurve — the degenerate cases", () => {
  it("has nothing to grow from", () => {
    expect(projectCurve({ ...shop }, 0, 5)).toBe(0);
    expect(projectCurve({ ...shop, ceiling: 0 }, 100, 5)).toBe(0);
  });

  it("holds an already-full business at capacity", () => {
    const curve = { ...shop, ceiling: 100, terminalAnnualRate: 0 } as const;
    for (const t of [0, 1, 59]) expect(projectCurve(curve, 100, t), `month ${t}`).toBeCloseTo(100, 9);
  });

  it("declines geometrically rather than accelerating into a floor", () => {
    // Someone who says "I expect to lose 2% a month" means a steady decline.
    const curve = { ...shop, monthlyRate: -0.02 } as const;
    for (const t of [0, 1, 24, 59]) {
      expect(projectCurve(curve, 500, t), `month ${t}`).toBeCloseTo(
        500 * Math.pow(0.98, t),
        9,
      );
    }
  });

  it("reverts to capacity when trading above it", () => {
    // The pole case: a declining series against a ceiling below it is where a
    // naive logistic divides by zero and returns negative revenue.
    const curve = { ...shop, ceiling: 300, monthlyRate: 0.1, terminalAnnualRate: 0 } as const;
    const s = projectSeries(curve, 500, 120);
    expect(s[0]!).toBeCloseTo(500, 9);
    for (let i = 1; i < s.length; i++) expect(s[i]!, `month ${i + 1}`).toBeLessThan(s[i - 1]!);
    expect(s[119]!).toBeGreaterThan(300);
    expect(s[119]!).toBeLessThan(301);
  });

  it("saturates at once when asked to grow faster than there is room for", () => {
    const curve = { ...shop, ceiling: 115, monthlyRate: 0.25, terminalAnnualRate: 0 } as const;
    expect(projectCurve(curve, 100, 0)).toBeCloseTo(100, 9);
    for (const t of [1, 2, 24]) expect(projectCurve(curve, 100, t), `month ${t}`).toBeCloseTo(115, 9);
  });

  it("returns nothing for a horizon of nothing", () => {
    expect(projectSeries(shop, START, 0)).toEqual([]);
  });
});

describe("projectCurve — finite and non-negative for everything the schema admits", () => {
  /* The sweep exists because a NaN revenue does not fail loudly: the balance
     sheet tie becomes NaN, and `NaN >= 0.01` is false, so the engine's own
     property test would pass a model that produced NaN in every cell. */
  it("never returns NaN, Infinity or a negative volume", () => {
    const starts = [0, 1e-9, 1, 300, 1e6];
    const rates = [-1, -0.5, -0.02, 0, 0.01, 0.08, 0.25];
    const ceilings = [0.5, 1, 2, 1e9];
    const terminals = [-0.25, 0, 0.05, 0.5];

    for (const v0 of starts) {
      for (const monthlyRate of rates) {
        for (const multiple of ceilings) {
          for (const terminalAnnualRate of terminals) {
            const curve: GrowthCurve = {
              shape: "saturating",
              ceiling: Math.max(1e-9, v0 * multiple),
              monthlyRate,
              terminalAnnualRate,
            };
            for (let t = 0; t <= 120; t += 4) {
              const v = projectCurve(curve, v0, t);
              const where = `v0=${v0} rate=${monthlyRate} ceil=${multiple}x term=${terminalAnnualRate} t=${t}`;
              expect(Number.isFinite(v), where).toBe(true);
              expect(v, where).toBeGreaterThanOrEqual(0);
            }
          }
        }
      }
    }
  });

  it("survives the case that breaks a naive logistic", () => {
    // v0 above the ceiling with a negative rate is where the denominator
    // crosses zero in the textbook form, producing a singularity near t=46 and
    // negative revenue after it.
    const curve = { ...shop, ceiling: 300, monthlyRate: -0.02, terminalAnnualRate: 0 } as const;
    for (const t of [6, 12, 36, 46, 47, 120]) {
      const v = projectCurve(curve, 500, t);
      expect(Number.isFinite(v), `month ${t}`).toBe(true);
      expect(v, `month ${t}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("the regression this module exists for", () => {
  /* The reported plan: 50% monthly growth compounded across 60 months, which
     the old engine turned into $4,302,537,004,633 of year-five revenue — about
     fifteen per cent of US GDP. The fix is not a clamp on the rate. It is that
     the rate no longer decides the destination. */
  const yearTotal = (curve: GrowthCurve, y: number) =>
    projectSeries(curve, START, 60)
      .slice(y * 12, (y + 1) * 12)
      .reduce((s, v) => s + v, 0);

  it("makes an optimistic rate harmless", () => {
    const absurd = { ...shop, monthlyRate: 0.25 } as const;
    expect(yearTotal(absurd, 4) / yearTotal(absurd, 0)).toBeLessThan(3);

    let ceilingYear = 0;
    for (let t = 48; t < 60; t++) ceilingYear += ceilingAt(absurd, t)!;
    expect(yearTotal(absurd, 4)).toBeLessThanOrEqual(ceilingYear);
  });

  it("puts the destination in the ceiling, not the rate", () => {
    const modest = yearTotal({ ...shop, monthlyRate: 0.05 }, 4);
    const bullish = yearTotal({ ...shop, monthlyRate: 0.15 }, 4);
    const absurd = yearTotal({ ...shop, monthlyRate: 0.25 }, 4);

    // Five times the growth rate moves year five by a couple of per cent,
    // because the ceiling is doing the work.
    expect(absurd / bullish).toBeLessThan(1.05);
    expect(bullish).toBeGreaterThan(modest);
  });
});
