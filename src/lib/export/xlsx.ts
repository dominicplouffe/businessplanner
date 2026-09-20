import ExcelJS from "exceljs";
import type { ExportDocument } from "./document";
import type { RevenueStream } from "@/lib/finance/types";

/* ==========================================================================
   The workbook, with live formulas.
   --------------------------------------------------------------------------
   This is the export bankers actually ask for and the one nobody in the
   category does properly: not a picture of the model, the model. Change a
   driver on the Drivers sheet and revenue, margin, coverage and the debt
   schedule all recalculate, because they are formulas over those cells rather
   than pasted numbers.

   Every sheet is built to be audited. The formulas mirror the engine's own
   arithmetic — volume × price, never a growth rate applied to a revenue line —
   so a reader interrogating the spreadsheet is interrogating the same build
   the written plan describes.

   The Filed sheet is how that claim is kept honest. It holds the figures the
   engine computed at export, and the variance row subtracts them from the live
   formulas. On open it reads zero across the horizon; if it ever does not, the
   workbook says so on its face rather than letting a reader discover it. Once
   a driver is edited the variance becomes the useful thing: exactly what that
   change did to the filed plan.
   ========================================================================== */

/** Monthly columns start here; A and B carry the label and the units. */
const FIRST_MONTH_COL = 3;

const INK = "FF0B1220";
const RULE = "FFD9D9D9";
const MONEY = '#,##0;(#,##0)';
const RATE = "0.00%";
const MULTIPLE = '0.00"×"';

type Ref = string;

export async function buildWorkbook(doc: ExportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Venturally";
  wb.created = new Date();

  const months = doc.model.horizonMonths;
  const labels = doc.model.monthLabels;

  const drivers = wb.addWorksheet("Drivers", { properties: { tabColor: { argb: "FF0F3D2E" } } });
  const revenue = wb.addWorksheet("Revenue");
  const payroll = wb.addWorksheet("Payroll");
  const opex = wb.addWorksheet("Operating costs");
  const model = wb.addWorksheet("Monthly model");
  const annual = wb.addWorksheet("Annual");
  const debt = wb.addWorksheet("Debt");
  const filed = wb.addWorksheet("Filed");
  const market = wb.addWorksheet("Market");
  const sources = wb.addWorksheet("Sources");

  const cells = writeDrivers(drivers, doc);
  const revenueRows = writeRevenue(revenue, doc, cells, months, labels);
  const payrollRows = writePayroll(payroll, doc, cells, months, labels);
  const opexRows = writeOpex(opex, doc, cells, revenueRows, payrollRows, months, labels);
  const debtRows = writeDebt(debt, doc, cells, months, labels);
  const modelRows = writeModel(model, doc, cells, revenueRows, payrollRows, opexRows, debtRows, months, labels);
  writeAnnual(annual, doc, modelRows, debtRows, months);
  writeFiled(filed, doc, modelRows, months, labels);
  writeMarket(market, doc, cells);
  writeSources(sources, doc);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

/* -------------------------------------------------------------------------- */
/* Sheet helpers                                                              */
/* -------------------------------------------------------------------------- */

function colLetter(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** The column for a 1-based month. */
function monthCol(month: number): string {
  return colLetter(FIRST_MONTH_COL + month - 1);
}

function heading(sheet: ExcelJS.Worksheet, row: number, text: string, note?: string) {
  const cell = sheet.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, size: 12, color: { argb: INK } };
  if (note) {
    const noteCell = sheet.getCell(row, 2);
    noteCell.value = note;
    noteCell.font = { italic: true, size: 9, color: { argb: "FF5F697D" } };
  }
}

function monthHeaders(sheet: ExcelJS.Worksheet, row: number, labels: string[], months: number) {
  sheet.getCell(row, 1).value = "";
  for (let m = 1; m <= months; m++) {
    const cell = sheet.getCell(row, FIRST_MONTH_COL + m - 1);
    cell.value = labels[m - 1] ?? `M${m}`;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
  }
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 16;
  for (let m = 1; m <= months; m++) sheet.getColumn(FIRST_MONTH_COL + m - 1).width = 13;
}

/** Writes a monthly row of formulas and returns the row number. */
function formulaRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  label: string,
  months: number,
  formula: (month: number, col: string, prevCol: string) => string | number,
  opts: { format?: string; bold?: boolean; unit?: string } = {},
): number {
  const cell = sheet.getCell(row, 1);
  cell.value = label;
  cell.font = { bold: opts.bold ?? false, size: 10 };
  if (opts.unit) {
    const unit = sheet.getCell(row, 2);
    unit.value = opts.unit;
    unit.font = { size: 9, color: { argb: "FF5F697D" } };
  }
  for (let m = 1; m <= months; m++) {
    const target = sheet.getCell(row, FIRST_MONTH_COL + m - 1);
    const value = formula(m, monthCol(m), m > 1 ? monthCol(m - 1) : monthCol(1));
    target.value = typeof value === "string" ? { formula: value } : value;
    target.numFmt = opts.format ?? MONEY;
    target.font = { bold: opts.bold ?? false, size: 10 };
  }
  return row;
}

/* -------------------------------------------------------------------------- */
/* Drivers                                                                    */
/* -------------------------------------------------------------------------- */

type DriverCells = {
  /** Dotted assumption path -> absolute reference, e.g. "Drivers!$B$12". */
  ref: Record<string, Ref>;
  /** The 12-cell seasonality range for a stream, when it has one. */
  seasonality: Record<string, Ref>;
  startCalendarMonth: number;
};

