import type { FinancialModel } from "./engine";

/* ==========================================================================
   Metrics — including the ratios a credit analyst computes.
   --------------------------------------------------------------------------
   Founders submit plans; banks compute ratios. This module renders the
   lender's own arithmetic so the number is in the plan before the underwriter
   works it out for themselves.
   ========================================================================== */

export type BreakEven = {
  /** First month in which the business earns an operating profit. */
  profitMonth: number | null;
  /** First month after which cash never goes down again on a trailing basis. */
  cashFlowPositiveMonth: number | null;
  /** Monthly revenue required to cover fixed costs at the current gross margin. */
  monthlyRevenueRequired: number;
  /** Units per month at break-even, when the model counts units. */
  monthlyUnitsRequired: number | null;
  contributionMarginRatio: number;
  averageMonthlyFixedCosts: number;
};

export type UnitEconomics = {
  customerAcquisitionCost: number | null;
  averageRevenuePerCustomerPerMonth: number | null;
  grossMargin: number;
  monthlyChurnRate: number | null;
  /** Gross-margin lifetime value, i.e. ARPU × margin ÷ churn. */
  lifetimeValue: number | null;
  ltvToCac: number | null;
  /** Months of gross profit needed to repay acquisition cost. */
  paybackMonths: number | null;
};

export type CashPosition = {
  /** Average monthly operating outflow while operating cash flow is negative. */
  averageNetBurn: number;
  grossBurnLastMonth: number;
  /** Months of runway from the last month's closing cash at current net burn. */
  runwayMonths: number | null;
  /** 1-based month in which cash first goes negative, if it ever does. */
  cashOutMonth: number | null;
  lowestCash: number;
  lowestCashMonth: number;
  peakFundingNeed: number;
};

export type UnderwriterRatios = {
  /** Debt service coverage by year: cash available ÷ scheduled debt service.
   *  Cash available is EBITDA less cash taxes — the convention most SBA
   *  lenders apply to projections. */
  dscrByYear: { year: number; cashAvailable: number; debtService: number; dscr: number | null }[];
  /** Weakest DSCR in any year that carries debt service. */
  minimumDscr: number | null;
  /** Coverage in the first full year after any interest-only period ends. */
  dscrFirstFullYear: number | null;
  currentRatioByYear: { year: number; ratio: number | null }[];
  debtToEquityByYear: { year: number; ratio: number | null }[];
  /** Owner compensation by year. A plan showing zero fails on first review:
   *  underwriters substitute a market salary, and the E-2 marginality test is
   *  assessed on the owner's income. */
  ownerCompensationByYear: { year: number; amount: number }[];
};

export type Metrics = {
  breakEven: BreakEven;
  unitEconomics: UnitEconomics;
  cash: CashPosition;
  underwriter: UnderwriterRatios;
  /** Revenue growth year over year. */
  revenueGrowthByYear: { year: number; growth: number | null }[];
  grossMarginByYear: { year: number; margin: number | null }[];
  /** Gross margin before direct labour. This is the one to compare against an
   *  industry band; grossMarginByYear is the one to report. */
  materialsMarginByYear: { year: number; margin: number | null }[];
  netMarginByYear: { year: number; margin: number | null }[];
};

function at(arr: number[], i: number): number {
  return arr[i] ?? 0;
}
function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}
function sumRange(arr: number[], from: number, count: number): number {
  let total = 0;
  for (let i = from; i < from + count; i++) total += at(arr, i);
  return total;
}

