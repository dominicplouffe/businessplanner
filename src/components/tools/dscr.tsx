"use client";

import { useMemo, useState } from "react";
import { CalculatorFrame, ConfigNote, Headline, NumberInput, ResultList, SelectInput } from "./shell";
import { useToday } from "./use-today";
import {
  dscrThreshold,
  sbaProgrammeForLoan,
  type SbaProgramme,
} from "@/lib/content/regulatory";
import { levelPayment } from "@/lib/finance/loans";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";

const PROGRAMME_LABELS: Record<SbaProgramme | "auto", string> = {
  auto: "Decide from the loan size",
  "7a-small": "SBA 7(a) Small",
  "7a-standard": "SBA 7(a) Standard",
  "504": "SBA 504",
};

/**
 * Coverage against the threshold in force.
 *
 * `asOf` comes from `useToday` rather than `new Date()`: `inForce` defaults to
 * the current date, and on a statically generated page that would freeze the
 * build day's threshold into the HTML. The server snapshot is the build date and
 * hydration replaces it with the real one.
 */
export function DscrCalculator({ buildDate }: { buildDate: string }) {
  const [ebitda, setEbitda] = useState(240_000);
  const [tax, setTax] = useState(38_000);
  const [principal, setPrincipal] = useState(400_000);
  const [rate, setRate] = useState(11.5);
  const [years, setYears] = useState(10);
  const [otherDebtService, setOtherDebtService] = useState(0);
  const [programmeChoice, setProgrammeChoice] = useState<SbaProgramme | "auto">("auto");

  const asOf = useToday(buildDate);

  const r = useMemo(() => {
    const termMonths = Math.max(1, Math.round(years * 12));
    const monthly = levelPayment(Math.max(0, principal), Math.max(0, rate) / 100 / 12, termMonths);
    const annualDebtService = monthly * 12 + Math.max(0, otherDebtService);

    const derived = sbaProgrammeForLoan(Math.max(0, principal), asOf);
    const programme = programmeChoice === "auto" ? derived.programme : programmeChoice;
    const threshold = dscrThreshold(programme, asOf);

    const cashAvailable = ebitda - tax;
    const dscr = annualDebtService > 0 ? cashAvailable / annualDebtService : null;
    // The question a lender asks next: how far can EBITDA fall before this
    // breaks? Expressed against EBITDA, not against cash available, because
    // EBITDA is the line the borrower can actually influence.
    const ebitdaAtThreshold = threshold.value * annualDebtService + tax;
    const headroom = ebitda > 0 ? (ebitda - ebitdaAtThreshold) / ebitda : 0;
    const maxDebtService = threshold.value > 0 ? cashAvailable / threshold.value : 0;

    return {
      monthly,
      annualDebtService,
      cashAvailable,
      dscr,
      programme,
      derived,
      threshold,
      headroom,
      ebitdaAtThreshold,
      maxDebtService,
      passes: dscr !== null && dscr >= threshold.value,
    };
  }, [ebitda, tax, principal, rate, years, otherDebtService, programmeChoice, asOf]);

  return (
    <CalculatorFrame
      inputs={
        <>
          <NumberInput
            label="EBITDA"
            value={ebitda}
            onChange={setEbitda}
            prefix="$"
            step={5_000}
            hint="Earnings before interest, tax, depreciation and amortisation, for the year being tested."
          />
          <NumberInput
            label="Cash taxes"
            value={tax}
            onChange={setTax}
            prefix="$"
            step={1_000}
            hint="Deducted, because tax is paid before debt service is."
          />
          <NumberInput label="Loan amount" value={principal} onChange={setPrincipal} prefix="$" step={10_000} />
          <NumberInput label="Annual rate" value={rate} onChange={setRate} suffix="%" step={0.125} max={100} />
          <NumberInput label="Term" value={years} onChange={setYears} suffix="years" step={1} min={1} max={30} />
          <NumberInput
            label="Other annual debt service"
            value={otherDebtService}
            onChange={setOtherDebtService}
            prefix="$"
            step={1_000}
            hint="Existing loans, equipment finance and capital leases already in place."
          />
          <SelectInput
            label="Programme"
            value={programmeChoice}
            onChange={setProgrammeChoice}
            options={(["auto", "7a-small", "7a-standard", "504"] as const).map((v) => ({
              value: v,
              label: PROGRAMME_LABELS[v],
            }))}
          />
        </>
      }
      results={
        <div className="space-y-6">
          <Headline
            label="Debt service coverage"
            value={r.dscr === null ? "No debt" : formatMultiple(r.dscr)}
            tone={r.dscr === null ? "neutral" : r.passes ? "good" : "critical"}
            note={
              r.dscr === null
                ? "Enter a loan amount to compute coverage."
                : r.passes
                  ? `Above the ${formatMultiple(r.threshold.value)} threshold for ${
                      PROGRAMME_LABELS[r.programme]
                    }. EBITDA could fall ${formatPercent(Math.max(0, r.headroom))} before it does not.`
                  : `Below the ${formatMultiple(r.threshold.value)} threshold for ${
                      PROGRAMME_LABELS[r.programme]
                    }. EBITDA of ${formatCurrency(r.ebitdaAtThreshold, "USD", {
                      compact: true,
                    })} would clear it, or debt service of ${formatCurrency(r.maxDebtService, "USD", {
                      compact: true,
                    })}.`
            }
          />

          <ResultList
            rows={[
              {
                label: "Cash available for debt service",
                value: formatCurrency(r.cashAvailable, "USD", { decimals: 0 }),
                note: "EBITDA less cash taxes — the convention most SBA lenders apply to projections.",
              },
              { label: "Monthly payment on this loan", value: formatCurrency(r.monthly, "USD", { decimals: 0 }) },
              { label: "Annual debt service", value: formatCurrency(r.annualDebtService, "USD", { decimals: 0 }) },
              {
                label: "Most debt service this supports",
                value: formatCurrency(r.maxDebtService, "USD", { decimals: 0 }),
                note: `At exactly ${formatMultiple(r.threshold.value)}, which is the floor rather than a target.`,
              },
            ]}
          />

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-tertiary">
              What this was measured against
            </p>
            <ConfigNote
              label={`${PROGRAMME_LABELS[r.programme]} coverage threshold`}
              value={formatMultiple(r.threshold.value)}
              source={r.threshold.source.label}
              effectiveFrom={r.threshold.effectiveFrom}
              effectiveTo={r.threshold.effectiveTo}
              confidence={r.threshold.confidence}
              stale={r.threshold.stale}
            />
            {programmeChoice === "auto" ? (
              <ConfigNote
                label="7(a) Small Loan ceiling"
                value={formatCurrency(r.derived.ceiling.value, "USD", { decimals: 0 })}
                source={r.derived.ceiling.source.label}
                effectiveFrom={r.derived.ceiling.effectiveFrom}
                effectiveTo={r.derived.ceiling.effectiveTo}
                confidence={r.derived.ceiling.confidence}
                stale={r.derived.ceiling.stale}
              />
            ) : null}
          </div>
        </div>
      }
    />
  );
}
