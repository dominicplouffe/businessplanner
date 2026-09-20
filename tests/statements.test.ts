import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/finance/engine";
import {
  buildBalanceSheet,
  buildCashFlow,
  buildProfitAndLoss,
  buildStatements,
  summariseScheduleByYear,
  MONTHLY_COLUMN_COUNT,
  type StatementRow,
} from "@/lib/finance/statements";
import { buildAmortisation, roundScheduleForDisplay } from "@/lib/finance/loans";
import { formatMonthLabel } from "@/lib/finance/format";
import { restaurantPlan, saasPlan } from "./fixtures";

const row = (rows: StatementRow[], key: string): StatementRow => {
  const found = rows.find((r) => r.key === key);
  if (!found) throw new Error(`No row "${key}"`);
  return found;
};

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

describe("statement shaping — columns", () => {
  it("gives one annual column per model year and twelve monthly", () => {
    const model = buildModel(saasPlan);
    for (const table of buildStatements(model, "annual")) {
      expect(table.columns).toHaveLength(model.annual.length);
      for (const r of table.rows) expect(r.values).toHaveLength(model.annual.length);
    }
    for (const table of buildStatements(model, "monthly")) {
      expect(table.columns).toHaveLength(MONTHLY_COLUMN_COUNT);
      for (const r of table.rows) expect(r.values).toHaveLength(MONTHLY_COLUMN_COUNT);
    }
  });

  it("labels annual columns from the model's own year labels", () => {
    const model = buildModel(restaurantPlan);
    expect(buildProfitAndLoss(model, "annual").columns).toEqual(model.annual.map((y) => y.label));
    expect(buildProfitAndLoss(model, "monthly").columns).toEqual(
      model.monthLabels.slice(0, MONTHLY_COLUMN_COUNT).map(formatMonthLabel),
    );
    expect(buildProfitAndLoss(model, "monthly").columns[0]).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
  });
});

describe("statement shaping — flows versus stocks", () => {
  it("sums flows across the year", () => {
    const model = buildModel(saasPlan);
    const rows = buildProfitAndLoss(model, "annual").rows;
    model.annual.forEach((year, i) => {
      expect(row(rows, "revenue").values[i]).toBeCloseTo(year.revenue, 6);
      expect(row(rows, "ebitda").values[i]).toBeCloseTo(year.ebitda, 6);
      expect(row(rows, "net-income").values[i]).toBeCloseTo(year.netIncome, 6);
    });
  });

  it("takes the closing value for stocks, not the sum", () => {
    const model = buildModel(restaurantPlan);
    const bs = buildBalanceSheet(model, "annual").rows;
    model.annual.forEach((year, i) => {
      const closingMonth = (i + 1) * 12 - 1;
      expect(row(bs, "cash").values[i]).toBeCloseTo(model.balanceSheet.cash[closingMonth]!, 6);
      expect(row(bs, "debt").values[i]).toBeCloseTo(model.balanceSheet.debt[closingMonth]!, 6);
      // Same figure the engine reports for the year, reached independently.
      expect(row(bs, "cash").values[i]).toBeCloseTo(year.closingCash, 6);
      expect(row(bs, "debt").values[i]).toBeCloseTo(year.closingDebt, 6);
    });
  });

  it("agrees between the cash-flow closing cash and the balance-sheet cash", () => {
    for (const plan of [saasPlan, restaurantPlan]) {
      const model = buildModel(plan);
      for (const granularity of ["annual", "monthly"] as const) {
        const cf = row(buildCashFlow(model, granularity).rows, "closing-cash").values;
        const bs = row(buildBalanceSheet(model, granularity).rows, "cash").values;
        cf.forEach((value, i) => expect(value).toBeCloseTo(bs[i]!, 6));
      }
    }
  });

  it("does not sum a stock: closing cash is never the year's total of itself", () => {
    const model = buildModel(saasPlan);
    const annual = row(buildCashFlow(model, "annual").rows, "closing-cash").values;
    const summed = sum(model.cashFlow.closingCash.slice(0, 12));
    // A stock summed like a flow would be roughly twelve times too large; this
    // is the bug the flow/stock split exists to prevent.
    expect(annual[0]).not.toBeCloseTo(summed, 2);
    expect(annual[0]).toBeCloseTo(model.cashFlow.closingCash[11]!, 6);
  });
});