function writeDrivers(sheet: ExcelJS.Worksheet, doc: ExportDocument): DriverCells {
  const ref: Record<string, Ref> = {};
  const seasonality: Record<string, Ref> = {};
  const a = doc.assumptions;
  let row = 1;

  sheet.getCell(row, 1).value = `${doc.companyName} — model drivers`;
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 1;
  sheet.getCell(row, 1).value =
    "Every white cell below is an input. Change one and the rest of the workbook recalculates.";
  sheet.getCell(row, 1).font = { italic: true, size: 9, color: { argb: "FF5F697D" } };
  row += 2;

  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 22;

  const registry = a.registry;
  const put = (path: string, label: string, value: number, format: string, provenance?: string) => {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { size: 10 };
    const cell = sheet.getCell(row, 2);
    cell.value = value;
    cell.numFmt = format;
    cell.font = { size: 10 };
    // Inputs are visibly inputs: a reader must be able to tell at a glance
    // which cells are theirs to change and which are derived.
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
    cell.border = { bottom: { style: "hair", color: { argb: RULE } } };
    const tag = provenance ?? registry[path]?.provenance;
    if (tag) {
      const p = sheet.getCell(row, 4);
      p.value = PROVENANCE_LABELS[tag] ?? tag;
      p.font = { size: 9, color: { argb: "FF5F697D" } };
    }
    ref[path] = `Drivers!$B$${row}`;
    row += 1;
  };

  const section = (title: string) => {
    row += 1;
    heading(sheet, row, title);
    row += 1;
  };

  section("Company");
  put("company.horizonMonths", "Months modelled", a.company.horizonMonths, "0");
  put("company.firstTradingMonth", "First trading month", a.company.firstTradingMonth, "0");
  put("payroll.payrollTaxRate", "Employer payroll tax", a.payroll.payrollTaxRate, RATE);
  put("payroll.benefitsRate", "Benefits load", a.payroll.benefitsRate, RATE);
  put("tax.corporateRate", "Corporate tax rate", a.tax.corporateRate, RATE);

  a.revenueStreams.forEach((stream, i) => {
    section(`Revenue — ${stream.name}`);
    put(`revenueStreams.${i}.startMonth`, "First billing month", stream.startMonth, "0");
    for (const [key, value] of Object.entries(stream)) {
      if (typeof value !== "number" || key === "startMonth") continue;
      put(
        `revenueStreams.${i}.${key}`,
        humanise(key),
        value,
        /rate|share|utilisation|percent|churn/i.test(key) ? RATE : "#,##0.00",
      );
    }
    if (stream.seasonality) {
      sheet.getCell(row, 1).value = "Seasonality by calendar month";
      sheet.getCell(row, 1).font = { size: 10 };
      stream.seasonality.forEach((factor, k) => {
        const cell = sheet.getCell(row, 2 + k);
        cell.value = factor;
        cell.numFmt = "0.00";
        cell.font = { size: 9 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF9E6" } };
      });
      seasonality[stream.id] = `Drivers!$B$${row}:$M$${row}`;
      row += 1;
    }
  });

  section("Team");
  a.roles.forEach((role, i) => {
    put(`roles.${i}.annualSalary`, `${role.title} — salary`, role.annualSalary, "#,##0");
    put(`roles.${i}.count`, `${role.title} — headcount`, role.count, "0");
    put(`roles.${i}.startMonth`, `${role.title} — starts month`, role.startMonth, "0");
    put(`roles.${i}.endMonth`, `${role.title} — ends month`, role.endMonth ?? a.company.horizonMonths, "0");
  });

  section("Operating costs");
  a.opex.forEach((item, i) => {
    if (item.percentOfRevenue !== undefined) {
      put(`opex.${i}.percentOfRevenue`, `${item.name} — share of revenue`, item.percentOfRevenue, RATE);
    } else {
      put(`opex.${i}.monthlyAmount`, `${item.name} — monthly`, item.monthlyAmount, "#,##0");
      put(`opex.${i}.annualGrowthRate`, `${item.name} — annual growth`, item.annualGrowthRate, RATE);
    }
    put(`opex.${i}.startMonth`, `${item.name} — starts month`, item.startMonth, "0");
    put(`opex.${i}.endMonth`, `${item.name} — ends month`, item.endMonth ?? a.company.horizonMonths, "0");
  });

  if (a.loans.length > 0) {
    section("Debt");
    a.loans.forEach((loan, i) => {
      put(`loans.${i}.principal`, `${loan.name} — principal`, loan.principal, "#,##0");
      put(`loans.${i}.annualRate`, `${loan.name} — annual rate`, loan.annualRate, RATE);
      put(`loans.${i}.termMonths`, `${loan.name} — term (months)`, loan.termMonths, "0");
      put(`loans.${i}.interestOnlyMonths`, `${loan.name} — interest-only months`, loan.interestOnlyMonths, "0");
      put(`loans.${i}.month`, `${loan.name} — drawn in month`, loan.month, "0");
    });
  }

  if (doc.market.sizing.complete) {
    section("Market build");
    const s = doc.assumptionsMarket;
    put("market.populationCount", "Population counted", s.populationCount, "#,##0");
    put("market.qualifiedShare", "Share who are plausible buyers", s.qualifiedShare, RATE);
    put("market.annualSpendPerCustomer", "Annual spend each", s.annualSpendPerCustomer, "#,##0.00");
    put("market.servableShare", "Serviceable share", s.servableShare, RATE);
    put("market.targetShare", "Target share", s.targetShare, RATE);
  }

  return { ref, seasonality, startCalendarMonth: startCalendarMonthOf(doc) };
}

const PROVENANCE_LABELS: Record<string, string> = {
  known: "Measured by the owner",
  estimated: "Estimated by the owner",
  benchmark_default: "Industry default",
};

function startCalendarMonthOf(doc: ExportDocument): number {
  const iso = doc.assumptions.company.startDate;
  return Number(iso.slice(5, 7));
}

/* -------------------------------------------------------------------------- */
/* Revenue                                                                    */
/* -------------------------------------------------------------------------- */

type RevenueRows = { revenueTotal: number; cogsTotal: number; deferredTotal: number };

function writeRevenue(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  cells: DriverCells,
  months: number,
  labels: string[],
): RevenueRows {
  let row = 1;
  sheet.getCell(row, 1).value = "Revenue, built from drivers";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;
  monthHeaders(sheet, row, labels, months);
  row += 1;

  const revenueRows: number[] = [];
  const cogsRows: number[] = [];
  const deferredRows: number[] = [];

  doc.assumptions.revenueStreams.forEach((stream, i) => {
    heading(sheet, row, stream.name, kindLabel(stream.kind));
    row += 1;
    const built = writeStream(sheet, row, stream, i, cells, months);
    revenueRows.push(built.revenue);
    cogsRows.push(built.cogs);
    if (built.deferred !== null) deferredRows.push(built.deferred);
    row = built.nextRow + 1;
  });

  const revenueTotal = formulaRow(sheet, row, "Total revenue", months, (_m, col) =>
    revenueRows.length === 0 ? 0 : `=${revenueRows.map((r) => `${col}${r}`).join("+")}`,
  { bold: true });
  row += 1;
  const cogsTotal = formulaRow(sheet, row, "Total cost of sales (streams)", months, (_m, col) =>
    cogsRows.length === 0 ? 0 : `=${cogsRows.map((r) => `${col}${r}`).join("+")}`,
  { bold: true });
  row += 1;
  const deferredTotal = formulaRow(sheet, row, "Deferred revenue balance", months, (_m, col) =>
    deferredRows.length === 0 ? 0 : `=${deferredRows.map((r) => `${col}${r}`).join("+")}`,
  );

  return { revenueTotal, cogsTotal, deferredTotal };
}

function kindLabel(kind: RevenueStream["kind"]): string {
  const map: Record<RevenueStream["kind"], string> = {
    subscription: "Seats × price, net of churn",
    "unit-sales": "Units × price",
    "hourly-services": "Heads × hours × utilisation × rate",
    "retail-footfall": "Traffic × conversion × ticket × trading days",
    marketplace: "GMV × take rate",
    contract: "Active contracts × monthly value",
    advertising: "Impressions × fill × CPM",
  };
  return map[kind];
}

/**
 * One stream's monthly formulas.
 *
 * The recursive models — a subscriber base that churns, a contract book that
 * ages — are written as a column referencing the column before it, which is
 * how a spreadsheet naturally expresses them and how a reader expects to audit
 * them.
 */
function writeStream(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  stream: RevenueStream,
  index: number,
  cells: DriverCells,
  months: number,
): { revenue: number; cogs: number; deferred: number | null; nextRow: number } {
  const d = (key: string) => cells.ref[`revenueStreams.${index}.${key}`] ?? "0";
  const start = d("startMonth");
  const season = (m: number) => {
    const range = cells.seasonality[stream.id];
    if (!range) return "1";
    const calendarIndex = ((cells.startCalendarMonth - 1 + (m - 1)) % 12) + 1;
    return `INDEX(${range},1,${calendarIndex})`;
  };
  /** Months since this stream started billing, floored at zero. */
  const elapsed = (m: number) => `MAX(0,${m}-${start})`;
  const live = (m: number, body: string) => `=IF(${m}<${start},0,${body})`;

  let row = startRow;
  let volumeRow = 0;
  let revenueRow = 0;
  let deferredRow: number | null = null;

  switch (stream.kind) {
    case "subscription": {
      volumeRow = formulaRow(sheet, row, "Customers", months, (m, col, prev) =>
        live(
          m,
          m === 1
            ? `${d("initialCustomers")}*(1-${d("monthlyChurnRate")})+${d("newCustomersMonth1")}`
            : `IF(${m}=${start},${d("initialCustomers")},${col === prev ? 0 : `${prev}${row}`})*(1-${d("monthlyChurnRate")})+${d("newCustomersMonth1")}*POWER(1+${d("newCustomerGrowthRate")},${elapsed(m)})`,
        ),
      { format: "#,##0", unit: "customers" });
      row += 1;
      const expansionRow = formulaRow(sheet, row, "Expansion multiplier", months, (m) =>
        live(m, `POWER(1+${d("expansionRate")},${elapsed(m)})`),
      { format: "0.000" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}*${d("pricePerCustomerPerMonth")}*${col}${expansionRow}*${season(m)}`),
      { bold: true });
      row += 1;
      deferredRow = formulaRow(sheet, row, "Deferred (prepaid terms)", months, (m, col) =>
        live(m, `IF(${d("prepaidMonths")}>1,${col}${revenueRow}*(${d("prepaidMonths")}-1),0)`),
      );
      row += 1;
      break;
    }

    case "unit-sales": {
      volumeRow = formulaRow(sheet, row, "Units", months, (m) =>
        live(m, `${d("unitsMonth1")}*POWER(1+${d("monthlyGrowthRate")},${elapsed(m)})*${season(m)}`),
      { format: "#,##0", unit: "units" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}*${d("pricePerUnit")}`),
      { bold: true });
      row += 1;
      break;
    }

    case "hourly-services": {
      const headsRow = formulaRow(sheet, row, "Billable heads", months, (m) =>
        live(m, `${d("billableHeadcount")}+${d("headcountGrowthPerMonth")}*${elapsed(m)}`),
      { format: "#,##0.0", unit: "people" });
      row += 1;
      volumeRow = formulaRow(sheet, row, "Billable hours", months, (m, col) =>
        live(m, `${col}${headsRow}*${d("hoursPerHeadPerMonth")}*${d("utilisation")}*${season(m)}`),
      { format: "#,##0", unit: "hours" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}*${d("hourlyRate")}`),
      { bold: true });
      row += 1;
      break;
    }

    case "retail-footfall": {
      volumeRow = formulaRow(sheet, row, "Transactions", months, (m) =>
        live(
          m,
          `${d("dailyTraffic")}*${d("conversionRate")}*${d("openDaysPerMonth")}*POWER(1+${d("monthlyGrowthRate")},${elapsed(m)})*${season(m)}`,
        ),
      { format: "#,##0", unit: "transactions" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}*${d("averageTicket")}`),
      { bold: true });
      row += 1;
      break;
    }

    case "marketplace": {
      volumeRow = formulaRow(sheet, row, "Gross merchandise value", months, (m) =>
        live(m, `${d("gmvMonth1")}*POWER(1+${d("monthlyGrowthRate")},${elapsed(m)})*${season(m)}`),
      { unit: "GMV" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}*${d("takeRate")}`),
      { bold: true });
      row += 1;
      break;
    }

    case "contract": {
      // The initial book runs out after the term; each month's wins add a
      // cohort that does the same. Expressed in closed form so the column does
      // not need to carry a queue.
      volumeRow = formulaRow(sheet, row, "Active contracts", months, (m) =>
        live(
          m,
          `${d("initialContracts")}*IF(${elapsed(m)}<${d("termMonths")}-1,1,0)+${d("newContractsPerMonth")}*MIN(${elapsed(m)}+1,${d("termMonths")}-1)`,
        ),
      { format: "#,##0", unit: "contracts" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}*${d("monthlyValuePerContract")}*${season(m)}`),
      { bold: true });
      row += 1;
      break;
    }

    case "advertising": {
      const impressionsRow = formulaRow(sheet, row, "Impressions", months, (m) =>
        live(m, `${d("impressionsMonth1")}*POWER(1+${d("monthlyGrowthRate")},${elapsed(m)})*${season(m)}`),
      { format: "#,##0", unit: "impressions" });
      row += 1;
      volumeRow = formulaRow(sheet, row, "Impressions sold", months, (m, col) =>
        live(m, `${col}${impressionsRow}*${d("fillRate")}`),
      { format: "#,##0" });
      row += 1;
      revenueRow = formulaRow(sheet, row, "Revenue", months, (m, col) =>
        live(m, `${col}${volumeRow}/1000*${d("cpm")}`),
      { bold: true });
      row += 1;
      break;
    }
  }

  const unitCost = stream.kind === "unit-sales" ? d("costPerUnit") : null;
  const cogsRow = formulaRow(sheet, row, "Direct cost", months, (m, col) =>
    unitCost
      ? live(m, `IF(${col}${volumeRow}*${unitCost}=0,${col}${revenueRow}*${d("cogsPercent")},${col}${volumeRow}*${unitCost})`)
      : live(m, `${col}${revenueRow}*${d("cogsPercent")}`),
  );
  row += 1;

  return { revenue: revenueRow, cogs: cogsRow, deferred: deferredRow, nextRow: row };
}

