"use client";

import { useMemo, useState } from "react";
import type { Assumptions } from "@/lib/finance/types";
import { buildScenarios, sensitivity, SCENARIOS, driversMoved, type ScenarioKey } from "@/lib/finance/scenarios";
import { computeMetrics } from "@/lib/finance/metrics";
import { buildStatements, MONTHLY_COLUMN_COUNT, type Granularity } from "@/lib/finance/statements";
import { formatCurrency, formatMonthLabel, formatMultiple, formatPercent, formatYearLabel } from "@/lib/finance/format";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { DivergingBarChart } from "@/components/charts/diverging-bar-chart";
import { StatementTableView } from "./statement-table";
import { UnderwriterPanel } from "./underwriter";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The financial workspace.
   --------------------------------------------------------------------------
   The engine runs in the browser. Switching scenario recomputes three full
   sixty-month models and the sensitivity fan without a round trip, which is
   both faster than fetching and the most direct demonstration that these
   numbers are computed rather than written.
   ========================================================================== */

const SCENARIO_ORDER: ScenarioKey[] = ["downside", "base", "upside"];

export function FinancialWorkspace({ assumptions }: { assumptions: Assumptions }) {
  const [scenario, setScenario] = useState<ScenarioKey>("base");
  const [granularity, setGranularity] = useState<Granularity>("annual");

  const scenarios = useMemo(() => buildScenarios(assumptions), [assumptions]);
  const model = scenarios[scenario];
  const metrics = useMemo(() => computeMetrics(model), [model]);
  const statements = useMemo(() => buildStatements(model, granularity), [model, granularity]);

  // Year-3 EBITDA is the outcome both a lender and an investor read, so it is
  // what the tornado ranks drivers against.
  const sensitivityRows = useMemo(
    () => sensitivity(assumptions, (m) => m.annual[2]?.ebitda ?? m.annual.at(-1)?.ebitda ?? 0),
    [assumptions],
  );
  const baseEbitda = sensitivityRows[0]?.base ?? 0;

  const currency = assumptions.company.currency;
  const money = (n: number) => formatCurrency(n, currency, { compact: true });
  const exact = (n: number) => formatCurrency(n, currency);
  const ue = metrics.unitEconomics;
  const be = metrics.breakEven;

  return (
    <div className="space-y-12 px-6 py-8 sm:px-10">
      {/* ---- Scenario switcher ------------------------------------------ */}
      <section aria-labelledby="scenario-heading">
        <h2 id="scenario-heading" className="font-display text-xl">Scenario</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
          A credible downside moves spend as well as revenue — cutting demand
          while holding the hiring plan constant is arithmetic, not a scenario.
          The driver count is what the validator checks.
        </p>

        {/* A group of toggles rather than a tablist: there is no single panel
            these control — the whole page recomputes — and a tablist without
            tabpanels misleads a screen reader about what moves. */}
        <div role="group" aria-label="Scenario" className="mt-5 flex flex-wrap gap-2">
          {SCENARIO_ORDER.map((key) => {
            const selected = key === scenario;
            const moved = driversMoved(SCENARIOS[key].adjustment);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => setScenario(key)}
                className={cn(
                  "rounded-sm border px-4 py-2.5 text-left transition-colors",
                  selected
                    ? "border-strong bg-surface-raised"
                    : "border-hairline text-secondary hover:border-strong",
                )}
              >
                <span className="block text-sm font-medium">{SCENARIOS[key].label}</span>
                <span className="numeric mt-0.5 block text-xs text-tertiary">
                  {moved === 0 ? "as modelled" : `${moved} drivers moved`}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-secondary">
          {SCENARIOS[scenario].description}
        </p>
      </section>

      {/* ---- Headline ratios -------------------------------------------- */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">Summary</h2>
        <dl className="grid grid-cols-2 gap-6 rounded-lg border border-hairline bg-surface-raised p-6 lg:grid-cols-4">
          <Stat label="Year 1 revenue" value={money(model.annual[0]?.revenue ?? 0)} />
          <Stat
            label={`Year ${Math.min(3, model.annual.length)} revenue`}
            value={money((model.annual[2] ?? model.annual.at(-1))?.revenue ?? 0)}
          />
          <Stat
            label="Lowest cash"
            value={money(metrics.cash.lowestCash)}
            note={`month ${metrics.cash.lowestCashMonth}`}
          />
          <Stat
            label="Operating profit from"
            value={be.profitMonth ? `Month ${be.profitMonth}` : "Not in horizon"}
          />
        </dl>
      </section>

      {/* ---- Cash ------------------------------------------------------- */}
      <section aria-labelledby="cash-heading">
        <h2 id="cash-heading" className="font-display text-xl">Cash</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
          The line that decides whether a plan survives its own forecast.
          {metrics.cash.cashOutMonth !== null
            ? ` This case runs out of cash in month ${metrics.cash.cashOutMonth}.`
            : " Cash stays positive across the horizon."}
        </p>

        <TimeSeriesChart
          className="mt-5"
          labels={model.monthLabels}
          series={[
            {
              key: "cash",
              label: "Closing cash",
              color: "var(--series-1)",
              values: model.cashFlow.closingCash,
              fill: true,
            },
          ]}
          height={240}
          formatValue={money}
          formatLabel={formatYearLabel}
          formatTooltipLabel={formatMonthLabel}
          description={`Closing cash by month over ${model.horizonMonths} months. Lowest point ${exact(
            metrics.cash.lowestCash,
          )} in month ${metrics.cash.lowestCashMonth}.`}
        />

        <dl className="mt-6 grid gap-6 sm:grid-cols-3">
          <Stat
            label="Peak funding need"
            value={exact(metrics.cash.peakFundingNeed)}
            note="The most cash the plan is ever short of before it funds itself"
          />
          <Stat
            label="Average net burn"
            value={exact(metrics.cash.averageNetBurn)}
            note="While operating cash flow is negative"
          />
          <Stat
            label="Runway"
            value={
              metrics.cash.runwayMonths === null
                ? "Not burning"
                : `${metrics.cash.runwayMonths.toFixed(0)} months`
            }
            note="From closing cash at the current burn"
          />
        </dl>
      </section>

      {/* ---- Statements ------------------------------------------------- */}
      <section aria-labelledby="statements-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="statements-heading" className="font-display text-xl">Statements</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-secondary">
              Three linked statements. The balance sheet carries its own tie row,
              because a statement that shows it balances is worth more than one
              that asks to be trusted.
            </p>
          </div>

          <div role="group" aria-label="Granularity" className="flex gap-2">
            {(["annual", "monthly"] as Granularity[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}
                className={cn(
                  "rounded-sm border px-3 py-1.5 text-sm transition-colors",
                  granularity === value
                    ? "border-strong bg-surface-raised text-primary"
                    : "border-hairline text-secondary hover:border-strong",
                )}
              >
                {value === "annual" ? "By year" : `First ${MONTHLY_COLUMN_COUNT} months`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 space-y-10">
          {statements.map((table) => (
            <StatementTableView key={table.id} table={table} currency={currency} />
          ))}
        </div>
      </section>

      {/* ---- Underwriter ------------------------------------------------ */}
      <UnderwriterPanel model={model} metrics={metrics} currency={currency} />

      {/* ---- Sensitivity ------------------------------------------------ */}
      <section aria-labelledby="sensitivity-heading">
        <h2 id="sensitivity-heading" className="font-display text-xl">Sensitivity</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
          Each driver moved 20% either way, against year-3 EBITDA of{" "}
          <span className="numeric">{exact(baseEbitda)}</span>. Ranked by spread —
          which is usually not the assumption that took the longest to argue
          about. Always computed from the base case, so it does not move with the
          scenario above.
        </p>

        <DivergingBarChart
          className="mt-5"
          rows={sensitivityRows.map((row) => ({
            key: row.driver,
            label: row.label,
            low: row.low,
            high: row.high,
          }))}
          base={baseEbitda}
          formatValue={money}
          description={`Sensitivity of year-3 EBITDA to each driver, moved 20% either way. ${
            sensitivityRows[0]?.label ?? "No driver"
          } has the widest spread.`}
        />
      </section>

      {/* ---- Unit economics and break-even ------------------------------ */}
      <section aria-labelledby="unit-heading">
        <h2 id="unit-heading" className="font-display text-xl">Unit economics and break-even</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
          Anything the model does not have the inputs for reads as not modelled
          rather than zero — a zero here would be a claim we cannot support.
        </p>

        <dl className="mt-5 grid gap-6 rounded-lg border border-hairline bg-surface-raised p-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Gross margin" value={formatPercent(ue.grossMargin)} />
          <Stat
            label="Customer acquisition cost"
            value={ue.customerAcquisitionCost === null ? "Not modelled" : exact(ue.customerAcquisitionCost)}
          />
          <Stat
            label="Lifetime value"
            value={ue.lifetimeValue === null ? "Not modelled" : exact(ue.lifetimeValue)}
            note="Gross-margin LTV"
          />
          <Stat
            label="LTV to CAC"
            value={ue.ltvToCac === null ? "Not modelled" : formatMultiple(ue.ltvToCac)}
            flag={ue.ltvToCac !== null && ue.ltvToCac < 3}
            note="3× is the usual floor"
          />
          <Stat
            label="Payback"
            value={ue.paybackMonths === null ? "Not modelled" : `${ue.paybackMonths.toFixed(1)} months`}
            flag={ue.paybackMonths !== null && ue.paybackMonths > 18}
          />
          <Stat
            label="Monthly revenue to break even"
            value={
              be.monthlyRevenueRequired === null
                ? "Not reachable"
                : exact(be.monthlyRevenueRequired)
            }
            note={`At a ${formatPercent(be.contributionMarginRatio)} contribution margin`}
          />
          <Stat
            label="Units per month to break even"
            value={be.monthlyUnitsRequired === null ? "Not a unit model" : be.monthlyUnitsRequired.toFixed(0)}
          />
          <Stat
            label="Cash flow positive from"
            value={be.cashFlowPositiveMonth ? `Month ${be.cashFlowPositiveMonth}` : "Not in horizon"}
            note="And stays there"
          />
        </dl>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  flag = false,
}: {
  label: string;
  value: string;
  note?: string;
  flag?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      {/* The note lives inside the <dd>: a <dl> group may contain only dt and
          dd, so a sibling <p> here is invalid and axe flags it. */}
      <dd
        className={cn(
          "figure-hero mt-1 font-display text-2xl tracking-[-0.02em]",
          flag && "text-critical",
        )}
      >
        {value}
        {note ? (
          <span className="mt-1 block font-sans text-xs leading-snug tracking-normal text-tertiary">
            {note}
          </span>
        ) : null}
      </dd>
    </div>
  );
}
