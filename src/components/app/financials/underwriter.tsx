"use client";

import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import type { FinancialModel } from "@/lib/finance/engine";
import type { Metrics } from "@/lib/finance/metrics";
import { buildAmortisation, roundScheduleForDisplay } from "@/lib/finance/loans";
import { summariseScheduleByYear } from "@/lib/finance/statements";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import {
  dscrThreshold,
  inForce,
  sbaProgrammeForLoan,
  EQUITY_INJECTION_MINIMUM,
  type DatedValue,
} from "@/lib/content/regulatory";
import { ThresholdBarChart } from "@/components/charts/threshold-bar-chart";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The underwriter panel.
   --------------------------------------------------------------------------
   Founders submit plans; banks compute ratios. This panel renders the lender's
   own arithmetic — coverage, the debt schedule, sources and uses, the equity
   injection — before the underwriter works it out for themselves.

   Every regulatory figure here is read through the dated config in
   src/lib/content/regulatory/ and printed with its source, its effective date
   and its confidence. None of them is a constant, and one marked "unverified"
   says so on the page rather than passing as authoritative.
   ========================================================================== */

const PROGRAMME_LABELS: Record<string, string> = {
  "7a-small": "SBA 7(a) Small Loan",
  "7a-standard": "SBA 7(a) standard",
  "504": "SBA 504",
};

