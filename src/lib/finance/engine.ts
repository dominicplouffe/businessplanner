import { AssumptionsSchema, type Assumptions, type AssumptionsInput, type OpexCategory, type Staffing } from "./types";
import { projectStream, type StreamResult } from "./revenue";
import { capexByMonth, depreciationByMonth } from "./depreciation";
import { debtServiceByMonth } from "./loans";

/* ==========================================================================
   The model. Monthly for the whole horizon, with annual rollups.
   --------------------------------------------------------------------------
   The three statements are LINKED, not three independent tables:
     net income   → retained earnings and the top of the cash flow
     ΔAR/ΔAP/ΔInv → working-capital movements in operating cash flow
     capex        → PP&E, and depreciation flows back through the P&L
     loan draws / repayments → debt balance and financing cash flow
     closing cash → the balance sheet's cash line
   `checks.balanceSheetTie` asserts assets − (liabilities + equity) ≈ 0 in every
   period. If that ever breaks, the model is wrong and nothing downstream of it
   can be trusted.
   ========================================================================== */

export type MonthlyLine = number[];

export type ProfitAndLoss = {
  revenue: MonthlyLine;
  revenueByStream: { id: string; name: string; values: MonthlyLine }[];
  cogs: MonthlyLine;
  /** Cost of sales before direct labour — materials, goods and stream costs.
   *  Industry gross-margin bands are quoted on this basis (a restaurant's
   *  "food cost", a retailer's "cost of goods"), so comparing a labour-inclusive
   *  margin against them reports a false warning on every plan that flags its
   *  service staff as direct labour. */
  materialsCogs: MonthlyLine;
  /** Gross profit before direct labour, for benchmark comparison only. */
  materialsGrossProfit: MonthlyLine;
  grossProfit: MonthlyLine;
  opexByCategory: { category: OpexCategory; values: MonthlyLine }[];
  totalOpex: MonthlyLine;
  /** Owner compensation, surfaced as its own line because lenders and the E-2
   *  marginality test both read it directly. Included within payroll/opex. */
  ownerCompensation: MonthlyLine;
  ebitda: MonthlyLine;
  depreciation: MonthlyLine;
  ebit: MonthlyLine;
  interest: MonthlyLine;
  pretaxIncome: MonthlyLine;
  tax: MonthlyLine;
  netIncome: MonthlyLine;
};

export type CashFlow = {
  netIncome: MonthlyLine;
  depreciation: MonthlyLine;
  changeInReceivables: MonthlyLine;
  changeInInventory: MonthlyLine;
  changeInPayables: MonthlyLine;
  changeInDeferredRevenue: MonthlyLine;
  operating: MonthlyLine;
  capex: MonthlyLine;
  investing: MonthlyLine;
  equityRaised: MonthlyLine;
  grantsReceived: MonthlyLine;
  debtDrawn: MonthlyLine;
  debtRepaid: MonthlyLine;
  financing: MonthlyLine;
  netChange: MonthlyLine;
  openingCash: MonthlyLine;
  closingCash: MonthlyLine;
};

export type BalanceSheet = {
  cash: MonthlyLine;
  accountsReceivable: MonthlyLine;
  inventory: MonthlyLine;
  grossPPE: MonthlyLine;
  accumulatedDepreciation: MonthlyLine;
  netPPE: MonthlyLine;
  totalAssets: MonthlyLine;
  accountsPayable: MonthlyLine;
  deferredRevenue: MonthlyLine;
  debt: MonthlyLine;
  totalLiabilities: MonthlyLine;
  paidInCapital: MonthlyLine;
  retainedEarnings: MonthlyLine;
  totalEquity: MonthlyLine;
  /** assets − (liabilities + equity). Must be ~0 everywhere. */
  tie: MonthlyLine;
};

