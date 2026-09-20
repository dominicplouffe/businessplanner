import type { FinancialModel } from "./engine";
import type { AmortisationRow } from "./loans";
import { formatMonthLabel } from "./format";

/* ==========================================================================
   Statement shaping.
   --------------------------------------------------------------------------
   Pure functions turning engine output into rows a table can render. Kept out
   of the components so they can be tested without a DOM, and so the three
   statements share one notion of what a subtotal is.
   ========================================================================== */

export type StatementRowKind = "line" | "subtotal" | "total" | "check";

export type StatementRow = {
  key: string;
  label: string;
  kind: StatementRowKind;
  /** One value per column. */
  values: number[];
  /** Indented under the row above. */
  indent?: boolean;
  /** Shown beneath the label in smaller type. */
  note?: string;
};

export type StatementTable = {
  id: string;
  title: string;
  columns: string[];
  rows: StatementRow[];
};

export type Granularity = "annual" | "monthly";

/** Monthly view shows year one only: twelve columns is readable, sixty is not. */
export const MONTHLY_COLUMN_COUNT = 12;

function sumByYear(values: number[], years: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < years; y++) {
    let total = 0;
    for (let m = y * 12; m < (y + 1) * 12 && m < values.length; m++) {
      total += values[m] ?? 0;
    }
    out.push(total);
  }
  return out;
}

/** Balance-sheet lines are stocks, not flows — take the closing value. */
function closingByYear(values: number[], years: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < years; y++) {
    const last = Math.min((y + 1) * 12 - 1, values.length - 1);
    out.push(values[last] ?? 0);
  }
  return out;
}

function firstMonths(values: number[]): number[] {
  return values.slice(0, MONTHLY_COLUMN_COUNT);
}

function columnsFor(model: FinancialModel, granularity: Granularity): string[] {
  if (granularity === "monthly") {
    // "Sep 2026" rather than "2026-09": a statement column is read, not parsed.
    return model.monthLabels.slice(0, MONTHLY_COLUMN_COUNT).map(formatMonthLabel);
  }
  return model.annual.map((y) => y.label);
}

/** Flows: summed across a year, or taken month by month. */
function flow(values: number[], model: FinancialModel, granularity: Granularity): number[] {
  return granularity === "monthly"
    ? firstMonths(values)
    : sumByYear(values, model.annual.length);
}

/** Stocks: closing balance at year end, or month by month. */
function stock(values: number[], model: FinancialModel, granularity: Granularity): number[] {
  return granularity === "monthly"
    ? firstMonths(values)
    : closingByYear(values, model.annual.length);
}

export function buildProfitAndLoss(
  model: FinancialModel,
  granularity: Granularity,
): StatementTable {
  const f = (values: number[]) => flow(values, model, granularity);
  const { pnl } = model;

  const rows: StatementRow[] = [];

  for (const stream of pnl.revenueByStream) {
    rows.push({
      key: `revenue-${stream.id}`,
      label: stream.name,
      kind: "line",
      indent: true,
      values: f(stream.values),
    });
  }
  rows.push({ key: "revenue", label: "Revenue", kind: "subtotal", values: f(pnl.revenue) });
  rows.push({
    key: "cogs",
    label: "Cost of sales",
    kind: "line",
    values: f(pnl.cogs).map((v) => -v),
  });
  rows.push({ key: "gross-profit", label: "Gross profit", kind: "subtotal", values: f(pnl.grossProfit) });

  for (const category of pnl.opexByCategory) {
    rows.push({
      key: `opex-${category.category}`,
      label: humanise(category.category),
      kind: "line",
      indent: true,
      values: f(category.values).map((v) => -v),
    });
  }
  rows.push({
    key: "total-opex",
    label: "Operating expenses",
    kind: "subtotal",
    values: f(pnl.totalOpex).map((v) => -v),
  });

  rows.push({
    key: "owner-comp",
    label: "of which owner compensation",
    kind: "line",
    indent: true,
    note: "Shown separately because a lender recomputes coverage without it.",
    values: f(pnl.ownerCompensation),
  });

  rows.push({ key: "ebitda", label: "EBITDA", kind: "subtotal", values: f(pnl.ebitda) });
  rows.push({
    key: "depreciation",
    label: "Depreciation",
    kind: "line",
    values: f(pnl.depreciation).map((v) => -v),
  });
  rows.push({ key: "ebit", label: "Operating profit", kind: "subtotal", values: f(pnl.ebit) });
  rows.push({
    key: "interest",
    label: "Interest",
    kind: "line",
    values: f(pnl.interest).map((v) => -v),
  });
  rows.push({ key: "pretax", label: "Profit before tax", kind: "subtotal", values: f(pnl.pretaxIncome) });
  rows.push({ key: "tax", label: "Tax", kind: "line", values: f(pnl.tax).map((v) => -v) });
  rows.push({ key: "net-income", label: "Net income", kind: "total", values: f(pnl.netIncome) });

  return {
    id: "profit-and-loss",
    title: "Profit and loss",
    columns: columnsFor(model, granularity),
    rows,
  };
}