export function UnderwriterPanel({
  model,
  metrics,
  currency,
}: {
  model: FinancialModel;
  metrics: Metrics;
  currency: string;
}) {
  const a = model.assumptions;
  const money = (n: number) => formatCurrency(n, currency, { compact: true });
  const exact = (n: number) => formatCurrency(n, currency);

  const debtPrincipal = a.loans.reduce((sum, l) => sum + l.principal, 0) + a.opening.debt;
  const hasDebt = debtPrincipal > 0;

  const { programme, ceiling } = useMemo(
    () => sbaProgrammeForLoan(debtPrincipal),
    [debtPrincipal],
  );
  const threshold = useMemo(() => dscrThreshold(programme), [programme]);
  const injectionMinimum = useMemo(() => inForce(EQUITY_INJECTION_MINIMUM), []);

  const schedules = useMemo(
    () =>
      a.loans.map((loan) => ({
        loan,
        years: summariseScheduleByYear(
          roundScheduleForDisplay(buildAmortisation(loan)),
          model,
        ),
      })),
    [a.loans, model],
  );

  // Mirrors the validator's definition exactly, so the page and the review
  // never disagree about what the injection is.
  const equity =
    a.equityRounds.reduce((sum, r) => sum + r.amount, 0) + a.opening.paidInCapital;
  const grants = a.grants.reduce((sum, g) => sum + g.amount, 0);
  const totalCapital = equity + debtPrincipal;
  const injection = totalCapital > 0 ? equity / totalCapital : null;
  const capex = a.capex.reduce((sum, c) => sum + c.amount, 0);
  const totalSources = equity + debtPrincipal + grants;
  const workingCapital = totalSources - capex;

  if (!hasDebt) {
    return (
      <Panel
        title="Underwriter view"
        lede="This plan carries no debt, so there is no coverage to compute."
      >
        <p className="text-sm leading-relaxed text-secondary">
          Add a loan in intake and this panel fills in: debt service coverage by
          year against the threshold in force, the amortisation schedule, sources
          and uses, and the equity injection. Until then the only ratio a lender
          would read is {injection === null ? "undefined" : formatPercent(injection)} equity
          against {exact(totalCapital)} of capital.
        </p>
      </Panel>
    );
  }

  const dscrRows = metrics.underwriter.dscrByYear;
  const shortfalls = dscrRows.filter((r) => r.dscr !== null && r.dscr < threshold.value);

  return (
    <Panel
      title="Underwriter view"
      lede="The ratios a credit decision actually turns on, with the arithmetic shown rather than asserted."
    >
      {/* ---- Coverage --------------------------------------------------- */}
      <section aria-labelledby="dscr-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h4 id="dscr-heading" className="text-sm font-medium text-primary">
            Debt service coverage
          </h4>
          <p className="text-xs text-tertiary">
            EBITDA less cash taxes, over scheduled debt service
          </p>
        </div>

        <ThresholdBarChart
          className="mt-4"
          rows={dscrRows.map((r) => ({
            key: `dscr-${r.year}`,
            label: model.annual[r.year - 1]?.label ?? `Year ${r.year}`,
            value: r.dscr,
          }))}
          threshold={threshold.value}
          thresholdLabel={`${formatMultiple(threshold.value)} ${PROGRAMME_LABELS[programme] ?? programme}`}
          // A true minus sign, not a hyphen: these sit beside statement
          // figures that use the accounting convention.
          formatValue={(n) => n.toFixed(2).replace("-", "\u2212")}
          belowLabel="short"
          description={`Debt service coverage by year against the ${formatMultiple(
            threshold.value,
          )} threshold. ${
            shortfalls.length === 0
              ? "Every year clears it."
              : `${shortfalls.length} of ${dscrRows.length} years fall short.`
          }`}
        />

        {/* The arithmetic, so the ratio is auditable rather than trusted */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Debt service coverage by year, scrollable"
          className="mt-5 overflow-x-auto rounded-lg border border-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          <table className="w-full min-w-[34rem] border-collapse text-right text-sm">
            <caption className="sr-only">Debt service coverage by year</caption>
            <thead>
              <tr className="border-b border-strong">
                <th scope="col" className="px-4 py-2.5 text-left font-medium text-primary">Year</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Cash available</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Debt service</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {dscrRows.map((row) => {
                const short = row.dscr !== null && row.dscr < threshold.value;
                return (
                  <tr key={row.year} className="border-b border-hairline last:border-b-0">
                    <th scope="row" className="px-4 py-2.5 text-left font-normal text-secondary">
                      {model.annual[row.year - 1]?.label ?? `Year ${row.year}`}
                    </th>
                    <td className="numeric px-4 py-2.5 text-secondary">{exact(row.cashAvailable)}</td>
                    <td className="numeric px-4 py-2.5 text-secondary">{exact(row.debtService)}</td>
                    <td
                      className={cn(
                        "numeric px-4 py-2.5 font-medium",
                        row.dscr === null ? "text-tertiary" : short ? "text-critical" : "text-primary",
                      )}
                    >
                      {row.dscr === null ? "—" : formatMultiple(row.dscr)}
                      {short ? <span className="ml-1.5 text-xs font-normal">▼ short</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Provenance
          label={`Threshold: ${formatMultiple(threshold.value)} for ${
            PROGRAMME_LABELS[programme] ?? programme
          }`}
          entry={threshold}
          extra={`Programme assumed from a ${exact(debtPrincipal)} request against a ${exact(
            ceiling.value,
          )} Small Loan ceiling.`}
        />
        <Provenance label="Small Loan ceiling" entry={ceiling} />
      </section>

      {/* ---- Debt schedule --------------------------------------------- */}
      <section aria-labelledby="schedule-heading">
        <h4 id="schedule-heading" className="text-sm font-medium text-primary">
          Debt schedule
        </h4>
        <p className="mt-1 text-xs text-tertiary">
          Rounded for display. The model itself runs at full precision — rounding
          inside the ledger is what breaks a balance sheet.
        </p>

        <div className="mt-4 space-y-6">
          {schedules.map(({ loan, years }) => (
            <div key={loan.id}>
              <p className="text-sm text-secondary">
                {loan.name}
                <span aria-hidden className="mx-2 text-tertiary">·</span>
                <span className="numeric text-tertiary">
                  {exact(loan.principal)} at {formatPercent(loan.annualRate, 2)} over{" "}
                  {loan.termMonths} months
                  {loan.interestOnlyMonths > 0
                    ? `, ${loan.interestOnlyMonths} interest-only`
                    : ""}
                  {loan.balloonPayment > 0 ? `, ${money(loan.balloonPayment)} balloon` : ""}
                </span>
              </p>

              <div
                tabIndex={0}
                role="region"
                aria-label={`${loan.name} amortisation by year, scrollable`}
                className="mt-3 overflow-x-auto rounded-lg border border-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <table className="w-full min-w-[34rem] border-collapse text-right text-sm">
                  <caption className="sr-only">{loan.name} amortisation by year</caption>
                  <thead>
                    <tr className="border-b border-strong">
                      <th scope="col" className="px-4 py-2.5 text-left font-medium text-primary">Year</th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-primary">Opening</th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-primary">Interest</th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-primary">Principal</th>
                      <th scope="col" className="px-4 py-2.5 font-medium text-primary">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((year) => (
                      <tr key={year.year} className="border-b border-hairline last:border-b-0">
                        <th scope="row" className="px-4 py-2.5 text-left font-normal text-secondary">
                          {year.label}
                        </th>
                        <td className="numeric px-4 py-2.5 text-secondary">{exact(year.openingBalance)}</td>
                        <td className="numeric px-4 py-2.5 text-secondary">{exact(year.interest)}</td>
                        <td className="numeric px-4 py-2.5 text-secondary">{exact(year.principal)}</td>
                        <td className="numeric px-4 py-2.5 text-primary">{exact(year.closingBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Sources and uses ------------------------------------------ */}
      <section aria-labelledby="sources-heading">
        <h4 id="sources-heading" className="text-sm font-medium text-primary">
          Sources and uses
        </h4>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <LedgerList
            heading="Sources"
            total={totalSources}
            currency={currency}
            items={[
              ...a.equityRounds.map((r) => ({ key: r.id, label: r.name, amount: r.amount })),
              ...(a.opening.paidInCapital > 0
                ? [{ key: "opening-equity", label: "Paid-in capital at open", amount: a.opening.paidInCapital }]
                : []),
              ...a.loans.map((l) => ({ key: l.id, label: l.name, amount: l.principal })),
              ...(a.opening.debt > 0
                ? [{ key: "opening-debt", label: "Debt at open", amount: a.opening.debt }]
                : []),
              ...a.grants.map((g) => ({ key: g.id, label: g.name, amount: g.amount })),
            ]}
          />
          <LedgerList
            heading="Uses"
            total={totalSources}
            currency={currency}
            items={[
              ...a.capex.map((c) => ({ key: c.id, label: c.name, amount: c.amount })),
              {
                key: "working-capital",
                label: "Working capital and operating runway",
                amount: workingCapital,
                note: "The residual — what the business draws on before it funds itself.",
              },
            ]}
          />
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-3">
          <Ratio
            label="Equity injection"
            value={injection === null ? "—" : formatPercent(injection)}
            note={`${formatPercent(injectionMinimum.value)} minimum`}
            flag={injection !== null && injection < injectionMinimum.value}
          />
          <Ratio
            label="Current ratio, year 1"
            value={ratioText(metrics.underwriter.currentRatioByYear[0]?.ratio)}
            note="Current assets over current liabilities"
            flag={(metrics.underwriter.currentRatioByYear[0]?.ratio ?? 2) < 1}
          />
          <Ratio
            label="Debt to equity, year 1"
            value={ratioText(metrics.underwriter.debtToEquityByYear[0]?.ratio)}
            note="A lender reads leverage before coverage"
            flag={false}
          />
        </dl>
        <Provenance label="Equity injection minimum" entry={injectionMinimum} />
      </section>

      {/* ---- Owner compensation ---------------------------------------- */}
      <section aria-labelledby="owner-heading">
        <h4 id="owner-heading" className="text-sm font-medium text-primary">
          Owner compensation
        </h4>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-tertiary">
          Shown as its own line because a plan reading zero fails on first
          review: the underwriter substitutes a market salary and recomputes
          coverage without it. It is also the line the E-2 marginality test is
          assessed on.
        </p>
        <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          {metrics.underwriter.ownerCompensationByYear.map((row) => (
            <li key={row.year}>
              <p className="text-xs text-tertiary">
                {model.annual[row.year - 1]?.label ?? `Year ${row.year}`}
              </p>
              <p
                className={cn(
                  "numeric mt-0.5 text-sm",
                  row.amount <= 0 ? "text-critical" : "text-primary",
                )}
              >
                {row.amount <= 0 ? "None modelled" : exact(row.amount)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function Panel({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby="underwriter" className="rounded-lg border border-hairline p-6 sm:p-7">
      <h3 id="underwriter" className="font-display text-xl">{title}</h3>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">{lede}</p>
      <div className="mt-7 space-y-10">{children}</div>
    </section>
  );
}

/** Prints where a regulatory figure came from, and says so plainly when we
 *  have not yet confirmed it against a primary source. */
function Provenance({
  label,
  entry,
  extra,
}: {
  label: string;
  entry: DatedValue<number>;
  extra?: string;
}) {
  const unverified = entry.confidence === "unverified";
  return (
    <p
      className={cn(
        "mt-4 flex items-start gap-2 text-xs leading-relaxed",
        unverified ? "text-warning" : "text-tertiary",
      )}
    >
      {unverified ? (
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span>
        {label}
        <span aria-hidden className="mx-1.5">·</span>
        {entry.source.label}, in force from {entry.effectiveFrom}
        {entry.effectiveTo ? ` to ${entry.effectiveTo}` : ""}, retrieved{" "}
        {entry.source.retrieved}
        {entry.note ? ` — ${entry.note}` : ""}
        {extra ? ` ${extra}` : ""}
        {unverified
          ? " This figure is not yet confirmed against a primary source and must not be relied on as authoritative."
          : ""}
      </span>
    </p>
  );
}

function LedgerList({
  heading,
  total,
  currency,
  items,
}: {
  heading: string;
  total: number;
  currency: string;
  items: { key: string; label: string; amount: number; note?: string }[];
}) {
  return (
    <div>
      <p className="text-eyebrow font-medium uppercase text-tertiary">{heading}</p>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="border-b border-hairline">
              <th scope="row" className="py-2 pr-4 text-left font-normal text-secondary">
                {item.label}
                {item.note ? (
                  <span className="mt-0.5 block text-xs leading-snug text-tertiary">{item.note}</span>
                ) : null}
              </th>
              <td className="numeric py-2 text-right text-secondary">
                {formatCurrency(item.amount, currency)}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-t-strong">
            <th scope="row" className="py-2 pr-4 text-left font-medium text-primary">Total</th>
            <td className="numeric py-2 text-right font-medium text-primary">
              {formatCurrency(total, currency)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Ratio({
  label,
  value,
  note,
  flag,
}: {
  label: string;
  value: string;
  note: string;
  flag: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-lg",
          flag ? "text-critical" : "text-primary",
        )}
      >
        <span className="numeric flex items-center gap-1.5">
          {value}
          {flag ? (
            <span className="text-xs">
              <AlertTriangle aria-hidden className="inline size-3.5" /> below
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-tertiary">{note}</span>
      </dd>
    </div>
  );
}

function ratioText(ratio: number | null | undefined): string {
  return ratio === null || ratio === undefined ? "—" : formatMultiple(ratio);
}
