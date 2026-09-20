"use client";

import { useMemo, useState } from "react";
import { CalculatorFrame, Headline, NumberInput, ResultList } from "./shell";
import { MoneyTimeSeries } from "@/components/charts/money-time-series";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { formatCurrency, formatNumber } from "@/lib/finance/format";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Burn and runway from a real sixty-month model, so the revenue ramp is
 * accounted for rather than assumed away. Naming the month the cash runs out is
 * the whole point — "eleven months of runway" is a number people nod at, and a
 * date is a thing people act on.
 */
export function BurnRunwayCalculator() {
  const [cash, setCash] = useState(420_000);
  const [revenue, setRevenue] = useState(18_000);
  const [revenueGrowth, setRevenueGrowth] = useState(8);
  const [payroll, setPayroll] = useState(62_000);
  const [otherCosts, setOtherCosts] = useState(14_000);
  const [startMonth, setStartMonth] = useState(1);

  const r = useMemo(() => {
    const model = buildModel({
      company: {
        name: "Runway",
        startDate: `2026-${String(Math.min(12, Math.max(1, Math.round(startMonth)))).padStart(2, "0")}-01`,
        industryKey: "saas",
      },
      revenueStreams: [
        {
          id: "rev",
          name: "Revenue",
          kind: "unit-sales",
          startMonth: 1,
          unitsMonth1: Math.max(0, revenue),
          monthlyGrowthRate: Math.max(0, revenueGrowth) / 100,
          pricePerUnit: 1,
          costPerUnit: 0,
        },
      ],
      opex: [
        // Payroll goes in as an opex line rather than as roles: this tool asks
        // for a loaded monthly figure, and running it through the payroll
        // loading a second time would overstate the burn by about a fifth.
        { id: "payroll", name: "Payroll, fully loaded", category: "salaries", monthlyAmount: Math.max(0, payroll) },
        { id: "other", name: "Everything else", category: "other", monthlyAmount: Math.max(0, otherCosts) },
      ],
      equityRounds: [{ id: "cash", name: "Cash in the bank", month: 1, amount: Math.max(0, cash) }],
      // Everything settles in the month it is incurred. The engine's default
      // thirty days of payables made month one's operating cash flow positive —
      // the bills had simply not been paid yet — and a runway calculator that
      // reports "cash-flow positive" because of trade credit is worse than no
      // calculator.
      workingCapital: { receivableDays: 0, payableDays: 0, inventoryDays: 0 },
    });
    const metrics = computeMetrics(model);

    // Runway is measured from today's burn, not from month sixty's, so it is
    // recomputed on the current month rather than read off the last one.
    const monthlyNet = (model.cashFlow.operating[0] ?? 0);
    const runwayMonths = monthlyNet < 0 ? Math.max(0, cash) / -monthlyNet : null;
    const grossBurnMonth1 = (model.pnl.cogs[0] ?? 0) + (model.pnl.totalOpex[0] ?? 0);

    const cashOut = metrics.cash.cashOutMonth;
    const startIndex = Math.min(12, Math.max(1, Math.round(startMonth))) - 1;
    const cashOutLabel =
      cashOut === null
        ? null
        : `${MONTH_NAMES[(startIndex + cashOut - 1) % 12]} ${2026 + Math.floor((startIndex + cashOut - 1) / 12)}`;

    return { model, metrics, monthlyNet, runwayMonths, grossBurnMonth1, cashOut, cashOutLabel };
  }, [cash, revenue, revenueGrowth, payroll, otherCosts, startMonth]);

  const tight = r.runwayMonths !== null && r.runwayMonths < 9;

  return (
    <CalculatorFrame
      inputs={
        <>
          <NumberInput label="Cash in the bank" value={cash} onChange={setCash} prefix="$" step={10_000} />
          <NumberInput label="Revenue this month" value={revenue} onChange={setRevenue} prefix="$" step={1_000} />
          <NumberInput
            label="Monthly revenue growth"
            value={revenueGrowth}
            onChange={setRevenueGrowth}
            suffix="%"
            step={1}
            hint="Held constant across the horizon. If you would not defend it for five years, try a lower one."
          />
          <NumberInput
            label="Payroll, fully loaded"
            value={payroll}
            onChange={setPayroll}
            prefix="$"
            suffix="/mo"
            step={2_000}
            hint="Including employer taxes and benefits, which usually add about a fifth."
          />
          <NumberInput
            label="Everything else"
            value={otherCosts}
            onChange={setOtherCosts}
            prefix="$"
            suffix="/mo"
            step={1_000}
          />
          <NumberInput
            label="Starting month"
            value={startMonth}
            onChange={setStartMonth}
            step={1}
            min={1}
            max={12}
            hint="1 = January 2026. Used to name the month the cash runs out."
          />
        </>
      }
      results={
        <div className="space-y-6">
          <Headline
            label="Runway"
            value={
              r.runwayMonths === null
                ? "Cash-flow positive"
                : `${formatNumber(r.runwayMonths, 1)} months`
            }
            tone={r.runwayMonths === null ? "good" : tight ? "critical" : "neutral"}
            note={
              r.runwayMonths === null
                ? "Revenue already covers costs at this month's run rate. Runway is not the constraint; growth is."
                : r.cashOutLabel
                  ? `Cash reaches zero in ${r.cashOutLabel} on this plan. Most advice is to start raising when six months remain, not when the runway ends.`
                  : "Revenue catches up before the cash runs out, so there is no cash-out date within five years."
            }
          />

          <ResultList
            rows={[
              {
                label: "Gross burn",
                value: formatCurrency(r.grossBurnMonth1, "USD", { decimals: 0 }),
                note: "Everything going out, before any revenue.",
              },
              {
                label: "Net burn",
                value:
                  r.monthlyNet >= 0
                    ? `${formatCurrency(r.monthlyNet, "USD", { decimals: 0 })} generated`
                    : formatCurrency(-r.monthlyNet, "USD", { decimals: 0 }),
                note: "Gross burn less revenue. This is what runway is computed on.",
              },
              {
                label: "Lowest cash on this plan",
                value: formatCurrency(r.metrics.cash.lowestCash, "USD", { decimals: 0 }),
                note: `In month ${r.metrics.cash.lowestCashMonth}.`,
              },
              ...(r.metrics.cash.peakFundingNeed > 0
                ? [
                    {
                      label: "Additional funding needed",
                      value: formatCurrency(r.metrics.cash.peakFundingNeed, "USD", { decimals: 0 }),
                      note: "The deepest the account goes below zero — the minimum a raise has to cover before anything else.",
                    },
                  ]
                : []),
            ]}
          />

          <div>
            <h3 className="font-display text-lg">Cash across five years</h3>
            <div className="mt-4 rounded-lg border border-hairline bg-surface-raised p-5">
              <MoneyTimeSeries
                labels={r.model.monthLabels}
                height={220}
                series={[
                  {
                    key: "cash",
                    label: "Closing cash",
                    color: "var(--series-1)",
                    values: r.model.cashFlow.closingCash,
                    fill: true,
                  },
                ]}
                description="Closing cash balance across sixty months."
              />
            </div>
          </div>
        </div>
      }
    />
  );
}
