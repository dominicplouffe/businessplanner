"use client";

import { useMemo, useState } from "react";
import { CalculatorFrame, Headline, NumberInput, ResultList } from "./shell";
import { MoneyTimeSeries } from "@/components/charts/money-time-series";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/finance/format";

/**
 * Break-even, computed by running a real sixty-month model rather than by
 * dividing two numbers. The month operating profit first turns positive then
 * comes out of the engine, which is also where the product gets it — so the
 * tool and the product cannot disagree.
 */
export function BreakEvenCalculator() {
  const [price, setPrice] = useState(48);
  const [variableCost, setVariableCost] = useState(19);
  const [unitsMonth1, setUnitsMonth1] = useState(400);
  const [growth, setGrowth] = useState(4);
  const [fixedCosts, setFixedCosts] = useState(9_500);
  const [ownerPay, setOwnerPay] = useState(60_000);

  const r = useMemo(() => {
    const model = buildModel({
      company: { name: "Break-even", startDate: "2026-01-01", industryKey: "other" },
      revenueStreams: [
        {
          id: "sales",
          name: "Sales",
          kind: "unit-sales",
          startMonth: 1,
          unitsMonth1: Math.max(0, unitsMonth1),
          monthlyGrowthRate: Math.max(0, growth) / 100,
          pricePerUnit: Math.max(0, price),
          costPerUnit: Math.max(0, variableCost),
        },
      ],
      // Owner pay is a role rather than an opex line so it lands in the same
      // place the product puts it. A break-even that pays the owner nothing is
      // the most common silent fiction in a plan.
      roles: [
        { id: "own", title: "Owner", annualSalary: Math.max(0, ownerPay), isOwner: true, startMonth: 1 },
      ],
      opex: [
        { id: "fixed", name: "Fixed costs", category: "other", monthlyAmount: Math.max(0, fixedCosts) },
      ],
      equityRounds: [{ id: "seed", name: "Opening capital", month: 1, amount: 50_000 }],
      // Representative trade terms, so the cash break-even genuinely lands after
      // the profit break-even. With no receivables and no stock the two dates
      // collapse together and the distinction the page is making disappears.
      workingCapital: { receivableDays: 14, payableDays: 30, inventoryDays: 21 },
    });
    const metrics = computeMetrics(model);
    const contribution = Math.max(0, price) - Math.max(0, variableCost);
    return { model, metrics, contribution };
  }, [price, variableCost, unitsMonth1, growth, fixedCosts, ownerPay]);

  const be = r.metrics.breakEven;
  const monthlyUnitsAtStart = Math.max(0, unitsMonth1);
  const unitsNeeded = be.monthlyUnitsRequired;

  return (
    <CalculatorFrame
      inputs={
        <>
          <NumberInput label="Price per unit" value={price} onChange={setPrice} prefix="$" step={1} />
          <NumberInput
            label="Variable cost per unit"
            value={variableCost}
            onChange={setVariableCost}
            prefix="$"
            step={1}
            hint="What one more sale costs you — materials, packaging, payment fees."
          />
          <NumberInput label="Units in month one" value={unitsMonth1} onChange={setUnitsMonth1} step={10} />
          <NumberInput label="Monthly growth" value={growth} onChange={setGrowth} suffix="%" step={0.5} />
          <NumberInput
            label="Fixed costs per month"
            value={fixedCosts}
            onChange={setFixedCosts}
            prefix="$"
            step={250}
            hint="Rent, insurance, software, staff who are there whether you sell or not."
          />
          <NumberInput
            label="Owner compensation"
            value={ownerPay}
            onChange={setOwnerPay}
            prefix="$"
            suffix="/yr"
            step={5_000}
            hint="Included deliberately. A lender substitutes a market salary when it reads zero, and the plan fails on first review."
          />
        </>
      }
      results={
        <div className="space-y-6">
          <Headline
            label="Break-even"
            value={
              unitsNeeded === null || !Number.isFinite(unitsNeeded)
                ? "Never at this price"
                : `${formatNumber(Math.ceil(unitsNeeded))} units a month`
            }
            tone={r.contribution <= 0 ? "critical" : "neutral"}
            note={
              r.contribution <= 0
                ? "Every sale loses money before any fixed cost is paid. No volume fixes that — the price or the unit cost has to move."
                : unitsNeeded !== null && Number.isFinite(unitsNeeded)
                  ? `${formatCurrency(be.monthlyRevenueRequired, "USD", {
                      decimals: 0,
                    })} of revenue a month. You are starting at ${formatNumber(monthlyUnitsAtStart)}.`
                  : undefined
            }
          />

          <ResultList
            rows={[
              {
                label: "Contribution per unit",
                value: formatCurrency(r.contribution, "USD", { decimals: 2 }),
                note: "Price less variable cost — what each sale puts towards the fixed costs.",
              },
              {
                label: "Contribution margin",
                value: formatPercent(be.contributionMarginRatio),
              },
              {
                label: "Average monthly fixed costs",
                value: formatCurrency(be.averageMonthlyFixedCosts, "USD", { decimals: 0 }),
                note: "Including loaded owner compensation, which is why this is higher than the figure you typed.",
              },
              {
                label: "First profitable month",
                value: be.profitMonth ? `Month ${be.profitMonth}` : "Not within five years",
              },
              {
                label: "Cash-flow positive from",
                value: be.cashFlowPositiveMonth
                  ? `Month ${be.cashFlowPositiveMonth}`
                  : "Not within five years",
                note: "Later than the profit date whenever you carry stock or receivables. Both dates matter; only one of them pays a supplier.",
              },
            ]}
          />

          <div>
            <h3 className="font-display text-lg">Revenue against total cost</h3>
            <div className="mt-4 rounded-lg border border-hairline bg-surface-raised p-5">
              <MoneyTimeSeries
                labels={r.model.monthLabels}
                height={220}
                series={[
                  {
                    key: "revenue",
                    label: "Revenue",
                    color: "var(--series-1)",
                    values: r.model.pnl.revenue,
                    fill: true,
                  },
                  {
                    key: "cost",
                    label: "Total cost",
                    color: "var(--series-4)",
                    values: r.model.pnl.revenue.map(
                      (_, i) => (r.model.pnl.cogs[i] ?? 0) + (r.model.pnl.totalOpex[i] ?? 0),
                    ),
                  },
                ]}
                description="Monthly revenue against total cost; they cross at break-even."
              />
            </div>
          </div>
        </div>
      }
    />
  );
}