export function computeMetrics(model: FinancialModel): Metrics {
  const { pnl, cashFlow, balanceSheet, annual, horizonMonths: n } = model;
  const a = model.assumptions;

  /* ---- Break-even ------------------------------------------------------- */
  let profitMonth: number | null = null;
  for (let i = 0; i < n; i++) {
    if (at(pnl.ebitda, i) > 0) {
      profitMonth = i + 1;
      break;
    }
  }

  let cashFlowPositiveMonth: number | null = null;
  for (let i = 0; i < n; i++) {
    const remainderAllPositive = cashFlow.operating.slice(i).every((v) => v > 0);
    if (at(cashFlow.operating, i) > 0 && remainderAllPositive) {
      cashFlowPositiveMonth = i + 1;
      break;
    }
  }

  // Contribution margin is measured over months that actually trade, so a
  // pre-launch ramp does not drag the ratio toward zero.
  const tradingMonths: number[] = [];
  for (let i = 0; i < n; i++) if (at(pnl.revenue, i) > 0) tradingMonths.push(i);

  const revenueTrading = tradingMonths.map((i) => at(pnl.revenue, i));
  const cogsTrading = tradingMonths.map((i) => at(pnl.cogs, i));
  const totalRevenueTrading = revenueTrading.reduce((s, v) => s + v, 0);
  const totalCogsTrading = cogsTrading.reduce((s, v) => s + v, 0);
  const contributionMarginRatio =
    totalRevenueTrading > 0 ? (totalRevenueTrading - totalCogsTrading) / totalRevenueTrading : 0;

  const averageMonthlyFixedCosts = mean(tradingMonths.map((i) => at(pnl.totalOpex, i)));
  const monthlyRevenueRequired =
    contributionMarginRatio > 0 ? averageMonthlyFixedCosts / contributionMarginRatio : Infinity;

  // Units only mean something when a stream actually prices per unit.
  const unitStream = a.revenueStreams.find((s) => s.kind === "unit-sales");
  let monthlyUnitsRequired: number | null = null;
  if (unitStream && unitStream.kind === "unit-sales") {
    const contributionPerUnit = unitStream.pricePerUnit - unitStream.costPerUnit;
    monthlyUnitsRequired =
      contributionPerUnit > 0 ? averageMonthlyFixedCosts / contributionPerUnit : null;
  }

  /* ---- Unit economics --------------------------------------------------- */
  const subscription = a.revenueStreams.find((s) => s.kind === "subscription");
  const grossMargin = contributionMarginRatio;
  const marginForLtv = a.unitEconomics?.grossMarginOverride ?? grossMargin;
  const cac = a.unitEconomics?.customerAcquisitionCost ?? null;

  let arpu: number | null = null;
  let churn: number | null = null;
  let ltv: number | null = null;
  if (subscription && subscription.kind === "subscription") {
    arpu = subscription.pricePerCustomerPerMonth;
    churn = subscription.monthlyChurnRate;
    if (churn > 0) ltv = (arpu * marginForLtv) / churn;
  }

  const ltvToCac = ltv !== null && cac !== null && cac > 0 ? ltv / cac : null;
  const paybackMonths =
    cac !== null && arpu !== null && arpu * marginForLtv > 0 ? cac / (arpu * marginForLtv) : null;

  /* ---- Cash ------------------------------------------------------------- */
  const burnMonths = cashFlow.operating.filter((v) => v < 0).map((v) => -v);
  const averageNetBurn = mean(burnMonths);
  const grossBurnLastMonth = at(pnl.cogs, n - 1) + at(pnl.totalOpex, n - 1);

  let cashOutMonth: number | null = null;
  let lowestCash = Infinity;
  let lowestCashMonth = 1;
  for (let i = 0; i < n; i++) {
    const c = at(cashFlow.closingCash, i);
    if (c < lowestCash) {
      lowestCash = c;
      lowestCashMonth = i + 1;
    }
    if (c < 0 && cashOutMonth === null) cashOutMonth = i + 1;
  }
  if (!Number.isFinite(lowestCash)) lowestCash = 0;

  const finalCash = at(cashFlow.closingCash, n - 1);
  const finalOperating = at(cashFlow.operating, n - 1);
  const runwayMonths =
    finalOperating < 0 && finalCash > 0 ? finalCash / -finalOperating : null;

  /* ---- Underwriter ratios ---------------------------------------------- */
  const dscrByYear = annual.map((y) => {
    // EBITDA less cash taxes is the cash available for debt service.
    const cashAvailable = y.ebitda - y.tax;
    const dscr = y.debtService > 0 ? cashAvailable / y.debtService : null;
    return { year: y.year, cashAvailable, debtService: y.debtService, dscr };
  });

  const dscrValues = dscrByYear
    .map((r) => r.dscr)
    .filter((v): v is number => v !== null);
  const minimumDscr = dscrValues.length > 0 ? Math.min(...dscrValues) : null;

  // The first year in which debt is fully amortising is the one a lender sizes
  // against; an interest-only year flatters coverage.
  const interestOnlyMonths = Math.max(0, ...a.loans.map((l) => l.interestOnlyMonths), 0);
  const firstFullYearIndex = Math.min(annual.length - 1, Math.floor(interestOnlyMonths / 12) + 1);
  const dscrFirstFullYear = dscrByYear[firstFullYearIndex]?.dscr ?? minimumDscr;

  const currentRatioByYear = annual.map((y) => {
    const i = Math.min(n - 1, y.year * 12 - 1);
    const currentAssets =
      at(balanceSheet.cash, i) + at(balanceSheet.accountsReceivable, i) + at(balanceSheet.inventory, i);
    const currentLiabilities =
      at(balanceSheet.accountsPayable, i) + at(balanceSheet.deferredRevenue, i);
    return {
      year: y.year,
      ratio: currentLiabilities > 0 ? currentAssets / currentLiabilities : null,
    };
  });

  const debtToEquityByYear = annual.map((y) => {
    const i = Math.min(n - 1, y.year * 12 - 1);
    const equity = at(balanceSheet.totalEquity, i);
    return { year: y.year, ratio: equity > 0 ? at(balanceSheet.debt, i) / equity : null };
  });

  /* ---- Trend ratios ---------------------------------------------------- */
  const revenueGrowthByYear = annual.map((y, idx) => {
    const prev = annual[idx - 1];
    return {
      year: y.year,
      growth: prev && prev.revenue > 0 ? (y.revenue - prev.revenue) / prev.revenue : null,
    };
  });

  // Materials-only margin is derived from the monthly lines rather than added to
  // AnnualSummary: it exists for the benchmark comparison, and a second gross
  // margin on the annual rollup would find its way into the statements.
  const materialsMarginByYear = annual.map((y) => {
    const from = (y.year - 1) * 12;
    const count = Math.min(12, n - from);
    const yearRevenue = sumRange(pnl.revenue, from, count);
    const yearGross = sumRange(pnl.materialsGrossProfit, from, count);
    return { year: y.year, margin: yearRevenue > 0 ? yearGross / yearRevenue : null };
  });

  return {
    breakEven: {
      profitMonth,
      cashFlowPositiveMonth,
      monthlyRevenueRequired,
      monthlyUnitsRequired,
      contributionMarginRatio,
      averageMonthlyFixedCosts,
    },
    unitEconomics: {
      customerAcquisitionCost: cac,
      averageRevenuePerCustomerPerMonth: arpu,
      grossMargin,
      monthlyChurnRate: churn,
      lifetimeValue: ltv,
      ltvToCac,
      paybackMonths,
    },
    cash: {
      averageNetBurn,
      grossBurnLastMonth,
      runwayMonths,
      cashOutMonth,
      lowestCash,
      lowestCashMonth,
      peakFundingNeed: lowestCash < 0 ? -lowestCash : 0,
    },
    underwriter: {
      dscrByYear,
      minimumDscr,
      dscrFirstFullYear,
      currentRatioByYear,
      debtToEquityByYear,
      ownerCompensationByYear: annual.map((y) => ({ year: y.year, amount: y.ownerCompensation })),
    },
    revenueGrowthByYear,
    grossMarginByYear: annual.map((y) => ({
      year: y.year,
      margin: y.revenue > 0 ? y.grossProfit / y.revenue : null,
    })),
    materialsMarginByYear,
    netMarginByYear: annual.map((y) => ({
      year: y.year,
      margin: y.revenue > 0 ? y.netIncome / y.revenue : null,
    })),
  };
}
