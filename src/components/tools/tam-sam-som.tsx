"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { CalculatorFrame, Headline, NumberInput } from "./shell";
import { computeSizing } from "@/lib/market/sizing";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/finance/format";

/** The product's own `computeSizing`, including its step-by-step workings. The
 *  point of this tool is the derivation, not the three headline numbers. */
export function TamSamSomCalculator() {
  const [populationCount, setPopulationCount] = useState(120_000);
  const [qualifiedShare, setQualifiedShare] = useState(35);
  const [annualSpend, setAnnualSpend] = useState(480);
  const [servableShare, setServableShare] = useState(20);
  const [targetShare, setTargetShare] = useState(4);

  const result = useMemo(
    () =>
      computeSizing({
        populationLabel: "people in the catchment",
        populationCount: Math.max(0, populationCount),
        qualifiedShare: clampShare(qualifiedShare),
        annualSpendPerCustomer: Math.max(0, annualSpend),
        servableShare: clampShare(servableShare),
        targetShare: clampShare(targetShare),
      }),
    [populationCount, qualifiedShare, annualSpend, servableShare, targetShare],
  );

  const render = (value: number, kind: "count" | "percent" | "currency") =>
    kind === "currency"
      ? formatCurrency(value, "USD", { compact: value >= 10_000 })
      : kind === "percent"
        ? formatPercent(value)
        : formatNumber(value);

  return (
    <CalculatorFrame
      wide
      inputs={
        <>
          <NumberInput
            label="How many are there?"
            value={populationCount}
            onChange={setPopulationCount}
            step={1_000}
            hint="Households, businesses, or people in the catchment. Write down where the figure came from — a market section without that is the classic rejection."
          />
          <NumberInput
            label="Share who are plausible buyers"
            value={qualifiedShare}
            onChange={setQualifiedShare}
            suffix="%"
            step={1}
            max={100}
            hint="The ones who have the problem and could pay to solve it."
          />
          <NumberInput
            label="Annual spend each"
            value={annualSpend}
            onChange={setAnnualSpend}
            prefix="$"
            step={10}
            hint="What one buyer spends on this category in a year — not what you would charge them."
          />
          <NumberInput
            label="Share you can actually serve"
            value={servableShare}
            onChange={setServableShare}
            suffix="%"
            step={1}
            max={100}
            hint="Constrained by geography, channel and capacity. This is where most sizings quietly cheat."
          />
          <NumberInput
            label="Share you expect to hold"
            value={targetShare}
            onChange={setTargetShare}
            suffix="%"
            step={0.5}
            max={100}
            hint="By the end of the plan horizon."
          />
        </>
      }
      results={
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-3">
            <Headline label="TAM" value={formatCurrency(result.tam, "USD", { compact: true })} />
            <Headline label="SAM" value={formatCurrency(result.sam, "USD", { compact: true })} />
            <Headline label="SOM" value={formatCurrency(result.som, "USD", { compact: true })} />
          </div>

          <div>
            <h3 className="font-display text-lg">The arithmetic</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-secondary">
              Shown line by line, because a market section that states a number without a
              derivation is the single most common reason one gets sent back.
            </p>
            <ol className="mt-5 divide-y divide-hairline border-y border-hairline">
              {result.steps.map((step) => (
                <li key={step.key} className="py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <p className="text-sm text-primary">{step.label}</p>
                    <p className="numeric shrink-0 text-sm text-primary">
                      {render(step.value, step.kind)}
                    </p>
                  </div>
                  {step.workings ? (
                    <p className="numeric mt-1 text-xs text-tertiary">{step.workings}</p>
                  ) : null}
                  {step.note ? (
                    <p className="mt-1 text-xs leading-relaxed text-tertiary">{step.note}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-hairline bg-surface-sunken p-6">
            <p className="font-display text-base">
              That obtainable share is{" "}
              <span className="numeric">{formatNumber(result.impliedCustomers)}</span> customers.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              This is the line to check first. Can you actually serve that many — with the
              premises, the staff and the hours you have modelled? Most market sections
              that do not survive contact with a reader fail right here, not on the TAM.
            </p>
          </div>

          <p className="flex gap-2.5 text-xs leading-relaxed text-tertiary">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              In the product this sizing is cross-checked two further ways: against a
              published market figure, which is inadmissible without a dated retrievable
              citation, and against the revenue your own model projects for year three. A
              plan whose model outruns the market it claims is caught before it is sent.
            </span>
          </p>
        </div>
      }
    />
  );
}

function clampShare(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(1, Math.max(0, percent / 100));
}
