import type { Loan } from "./types";

export type AmortisationRow = {
  /** 1-based month of the model horizon. */
  month: number;
  openingBalance: number;
  payment: number;
  interest: number;
  principal: number;
  closingBalance: number;
};

/**
 * Level payment for a fully amortising loan (the spreadsheet PMT function).
 *
 *   payment = P · r / (1 − (1 + r)^−n)
 *
 * where r is the periodic rate and n the number of payments. With r = 0 the
 * expression is indeterminate, so it degrades to straight-line repayment.
 */
export function levelPayment(principal: number, periodicRate: number, periods: number): number {
  if (periods <= 0) return 0;
  if (periodicRate === 0) return principal / periods;
  return (principal * periodicRate) / (1 - Math.pow(1 + periodicRate, -periods));
}

/**
 * Builds a month-by-month amortisation schedule, honouring an interest-only
 * period and a balloon at maturity.
 *
 * The amortising payment is sized against the portion of principal that is
 * actually amortised (principal less balloon) over the remaining term, so a
 * balloon loan carries a genuinely lower monthly payment — which is the whole
 * reason borrowers use one, and getting it wrong understates DSCR.
 */
export function buildAmortisation(loan: Loan): AmortisationRow[] {
  const rows: AmortisationRow[] = [];
  const r = loan.annualRate / 12;
  const amortisingMonths = loan.termMonths - loan.interestOnlyMonths;
  const balloon = Math.min(loan.balloonPayment, loan.principal);
  const amortisingPrincipal = loan.principal - balloon;
  const payment =
    amortisingMonths > 0 ? levelPayment(amortisingPrincipal, r, amortisingMonths) : 0;

  let balance = loan.principal;

  for (let i = 0; i < loan.termMonths; i++) {
    const month = loan.month + i;
    const opening = balance;
    const interest = opening * r;
    const isInterestOnly = i < loan.interestOnlyMonths;
    const isFinal = i === loan.termMonths - 1;

    let principalPortion: number;
    let cashPayment: number;

    if (isInterestOnly) {
      principalPortion = 0;
      cashPayment = interest;
    } else {
      principalPortion = Math.min(payment - interest, opening);
      cashPayment = interest + principalPortion;
    }

    // Whatever remains at maturity is repaid, balloon or rounding alike.
    if (isFinal) {
      const remaining = opening - principalPortion;
      principalPortion += remaining;
      cashPayment += remaining;
    }

    balance = opening - principalPortion;

    rows.push({
      month,
      openingBalance: opening,
      payment: cashPayment,
      interest,
      principal: principalPortion,
      closingBalance: Math.max(0, balance),
    });
  }

  return rows;
}

/** Total scheduled debt service across all loans, indexed by month (1-based). */
export function debtServiceByMonth(
  loans: Loan[],
  horizonMonths: number,
): { interest: number[]; principal: number[]; balance: number[]; drawdown: number[] } {
  const interest = new Array<number>(horizonMonths).fill(0);
  const principal = new Array<number>(horizonMonths).fill(0);
  const balance = new Array<number>(horizonMonths).fill(0);
  const drawdown = new Array<number>(horizonMonths).fill(0);

  for (const loan of loans) {
    if (loan.month >= 1 && loan.month <= horizonMonths) {
      drawdown[loan.month - 1] = (drawdown[loan.month - 1] ?? 0) + loan.principal;
    }
    for (const row of buildAmortisation(loan)) {
      if (row.month < 1 || row.month > horizonMonths) continue;
      const i = row.month - 1;
      interest[i] = (interest[i] ?? 0) + row.interest;
      principal[i] = (principal[i] ?? 0) + row.principal;
    }
  }

  // Closing balance carried forward: opening debt is added by the engine.
  let running = 0;
  for (let i = 0; i < horizonMonths; i++) {
    running += (drawdown[i] ?? 0) - (principal[i] ?? 0);
    balance[i] = running;
  }

  return { interest, principal, balance, drawdown };
}

/**
 * Rounds a schedule for display only.
 *
 * The schedule itself is kept at full precision on purpose: rounding each row
 * to cents made the sum of principal repayments differ from the amount drawn by
 * a cent or two, which then showed up as a balance-sheet break. Round at the
 * edge, never in the ledger.
 */
export function roundScheduleForDisplay(rows: AmortisationRow[]): AmortisationRow[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return rows.map((row) => ({
    month: row.month,
    openingBalance: r2(row.openingBalance),
    payment: r2(row.payment),
    interest: r2(row.interest),
    principal: r2(row.principal),
    closingBalance: r2(row.closingBalance),
  }));
}