export type AnnualSummary = {
  year: number;
  label: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  totalOpex: number;
  ownerCompensation: number;
  ebitda: number;
  depreciation: number;
  interest: number;
  tax: number;
  netIncome: number;
  operatingCashFlow: number;
  closingCash: number;
  closingDebt: number;
  debtService: number;
};

export type FinancialModel = {
  assumptions: Assumptions;
  horizonMonths: number;
  /** ISO month labels, e.g. "2026-04". */
  monthLabels: string[];
  streams: StreamResult[];
  pnl: ProfitAndLoss;
  cashFlow: CashFlow;
  balanceSheet: BalanceSheet;
  annual: AnnualSummary[];
  debtService: { interest: MonthlyLine; principal: MonthlyLine };
  /** People on the payroll each month, which now varies. Read by the
   *  revenue-per-employee rule, the billable-heads rule and the public
   *  worked examples, all of which used to re-derive it from `role.count`. */
  headcount: { total: MonthlyLine; directLabour: MonthlyLine; owner: MonthlyLine };
  checks: {
    balanceSheetTie: { worstAbsolute: number; worstMonth: number; passes: boolean };
  };
};

const DAYS_PER_MONTH = 30.4375;

function zeros(n: number): number[] {
  return new Array<number>(n).fill(0);
}
function at(arr: number[], i: number): number {
  return arr[i] ?? 0;
}
function sumRange(arr: number[], from: number, count: number): number {
  let total = 0;
  for (let i = from; i < from + count && i < arr.length; i++) total += at(arr, i);
  return total;
}

