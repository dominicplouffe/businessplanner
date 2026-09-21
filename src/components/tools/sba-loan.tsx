"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { CalculatorFrame, ConfigNote, Headline, NumberInput, ResultList } from "./shell";
import { useToday } from "./use-today";
import {
  CONFIG_VINTAGE,
  EQUITY_INJECTION_MINIMUM,
  dscrThreshold,
  inForce,
  sbaProgrammeForLoan,
} from "@/lib/content/regulatory";
import { levelPayment } from "@/lib/finance/loans";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";

const PROGRAMME_LABEL = {
  "7a-small": "SBA 7(a) Small",
  "7a-standard": "SBA 7(a) Standard",
  "504": "SBA 504",
} as const;

/**
 * Project cost in, payment and the two tests a 7(a) file is screened on out.
 * Every threshold is read through `inForce` against `useToday`, so it is the
 * figure in force now rather than the one in force when this page was built.
 */
export function SbaLoanCalculator({ buildDate }: { buildDate: string }) {
  const [projectCost, setProjectCost] = useState(650_000);
  const [equity, setEquity] = useState(90_000);
  const [rate, setRate] = useState(11.5);
  const [years, setYears] = useState(10);
  const [ebitda, setEbitda] = useState(185_000);
  const [tax, setTax] = useState(28_000);

  const asOf = useToday(buildDate);

  const r = useMemo(() => {
    const cost = Math.max(0, projectCost);
    const injection = Math.min(Math.max(0, equity), cost);
    const principal = cost - injection;
    const termMonths = Math.max(1, Math.round(years * 12));
    const monthly = levelPayment(principal, Math.max(0, rate) / 100 / 12, termMonths);
    const annualDebtService = monthly * 12;

    const { programme, ceiling } = sbaProgrammeForLoan(principal, asOf);
    const threshold = dscrThreshold(programme, asOf);
    const minimumInjection = inForce(EQUITY_INJECTION_MINIMUM, asOf);

    const injectionShare = cost > 0 ? injection / cost : 0;
    const injectionShortfall = Math.max(0, minimumInjection.value * cost - injection);
    const cashAvailable = ebitda - tax;
    const dscr = annualDebtService > 0 ? cashAvailable / annualDebtService : null;

    return {
      cost,
      injection,
      principal,
      monthly,
      annualDebtService,
      totalInterest: monthly * termMonths - principal,
      programme,
      ceiling,
      threshold,
      minimumInjection,
      injectionShare,
      injectionShortfall,
      dscr,
      coveragePasses: dscr !== null && dscr >= threshold.value,
      injectionPasses: injectionShare >= minimumInjection.value,
    };
  }, [projectCost, equity, rate, years, ebitda, tax, asOf]);

  return (
    <CalculatorFrame
      inputs={
        <>
          <NumberInput
            label="Total project cost"
            value={projectCost}
            onChange={setProjectCost}
            prefix="$"
            step={10_000}
            hint="Everything the loan is for: purchase price, fit-out, equipment, working capital, fees."
          />
          <NumberInput
            label="Your equity injection"
            value={equity}
            onChange={setEquity}
            prefix="$"
            step={5_000}
            hint="Cash you are putting in. Borrowed funds generally do not count."
          />
          <NumberInput label="Annual rate" value={rate} onChange={setRate} suffix="%" step={0.125} max={100} />
          <NumberInput label="Term" value={years} onChange={setYears} suffix="years" step={1} min={1} max={25} />
          <NumberInput
            label="Projected EBITDA"
            value={ebitda}
            onChange={setEbitda}
            prefix="$"
            step={5_000}
            hint="For the first full year after any interest-only period ends — the year a lender sizes against."
          />
          <NumberInput label="Cash taxes in that year" value={tax} onChange={setTax} prefix="$" step={1_000} />
        </>
      }
      results={
        <div className="space-y-6">
          <Headline
            label="Monthly payment"
            value={formatCurrency(r.monthly, "USD", { decimals: 0 })}
            note={`On ${formatCurrency(r.principal, "USD", { compact: true })} borrowed against a ${formatCurrency(
              r.cost,
              "USD",
              { compact: true },
            )} project — ${PROGRAMME_LABEL[r.programme]} by size.`}
          />

          <div className="space-y-3">
            <Test
              passes={r.injectionPasses}
              title={`Equity injection: ${formatPercent(r.injectionShare)}`}
              detail={
                r.injectionPasses
                  ? `At or above the ${formatPercent(r.minimumInjection.value, 0)} minimum.`
                  : `${formatCurrency(r.injectionShortfall, "USD", {
                      decimals: 0,
                    })} short of the ${formatPercent(r.minimumInjection.value, 0)} minimum.`
              }
            />
            <Test
              passes={r.coveragePasses}
              title={`Coverage: ${r.dscr === null ? "no debt" : formatMultiple(r.dscr)}`}
              detail={
                r.dscr === null
                  ? "Nothing to cover."
                  : r.coveragePasses
                    ? `At or above the ${formatMultiple(r.threshold.value)} threshold for this programme.`
                    : `Below the ${formatMultiple(r.threshold.value)} threshold. EBITDA of ${formatCurrency(
                        r.threshold.value * r.annualDebtService + tax,
                        "USD",
                        { compact: true },
                      )} would clear it.`
              }
            />
          </div>

          <ResultList
            rows={[
              { label: "Amount financed", value: formatCurrency(r.principal, "USD", { decimals: 0 }) },
              { label: "Annual debt service", value: formatCurrency(r.annualDebtService, "USD", { decimals: 0 }) },
              {
                label: "Total interest over the term",
                value: formatCurrency(r.totalInterest, "USD", { compact: true }),
              },
              {
                label: "Guaranty fee",
                value: "Not modelled",
                note: "The fee schedule is fiscal-year dependent and sits in our verification queue. We would rather leave it out than print a figure we have not confirmed against SBA's own source.",
              },
            ]}
          />

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-tertiary">
              What these tests were measured against
            </p>
            <ConfigNote
              label="Minimum equity injection"
              value={formatPercent(r.minimumInjection.value, 0)}
              source={r.minimumInjection.source.label}
              effectiveFrom={r.minimumInjection.effectiveFrom}
              effectiveTo={r.minimumInjection.effectiveTo}
              confidence={r.minimumInjection.confidence}
              stale={r.minimumInjection.stale}
            />
            <ConfigNote
              label={`${PROGRAMME_LABEL[r.programme]} coverage threshold`}
              value={formatMultiple(r.threshold.value)}
              source={r.threshold.source.label}
              effectiveFrom={r.threshold.effectiveFrom}
              effectiveTo={r.threshold.effectiveTo}
              confidence={r.threshold.confidence}
              stale={r.threshold.stale}
            />
            <ConfigNote
              label="7(a) Small Loan ceiling"
              value={formatCurrency(r.ceiling.value, "USD", { decimals: 0 })}
              source={r.ceiling.source.label}
              effectiveFrom={r.ceiling.effectiveFrom}
              effectiveTo={r.ceiling.effectiveTo}
              confidence={r.ceiling.confidence}
              stale={r.ceiling.stale}
            />
            <p className="text-xs leading-relaxed text-tertiary">
              Configuration last reviewed {CONFIG_VINTAGE.lastReviewed}. Every figure above
              carries its own effective date, so this page changes when the guidance does
              rather than when someone remembers to edit it.
            </p>
          </div>
        </div>
      }
    />
  );
}

function Test({ passes, title, detail }: { passes: boolean; title: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-sm border border-hairline p-4">
      {passes ? (
        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
      ) : (
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      )}
      <div>
        <p className="text-sm font-medium">
          <span className="sr-only">{passes ? "Passes: " : "Does not pass: "}</span>
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-secondary">{detail}</p>
      </div>
    </div>
  );
}