/* -------------------------------------------------------------------------- */
/* Payroll, operating costs, debt                                             */
/* -------------------------------------------------------------------------- */

type PayrollRows = { directLabour: number; opexPayroll: number; ownerComp: number };

function writePayroll(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  cells: DriverCells,
  months: number,
  labels: string[],
): PayrollRows {
  let row = 1;
  sheet.getCell(row, 1).value = "Payroll, loaded";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;
  monthHeaders(sheet, row, labels, months);
  row += 1;

  const load = `(1+${cells.ref["payroll.payrollTaxRate"]}+${cells.ref["payroll.benefitsRate"]})`;
  const roleRows: { row: number; isDirect: boolean; isOwner: boolean }[] = [];

  doc.assumptions.roles.forEach((role, i) => {
    const salary = cells.ref[`roles.${i}.annualSalary`]!;
    const count = cells.ref[`roles.${i}.count`]!;
    const start = cells.ref[`roles.${i}.startMonth`]!;
    const end = cells.ref[`roles.${i}.endMonth`]!;
    const r = formulaRow(sheet, row, `${role.title}${role.isOwner ? " (owner)" : ""}`, months, (m) =>
      `=IF(AND(${m}>=${start},${m}<=${end}),${salary}/12*${count}*${load},0)`,
    );
    roleRows.push({ row: r, isDirect: role.isDirectLabour, isOwner: role.isOwner });
    row += 1;
  });

  const sumOf = (rows: number[]) => (col: string) =>
    rows.length === 0 ? 0 : `=${rows.map((r) => `${col}${r}`).join("+")}`;

  row += 1;
  const directLabour = formulaRow(sheet, row, "Direct labour → cost of sales", months, (_m, col) =>
    sumOf(roleRows.filter((r) => r.isDirect).map((r) => r.row))(col),
  { bold: true });
  row += 1;
  const opexPayroll = formulaRow(sheet, row, "Salaries → operating expenses", months, (_m, col) =>
    sumOf(roleRows.filter((r) => !r.isDirect).map((r) => r.row))(col),
  { bold: true });
  row += 1;
  const ownerComp = formulaRow(sheet, row, "Of which owner compensation", months, (_m, col) =>
    sumOf(roleRows.filter((r) => r.isOwner).map((r) => r.row))(col),
  );

  return { directLabour, opexPayroll, ownerComp };
}

