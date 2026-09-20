"use client";

import { useMemo, useState } from "react";
import { CalculatorFrame, Headline, NumberInput, ResultList } from "./shell";
import { MoneyTimeSeries } from "@/components/charts/money-time-series";
import { buildAmortisation, roundScheduleForDisplay } from "@/lib/finance/loans";
import { formatCurrency, formatPercent } from "@/lib/finance/format";

/** The schedule, from the product's own `buildAmortisation`. Rounding happens
 *  here, at the edge, via roundScheduleForDisplay — never in the ledger. */
export function LoanAmortisationCalculator() {
  const [principal, setPrincipal] = useState(250_000);
  const [rate, setRate] = useState(11.5);
  const [years, setYears] = useState(10);
  const [interestOnly, setInterestOnly] = useState(0);
  const [balloonPercent, setBalloonPercent] = useState(0);

  const result = useMemo(() => {
    const termMonths = Math.max(1, Math.round(years * 12));
    const rows = buildAmortisation({
      id: "loan",
      name: "Loan",
      month: 1,
      principal: Math.max(0, principal),
      annualRate: Math.max(0, rate) / 100,
      termMonths,
      interestOnlyMonths: Math.min(Math.max(0, Math.round(interestOnly)), termMonths - 1),
      balloonPayment: (Math.max(0, principal) * Math.max(0, balloonPercent)) / 100,
    });
    const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
    const totalPaid = rows.reduce((s, r) => s + r.payment, 0);
    const amortisingRow = rows.find((r) => r.principal > 0);
    const finalRow = rows.at(-1);
    return {
      rows: roundScheduleForDisplay(rows),
      termMonths,
      totalInterest,
      totalPaid,
      levelPayment: amortisingRow?.payment ?? 0,
      interestOnlyPayment: rows[0]?.payment ?? 0,
      hasInterestOnly: Math.round(interestOnly) > 0,
      balloon: finalRow && balloonPercent > 0 ? finalRow.payment : 0,
      // The first payment's split is the number people are surprised by.
      firstPrincipalShare:
        amortisingRow && amortisingRow.payment > 0
          ? amortisingRow.principal / amortisingRow.payment
          : 0,
    };
  }, [principal, rate, years, interestOnly, balloonPercent]);

  const labels = result.rows.map((r) => {
    const month = r.month - 1;
    return `${2026 + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
  });

  return (
    <CalculatorFrame
      wide
      inputs={
        <>
          <NumberInput label="Loan amount" value={principal} onChange={setPrincipal} prefix="$" step={5_000} />
          <NumberInput label="Annual interest rate" value={rate} onChange={setRate} suffix="%" step={0.125} max={100} />
          <NumberInput label="Term" value={years} onChange={setYears} suffix="years" step={1} min={1} max={30} />
          <NumberInput
            label="Interest-only period"
            value={interestOnly}
            onChange={setInterestOnly}
            suffix="months"
            step={1}
            hint="Common on construction and start-up loans. Payments cover interest only until it ends."
          />
          <NumberInput
            label="Balloon at maturity"
            value={balloonPercent}
            onChange={setBalloonPercent}
            suffix="% of principal"
            step={5}
            max={90}
            hint="Sized against the amortising portion, so the monthly payment genuinely falls."
          />
        </>
      }
      results={
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Headline
              label={result.hasInterestOnly ? "Payment once amortising" : "Monthly payment"}
              value={formatCurrency(result.levelPayment, "USD", { decimals: 0 })}
              note={
                result.hasInterestOnly
                  ? `Interest-only payments of ${formatCurrency(result.interestOnlyPayment, "USD", {
                      decimals: 0,
                    })} for the first ${Math.round(interestOnly)} months.`
                  : `Of the first amortising payment, ${formatPercent(
                      result.firstPrincipalShare,
                    )} goes to principal.`
              }
            />
            <Headline
              label="Total interest over the term"
              value={formatCurrency(result.totalInterest, "USD", { compact: true })}
              note={`${formatCurrency(result.totalPaid, "USD", { compact: true })} paid in total on ${formatCurrency(
                principal,
                "USD",
                { compact: true },
              )} borrowed.`}
            />
          </div>

          <ResultList
            rows={[
              { label: "Payments", value: `${result.termMonths}` },
              {
                label: "Interest as a share of what you repay",
                value: formatPercent(result.totalPaid > 0 ? result.totalInterest / result.totalPaid : 0),
              },
              ...(result.balloon > 0
                ? [
                    {
                      label: "Final payment, including balloon",
                      value: formatCurrency(result.balloon, "USD", { decimals: 0 }),
                      note: "A balloon has to be refinanced or repaid. Lenders will ask how.",
                    },
                  ]
                : []),
            ]}
          />

          <div>
            <h3 className="font-display text-lg">Where each payment goes</h3>
            <div className="mt-4 rounded-lg border border-hairline bg-surface-raised p-5">
              <MoneyTimeSeries
                labels={labels}
                height={220}
                series={[
                  {
                    key: "balance",
                    label: "Balance outstanding",
                    color: "var(--series-1)",
                    values: result.rows.map((r) => r.closingBalance),
                    fill: true,
                  },
                  {
                    key: "interest",
                    label: "Interest in the month",
                    color: "var(--series-4)",
                    values: result.rows.map((r) => r.interest),
                  },
                ]}
                description="Loan balance and monthly interest across the term."
              />
            </div>
          </div>

          <div>
            <h3 className="font-display text-lg">The schedule</h3>
            <p className="mt-1.5 text-sm text-secondary">
              First and last twelve months. The product exports the whole schedule to
              Excel as live formulas.
            </p>
            <div
              className="mt-4 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Amortisation schedule, scrollable"
            >
              <table className="w-full min-w-[36rem] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-hairline text-left">
                    <th scope="col" className="py-2 pr-4 font-medium text-tertiary">Month</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium text-tertiary">Payment</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium text-tertiary">Interest</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium text-tertiary">Principal</th>
                    <th scope="col" className="py-2 text-right font-medium text-tertiary">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {condense(result.rows).map((row, i) =>
                    row === "gap" ? (
                      <tr key="gap">
                        <td colSpan={5} className="py-2 text-center text-xs text-tertiary">
                          …
                        </td>
                      </tr>
                    ) : (
                      <tr key={`${row.month}-${i}`}>
                        <th scope="row" className="numeric py-2 pr-4 text-left font-normal text-secondary">
                          {row.month}
                        </th>
                        <td className="numeric py-2 pr-4 text-right">{formatCurrency(row.payment, "USD", { decimals: 0 })}</td>
                        <td className="numeric py-2 pr-4 text-right">{formatCurrency(row.interest, "USD", { decimals: 0 })}</td>
                        <td className="numeric py-2 pr-4 text-right">{formatCurrency(row.principal, "USD", { decimals: 0 })}</td>
                        <td className="numeric py-2 text-right">{formatCurrency(row.closingBalance, "USD", { decimals: 0 })}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
    />
  );
}

type Row = ReturnType<typeof roundScheduleForDisplay>[number];

/** First twelve and last twelve, with a marker between. A 360-row table in a
 *  page is unreadable and nobody scrolls it. */
function condense(rows: Row[]): (Row | "gap")[] {
  if (rows.length <= 26) return rows;
  return [...rows.slice(0, 12), "gap" as const, ...rows.slice(-12)];
}
