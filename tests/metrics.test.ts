import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { saasPlan, restaurantPlan } from "./fixtures";

describe("computeMetrics — break-even", () => {
  it("finds the first EBITDA-positive month", () => {
    const m = buildModel(saasPlan);
    const k = computeMetrics(m);
    expect(k.breakEven.profitMonth).not.toBeNull();
    const month = k.breakEven.profitMonth!;
    expect(m.pnl.ebitda[month - 1]!).toBeGreaterThan(0);
    // And it really is the first.
    for (let i = 0; i < month - 1; i++) expect(m.pnl.ebitda[i]!).toBeLessThanOrEqual(0);
  });

  it("computes break-even revenue as fixed costs over contribution margin", () => {
    const m = buildModel(saasPlan);
    const k = computeMetrics(m);
    const expected = k.breakEven.averageMonthlyFixedCosts / k.breakEven.contributionMarginRatio;
    expect(k.breakEven.monthlyRevenueRequired).toBeCloseTo(expected, 6);
  });

  /* This used to be `Infinity`, and `Infinity > 0` is `true` — so the rubric
     check named "Break-even is computed, not asserted" passed on exactly the
     plans where break-even does not exist. It also reached the facts block,
     the only figures a generator is allowed to use, where it would render as
     a price. */
  it("reports no break-even when every sale loses money", () => {
    const k = computeMetrics(
      buildModel({
        company: { name: "Below cost", startDate: "2026-01-01", horizonMonths: 36, industryKey: "other" },
        revenueStreams: [
          { id: "u", name: "Units", kind: "unit-sales", unitsMonth1: 100, monthlyGrowthRate: 0,
            pricePerUnit: 10, costPerUnit: 14 },
        ],
        opex: [{ id: "r", name: "Rent", category: "rent", monthlyAmount: 5_000 }],
      }),
    );
    expect(k.breakEven.contributionMarginRatio).toBeLessThan(0);
    expect(k.breakEven.monthlyRevenueRequired).toBeNull();
  });

  it("never reports a non-finite break-even, whatever the margin", () => {
    for (const costPerUnit of [0, 10, 14, 1_000]) {
      const k = computeMetrics(
        buildModel({
          company: { name: "Margins", startDate: "2026-01-01", horizonMonths: 36, industryKey: "other" },
          revenueStreams: [
            { id: "u", name: "Units", kind: "unit-sales", unitsMonth1: 100, monthlyGrowthRate: 0,
              pricePerUnit: 10, costPerUnit },
          ],
          opex: [{ id: "r", name: "Rent", category: "rent", monthlyAmount: 5_000 }],
        }),
      );
      const value = k.breakEven.monthlyRevenueRequired;
      expect(value === null || Number.isFinite(value), `costPerUnit=${costPerUnit}`).toBe(true);
    }
  });

  it("reports a contribution margin consistent with the modelled COGS", () => {
    const m = buildModel(saasPlan);
    const k = computeMetrics(m);
    // The SaaS fixture sets a 22% COGS on the only stream, plus direct labour
    // from month 10, so the blended margin sits a little below 78%.
    expect(k.breakEven.contributionMarginRatio).toBeGreaterThan(0.6);
    expect(k.breakEven.contributionMarginRatio).toBeLessThan(0.78);
  });
});

describe("computeMetrics — unit economics", () => {
  it("derives LTV from ARPU, margin and churn", () => {
    const m = buildModel(saasPlan);
    const k = computeMetrics(m);
    const { averageRevenuePerCustomerPerMonth: arpu, grossMargin, monthlyChurnRate: churn } = k.unitEconomics;
    expect(arpu).toBe(149);
    expect(churn).toBeCloseTo(0.02);
    expect(k.unitEconomics.lifetimeValue).toBeCloseTo((arpu! * grossMargin) / churn!, 6);
  });

  it("computes LTV:CAC and payback against the supplied CAC", () => {
    const k = computeMetrics(buildModel(saasPlan));
    expect(k.unitEconomics.customerAcquisitionCost).toBe(640);
    expect(k.unitEconomics.ltvToCac).toBeCloseTo(k.unitEconomics.lifetimeValue! / 640, 6);
    expect(k.unitEconomics.paybackMonths).toBeCloseTo(640 / (149 * k.unitEconomics.grossMargin), 6);
  });

  it("leaves LTV null when there is no subscription stream", () => {
    const k = computeMetrics(buildModel(restaurantPlan));
    expect(k.unitEconomics.lifetimeValue).toBeNull();
    expect(k.unitEconomics.ltvToCac).toBeNull();
  });
});