export function buildModel(input: AssumptionsInput | Assumptions): FinancialModel {
  const a = AssumptionsSchema.parse(input);
  const n = a.company.horizonMonths;
  const start = new Date(`${a.company.startDate}T00:00:00Z`);
  const startCalendarMonth = start.getUTCMonth() + 1;

  const monthLabels = Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  /* ---- Revenue ---------------------------------------------------------- */
  const streams = a.revenueStreams.map((s) => projectStream(s, n, startCalendarMonth));
  const revenue = zeros(n);
  const streamCogs = zeros(n);
  const deferredTarget = zeros(n);
  for (const s of streams) {
    for (let i = 0; i < n; i++) {
      revenue[i] = at(revenue, i) + at(s.revenue, i);
      streamCogs[i] = at(streamCogs, i) + at(s.cogs, i);
      deferredTarget[i] = at(deferredTarget, i) + at(s.deferred, i);
    }
  }

  /* ---- Payroll ---------------------------------------------------------- */
  /* Computed inside the month loop, not once per role.

     It used to be hoisted, which made company payroll a step function: flat
     within each role's window, no raises, and no relationship to how much work
     there was. The reported plan grew revenue to $4.3 trillion while salaries
     stayed at $11,965 in every month of every year. A role can now derive its
     headcount from the work (`staffing`) and carry a raise, so a growing
     business costs what a growing business costs.

     Runs after revenue is summed above, so `revenue` is complete and there is
     no circularity — a staffing rule reads the month's revenue, and a revenue
     stream never reads payroll. */
  /* The load, split so the wage base can bite.

     It used to be a single `1 + payrollTaxRate + benefitsRate` applied to
     every dollar of wage, which charges the 6.2% OASDI half on salaries far
     above the base — roughly $7k a year of employer tax nobody owes, on every
     high earner. `FICA_WAGE_BASE` was configured, named in the project's own
     rules, and read by nothing.

     Medicare and benefits stay uncapped; only `cappedTaxRate` stops, and it
     stops per employee per *calendar* year, which is why the accumulator
     below is keyed on the calendar and not on the model's own year one. */
  const uncappedRate =
    1 + Math.max(0, a.payroll.payrollTaxRate - a.payroll.cappedTaxRate) + a.payroll.benefitsRate;
  const cappedRate = Math.min(a.payroll.cappedTaxRate, a.payroll.payrollTaxRate);
  const wageBase = a.payroll.taxableWageBase;
  const directLabour = zeros(n);
  const payrollOpex = zeros(n);
  const ownerCompensation = zeros(n);
  const headcountTotal = zeros(n);
  const headcountDirect = zeros(n);
  const headcountOwner = zeros(n);

  /** What a staffing rule measures the work in, for a given month index. */
  const workAt = (rule: Staffing, i: number): number => {
    if (i < 0) return 0;
    if (rule.driver === "revenue") return at(revenue, i);
    const stream = streams.find((s) => s.id === rule.streamId);
    if (!stream) {
      // Returning 0 would pin headcount at the floor and read as a deliberate
      // plan to hire nobody. A staffing rule naming a stream that does not
      // exist is a wiring error, and it should say so.
      throw new Error(
        `Role staffing references stream "${rule.streamId}", which this plan does not have. ` +
          `Available: ${streams.map((s) => s.id).join(", ") || "none"}.`,
      );
    }
    return rule.driver === "billable-heads"
      ? at(stream.billableHeads ?? [], i)
      : at(stream.volume, i);
  };

  for (const role of a.roles) {
    const raise = role.annualRaiseRate ?? a.payroll.annualSalaryInflation;
    const last = role.endMonth ?? n;
    let ratchet = 0;
    /* Wages paid to one head of this role so far in the calendar year. Heads
       within a role are identical earners, so one accumulator serves them
       all; it resets in January, which is when the wage base does. */
    let ytdWagePerHead = 0;
    let ytdCalendarYear = -1;

    for (let m = role.startMonth; m <= Math.min(last, n); m++) {
      const i = m - 1;

      let heads = role.count;
      if (role.staffing) {
        const rule = role.staffing;
        // Read the month whose work justifies the hire, so a ramp does not pay
        // for capacity before the work that needs it arrives.
        const work = workAt(rule, i - rule.hireLagMonths);
        // Rounded *up*: you cannot serve 1.4 people's worth of demand with one
        // person, and rounding up is the conservative direction in a document
        // a lender reads.
        const needed = Math.ceil(work / rule.perHead / rule.stepSize) * rule.stepSize;
        // The floor is applied first and the ceiling last, so a rule whose
        // floor sits above its ceiling cannot quietly exceed the maximum the
        // plan states. The mapper cannot produce that pair, but a hand-built
        // one could, and "never more than eight" has to mean it.
        heads = Math.min(Math.max(needed, rule.minCount), rule.maxCount ?? Infinity);
        if (rule.ratchet) heads = ratchet = Math.max(ratchet, heads);
      }

      // Indexed from the role's own start, mirroring the opex inflator, so a
      // role's first twelve months sit at the salary it was offered.
      const yearsElapsed = Math.floor((m - role.startMonth) / 12);
      const wagePerHead = (role.annualSalary / 12) * Math.pow(1 + raise, yearsElapsed);

      // Calendar year of this model month, so the wage base resets in January.
      const calendarYear = Math.floor((startCalendarMonth - 1 + (m - 1)) / 12);
      if (calendarYear !== ytdCalendarYear) {
        ytdCalendarYear = calendarYear;
        ytdWagePerHead = 0;
      }
      const taxableThisMonth = Math.max(0, Math.min(wagePerHead, wageBase - ytdWagePerHead));
      ytdWagePerHead += wagePerHead;

      const monthlyLoaded =
        (wagePerHead * uncappedRate + taxableThisMonth * cappedRate) * heads;

      if (role.isDirectLabour) directLabour[i] = at(directLabour, i) + monthlyLoaded;
      else payrollOpex[i] = at(payrollOpex, i) + monthlyLoaded;
      if (role.isOwner) ownerCompensation[i] = at(ownerCompensation, i) + monthlyLoaded;

      headcountTotal[i] = at(headcountTotal, i) + heads;
      if (role.isDirectLabour) headcountDirect[i] = at(headcountDirect, i) + heads;
      if (role.isOwner) headcountOwner[i] = at(headcountOwner, i) + heads;
    }
  }

  const cogs = zeros(n);
  // Materials-only cost of sales is kept alongside the full figure: the
  // statements need labour in cost of sales, and the benchmark comparison
  // needs it out, because the published bands are quoted without it.
  const materialsCogs = zeros(n);
  const materialsGrossProfit = zeros(n);
  for (let i = 0; i < n; i++) {
    cogs[i] = at(streamCogs, i) + at(directLabour, i);
    materialsCogs[i] = at(streamCogs, i);
    materialsGrossProfit[i] = at(revenue, i) - at(streamCogs, i);
  }

  /* ---- Operating expenses ---------------------------------------------- */
  const categories = new Map<OpexCategory, number[]>();
  const addOpex = (cat: OpexCategory, i: number, amount: number) => {
    const line = categories.get(cat) ?? zeros(n);
    line[i] = at(line, i) + amount;
    categories.set(cat, line);
  };

  for (let i = 0; i < n; i++) if (at(payrollOpex, i) > 0) addOpex("salaries", i, at(payrollOpex, i));

  for (const item of a.opex) {
    const last = item.endMonth ?? n;
    for (let m = item.startMonth; m <= Math.min(last, n); m++) {
      const i = m - 1;
      const yearsElapsed = Math.floor((m - item.startMonth) / 12);
      const inflator = Math.pow(1 + item.annualGrowthRate, yearsElapsed);
      const amount =
        item.percentOfRevenue !== undefined
          ? at(revenue, i) * item.percentOfRevenue
          : item.monthlyAmount * inflator;
      addOpex(item.category, i, amount);
    }
  }

  const opexByCategory = [...categories.entries()].map(([category, values]) => ({ category, values }));
  const totalOpex = zeros(n);
  for (const { values } of opexByCategory) {
    for (let i = 0; i < n; i++) totalOpex[i] = at(totalOpex, i) + at(values, i);
  }

  /* ---- Depreciation, capex, debt ---------------------------------------- */
  const depreciation = depreciationByMonth(a.capex, n);
  const capexOut = capexByMonth(a.capex, n);
  const debt = debtServiceByMonth(a.loans, n);

  /* ---- P&L -------------------------------------------------------------- */
  const grossProfit = zeros(n);
  const ebitda = zeros(n);
  const ebit = zeros(n);
  const pretaxIncome = zeros(n);
  const tax = zeros(n);
  const netIncome = zeros(n);
  let lossCarryforward = 0;

  for (let i = 0; i < n; i++) {
    grossProfit[i] = at(revenue, i) - at(cogs, i);
    ebitda[i] = at(grossProfit, i) - at(totalOpex, i);
    ebit[i] = at(ebitda, i) - at(depreciation, i);
    pretaxIncome[i] = at(ebit, i) - at(debt.interest, i);

    // Tax is charged on positive income only; losses carry forward when enabled.
    const pre = at(pretaxIncome, i);
    if (pre <= 0) {
      tax[i] = 0;
      if (a.tax.lossCarryforward) lossCarryforward += -pre;
    } else {
      const offset = a.tax.lossCarryforward ? Math.min(lossCarryforward, pre) : 0;
      lossCarryforward -= offset;
      tax[i] = (pre - offset) * a.tax.corporateRate;
    }
    netIncome[i] = pre - at(tax, i);
  }

  /* ---- Working capital -------------------------------------------------- */
  const arBalance = zeros(n);
  const apBalance = zeros(n);
  const invBalance = zeros(n);
  const deferredBalance = zeros(n);
  const hasInventory = a.revenueStreams.some((s) => s.kind === "unit-sales" || s.kind === "retail-footfall");

  for (let i = 0; i < n; i++) {
    const dailyRevenue = at(revenue, i) / DAYS_PER_MONTH;
    const dailyCosts = (at(cogs, i) + at(totalOpex, i)) / DAYS_PER_MONTH;
    const dailyCogs = at(cogs, i) / DAYS_PER_MONTH;
    arBalance[i] = dailyRevenue * a.workingCapital.receivableDays;
    apBalance[i] = dailyCosts * a.workingCapital.payableDays;
    invBalance[i] = hasInventory ? dailyCogs * a.workingCapital.inventoryDays : 0;
    deferredBalance[i] = at(deferredTarget, i);
  }

  /* ---- Cash flow -------------------------------------------------------- */
  const changeInReceivables = zeros(n);
  const changeInInventory = zeros(n);
  const changeInPayables = zeros(n);
  const changeInDeferredRevenue = zeros(n);
  const operating = zeros(n);
  const investing = zeros(n);
  const equityRaised = zeros(n);
  const grantsReceived = zeros(n);
  const financing = zeros(n);
  const netChange = zeros(n);
  const openingCash = zeros(n);
  const closingCash = zeros(n);

  for (const r of a.equityRounds) {
    if (r.month >= 1 && r.month <= n) equityRaised[r.month - 1] = at(equityRaised, r.month - 1) + r.amount;
  }
  for (const g of a.grants) {
    if (g.month >= 1 && g.month <= n) grantsReceived[g.month - 1] = at(grantsReceived, g.month - 1) + g.amount;
  }

  let cash = a.opening.cash;
  for (let i = 0; i < n; i++) {
    const prevAR = i === 0 ? a.opening.accountsReceivable : at(arBalance, i - 1);
    const prevAP = i === 0 ? a.opening.accountsPayable : at(apBalance, i - 1);
    const prevInv = i === 0 ? a.opening.inventory : at(invBalance, i - 1);
    const prevDef = i === 0 ? a.opening.deferredRevenue : at(deferredBalance, i - 1);

    // An increase in an asset consumes cash; an increase in a liability releases it.
    changeInReceivables[i] = -(at(arBalance, i) - prevAR);
    changeInInventory[i] = -(at(invBalance, i) - prevInv);
    changeInPayables[i] = at(apBalance, i) - prevAP;
    changeInDeferredRevenue[i] = at(deferredBalance, i) - prevDef;

    operating[i] =
      at(netIncome, i) +
      at(depreciation, i) +
      at(changeInReceivables, i) +
      at(changeInInventory, i) +
      at(changeInPayables, i) +
      at(changeInDeferredRevenue, i);

    investing[i] = -at(capexOut, i);
    financing[i] =
      at(equityRaised, i) + at(grantsReceived, i) + at(debt.drawdown, i) - at(debt.principal, i);

    netChange[i] = at(operating, i) + at(investing, i) + at(financing, i);
    openingCash[i] = cash;
    cash += at(netChange, i);
    closingCash[i] = cash;
  }

  /* ---- Balance sheet ---------------------------------------------------- */
  const grossPPE = zeros(n);
  const accumulatedDepreciation = zeros(n);
  const netPPE = zeros(n);
  const totalAssets = zeros(n);
  const debtBalance = zeros(n);
  const totalLiabilities = zeros(n);
  const paidInCapital = zeros(n);
  const retainedEarnings = zeros(n);
  const totalEquity = zeros(n);
  const tie = zeros(n);

  let ppe = a.opening.grossPPE;
  let accDep = a.opening.accumulatedDepreciation;
  let pic = a.opening.paidInCapital;
  let re = a.opening.retainedEarnings;
  let outstandingDebt = a.opening.debt;

  for (let i = 0; i < n; i++) {
    ppe += at(capexOut, i);
    accDep += at(depreciation, i);
    // Grants are treated as contributed capital rather than income: they are not
    // earned revenue, and running them through the P&L would flatter EBITDA.
    pic += at(equityRaised, i) + at(grantsReceived, i);
    re += at(netIncome, i);
    outstandingDebt += at(debt.drawdown, i) - at(debt.principal, i);

    grossPPE[i] = ppe;
    accumulatedDepreciation[i] = accDep;
    netPPE[i] = ppe - accDep;
    // Deliberately NOT clamped at zero. A clamp here would silently absorb any
    // inconsistency between the amortisation schedule and the cash flow, which
    // is exactly the class of bug the balance-sheet tie exists to catch.
    debtBalance[i] = outstandingDebt;
    paidInCapital[i] = pic;
    retainedEarnings[i] = re;

    totalAssets[i] = at(closingCash, i) + at(arBalance, i) + at(invBalance, i) + at(netPPE, i);
    totalLiabilities[i] = at(apBalance, i) + at(deferredBalance, i) + at(debtBalance, i);
    totalEquity[i] = at(paidInCapital, i) + at(retainedEarnings, i);
    tie[i] = at(totalAssets, i) - (at(totalLiabilities, i) + at(totalEquity, i));
  }

  let worstAbsolute = 0;
  let worstMonth = 1;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(at(tie, i));
    if (d > worstAbsolute) {
      worstAbsolute = d;
      worstMonth = i + 1;
    }
  }

  /* ---- Annual rollups --------------------------------------------------- */
  const years = Math.ceil(n / 12);
  const annual: AnnualSummary[] = [];
  for (let y = 0; y < years; y++) {
    const from = y * 12;
    const count = Math.min(12, n - from);
    const lastIdx = from + count - 1;
    annual.push({
      year: y + 1,
      label: `Year ${y + 1}`,
      revenue: sumRange(revenue, from, count),
      cogs: sumRange(cogs, from, count),
      grossProfit: sumRange(grossProfit, from, count),
      totalOpex: sumRange(totalOpex, from, count),
      ownerCompensation: sumRange(ownerCompensation, from, count),
      ebitda: sumRange(ebitda, from, count),
      depreciation: sumRange(depreciation, from, count),
      interest: sumRange(debt.interest, from, count),
      tax: sumRange(tax, from, count),
      netIncome: sumRange(netIncome, from, count),
      operatingCashFlow: sumRange(operating, from, count),
      closingCash: at(closingCash, lastIdx),
      closingDebt: at(debtBalance, lastIdx),
      debtService: sumRange(debt.interest, from, count) + sumRange(debt.principal, from, count),
    });
  }

  return {
    assumptions: a,
    horizonMonths: n,
    monthLabels,
    streams,
    pnl: {
      revenue,
      revenueByStream: streams.map((s) => ({ id: s.id, name: s.name, values: s.revenue })),
      cogs,
      materialsCogs,
      materialsGrossProfit,
      grossProfit,
      opexByCategory,
      totalOpex,
      ownerCompensation,
      ebitda,
      depreciation,
      ebit,
      interest: debt.interest,
      pretaxIncome,
      tax,
      netIncome,
    },
    cashFlow: {
      netIncome,
      depreciation,
      changeInReceivables,
      changeInInventory,
      changeInPayables,
      changeInDeferredRevenue,
      operating,
      capex: capexOut,
      investing,
      equityRaised,
      grantsReceived,
      debtDrawn: debt.drawdown,
      debtRepaid: debt.principal,
      financing,
      netChange,
      openingCash,
      closingCash,
    },
    balanceSheet: {
      cash: closingCash,
      accountsReceivable: arBalance,
      inventory: invBalance,
      grossPPE,
      accumulatedDepreciation,
      netPPE,
      totalAssets,
      accountsPayable: apBalance,
      deferredRevenue: deferredBalance,
      debt: debtBalance,
      totalLiabilities,
      paidInCapital,
      retainedEarnings,
      totalEquity,
      tie,
    },
    annual,
    debtService: { interest: debt.interest, principal: debt.principal },
    headcount: {
      total: headcountTotal,
      directLabour: headcountDirect,
      owner: headcountOwner,
    },
    checks: {
      balanceSheetTie: {
        worstAbsolute,
        worstMonth,
        // One cent per period of accumulated float is the tolerance.
        passes: worstAbsolute < Math.max(0.01 * n, 1),
      },
    },
  };
}