function writeOpex(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  cells: DriverCells,
  revenueRows: RevenueRows,
  payrollRows: PayrollRows,
  months: number,
  labels: string[],
): { total: number } {
  let row = 1;
  sheet.getCell(row, 1).value = "Operating costs";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;
  monthHeaders(sheet, row, labels, months);
  row += 1;

  const lineRows: number[] = [];
  doc.assumptions.opex.forEach((item, i) => {
    const start = cells.ref[`opex.${i}.startMonth`]!;
    const end = cells.ref[`opex.${i}.endMonth`]!;
    const body =
      item.percentOfRevenue !== undefined
        ? `Revenue!{COL}${revenueRows.revenueTotal}*${cells.ref[`opex.${i}.percentOfRevenue`]}`
        : `${cells.ref[`opex.${i}.monthlyAmount`]}*POWER(1+${cells.ref[`opex.${i}.annualGrowthRate`]},ROUNDDOWN(({M}-${start})/12,0))`;
    const r = formulaRow(sheet, row, item.name, months, (m, col) =>
      `=IF(AND(${m}>=${start},${m}<=${end}),${body.replace("{COL}", col).replace("{M}", String(m))},0)`,
    );
    lineRows.push(r);
    row += 1;
  });

  row += 1;
  const total = formulaRow(sheet, row, "Total operating expenses", months, (_m, col) =>
    `=${[`Payroll!${col}${payrollRows.opexPayroll}`, ...lineRows.map((r) => `${col}${r}`)].join("+")}`,
  { bold: true });

  return { total };
}