describe("computeMetrics — underwriter ratios", () => {
  it("computes DSCR as cash available over scheduled debt service", () => {
    const m = buildModel(saasPlan);
    const k = computeMetrics(m);
    for (const row of k.underwriter.dscrByYear) {
      const year = m.annual.find((y) => y.year === row.year)!;
      expect(row.cashAvailable).toBeCloseTo(year.ebitda - year.tax, 6);
      if (year.debtService > 0) {
        expect(row.dscr).toBeCloseTo((year.ebitda - year.tax) / year.debtService, 6);
      }
    }
  });

  it("matches a hand-computed DSCR", () => {
    // A deliberately simple model: flat revenue, one cost, one fully amortising
    // loan. Coverage can be worked out by hand and must agree.
    const m = buildModel({
      company: { name: "Hand check", startDate: "2026-01-01", horizonMonths: 36, industryKey: "other" },
      revenueStreams: [
        { id: "s", name: "Sales", kind: "unit-sales", unitsMonth1: 1000, monthlyGrowthRate: 0,
          pricePerUnit: 100, costPerUnit: 40 },
      ],
      roles: [{ id: "o", title: "Owner", annualSalary: 120_000, isOwner: true, startMonth: 1 }],
      opex: [{ id: "r", name: "Rent", category: "rent", monthlyAmount: 10_000 }],
      loans: [{ id: "l", name: "Loan", month: 1, principal: 300_000, annualRate: 0.09, termMonths: 36 }],
      tax: { corporateRate: 0, lossCarryforward: false },
    });
    const k = computeMetrics(m);
    const y1 = m.annual[0]!;

    // Revenue 1,000 × $100 × 12 = 1,200,000; COGS 40% = 480,000 → GP 720,000.
    expect(y1.revenue).toBeCloseTo(1_200_000, 4);
    expect(y1.grossProfit).toBeCloseTo(720_000, 4);
    // Opex: rent 120,000 + loaded owner salary 120,000 × 1.1965 = 143,580.
    expect(y1.totalOpex).toBeCloseTo(120_000 + 120_000 * 1.1965, 2);
    // Tax is off, so cash available for debt service is EBITDA exactly.
    expect(k.underwriter.dscrByYear[0]!.cashAvailable).toBeCloseTo(y1.ebitda, 6);
    expect(k.underwriter.dscrByYear[0]!.dscr).toBeCloseTo(y1.ebitda / y1.debtService, 6);
    // And that coverage is comfortable.
    expect(k.underwriter.minimumDscr).toBeGreaterThan(1.25);
  });

  it("reports owner compensation for every year", () => {
    const k = computeMetrics(buildModel(saasPlan));
    expect(k.underwriter.ownerCompensationByYear).toHaveLength(5);
    for (const row of k.underwriter.ownerCompensationByYear) {
      expect(row.amount).toBeGreaterThan(0);
    }
  });

  it("leaves DSCR null for a debt-free model", () => {
    const k = computeMetrics(
      buildModel({
        company: { name: "No debt", startDate: "2026-01-01", horizonMonths: 36, industryKey: "other" },
        revenueStreams: [
          { id: "s", name: "S", kind: "unit-sales", unitsMonth1: 100, pricePerUnit: 50, costPerUnit: 10 },
        ],
        roles: [{ id: "o", title: "Owner", annualSalary: 60_000, isOwner: true, startMonth: 1 }],
      }),
    );
    expect(k.underwriter.minimumDscr).toBeNull();
  });

  /* ---- Which year coverage is read from -------------------------------
     `dscrFirstFullYear` used to be `Math.floor(io / 12) + 1`, measured from
     month one against the largest interest-only period of any facility. That
     is off by one whenever the period is an exact multiple of twelve —
     including zero, the intake default — so the great majority of plans had
     their *second* year's coverage reported as their first full year.
     Coverage improves with time, so the error only ever flattered. Nothing
     asserted which year was chosen, which is how it survived. */
  const coverageModel = (loans: {
    id: string; name: string; month: number; principal: number;
    annualRate: number; termMonths: number; interestOnlyMonths?: number;
  }[]) =>
    buildModel({
      company: { name: "Coverage", startDate: "2026-01-01", horizonMonths: 60, industryKey: "other" },
      revenueStreams: [
        // Ramping, because that is the case the bug bit: coverage improves
        // with time, so reading the wrong year is never neutral.
        { id: "s", name: "Sales", kind: "unit-sales", unitsMonth1: 1000, monthlyGrowthRate: 0.02,
          pricePerUnit: 100, costPerUnit: 40 },
      ],
      roles: [{ id: "o", title: "Owner", annualSalary: 120_000, isOwner: true, startMonth: 1 }],
      opex: [{ id: "r", name: "Rent", category: "rent", monthlyAmount: 10_000 }],
      loans,
      tax: { corporateRate: 0, lossCarryforward: false },
    });

  const facility = (interestOnlyMonths: number, month = 1) => ({
    id: `l${month}-${interestOnlyMonths}`, name: "Loan", month,
    principal: 300_000, annualRate: 0.09, termMonths: 120, interestOnlyMonths,
  });

  it.each([
    [0, 1],
    [6, 2],
    [12, 2],
    [18, 3],
    [24, 3],
  ])("reads coverage from the first fully amortising year (io=%i → year %i)", (io, year) => {
    const k = computeMetrics(coverageModel([facility(io)]));
    expect(k.underwriter.dscrFirstFullYearYear).toBe(year);
    expect(k.underwriter.dscrFirstFullYear).toBeCloseTo(
      k.underwriter.dscrByYear[year - 1]!.dscr!,
      9,
    );
  });

  it.each([0, 6, 12, 18, 24])(
    "never reports a year that still carries an interest-only month (io=%i)",
    (io) => {
      const loan = facility(io);
      const k = computeMetrics(coverageModel([loan]));
      const year = k.underwriter.dscrFirstFullYearYear!;
      const lastInterestOnly = loan.month + io - 1;
      expect((year - 1) * 12 + 1).toBeGreaterThan(lastInterestOnly);
    },
  );

  it("measures each facility's interest-only window from its own draw month", () => {
    // Drawn in month 13 with six interest-only months, so months 13–18 are
    // interest-only and year three is the first clear of them. Taking the max
    // of the bare `interestOnlyMonths` from month one could never see this.
    const k = computeMetrics(coverageModel([facility(0), facility(6, 13)]));
    expect(k.underwriter.dscrFirstFullYearYear).toBe(3);
  });

  it("reports the earlier, weaker year when there is no interest-only period", () => {
    // The regression, stated as the ordering rather than a magic constant:
    // year one is the honest answer and it is the less flattering one.
    const k = computeMetrics(coverageModel([facility(0)]));
    const [y1, y2] = k.underwriter.dscrByYear;
    expect(k.underwriter.dscrFirstFullYearYear).toBe(1);
    expect(k.underwriter.dscrFirstFullYear).toBeCloseTo(y1!.dscr!, 9);
    expect(y1!.dscr!).toBeLessThan(y2!.dscr!);
  });

  it("falls back to year one when the only debt is on the opening balance sheet", () => {
    const k = computeMetrics(coverageModel([]));
    expect(k.underwriter.dscrFirstFullYearYear).toBe(1);
  });
});

describe("computeMetrics — cash", () => {
  it("identifies the lowest cash point", () => {
    const m = buildModel(saasPlan);
    const k = computeMetrics(m);
    const min = Math.min(...m.cashFlow.closingCash);
    expect(k.cash.lowestCash).toBeCloseTo(min, 6);
    expect(m.cashFlow.closingCash[k.cash.lowestCashMonth - 1]).toBeCloseTo(min, 6);
  });

  it("reports the peak funding need only when cash goes negative", () => {
    const k = computeMetrics(buildModel(saasPlan));
    if (k.cash.cashOutMonth === null) {
      expect(k.cash.peakFundingNeed).toBe(0);
    } else {
      expect(k.cash.peakFundingNeed).toBeGreaterThan(0);
    }
  });
});
