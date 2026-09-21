import { buildModel, type FinancialModel } from "./engine";
import type { Assumptions } from "./types";
import type { GrowthCurve } from "./growth";

/* ==========================================================================
   Scenarios and sensitivity.
   --------------------------------------------------------------------------
   A credible downside moves revenue AND spend: cutting revenue while holding
   the hiring plan constant is not a scenario, it is arithmetic. So each case
   carries a cost response as well as a demand shock.
   ========================================================================== */

export type ScenarioKey = "base" | "upside" | "downside";

export type ScenarioAdjustment = {
  /** Multiplier on every stream's primary volume driver. */
  volume: number;
  /** Multiplier on price. */
  price: number;
  /** Multiplier on discretionary operating expenses. */
  opex: number;
  /** Multiplier on headcount cost — the cost response. */
  payroll: number;
  /** Additive change to subscription churn, in points. */
  churnDelta: number;
  /** Months of delay to the revenue ramp. */
  rampDelayMonths: number;
};

export const SCENARIOS: Record<ScenarioKey, { label: string; description: string; adjustment: ScenarioAdjustment }> = {
  base: {
    label: "Base",
    description: "The plan as modelled.",
    adjustment: { volume: 1, price: 1, opex: 1, payroll: 1, churnDelta: 0, rampDelayMonths: 0 },
  },
  upside: {
    label: "Upside",
    description: "Demand lands ahead of plan and retention holds; spend follows revenue.",
    adjustment: { volume: 1.25, price: 1.05, opex: 1.1, payroll: 1.1, churnDelta: -0.005, rampDelayMonths: 0 },
  },
  downside: {
    label: "Downside",
    description:
      "Demand lands at three quarters of plan, the ramp slips a quarter, churn worsens — and management responds by holding hiring and discretionary spend down.",
    adjustment: { volume: 0.75, price: 0.95, opex: 0.85, payroll: 0.8, churnDelta: 0.01, rampDelayMonths: 3 },
  },
};

/**
 * Count of drivers a scenario actually moves — the validator checks this.
 *
 * With `a` supplied, a driver only counts when the plan has something for it
 * to act on. Without it the count is a property of `SCENARIOS` alone, which
 * is a module constant — so `no-coherent-downside` was comparing a
 * compile-time 6 against a threshold of 5 and could never fire. A blocking
 * check that cannot block is worse than no check, because it reads as
 * coverage. Scaling payroll on a plan with no roles moves nothing, and
 * telling its author their downside is coherent is exactly the false comfort
 * the rule exists to prevent.
 */
export function driversMoved(adj: ScenarioAdjustment, a?: Assumptions): number {
  const hasRevenue = !a || a.revenueStreams.length > 0;
  const hasOpex = !a || a.opex.length > 0;
  const hasPayroll = !a || a.roles.length > 0;
  const hasChurn = !a || a.revenueStreams.some((s) => s.kind === "subscription");

  let count = 0;
  if (adj.volume !== 1 && hasRevenue) count++;
  if (adj.price !== 1 && hasRevenue) count++;
  if (adj.opex !== 1 && hasOpex) count++;
  if (adj.payroll !== 1 && hasPayroll) count++;
  if (adj.churnDelta !== 0 && hasChurn) count++;
  if (adj.rampDelayMonths !== 0 && hasRevenue) count++;
  return count;
}

/**
 * Capacity moves with the case.
 *
 * A scenario scales the level drivers, so without this the upside is clipped
 * by a ceiling calibrated for the base case — the optimistic plan quietly
 * becomes the base plan, and the volume row of the sensitivity tornado
 * under-reports, telling a founder that volume matters less than it does.
 *
 * The reading is that an upside is a bigger business, not the same business
 * working harder: more covers means more room, more units means more line.
 */
function scaleCapacity<T extends { growth?: GrowthCurve }>(stream: T, volume: number): T {
  if (!stream.growth || volume === 1) return stream;
  const growth = stream.growth;
  if (growth.shape === "saturating") {
    return { ...stream, growth: { ...growth, ceiling: growth.ceiling * volume } };
  }
  if (growth.shape === "linear" && growth.max !== undefined) {
    return { ...stream, growth: { ...growth, max: growth.max * volume } };
  }
  return stream;
}