type DebtRows = { interest: number; principal: number; service: number; balance: number };

function writeDebt(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  cells: DriverCells,
  months: number,
  labels: string[],
): DebtRows {
  let row = 1;
  sheet.getCell(row, 1).value = "Debt schedule";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 1;
  sheet.getCell(row, 1).value =
    "Level payment sized on the amortising portion, so an interest-only period and a balloon both behave as the lender's own schedule does.";
  sheet.getCell(row, 1).font = { italic: true, size: 9, color: { argb: "FF5F697D" } };
  row += 2;
  monthHeaders(sheet, row, labels, months);
  row += 1;

  const interestRows: number[] = [];
  const principalRows: number[] = [];
  const balanceRows: number[] = [];

  doc.assumptions.loans.forEach((loan, i) => {
    const p = cells.ref[`loans.${i}.principal`]!;
    const rate = cells.ref[`loans.${i}.annualRate`]!;
    const term = cells.ref[`loans.${i}.termMonths`]!;
    const io = cells.ref[`loans.${i}.interestOnlyMonths`]!;
    const drawn = cells.ref[`loans.${i}.month`]!;

    heading(sheet, row, loan.name);
    row += 1;

    // Laid out explicitly rather than by arithmetic on the row number: the
    // opening balance has to reference the previous month's closing balance,
    // and an off-by-one there zeroes the schedule from month two without
    // throwing anything.
    const openingRow = row;
    const paymentRow = openingRow + 1;
    const interestRow = openingRow + 2;
    const principalRow = openingRow + 3;
    const closingRow = openingRow + 4;

    formulaRow(sheet, row, "Opening balance", months, (m, _col, prev) =>
      m === 1
        ? `=IF(${m}>=${drawn},${p},0)`
        : `=IF(${m}<${drawn},0,IF(${m}=${drawn},${p},${prev}${closingRow}))`,
    );
    row += 1;

    formulaRow(sheet, row, "Scheduled payment", months, (m) =>
      `=IF(OR(${m}<${drawn},${m}>=${drawn}+${term}),0,IF(${m}<${drawn}+${io},${openingCell(openingRow, m)}*${rate}/12,PMT(${rate}/12,${term}-${io},-${p})))`,
    );
    row += 1;

    formulaRow(sheet, row, "Interest", months, (_m, col) =>
      `=IF(${col}${openingRow}=0,0,${col}${openingRow}*${rate}/12)`,
    );
    row += 1;

    formulaRow(sheet, row, "Principal", months, (_m, col) =>
      `=MIN(MAX(${col}${paymentRow}-${col}${interestRow},0),${col}${openingRow})`,
    );
    row += 1;

    formulaRow(sheet, row, "Closing balance", months, (_m, col) =>
      `=MAX(${col}${openingRow}-${col}${principalRow},0)`,
    );
    balanceRows.push(closingRow);
    row += 2;

    interestRows.push(interestRow);
    principalRows.push(principalRow);
  });

  const join = (rows: number[]) => (col: string) =>
    rows.length === 0 ? 0 : `=${rows.map((r) => `${col}${r}`).join("+")}`;

  heading(sheet, row, "All facilities");
  row += 1;
  const interest = formulaRow(sheet, row, "Interest", months, (_m, col) => join(interestRows)(col), { bold: true });
  row += 1;
  const principal = formulaRow(sheet, row, "Principal", months, (_m, col) => join(principalRows)(col), { bold: true });
  row += 1;
  const service = formulaRow(sheet, row, "Debt service", months, (_m, col) =>
    `=${col}${interest}+${col}${principal}`,
  { bold: true });
  row += 1;
  const balance = formulaRow(sheet, row, "Outstanding balance", months, (_m, col) => join(balanceRows)(col));

  return { interest, principal, service, balance };
}

