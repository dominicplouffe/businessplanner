import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/finance/engine";
import { AssumptionsSchema, type AssumptionsInput } from "@/lib/finance/types";
import { restaurantPlan, saasPlan } from "./fixtures";

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

describe("buildModel — statement integrity", () => {
  it("ties the balance sheet in every period (SaaS)", () => {
    const m = buildModel(saasPlan);
    expect(m.checks.balanceSheetTie.passes).toBe(true);
    for (let i = 0; i < m.horizonMonths; i++) {
      expect(Math.abs(m.balanceSheet.tie[i] ?? 0)).toBeLessThan(0.01);
    }
  });

  it("ties the balance sheet in every period (restaurant, with inventory)", () => {
    const m = buildModel(restaurantPlan);
    expect(m.checks.balanceSheetTie.passes).toBe(true);
    for (let i = 0; i < m.horizonMonths; i++) {
      expect(Math.abs(m.balanceSheet.tie[i] ?? 0)).toBeLessThan(0.01);
    }
  });

  it("reconciles closing cash to the sum of net changes plus opening cash", () => {
    const m = buildModel(saasPlan);
    const opening = m.assumptions.opening.cash;
    const expected = opening + sum(m.cashFlow.netChange);
    expect(m.cashFlow.closingCash.at(-1)).toBeCloseTo(expected, 4);
  });

  it("derives gross profit and EBITDA consistently from their components", () => {
    const m = buildModel(saasPlan);
    for (let i = 0; i < m.horizonMonths; i++) {
      const gp = (m.pnl.revenue[i] ?? 0) - (m.pnl.cogs[i] ?? 0);
      expect(m.pnl.grossProfit[i] ?? 0).toBeCloseTo(gp, 6);
      expect(m.pnl.ebitda[i] ?? 0).toBeCloseTo(gp - (m.pnl.totalOpex[i] ?? 0), 6);
    }
  });

  it("carries net income into retained earnings", () => {
    const m = buildModel(saasPlan);
    const opening = m.assumptions.opening.retainedEarnings;
    expect(m.balanceSheet.retainedEarnings.at(-1)).toBeCloseTo(opening + sum(m.pnl.netIncome), 4);
  });

  it("rolls net PP&E forward as capex less accumulated depreciation", () => {
    const m = buildModel(saasPlan);
    const totalCapex = sum(m.cashFlow.capex);
    const totalDep = sum(m.pnl.depreciation);
    expect(m.balanceSheet.netPPE.at(-1)).toBeCloseTo(totalCapex - totalDep, 4);
  });

  it("produces annual rollups that sum the monthly lines", () => {
    const m = buildModel(saasPlan);
    expect(sum(m.annual.map((y) => y.revenue))).toBeCloseTo(sum(m.pnl.revenue), 4);
    expect(sum(m.annual.map((y) => y.netIncome))).toBeCloseTo(sum(m.pnl.netIncome), 4);
  });

  it("charges no tax while cumulative income is negative", () => {
    const m = buildModel(saasPlan);
    const firstProfitable = m.pnl.pretaxIncome.findIndex((v) => v > 0);
    expect(firstProfitable).toBeGreaterThan(0);
    for (let i = 0; i < firstProfitable; i++) expect(m.pnl.tax[i] ?? 0).toBe(0);
  });

  it("respects a revenue stream's start month", () => {
    const m = buildModel(restaurantPlan);
    // Trading starts in month 4, so the first three months bill nothing.
    for (let i = 0; i < 3; i++) expect(m.pnl.revenue[i] ?? 0).toBe(0);
    expect(m.pnl.revenue[3] ?? 0).toBeGreaterThan(0);
  });

  it("applies seasonality without changing the annual total materially", () => {
    const seasonal = buildModel(restaurantPlan);
    const flat = buildModel({
      ...restaurantPlan,
      revenueStreams: [{ ...restaurantPlan.revenueStreams![0]!, seasonality: undefined } as never],
    });
    // The seasonality factors average ~1, so a full year differs by only a few percent.
    const sYear2 = seasonal.annual[1]?.revenue ?? 0;
    const fYear2 = flat.annual[1]?.revenue ?? 0;
    expect(Math.abs(sYear2 - fYear2) / fYear2).toBeLessThan(0.05);
  });
});

