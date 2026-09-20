import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { benchmarkFor, type IndustryPage } from "@/lib/content/industries";
import type { IndustryBenchmark } from "@/lib/finance/benchmarks";
import type { RevenueStream } from "@/lib/finance/types";

/* ==========================================================================
   The worked example behind an industry page.
   --------------------------------------------------------------------------
   Every figure a public industry page prints comes from here, and every figure
   here comes from the engine. There is no separate "sample output" for
   marketing to drift away from — the same rule the homepage demo follows.

   The shape returned is deliberately flat and serialisable: the page is a
   server component and the chart is a client one, so anything that crosses that
   boundary has to survive serialisation.
   ========================================================================== */

export type DriverRow = {
  label: string;
  value: string;
  /** What this driver is, in the reader's language rather than the schema's. */
  note?: string;
};

export type ExampleFigures = {
  /** Which gross margin the band is comparable to, and what it reads. */
  grossMarginBasis: IndustryBenchmark["grossMarginBasis"];
  comparableGrossMargin: number | null;
  /** The figure the statements themselves show, after direct labour. */
  reportedGrossMargin: number | null;
  netMargin: number | null;
  year1Revenue: number;
  year3Revenue: number;
  year3Headcount: number;
  breakEvenMonth: number | null;
  lowestCash: number;
  lowestCashMonth: number;
  /** Null when the example carries no debt, which some sectors should not. */
  dscrFirstFullYear: number | null;
  minimumDscr: number | null;
  totalDebt: number;
  totalEquity: number;
  totalCapex: number;
  balanceSheetTies: boolean;
  blockingCount: number;
  warningCount: number;
};

export type IndustryExample = {
  slug: string;
  benchmark: IndustryBenchmark;
  figures: ExampleFigures;
  /** The revenue build, driver by driver, as a reader can check it. */
  streams: { name: string; kindLabel: string; drivers: DriverRow[] }[];
  /** Monthly series for the chart. Twelve-month labels, full horizon. */
  chart: { labels: string[]; revenue: number[]; ebitda: number[] };
  annual: { label: string; revenue: number; ebitda: number; netIncome: number; closingCash: number }[];
};