function openingCell(openingRow: number, month: number): string {
  return `${monthCol(month)}${openingRow}`;
}

/* -------------------------------------------------------------------------- */
/* The monthly model                                                          */
/* -------------------------------------------------------------------------- */

type ModelRows = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interest: number;
  pretax: number;
  tax: number;
  netIncome: number;
  ownerComp: number;
};

function writeModel(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  cells: DriverCells,
  revenueRows: RevenueRows,
  payrollRows: PayrollRows,
  opexRows: { total: number },
  debtRows: DebtRows,
  months: number,
  labels: string[],
): ModelRows {
  let row = 1;
  sheet.getCell(row, 1).value = "Monthly profit and loss";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;
  monthHeaders(sheet, row, labels, months);
  row += 1;

  const revenue = formulaRow(sheet, row, "Revenue", months, (_m, col) => `=Revenue!${col}${revenueRows.revenueTotal}`, { bold: true });
  row += 1;
  const cogs = formulaRow(sheet, row, "Cost of sales", months, (_m, col) =>
    `=Revenue!${col}${revenueRows.cogsTotal}+Payroll!${col}${payrollRows.directLabour}`,
  );
  row += 1;
  const grossProfit = formulaRow(sheet, row, "Gross profit", months, (_m, col) => `=${col}${revenue}-${col}${cogs}`, { bold: true });
  row += 1;
  const opex = formulaRow(sheet, row, "Operating expenses", months, (_m, col) =>
    `='Operating costs'!${col}${opexRows.total}`,
  );
  row += 1;
  const ebitda = formulaRow(sheet, row, "EBITDA", months, (_m, col) => `=${col}${grossProfit}-${col}${opex}`, { bold: true });
  row += 1;

  // Depreciation is the one line the workbook does not recompute: declining
  // balance needs a carrying-value queue that a single row cannot express.
  // It is carried at the engine's value and labelled as such rather than
  // approximated, because a wrong depreciation line moves every figure below.
  const depreciation = formulaRow(sheet, row, "Depreciation", months, (m) => doc.model.pnl.depreciation[m - 1] ?? 0, {
    unit: "as filed",
  });
  row += 1;
  const ebit = formulaRow(sheet, row, "Operating profit", months, (_m, col) => `=${col}${ebitda}-${col}${depreciation}`, { bold: true });
  row += 1;
  const interest = formulaRow(sheet, row, "Interest", months, (_m, col) => `=Debt!${col}${debtRows.interest}`);
  row += 1;
  const pretax = formulaRow(sheet, row, "Profit before tax", months, (_m, col) => `=${col}${ebit}-${col}${interest}`, { bold: true });
  row += 1;

  // Losses carry forward, so tax needs the running pool the engine keeps.
  const carryRow = formulaRow(sheet, row, "Loss carryforward", months, (m, col, prev) =>
    m === 1
      ? `=MAX(0,-${col}${pretax})`
      : `=MAX(0,${prev}${row}-MAX(0,${col}${pretax}))+MAX(0,-${col}${pretax})`,
  );
  row += 1;
  const tax = formulaRow(sheet, row, "Tax", months, (m, col, prev) =>
    m === 1
      ? `=MAX(0,${col}${pretax})*${cells.ref["tax.corporateRate"]}`
      : `=MAX(0,${col}${pretax}-${prev}${carryRow})*${cells.ref["tax.corporateRate"]}`,
  );
  row += 1;
  const netIncome = formulaRow(sheet, row, "Net income", months, (_m, col) => `=${col}${pretax}-${col}${tax}`, { bold: true });
  row += 1;
  const ownerComp = formulaRow(sheet, row, "Owner compensation", months, (_m, col) => `=Payroll!${col}${payrollRows.ownerComp}`);

  return { revenue, cogs, grossProfit, opex, ebitda, depreciation, ebit, interest, pretax, tax, netIncome, ownerComp };
}

/* -------------------------------------------------------------------------- */
/* Annual and ratios                                                          */
/* -------------------------------------------------------------------------- */