describe("statement shaping — presentation", () => {
  it("flips expense signs exactly once", () => {
    const model = buildModel(restaurantPlan);
    const rows = buildProfitAndLoss(model, "annual").rows;
    model.annual.forEach((year, i) => {
      expect(row(rows, "cogs").values[i]).toBeCloseTo(-year.cogs, 6);
      expect(row(rows, "total-opex").values[i]).toBeCloseTo(-year.totalOpex, 6);
      expect(row(rows, "depreciation").values[i]).toBeCloseTo(-year.depreciation, 6);
      expect(row(rows, "interest").values[i]).toBeCloseTo(-year.interest, 6);
      expect(row(rows, "tax").values[i]).toBeCloseTo(-year.tax, 6);
    });
  });

  it("keeps owner compensation positive, because it is disclosed not deducted twice", () => {
    const model = buildModel(restaurantPlan);
    const rows = buildProfitAndLoss(model, "annual").rows;
    model.annual.forEach((year, i) => {
      expect(row(rows, "owner-comp").values[i]).toBeCloseTo(year.ownerCompensation, 6);
      expect(row(rows, "owner-comp").values[i]).toBeGreaterThan(0);
    });
  });

  it("carries a tie row that reads zero in every period of every granularity", () => {
    for (const plan of [saasPlan, restaurantPlan]) {
      const model = buildModel(plan);
      for (const granularity of ["annual", "monthly"] as const) {
        const tie = row(buildBalanceSheet(model, granularity).rows, "tie");
        expect(tie.kind).toBe("check");
        for (const value of tie.values) expect(Math.abs(value)).toBeLessThan(0.01);
      }
    }
  });

  it("names a subtotal or total for every aggregate a reader looks for", () => {
    const model = buildModel(saasPlan);
    const [pnl, cashFlow, balanceSheet] = buildStatements(model, "annual");
    const emphasised = (rows: StatementRow[]) =>
      rows.filter((r) => r.kind === "subtotal" || r.kind === "total").map((r) => r.key);

    expect(emphasised(pnl!.rows)).toEqual(
      expect.arrayContaining(["revenue", "gross-profit", "ebitda", "ebit", "net-income"]),
    );
    expect(emphasised(cashFlow!.rows)).toEqual(
      expect.arrayContaining(["operating", "investing", "financing", "closing-cash"]),
    );
    expect(emphasised(balanceSheet!.rows)).toEqual(
      expect.arrayContaining(["total-assets", "total-liabilities", "total-equity"]),
    );
  });
});

describe("summariseScheduleByYear", () => {
  const model = buildModel(restaurantPlan);
  // Taken from the parsed model, not the fixture: the raw input omits the
  // schema's defaults, and buildAmortisation needs them.
  const loan = model.assumptions.loans[0]!;
  const schedule = buildAmortisation(loan);

  it("keeps the whole term, including the years past the model horizon", () => {
    const years = summariseScheduleByYear(schedule, model);
    expect(years).toHaveLength(Math.ceil(loan.termMonths / 12));
    // A twenty-year term outlives a five-year projection; hiding the tail would
    // understate the obligation.
    expect(years.length).toBeGreaterThan(model.annual.length);
    expect(years[0]!.label).toBe(model.annual[0]!.label);
    expect(years.at(-1)!.label).toMatch(/^Year \d+$/);
  });

  it("sums interest and principal but takes balances from the year's edges", () => {
    const years = summariseScheduleByYear(schedule, model);
    const firstYear = schedule.slice(0, 12);
    expect(years[0]!.interest).toBeCloseTo(sum(firstYear.map((r) => r.interest)), 6);
    expect(years[0]!.principal).toBeCloseTo(sum(firstYear.map((r) => r.principal)), 6);
    expect(years[0]!.openingBalance).toBeCloseTo(firstYear[0]!.openingBalance, 6);
    expect(years[0]!.closingBalance).toBeCloseTo(firstYear[11]!.closingBalance, 6);
  });

  it("repays exactly the principal drawn across the whole schedule", () => {
    const years = summariseScheduleByYear(schedule, model);
    expect(sum(years.map((y) => y.principal))).toBeCloseTo(loan.principal, 6);
    expect(years.at(-1)!.closingBalance).toBeCloseTo(0, 6);
  });

  it("works on a display-rounded schedule without changing which year is which", () => {
    const years = summariseScheduleByYear(roundScheduleForDisplay(schedule), model);
    expect(years).toHaveLength(Math.ceil(loan.termMonths / 12));
    expect(sum(years.map((y) => y.principal))).toBeCloseTo(loan.principal, 0);
  });

  it("returns nothing for an empty schedule", () => {
    expect(summariseScheduleByYear([], model)).toEqual([]);
  });
});
