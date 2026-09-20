"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { computeSizing, type MarketSizing } from "@/lib/market/sizing";
import type { FinancialModel } from "@/lib/finance/engine";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { saveSizingAction } from "@/lib/actions/market-actions";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The bottom-up market build.
   --------------------------------------------------------------------------
   The arithmetic recomputes as you type, in the browser, from the same pure
   function the review page scores against. Every line shows how it was reached
   from the one above, which is the whole argument for building bottom-up: a
   reader can disagree with one number instead of with the conclusion.
   ========================================================================== */

type Draft = {
  populationLabel: string;
  populationCount: string;
  qualifiedShare: string;
  annualSpendPerCustomer: string;
  servableShare: string;
  targetShare: string;
  populationSource: string;
};

function toDraft(sizing: MarketSizing): Draft {
  return {
    populationLabel: sizing.populationLabel,
    populationCount: sizing.populationCount ? String(sizing.populationCount) : "",
    qualifiedShare: String(round(sizing.qualifiedShare * 100)),
    annualSpendPerCustomer: sizing.annualSpendPerCustomer ? String(sizing.annualSpendPerCustomer) : "",
    servableShare: String(round(sizing.servableShare * 100)),
    targetShare: String(round(sizing.targetShare * 100)),
    populationSource: sizing.populationSource,
  };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (value: string) => {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
/** Shares are typed as percentages and stored as proportions; clamping here
 *  means a fat-fingered 800 never reaches the schema and throws. */
const share = (value: string) => Math.min(1, Math.max(0, num(value) / 100));

export function SizingBuilder({
  planId,
  sizing,
  model,
  currency,
}: {
  planId: string;
  sizing: MarketSizing;
  model: FinancialModel | null;
  currency: string;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(sizing));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = useMemo(
    () => ({
      populationLabel: draft.populationLabel,
      populationCount: num(draft.populationCount),
      qualifiedShare: share(draft.qualifiedShare),
      annualSpendPerCustomer: num(draft.annualSpendPerCustomer),
      servableShare: share(draft.servableShare),
      targetShare: share(draft.targetShare),
      populationSource: draft.populationSource,
      topDownMarketSize: sizing.topDownMarketSize,
      topDownLabel: sizing.topDownLabel,
      topDownCitationId: sizing.topDownCitationId,
      compareToYear: sizing.compareToYear,
    }),
    [draft, sizing],
  );

  const result = useMemo(
    () => computeSizing(parsed, model ?? undefined),
    [parsed, model],
  );

  const set = (key: keyof Draft) => (value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveSizingAction({ planId, sizing: parsed });
        setSaved(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save.");
      }
    });
  };

  // Exact, not compact: the point of the derivation is that a reader can
  // multiply 8,400 by $480 and get the same answer. "$4M" defeats that.
  const money = (n: number) => formatCurrency(n, currency);

  return (
    <section aria-labelledby="sizing" className="rounded-lg border border-hairline p-6 sm:p-7">
      <h2 id="sizing" className="font-display text-xl">Market size, built from the ground up</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
        A share of a very large number is the classic unfundable market section,
        because there is nothing in it a reader can check. Count something real
        instead, and show every step.
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <Field
            label="What are you counting?"
            hint="Households within three miles. Licensed electricians in the state. Something a reader could look up."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.populationLabel}
                onChange={(e) => set("populationLabel")(e.target.value)}
                placeholder="Households within three miles"
              />
            )}
          </Field>

          <Field label="How many are there?">
            {({ id }) => (
              <Input
                id={id}
                inputMode="numeric"
                className="numeric"
                value={draft.populationCount}
                onChange={(e) => set("populationCount")(e.target.value)}
                placeholder="24000"
              />
            )}
          </Field>

          <Field label="Where does that number come from?" hint="Cite it if you can. An uncited count is an estimate.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={draft.populationSource}
                onChange={(e) => set("populationSource")(e.target.value)}
                placeholder="Census tract data, 2026"
              />
            )}
          </Field>

          <Field label="What share of them are plausible buyers?" hint="Percent.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="decimal"
                className="numeric"
                value={draft.qualifiedShare}
                onChange={(e) => set("qualifiedShare")(e.target.value)}
              />
            )}
          </Field>

          <Field label="What does one of them spend a year, in this category?">
            {({ id }) => (
              <Input
                id={id}
                inputMode="decimal"
                className="numeric"
                value={draft.annualSpendPerCustomer}
                onChange={(e) => set("annualSpendPerCustomer")(e.target.value)}
                placeholder="480"
              />
            )}
          </Field>

          <Field
            label="What share can you actually serve?"
            hint="Percent. Your geography, your channel, your capacity."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="decimal"
                className="numeric"
                value={draft.servableShare}
                onChange={(e) => set("servableShare")(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="What share of that will you hold by the end of the plan?"
            hint="Percent. This is the one a reader will push hardest on."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="decimal"
                className="numeric"
                value={draft.targetShare}
                onChange={(e) => set("targetShare")(e.target.value)}
              />
            )}
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save the build"}
            </Button>
            {saved ? (
              <span className="flex items-center gap-1.5 text-sm text-good">
                <Check aria-hidden className="size-4" />
                Saved
              </span>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-critical">{error}</p>
          ) : null}
        </div>

        {/* The derivation */}
        <div>
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">The market size derivation, step by step</caption>
            <tbody>
              {result.steps.map((step) => {
                const emphasised = ["tam", "sam", "som"].includes(step.key);
                return (
                  <tr key={step.key} className="border-b border-hairline last:border-b-0">
                    <th scope="row" className="py-3 pr-4 text-left font-normal align-top">
                      <span className={cn(emphasised ? "font-medium text-primary" : "text-secondary")}>
                        {step.label}
                      </span>
                      {step.workings ? (
                        <span className="mt-0.5 block text-xs leading-snug text-tertiary">
                          {step.workings}
                        </span>
                      ) : null}
                      {step.note ? (
                        <span className="mt-0.5 block text-xs leading-snug text-tertiary">
                          {step.note}
                        </span>
                      ) : null}
                    </th>
                    <td
                      className={cn(
                        "numeric py-3 text-right align-top",
                        emphasised ? "font-medium text-primary" : "text-secondary",
                      )}
                    >
                      {step.kind === "currency"
                        ? money(step.value)
                        : Math.round(step.value).toLocaleString("en-US")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ModelCheckNote result={result} currency={currency} />
        </div>
      </div>
    </section>
  );
}

function ModelCheckNote({
  result,
  currency,
}: {
  result: ReturnType<typeof computeSizing>;
  currency: string;
}) {
  const check = result.modelCheck;
  if (check.status !== "checked") {
    return (
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-tertiary">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {check.status === "unavailable" ? check.reason : ""}
      </p>
    );
  }

  const money = (n: number) => formatCurrency(n, currency, { compact: true });
  const bad = check.overruns || check.understates;

  return (
    <p
      className={cn(
        "mt-5 flex items-start gap-2 text-xs leading-relaxed",
        bad ? "text-warning" : "text-tertiary",
      )}
    >
      {bad ? (
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span>
        {check.overruns ? (
          <>
            Year {check.year} revenue in the model is {money(check.projectedRevenue)} —{" "}
            {formatMultiple(check.ratio)} the {money(check.obtainableRevenue)} this build
            says is obtainable. The plan is forecasting more than the market it
            claims. One of the two is wrong, and a reader will find it.
          </>
        ) : check.understates ? (
          <>
            This build claims {money(check.obtainableRevenue)} is obtainable while the
            model forecasts {money(check.projectedRevenue)} in year {check.year} —{" "}
            {formatPercent(check.ratio)} of it. A market that large with a plan
            that small invites the question of why.
          </>
        ) : (
          <>
            Year {check.year} revenue of {money(check.projectedRevenue)} sits inside the{" "}
            {money(check.obtainableRevenue)} this build says is obtainable. The market
            section and the model agree.
          </>
        )}
      </span>
    </p>
  );
}