function writeAnnual(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  modelRows: ModelRows,
  debtRows: DebtRows,
  months: number,
): void {
  const years = doc.model.annual.length;
  sheet.getColumn(1).width = 34;
  for (let y = 1; y <= years; y++) sheet.getColumn(1 + y).width = 16;

  let row = 1;
  sheet.getCell(row, 1).value = "Annual summary and coverage";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;

  doc.model.annual.forEach((year, y) => {
    const cell = sheet.getCell(row, 2 + y);
    cell.value = year.label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
  });
  row += 1;

  const range = (y: number, modelRow: number, sheetName = "'Monthly model'") => {
    const from = monthCol(y * 12 + 1);
    const to = monthCol(Math.min((y + 1) * 12, months));
    return `SUM(${sheetName}!${from}${modelRow}:${to}${modelRow})`;
  };

  const annualRow = (label: string, modelRow: number, bold = false, sheetName?: string) => {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { bold, size: 10 };
    for (let y = 0; y < years; y++) {
      const cell = sheet.getCell(row, 2 + y);
      cell.value = { formula: `=${range(y, modelRow, sheetName)}` };
      cell.numFmt = MONEY;
      cell.font = { bold, size: 10 };
    }
    const at = row;
    row += 1;
    return at;
  };

  const revenue = annualRow("Revenue", modelRows.revenue, true);
  annualRow("Cost of sales", modelRows.cogs);
  annualRow("Gross profit", modelRows.grossProfit, true);
  annualRow("Operating expenses", modelRows.opex);
  const ebitda = annualRow("EBITDA", modelRows.ebitda, true);
  annualRow("Depreciation", modelRows.depreciation);
  annualRow("Interest", modelRows.interest);
  const tax = annualRow("Tax", modelRows.tax);
  annualRow("Net income", modelRows.netIncome, true);
  annualRow("Owner compensation", modelRows.ownerComp);
  const service = annualRow("Debt service", debtRows.service, false, "Debt");
  row += 1;

  heading(sheet, row, "Coverage", "EBITDA less cash taxes, over scheduled debt service");
  row += 1;

  sheet.getCell(row, 1).value = "Cash available for debt service";
  sheet.getCell(row, 1).font = { size: 10 };
  for (let y = 0; y < years; y++) {
    const c = colLetter(2 + y);
    const cell = sheet.getCell(row, 2 + y);
    cell.value = { formula: `=${c}${ebitda}-${c}${tax}` };
    cell.numFmt = MONEY;
  }
  const cashAvailable = row;
  row += 1;

  sheet.getCell(row, 1).value = "Debt service coverage";
  sheet.getCell(row, 1).font = { bold: true, size: 10 };
  for (let y = 0; y < years; y++) {
    const c = colLetter(2 + y);
    const cell = sheet.getCell(row, 2 + y);
    cell.value = { formula: `=IF(${c}${service}=0,"no debt",${c}${cashAvailable}/${c}${service})` };
    cell.numFmt = MULTIPLE;
    cell.font = { bold: true, size: 10 };
  }
  row += 1;

  const threshold = doc.underwriter.dscr?.threshold;
  if (threshold) {
    sheet.getCell(row, 1).value = `Threshold (${doc.underwriter.dscr?.programme})`;
    sheet.getCell(row, 1).font = { size: 10 };
    for (let y = 0; y < years; y++) {
      const cell = sheet.getCell(row, 2 + y);
      cell.value = threshold.value;
      cell.numFmt = MULTIPLE;
    }
    row += 1;
    sheet.getCell(row, 1).value = `Source: ${threshold.source.label}, in force from ${threshold.effectiveFrom} (${threshold.confidence})`;
    sheet.getCell(row, 1).font = { italic: true, size: 9, color: { argb: "FF5F697D" } };
    row += 1;
  }

  row += 1;
  sheet.getCell(row, 1).value = "Gross margin";
  for (let y = 0; y < years; y++) {
    const c = colLetter(2 + y);
    const cell = sheet.getCell(row, 2 + y);
    cell.value = { formula: `=IF(${c}${revenue}=0,0,(${c}${revenue}-${c}${revenue + 1})/${c}${revenue})` };
    cell.numFmt = RATE;
  }
}

/* -------------------------------------------------------------------------- */
/* Filed comparison                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The workbook's own tie row.
 *
 * The engine's figures as filed, and the live formulas minus them. On open the
 * variance reads zero across the horizon; if it does not, the workbook and the
 * plan disagree and this says so rather than leaving a reader to find out.
 * After an edit it becomes the more useful thing: precisely what that change
 * did to the filed plan.
 */
function writeFiled(
  sheet: ExcelJS.Worksheet,
  doc: ExportDocument,
  modelRows: ModelRows,
  months: number,
  labels: string[],
): void {
  let row = 1;
  sheet.getCell(row, 1).value = "As filed, and what has changed since";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 1;
  sheet.getCell(row, 1).value =
    "The figures the written plan was built on. Every variance row reads zero until a driver is changed.";
  sheet.getCell(row, 1).font = { italic: true, size: 9, color: { argb: "FF5F697D" } };
  row += 2;
  monthHeaders(sheet, row, labels, months);
  row += 1;

  const pairs: { label: string; filed: number[]; live: number }[] = [
    { label: "Revenue", filed: doc.model.pnl.revenue, live: modelRows.revenue },
    { label: "EBITDA", filed: doc.model.pnl.ebitda, live: modelRows.ebitda },
    { label: "Net income", filed: doc.model.pnl.netIncome, live: modelRows.netIncome },
  ];

  for (const pair of pairs) {
    heading(sheet, row, pair.label);
    row += 1;
    const filedRow = formulaRow(sheet, row, "As filed", months, (m) => pair.filed[m - 1] ?? 0);
    row += 1;
    formulaRow(sheet, row, "Live", months, (_m, col) => `='Monthly model'!${col}${pair.live}`);
    const liveRow = row;
    row += 1;
    formulaRow(sheet, row, "Variance — zero until you change a driver", months, (_m, col) =>
      `=${col}${liveRow}-${col}${filedRow}`,
    { bold: true });
    row += 2;
  }
}