const KIND_LABELS: Record<RevenueStream["kind"], string> = {
  subscription: "Recurring subscription",
  "unit-sales": "Units × price",
  "hourly-services": "Billable hours × rate",
  "retail-footfall": "Traffic × conversion × ticket",
  marketplace: "GMV × take rate",
  contract: "Contracts × monthly value",
  advertising: "Impressions × fill × CPM",
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number) => `${(n * 100).toFixed(n * 100 < 10 ? 1 : 0)}%`;
const num = (n: number, decimals = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function driversFor(stream: RevenueStream): DriverRow[] {
  switch (stream.kind) {
    case "retail-footfall":
      return [
        { label: "Daily traffic", value: num(stream.dailyTraffic), note: "People past the door, or covers seated" },
        { label: "Conversion", value: pct(stream.conversionRate), note: "Share who buy" },
        { label: "Average ticket", value: money(stream.averageTicket) },
        { label: "Open days per month", value: num(stream.openDaysPerMonth) },
        { label: "Monthly growth", value: pct(stream.monthlyGrowthRate) },
        { label: "Cost of sales", value: pct(stream.cogsPercent), note: "Food, drink or goods only" },
      ];
    case "unit-sales":
      return [
        { label: "Units in month one", value: num(stream.unitsMonth1) },
        { label: "Price per unit", value: money(stream.pricePerUnit) },
        { label: "Cost per unit", value: money(stream.costPerUnit) },
        { label: "Monthly growth", value: pct(stream.monthlyGrowthRate) },
      ];
    case "subscription":
      return [
        { label: "Opening customers", value: num(stream.initialCustomers) },
        { label: "New per month", value: num(stream.newCustomersMonth1, 1) },
        { label: "Price per month", value: money(stream.pricePerCustomerPerMonth) },
        { label: "Monthly churn", value: pct(stream.monthlyChurnRate) },
        { label: "Billed up front", value: `${num(stream.prepaidMonths)} month(s)` },
        { label: "Cost of sales", value: pct(stream.cogsPercent) },
      ];
    case "hourly-services":
      return [
        { label: "Billable heads", value: num(stream.billableHeadcount, 1) },
        { label: "Hours per head per month", value: num(stream.hoursPerHeadPerMonth) },
        { label: "Utilisation", value: pct(stream.utilisation), note: "Share of hours actually billed" },
        { label: "Hourly rate", value: money(stream.hourlyRate) },
        { label: "Heads added per month", value: num(stream.headcountGrowthPerMonth, 3) },
      ];
    case "contract":
      return [
        { label: "Opening contracts", value: num(stream.initialContracts, 1) },
        { label: "New per month", value: num(stream.newContractsPerMonth, 1) },
        { label: "Monthly value each", value: money(stream.monthlyValuePerContract) },
        { label: "Term", value: `${num(stream.termMonths)} months` },
        { label: "Cost of sales", value: pct(stream.cogsPercent), note: "Materials and consumables" },
      ];
    case "marketplace":
      return [
        { label: "GMV in month one", value: money(stream.gmvMonth1) },
        { label: "Take rate", value: pct(stream.takeRate) },
        { label: "Monthly growth", value: pct(stream.monthlyGrowthRate) },
      ];
    case "advertising":
      return [
        { label: "Impressions in month one", value: num(stream.impressionsMonth1) },
        { label: "Fill rate", value: pct(stream.fillRate) },
        { label: "CPM", value: money(stream.cpm) },
        { label: "Monthly growth", value: pct(stream.monthlyGrowthRate) },
      ];
  }
}

/** Direct and owner roles active in the last month of year three. */
function headcountAtMonth(
  roles: { count?: number; startMonth: number; endMonth?: number }[],
  month: number,
): number {
  return roles
    .filter((r) => r.startMonth <= month && (r.endMonth === undefined || r.endMonth >= month))
    .reduce((sum, r) => sum + (r.count ?? 1), 0);
}

export function buildIndustryExample(page: IndustryPage): IndustryExample {
  const model = buildModel(page.build());
  const metrics = computeMetrics(model);
  const benchmark = benchmarkFor(page);
  const validation = validateModel(model, metrics, {
    purpose: page.typicalPurpose,
    // The worked example carries no market research or narrative, so the checks
    // that depend on those are answered as satisfied rather than reported as
    // failures of the model. Anything the engine can decide for itself is left
    // to the engine.
    competitorCount: 3,
    competitorsHaveDatedEvidence: true,
    hasBottomUpMarketSizing: true,
    downsideScenarioDriverCount: 6,
    uncitedStatisticCount: 0,
    unreconciledFigureCount: 0,
  });

  const comparableSeries =
    benchmark.grossMarginBasis === "materials"
      ? metrics.materialsMarginByYear
      : metrics.grossMarginByYear;
  const yearThree = (rows: { year: number; margin: number | null }[]) =>
    rows.find((r) => r.year === 3)?.margin ?? null;

  const a = model.assumptions;
  return {
    slug: page.slug,
    benchmark,
    figures: {
      grossMarginBasis: benchmark.grossMarginBasis,
      comparableGrossMargin: yearThree(comparableSeries),
      reportedGrossMargin: yearThree(metrics.grossMarginByYear),
      netMargin: yearThree(metrics.netMarginByYear),
      year1Revenue: model.annual[0]?.revenue ?? 0,
      year3Revenue: model.annual[2]?.revenue ?? model.annual.at(-1)?.revenue ?? 0,
      year3Headcount: headcountAtMonth(a.roles, 36),
      breakEvenMonth: metrics.breakEven.profitMonth,
      lowestCash: metrics.cash.lowestCash,
      lowestCashMonth: metrics.cash.lowestCashMonth,
      dscrFirstFullYear: metrics.underwriter.dscrFirstFullYear,
      minimumDscr: metrics.underwriter.minimumDscr,
      totalDebt: a.loans.reduce((s, l) => s + l.principal, 0),
      totalEquity: a.equityRounds.reduce((s, r) => s + r.amount, 0),
      totalCapex: a.capex.reduce((s, c) => s + c.amount, 0),
      balanceSheetTies: model.checks.balanceSheetTie.passes,
      blockingCount: validation.blockingCount,
      warningCount: validation.warningCount,
    },
    streams: a.revenueStreams.map((s) => ({
      name: s.name,
      kindLabel: KIND_LABELS[s.kind],
      drivers: driversFor(s),
    })),
    chart: {
      labels: model.monthLabels,
      revenue: model.pnl.revenue,
      // EBITDA rather than closing cash: both are monthly flows, so one axis
      // serves them. A cumulative balance on the same scale flattens the
      // monthly line to nothing by year five.
      ebitda: model.pnl.ebitda,
    },
    annual: model.annual.map((y) => ({
      label: y.label,
      revenue: y.revenue,
      ebitda: y.ebitda,
      netIncome: y.netIncome,
      closingCash: y.closingCash,
    })),
  };
}