describe("buildModel — randomised property test", () => {
  // A deterministic PRNG: a failing case must be reproducible.
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("keeps assets equal to liabilities plus equity across 200 random models", () => {
    const rnd = mulberry32(20260919);
    const kinds = ["subscription", "unit-sales", "hourly-services", "retail-footfall", "marketplace", "contract", "advertising"] as const;

    for (let trial = 0; trial < 200; trial++) {
      const kind = kinds[Math.floor(rnd() * kinds.length)]!;
      const common = {
        id: "s",
        name: "Stream",
        startMonth: 1 + Math.floor(rnd() * 6),
        cogsPercent: rnd() * 0.6,
      };

      let stream: Record<string, unknown>;
      switch (kind) {
        case "subscription":
          stream = { ...common, kind, initialCustomers: rnd() * 50, newCustomersMonth1: rnd() * 40,
            newCustomerGrowthRate: rnd() * 0.1 - 0.02, monthlyChurnRate: rnd() * 0.08,
            pricePerCustomerPerMonth: 10 + rnd() * 300, expansionRate: rnd() * 0.01,
            prepaidMonths: Math.floor(rnd() * 13) }; break;
        case "unit-sales":
          stream = { ...common, kind, unitsMonth1: rnd() * 800, monthlyGrowthRate: rnd() * 0.12 - 0.03,
            pricePerUnit: 5 + rnd() * 200, costPerUnit: rnd() * 60 }; break;
        case "hourly-services":
          stream = { ...common, kind, billableHeadcount: 1 + rnd() * 20, hoursPerHeadPerMonth: 120 + rnd() * 60,
            utilisation: 0.4 + rnd() * 0.5, hourlyRate: 50 + rnd() * 250,
            headcountGrowthPerMonth: rnd() * 0.5 }; break;
        case "retail-footfall":
          stream = { ...common, kind, dailyTraffic: rnd() * 500, conversionRate: rnd(),
            averageTicket: 5 + rnd() * 90, openDaysPerMonth: 20 + rnd() * 10,
            monthlyGrowthRate: rnd() * 0.05 }; break;
        case "marketplace":
          stream = { ...common, kind, gmvMonth1: rnd() * 400_000, monthlyGrowthRate: rnd() * 0.1,
            takeRate: rnd() * 0.3 }; break;
        case "contract":
          stream = { ...common, kind, initialContracts: rnd() * 20, newContractsPerMonth: rnd() * 8,
            monthlyValuePerContract: 200 + rnd() * 8000, termMonths: 3 + Math.floor(rnd() * 33) }; break;
        case "advertising":
          stream = { ...common, kind, impressionsMonth1: rnd() * 5_000_000, monthlyGrowthRate: rnd() * 0.1,
            fillRate: 0.3 + rnd() * 0.7, cpm: 1 + rnd() * 40 }; break;
      }

      const model = buildModel({
        company: {
          name: `Trial ${trial}`,
          startDate: "2026-01-01",
          horizonMonths: rnd() > 0.5 ? 60 : 36,
          industryKey: "other",
        },
        revenueStreams: [stream as never],
        roles: [
          { id: "o", title: "Owner", annualSalary: 40_000 + rnd() * 120_000, isOwner: true, startMonth: 1 },
          { id: "s", title: "Staff", annualSalary: 30_000 + rnd() * 90_000,
            count: 1 + Math.floor(rnd() * 5), startMonth: 1 + Math.floor(rnd() * 12),
            isDirectLabour: rnd() > 0.6 },
        ],
        opex: [
          { id: "r", name: "Rent", category: "rent", monthlyAmount: rnd() * 20_000, annualGrowthRate: rnd() * 0.06 },
          { id: "m", name: "Marketing", category: "marketing", percentOfRevenue: rnd() * 0.25 },
        ],
        capex: rnd() > 0.4
          ? [{ id: "c", name: "Equipment", month: 1 + Math.floor(rnd() * 12), amount: rnd() * 500_000,
              usefulLifeYears: 3 + rnd() * 12, method: rnd() > 0.5 ? "declining-balance" : "straight-line",
              salvageValue: rnd() * 20_000 }]
          : [],
        loans: rnd() > 0.4
          ? [{ id: "l", name: "Loan", month: 1, principal: rnd() * 700_000, annualRate: rnd() * 0.18,
              termMonths: 12 + Math.floor(rnd() * 240), interestOnlyMonths: Math.floor(rnd() * 13),
              balloonPayment: rnd() > 0.8 ? rnd() * 100_000 : 0 }]
          : [],
        equityRounds: [{ id: "e", name: "Equity", month: 1, amount: rnd() * 2_000_000 }],
        grants: rnd() > 0.85 ? [{ id: "g", name: "Grant", month: 6, amount: rnd() * 150_000 }] : [],
        workingCapital: {
          receivableDays: rnd() * 90,
          payableDays: rnd() * 60,
          inventoryDays: rnd() * 60,
        },
        tax: { corporateRate: rnd() * 0.35, lossCarryforward: rnd() > 0.3 },
      });

      const worst = model.checks.balanceSheetTie.worstAbsolute;
      if (worst >= 0.01) {
        throw new Error(
          `Trial ${trial} (${kind}) broke the balance sheet by ${worst} at month ${model.checks.balanceSheetTie.worstMonth}`,
        );
      }
    }
  });
});