/* -------------------------------------------------------------------------- */
/* Market and sources                                                         */
/* -------------------------------------------------------------------------- */

function writeMarket(sheet: ExcelJS.Worksheet, doc: ExportDocument, cells: DriverCells): void {
  sheet.getColumn(1).width = 44;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 40;

  let row = 1;
  sheet.getCell(row, 1).value = "Market, built from the ground up";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;

  if (!doc.market.sizing.complete) {
    sheet.getCell(row, 1).value =
      "No bottom-up build was recorded, so no market size is stated. An unsupported figure would be worse than none.";
    sheet.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF5F697D" } };
    row += 2;
  } else {
    const pop = cells.ref["market.populationCount"];
    const qualified = cells.ref["market.qualifiedShare"];
    const spend = cells.ref["market.annualSpendPerCustomer"];
    const servable = cells.ref["market.servableShare"];
    const target = cells.ref["market.targetShare"];

    const line = (label: string, formula: string, workings: string, bold = false, fmt = MONEY) => {
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 1).font = { bold, size: 10 };
      const cell = sheet.getCell(row, 2);
      cell.value = { formula };
      cell.numFmt = fmt;
      cell.font = { bold, size: 10 };
      sheet.getCell(row, 3).value = workings;
      sheet.getCell(row, 3).font = { size: 9, color: { argb: "FF5F697D" } };
      row += 1;
    };

    line("Population counted", `=${pop}`, doc.assumptionsMarket.populationLabel, false, "#,##0");
    line("Plausible buyers", `=${pop}*${qualified}`, "population × qualified share", false, "#,##0");
    line("Total addressable market", `=${pop}*${qualified}*${spend}`, "buyers × annual spend", true);
    line("Serviceable market", `=${pop}*${qualified}*${spend}*${servable}`, "× serviceable share", true);
    line("Obtainable market", `=${pop}*${qualified}*${spend}*${servable}*${target}`, "× target share", true);
    line("Customers implied", `=${pop}*${qualified}*${servable}*${target}`, "at the spend above", false, "#,##0");
    row += 1;
  }

  heading(sheet, row, "Competitors", "A price with no date is not evidence");
  row += 1;
  for (const header of ["Name", "Price as published", "Observed", "Where they are weak"]) {
    const cell = sheet.getCell(row, 1 + ["Name", "Price as published", "Observed", "Where they are weak"].indexOf(header));
    cell.value = header;
    cell.font = { bold: true, size: 10 };
    cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
  }
  row += 1;
  if (doc.market.competitors.length === 0) {
    sheet.getCell(row, 1).value = "None recorded.";
    sheet.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF5F697D" } };
    row += 1;
  }
  for (const competitor of doc.market.competitors) {
    sheet.getCell(row, 1).value = competitor.url
      ? { text: competitor.name, hyperlink: competitor.url }
      : competitor.name;
    sheet.getCell(row, 2).value = competitor.priceLabel || "none found";
    sheet.getCell(row, 3).value = competitor.priceDate ?? "undated";
    sheet.getCell(row, 4).value = competitor.weaknesses;
    row += 1;
  }
}

function writeSources(sheet: ExcelJS.Worksheet, doc: ExportDocument): void {
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 60;
  sheet.getColumn(3).width = 34;
  sheet.getColumn(4).width = 14;

  let row = 1;
  sheet.getCell(row, 1).value = "Sources";
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: INK } };
  row += 2;

  if (doc.citations.length === 0) {
    sheet.getCell(row, 1).value = "No sources were recorded for this plan.";
    sheet.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF5F697D" } };
    row += 2;
  }
  for (const citation of doc.citations) {
    sheet.getCell(row, 1).value = `[${citation.index}]`;
    sheet.getCell(row, 2).value = citation.claim || citation.label;
    sheet.getCell(row, 3).value = citation.url
      ? { text: citation.label, hyperlink: citation.url }
      : citation.label;
    sheet.getCell(row, 4).value = citation.sourceDate;
    row += 1;
  }

  row += 1;
  heading(sheet, row, "Methodology");
  row += 1;
  sheet.getCell(row, 2).value = `Config reviewed ${doc.methodology.configReviewed}`;
  row += 1;
  sheet.getCell(row, 2).value = `Benchmarks: ${doc.methodology.benchmarkSource}`;
  row += 1;
  for (const entry of doc.methodology.entries) {
    sheet.getCell(row, 2).value = `${entry.label}: ${entry.value}`;
    sheet.getCell(row, 3).value = `${entry.source}, from ${entry.effectiveFrom}`;
    sheet.getCell(row, 4).value = entry.confidence;
    row += 1;
  }
  row += 1;
  sheet.getCell(row, 2).value = "Still to be confirmed against a primary source:";
  sheet.getCell(row, 2).font = { bold: true, size: 10 };
  row += 1;
  for (const item of doc.methodology.verificationQueue) {
    sheet.getCell(row, 2).value = `• ${item}`;
    sheet.getCell(row, 2).font = { size: 9, color: { argb: "FF5F697D" } };
    row += 1;
  }
}

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