export function buildCashFlow(model: FinancialModel, granularity: Granularity): StatementTable {
  const f = (values: number[]) => flow(values, model, granularity);
  const { cashFlow } = model;

  const rows: StatementRow[] = [
    { key: "net-income", label: "Net income", kind: "line", values: f(cashFlow.netIncome) },
    { key: "depreciation", label: "Depreciation added back", kind: "line", indent: true, values: f(cashFlow.depreciation) },
    { key: "ar", label: "Change in receivables", kind: "line", indent: true, values: f(cashFlow.changeInReceivables) },
    { key: "inventory", label: "Change in inventory", kind: "line", indent: true, values: f(cashFlow.changeInInventory) },
    { key: "ap", label: "Change in payables", kind: "line", indent: true, values: f(cashFlow.changeInPayables) },
    { key: "deferred", label: "Change in deferred revenue", kind: "line", indent: true, values: f(cashFlow.changeInDeferredRevenue) },
    { key: "operating", label: "Operating cash flow", kind: "subtotal", values: f(cashFlow.operating) },
    { key: "capex", label: "Capital expenditure", kind: "line", values: f(cashFlow.capex).map((v) => -v) },
    { key: "investing", label: "Investing cash flow", kind: "subtotal", values: f(cashFlow.investing) },
    { key: "equity", label: "Equity raised", kind: "line", indent: true, values: f(cashFlow.equityRaised) },
    { key: "grants", label: "Grants received", kind: "line", indent: true, values: f(cashFlow.grantsReceived) },
    { key: "debt-drawn", label: "Debt drawn", kind: "line", indent: true, values: f(cashFlow.debtDrawn) },
    { key: "debt-repaid", label: "Debt repaid", kind: "line", indent: true, values: f(cashFlow.debtRepaid).map((v) => -v) },
    { key: "financing", label: "Financing cash flow", kind: "subtotal", values: f(cashFlow.financing) },
    { key: "net-change", label: "Net change in cash", kind: "subtotal", values: f(cashFlow.netChange) },
    { key: "closing-cash", label: "Closing cash", kind: "total", values: stock(cashFlow.closingCash, model, granularity) },
  ];

  return {
    id: "cash-flow",
    title: "Cash flow",
    columns: columnsFor(model, granularity),
    rows,
  };
}

export function buildBalanceSheet(model: FinancialModel, granularity: Granularity): StatementTable {
  const s = (values: number[]) => stock(values, model, granularity);
  const { balanceSheet: bs } = model;

  const rows: StatementRow[] = [
    { key: "cash", label: "Cash", kind: "line", indent: true, values: s(bs.cash) },
    { key: "ar", label: "Accounts receivable", kind: "line", indent: true, values: s(bs.accountsReceivable) },
    { key: "inventory", label: "Inventory", kind: "line", indent: true, values: s(bs.inventory) },
    { key: "ppe", label: "Property and equipment, net", kind: "line", indent: true, values: s(bs.netPPE) },
    { key: "total-assets", label: "Total assets", kind: "subtotal", values: s(bs.totalAssets) },
    { key: "ap", label: "Accounts payable", kind: "line", indent: true, values: s(bs.accountsPayable) },
    { key: "deferred", label: "Deferred revenue", kind: "line", indent: true, values: s(bs.deferredRevenue) },
    { key: "debt", label: "Debt", kind: "line", indent: true, values: s(bs.debt) },
    { key: "total-liabilities", label: "Total liabilities", kind: "subtotal", values: s(bs.totalLiabilities) },
    { key: "paid-in", label: "Paid-in capital", kind: "line", indent: true, values: s(bs.paidInCapital) },
    { key: "retained", label: "Retained earnings", kind: "line", indent: true, values: s(bs.retainedEarnings) },
    { key: "total-equity", label: "Total equity", kind: "subtotal", values: s(bs.totalEquity) },
    {
      key: "tie",
      label: "Assets less liabilities and equity",
      kind: "check",
      note: "Zero in every period, or the model is wrong.",
      values: s(bs.tie),
    },
  ];

  return {
    id: "balance-sheet",
    title: "Balance sheet",
    columns: columnsFor(model, granularity),
    rows,
  };
}

export function buildStatements(
  model: FinancialModel,
  granularity: Granularity,
): StatementTable[] {
  return [
    buildProfitAndLoss(model, granularity),
    buildCashFlow(model, granularity),
    buildBalanceSheet(model, granularity),
  ];
}

function humanise(value: string): string {
  return value
    .split("-")
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Debt schedule                                                              */
/* -------------------------------------------------------------------------- */

export type DebtYearRow = {
  year: number;
  label: string;
  openingBalance: number;
  interest: number;
  principal: number;
  closingBalance: number;
};

/**
 * Rolls an amortisation schedule up by year.
 *
 * A ten-year term is 120 rows, which no reader audits; a lender reads the
 * annual interest and principal split and the closing balance. Balances are
 * taken from the first and last month of each year rather than summed, because
 * they are stocks. Years beyond the model horizon are kept and labelled
 * generically — the term outlives the projection, and hiding the tail would
 * misstate the obligation.
 */
export function summariseScheduleByYear(
  rows: AmortisationRow[],
  model: FinancialModel,
): DebtYearRow[] {
  if (rows.length === 0) return [];
  const byYear = new Map<number, AmortisationRow[]>();
  for (const row of rows) {
    const year = Math.floor((row.month - 1) / 12);
    const bucket = byYear.get(year);
    if (bucket) bucket.push(row);
    else byYear.set(year, [row]);
  }

  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, months]) => {
      const first = months[0]!;
      const last = months[months.length - 1]!;
      return {
        year: year + 1,
        label: model.annual[year]?.label ?? `Year ${year + 1}`,
        openingBalance: first.openingBalance,
        interest: months.reduce((sum, m) => sum + m.interest, 0),
        principal: months.reduce((sum, m) => sum + m.principal, 0),
        closingBalance: last.closingBalance,
      };
    });
}