function applyAdjustment(a: Assumptions, adj: ScenarioAdjustment): Assumptions {
  const streams = a.revenueStreams.map((raw) => {
    const s = scaleCapacity(raw, adj.volume);
    const startMonth = s.startMonth + adj.rampDelayMonths;
    switch (s.kind) {
      case "subscription":
        return {
          ...s,
          startMonth,
          initialCustomers: s.initialCustomers * adj.volume,
          newCustomersMonth1: s.newCustomersMonth1 * adj.volume,
          ...(s.customerCeiling !== undefined
            ? { customerCeiling: s.customerCeiling * adj.volume }
            : {}),
          pricePerCustomerPerMonth: s.pricePerCustomerPerMonth * adj.price,
          monthlyChurnRate: Math.max(0, Math.min(1, s.monthlyChurnRate + adj.churnDelta)),
        };
      case "unit-sales":
        return { ...s, startMonth, unitsMonth1: s.unitsMonth1 * adj.volume, pricePerUnit: s.pricePerUnit * adj.price };
      case "hourly-services":
        return { ...s, startMonth, billableHeadcount: s.billableHeadcount * adj.volume, hourlyRate: s.hourlyRate * adj.price };
      case "retail-footfall":
        return { ...s, startMonth, dailyTraffic: s.dailyTraffic * adj.volume, averageTicket: s.averageTicket * adj.price };
      case "marketplace":
        return { ...s, startMonth, gmvMonth1: s.gmvMonth1 * adj.volume, takeRate: Math.min(1, s.takeRate * adj.price) };
      case "contract":
        return {
          ...s,
          startMonth,
          initialContracts: s.initialContracts * adj.volume,
          newContractsPerMonth: s.newContractsPerMonth * adj.volume,
          monthlyValuePerContract: s.monthlyValuePerContract * adj.price,
        };
      case "advertising":
        return { ...s, startMonth, impressionsMonth1: s.impressionsMonth1 * adj.volume, cpm: s.cpm * adj.price };
    }
  });

  return {
    ...a,
    revenueStreams: streams,
    // Payroll responds; salaries are not a fixed law of nature.
    roles: a.roles.map((r) => ({ ...r, annualSalary: r.annualSalary * adj.payroll })),
    // Rent and insurance are genuinely committed; the rest flexes.
    opex: a.opex.map((o) =>
      o.category === "rent" || o.category === "insurance"
        ? o
        : { ...o, monthlyAmount: o.monthlyAmount * adj.opex },
    ),
  };
}

export type ScenarioSet = Record<ScenarioKey, FinancialModel>;

export function buildScenarios(a: Assumptions): ScenarioSet {
  return {
    base: buildModel(a),
    upside: buildModel(applyAdjustment(a, SCENARIOS.upside.adjustment)),
    downside: buildModel(applyAdjustment(a, SCENARIOS.downside.adjustment)),
  };
}

/* -------------------------------------------------------------------------- */
/* One-at-a-time sensitivity — the tornado dataset                            */
/* -------------------------------------------------------------------------- */

export type SensitivityDriver = "volume" | "price" | "opex" | "payroll" | "churn";

export type SensitivityRow = {
  driver: SensitivityDriver;
  label: string;
  /** Outcome when the driver moves down by `swing`. */
  low: number;
  /** Outcome when the driver moves up by `swing`. */
  high: number;
  base: number;
  /** Absolute spread, for sorting the tornado. */
  spread: number;
};

const NEUTRAL: ScenarioAdjustment = {
  volume: 1, price: 1, opex: 1, payroll: 1, churnDelta: 0, rampDelayMonths: 0,
};

/**
 * Moves one driver at a time by ±`swing` and reports the effect on a chosen
 * outcome, sorted by impact. This is what tells a founder which assumption
 * actually matters — usually not the one they spent the most time on.
 */
export function sensitivity(
  a: Assumptions,
  outcome: (m: FinancialModel) => number,
  swing = 0.2,
): SensitivityRow[] {
  const base = outcome(buildModel(a));

  const drivers: { driver: SensitivityDriver; label: string; low: ScenarioAdjustment; high: ScenarioAdjustment }[] = [
    { driver: "volume", label: "Sales volume", low: { ...NEUTRAL, volume: 1 - swing }, high: { ...NEUTRAL, volume: 1 + swing } },
    { driver: "price", label: "Price", low: { ...NEUTRAL, price: 1 - swing }, high: { ...NEUTRAL, price: 1 + swing } },
    { driver: "opex", label: "Operating expenses", low: { ...NEUTRAL, opex: 1 - swing }, high: { ...NEUTRAL, opex: 1 + swing } },
    { driver: "payroll", label: "Payroll", low: { ...NEUTRAL, payroll: 1 - swing }, high: { ...NEUTRAL, payroll: 1 + swing } },
    { driver: "churn", label: "Churn", low: { ...NEUTRAL, churnDelta: -swing / 20 }, high: { ...NEUTRAL, churnDelta: swing / 20 } },
  ];

  return drivers
    .map(({ driver, label, low, high }) => {
      const lo = outcome(buildModel(applyAdjustment(a, low)));
      const hi = outcome(buildModel(applyAdjustment(a, high)));
      return { driver, label, low: lo, high: hi, base, spread: Math.abs(hi - lo) };
    })
    .sort((x, y) => y.spread - x.spread);
}