describe("AssumptionsSchema", () => {
  it("rejects a model with no company name", () => {
    expect(() => AssumptionsSchema.parse({ company: { startDate: "2026-01-01", industryKey: "saas" } })).toThrow();
  });

  it("applies documented defaults", () => {
    const a = AssumptionsSchema.parse({
      company: { name: "X", startDate: "2026-01-01", industryKey: "saas" },
    });
    expect(a.company.horizonMonths).toBe(60);
    expect(a.company.currency).toBe("USD");
    expect(a.payroll.payrollTaxRate).toBeCloseTo(0.0765);
    expect(a.tax.corporateRate).toBeCloseTo(0.21);
  });
});

/* ==========================================================================
   Payroll that follows the business.
   --------------------------------------------------------------------------
   The reported plan grew revenue to $4.3 trillion while salaries stayed at
   $11,965 in every month of every year. Two separate causes: the loaded cost
   was computed once per role and written unchanged into every month, and
   nothing related headcount to how much work there was.
   ========================================================================== */
describe("buildModel — payroll follows the business", () => {
  /** One role, one flat stream, so payroll is the only thing moving. */
  const withRoles = (roles: AssumptionsInput["roles"], extra: Partial<AssumptionsInput> = {}) =>
    buildModel({
      company: { name: "Staffing", startDate: "2026-01-01", industryKey: "other", horizonMonths: 60 },
      revenueStreams: [
        {
          id: "units", name: "Units", kind: "unit-sales",
          unitsMonth1: 1000, pricePerUnit: 100, costPerUnit: 40,
          growth: { shape: "flat" },
        },
      ],
      roles,
      registry: { "roles.0.annualSalary": { provenance: "known" } },
      ...extra,
    } as AssumptionsInput);

  it("pays a raise rather than the same salary for five years", () => {
    const model = withRoles(
      [{ id: "owner", title: "Owner", annualSalary: 120_000, isOwner: true, annualRaiseRate: 0.03 }],
      {},
    );
    const owner = model.pnl.ownerCompensation ?? [];
    const first = owner[0]!;
    // Indexed from the role's own start, so the first twelve months sit at the
    // salary that was offered and year two is the first raise.
    expect(owner[11]! / first).toBeCloseTo(1, 6);
    expect(owner[12]! / first).toBeCloseTo(1.03, 6);
    expect(owner[59]! / first).toBeCloseTo(Math.pow(1.03, 4), 6);
  });

  it("falls back to the company-wide raise when a role states none", () => {
    const model = withRoles([{ id: "owner", title: "Owner", annualSalary: 120_000, isOwner: true }], {
      payroll: { payrollTaxRate: 0.0765, benefitsRate: 0.12, annualSalaryInflation: 0.02 },
    });
    const owner = model.pnl.ownerCompensation ?? [];
    expect(owner[12]! / owner[0]!).toBeCloseTo(1.02, 6);
  });

  it("hires as the work arrives, in whole people", () => {
    // 1000 units a month at 400 units a head is 2.5 heads, so three people.
    const model = withRoles([
      { id: "owner", title: "Owner", annualSalary: 90_000, isOwner: true },
      {
        id: "crew", title: "Crew", annualSalary: 48_000, isDirectLabour: true,
        staffing: { driver: "stream-volume", streamId: "units", perHead: 400 },
      },
    ]);
    expect(model.headcount.directLabour[0]).toBe(3);
    expect(model.headcount.total[0]).toBe(4);
    expect(model.headcount.owner[0]).toBe(1);
  });

  it("never hires past the maximum the plan states", () => {
    const model = withRoles([
      { id: "owner", title: "Owner", annualSalary: 90_000, isOwner: true },
      {
        id: "crew", title: "Crew", annualSalary: 48_000,
        staffing: { driver: "stream-volume", streamId: "units", perHead: 100, maxCount: 4 },
      },
    ]);
    for (let i = 0; i < 60; i++) {
      expect(model.headcount.total[i]! - model.headcount.owner[i]!, `month ${i + 1}`).toBeLessThanOrEqual(4);
    }
  });

  it("lands the hire with the work rather than ahead of it", () => {
    const ramping = (hireLagMonths: number) =>
      buildModel({
        company: { name: "Lag", startDate: "2026-01-01", industryKey: "other", horizonMonths: 36 },
        revenueStreams: [
          {
            id: "units", name: "Units", kind: "unit-sales",
            unitsMonth1: 100, pricePerUnit: 10,
            growth: { shape: "saturating", monthlyRate: 0.2, ceiling: 1000, terminalAnnualRate: 0 },
          },
        ],
        roles: [
          { id: "owner", title: "Owner", annualSalary: 60_000, isOwner: true },
          {
            id: "crew", title: "Crew", annualSalary: 40_000,
            staffing: { driver: "stream-volume", streamId: "units", perHead: 150, hireLagMonths },
          },
        ],
        registry: { "roles.0.annualSalary": { provenance: "known" } },
      } as AssumptionsInput);

    const prompt = ramping(0).headcount.total;
    const lagged = ramping(3).headcount.total;
    // The lagged plan is never ahead of the prompt one, and is behind it
    // somewhere — the whole point of the field.
    let everBehind = false;
    for (let i = 0; i < 36; i++) {
      expect(lagged[i]!, `month ${i + 1}`).toBeLessThanOrEqual(prompt[i]!);
      if (lagged[i]! < prompt[i]!) everBehind = true;
    }
    expect(everBehind).toBe(true);
  });

  it("does not hire and fire the same person every winter", () => {
    // Seasonality swings volume hard. Without the ratchet the crew would be
    // dismissed every February and rehired every June, which no plan means.
    const model = withRoles(
      [
        { id: "owner", title: "Owner", annualSalary: 60_000, isOwner: true },
        {
          id: "crew", title: "Crew", annualSalary: 40_000,
          staffing: { driver: "stream-volume", streamId: "units", perHead: 300 },
        },
      ],
      {
        revenueStreams: [
          {
            id: "units", name: "Units", kind: "unit-sales",
            unitsMonth1: 1000, pricePerUnit: 100,
            growth: { shape: "flat" },
            seasonality: [0.4, 0.4, 0.7, 1.0, 1.3, 1.6, 1.6, 1.4, 1.0, 0.8, 0.6, 0.4],
          },
        ],
      },
    );
    for (let i = 1; i < 60; i++) {
      expect(model.headcount.total[i]!, `month ${i + 1}`).toBeGreaterThanOrEqual(
        model.headcount.total[i - 1]!,
      );
    }
  });

  it("pays for the billable people it sells", () => {
    // The defect this closes: hourly-services grew billable heads to produce
    // revenue and charged nothing for them, so the two sides of the same
    // person were modelled independently.
    const model = buildModel({
      company: { name: "Agency", startDate: "2026-01-01", industryKey: "professional-services", horizonMonths: 60 },
      revenueStreams: [
        {
          id: "billing", name: "Billable work", kind: "hourly-services",
          billableHeadcount: 3, hourlyRate: 150, utilisation: 0.7,
          growth: { shape: "linear", perMonth: 0.1, max: 9 },
        },
      ],
      roles: [
        { id: "owner", title: "Owner", annualSalary: 120_000, isOwner: true },
        {
          id: "consultants", title: "Consultants", annualSalary: 110_000, isDirectLabour: true,
          staffing: { driver: "billable-heads", streamId: "billing", perHead: 1, minCount: 2 },
        },
      ],
      registry: { "roles.0.annualSalary": { provenance: "known" } },
    } as AssumptionsInput);

    const billable = model.streams[0]!.billableHeads!;
    for (let i = 0; i < 60; i++) {
      const paid = model.headcount.directLabour[i]! + model.headcount.owner[i]!;
      expect(billable[i]!, `month ${i + 1}: ${billable[i]} billable vs ${paid} paid`).toBeLessThanOrEqual(
        paid + 0.5,
      );
    }
  });
});
