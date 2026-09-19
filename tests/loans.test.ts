import { describe, expect, it } from "vitest";
import { buildAmortisation, levelPayment, debtServiceByMonth } from "@/lib/finance/loans";

describe("levelPayment", () => {
  // Textbook PMT check: $200,000 at 6% nominal over 30 years = $1,199.10/month.
  it("matches the standard PMT result for a 30-year mortgage", () => {
    expect(levelPayment(200_000, 0.06 / 12, 360)).toBeCloseTo(1199.1011, 3);
  });

  // $25,000 at 7.5% over 60 months = $500.9487/month.
  it("matches the standard PMT result for a 5-year term loan", () => {
    expect(levelPayment(25_000, 0.075 / 12, 60)).toBeCloseTo(500.9487, 3);
  });

  it("degrades to straight-line repayment at a zero rate", () => {
    expect(levelPayment(12_000, 0, 12)).toBeCloseTo(1_000, 10);
  });

  it("returns zero for a non-positive term", () => {
    expect(levelPayment(10_000, 0.01, 0)).toBe(0);
  });
});

const loan = (over: Partial<Parameters<typeof buildAmortisation>[0]> = {}) => ({
  id: "l",
  name: "Loan",
  month: 1,
  principal: 250_000,
  annualRate: 0.115,
  termMonths: 120,
  interestOnlyMonths: 0,
  balloonPayment: 0,
  ...over,
});

describe("buildAmortisation", () => {
  it("repays exactly the principal drawn — no more, no less", () => {
    const rows = buildAmortisation(loan());
    const total = rows.reduce((s, r) => s + r.principal, 0);
    expect(total).toBeCloseTo(250_000, 6);
    expect(rows.at(-1)?.closingBalance).toBeCloseTo(0, 6);
  });

  it("charges interest on the opening balance each month", () => {
    const rows = buildAmortisation(loan());
    const first = rows[0]!;
    expect(first.interest).toBeCloseTo((250_000 * 0.115) / 12, 6);
  });

  it("shifts the interest/principal split toward principal over time", () => {
    const rows = buildAmortisation(loan());
    expect(rows[0]!.principal).toBeLessThan(rows.at(-1)!.principal);
    expect(rows[0]!.interest).toBeGreaterThan(rows.at(-1)!.interest);
  });

  it("pays no principal during an interest-only period", () => {
    const rows = buildAmortisation(loan({ interestOnlyMonths: 6 }));
    for (let i = 0; i < 6; i++) expect(rows[i]!.principal).toBe(0);
    expect(rows[6]!.principal).toBeGreaterThan(0);
    // Still fully repaid by maturity.
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBeCloseTo(250_000, 6);
  });

  it("lowers the monthly payment when a balloon is due at maturity", () => {
    const level = buildAmortisation(loan());
    const withBalloon = buildAmortisation(loan({ balloonPayment: 80_000 }));
    expect(withBalloon[0]!.payment).toBeLessThan(level[0]!.payment);
    // And still repays the whole principal, balloon included.
    expect(withBalloon.reduce((s, r) => s + r.principal, 0)).toBeCloseTo(250_000, 6);
    // The final instalment carries the balloon.
    expect(withBalloon.at(-1)!.principal).toBeGreaterThan(withBalloon.at(-2)!.principal * 5);
  });

  it("handles a zero-rate loan", () => {
    const rows = buildAmortisation(loan({ annualRate: 0, termMonths: 10, principal: 10_000 }));
    expect(rows.every((r) => r.interest === 0)).toBe(true);
    expect(rows.reduce((s, r) => s + r.principal, 0)).toBeCloseTo(10_000, 6);
  });
});

describe("debtServiceByMonth", () => {
  it("aggregates several loans and tracks the combined balance", () => {
    const result = debtServiceByMonth(
      [
        loan({ id: "a", principal: 100_000, termMonths: 24, annualRate: 0.1 }),
        loan({ id: "b", principal: 50_000, month: 7, termMonths: 24, annualRate: 0.08 }),
      ],
      36,
    );
    expect(result.drawdown[0]).toBeCloseTo(100_000, 6);
    expect(result.drawdown[6]).toBeCloseTo(50_000, 6);
    // Both loans mature inside the horizon, so the balance returns to zero.
    expect(result.balance.at(-1)).toBeCloseTo(0, 6);
    expect(result.principal.reduce((s, v) => s + v, 0)).toBeCloseTo(150_000, 6);
  });

  it("ignores schedule rows beyond the model horizon", () => {
    const result = debtServiceByMonth([loan({ termMonths: 120 })], 12);
    expect(result.interest).toHaveLength(12);
    // A 10-year loan is nowhere near repaid after one year.
    expect(result.balance.at(-1)).toBeGreaterThan(230_000);
  });
});
