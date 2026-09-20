"use client";

import { useMemo, useState } from "react";
import { CalculatorFrame, Headline, NumberInput, ResultList } from "./shell";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { formatCurrency, formatMultiple, formatNumber, formatPercent } from "@/lib/finance/format";

/** LTV, CAC and payback from the product's own metrics module. Lifetime value
 *  is computed on gross margin, never on revenue — computing it on revenue is
 *  the most common way the figure gets inflated by a factor of three. */
export function UnitEconomicsCalculator() {
  const [price, setPrice] = useState(89);
  const [grossMargin, setGrossMargin] = useState(78);
  const [churn, setChurn] = useState(3.2);
  const [cac, setCac] = useState(640);
  const [newPerMonth, setNewPerMonth] = useState(45);

  const r = useMemo(() => {
    const margin = Math.min(1, Math.max(0, grossMargin / 100));
    const model = buildModel({
      company: { name: "Unit economics", startDate: "2026-01-01", industryKey: "saas" },
      revenueStreams: [
        {
          id: "subs",
          name: "Subscriptions",
          kind: "subscription",
          startMonth: 1,
          initialCustomers: 0,
          newCustomersMonth1: Math.max(0, newPerMonth),
          monthlyChurnRate: Math.min(1, Math.max(0, churn / 100)),
          pricePerCustomerPerMonth: Math.max(0, price),
          cogsPercent: 1 - margin,
        },
      ],
      unitEconomics: { customerAcquisitionCost: Math.max(0, cac), grossMarginOverride: margin },
      equityRounds: [{ id: "seed", name: "Opening capital", month: 1, amount: 250_000 }],
    });
    return computeMetrics(model).unitEconomics;
  }, [price, grossMargin, churn, cac, newPerMonth]);

  const lifetimeMonths = churn > 0 ? 100 / churn : null;
  const healthy = r.ltvToCac !== null && r.ltvToCac >= 3;
  const paybackHealthy = r.paybackMonths !== null && r.paybackMonths <= 12;

  return (
    <CalculatorFrame
      inputs={
        <>
          <NumberInput label="Price per customer per month" value={price} onChange={setPrice} prefix="$" step={1} />
          <NumberInput
            label="Gross margin"
            value={grossMargin}
            onChange={setGrossMargin}
            suffix="%"
            step={1}
            max={100}
            hint="Revenue less the cost of serving that customer — hosting, support, payment fees."
          />
          <NumberInput
            label="Monthly churn"
            value={churn}
            onChange={setChurn}
            suffix="%"
            step={0.1}
            max={100}
            hint="Share of customers who leave each month. Lifetime value divides by this, so an optimistic figure here moves everything."
          />
          <NumberInput
            label="Customer acquisition cost"
            value={cac}
            onChange={setCac}
            prefix="$"
            step={25}
            hint="Everything spent to win one customer — advertising, sales salaries, commission."
          />
          <NumberInput label="New customers per month" value={newPerMonth} onChange={setNewPerMonth} step={5} />
        </>
      }
      results={
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Headline
              label="LTV to CAC"
              value={r.ltvToCac === null ? "—" : formatMultiple(r.ltvToCac, 1)}
              tone={r.ltvToCac === null ? "neutral" : healthy ? "good" : "warning"}
              note={
                r.ltvToCac === null
                  ? "Needs a churn rate and an acquisition cost."
                  : healthy
                    ? "At or above the 3× investors treat as the floor."
                    : "Below 3×, which is where investors start asking whether the acquisition channel works."
              }
            />
            <Headline
              label="Payback"
              value={
                r.paybackMonths === null || !Number.isFinite(r.paybackMonths)
                  ? "Never"
                  : `${formatNumber(r.paybackMonths, 1)} months`
              }
              tone={paybackHealthy ? "good" : "warning"}
              note="Months of gross profit before a customer has repaid what it cost to win them."
            />
          </div>

          <ResultList
            rows={[
              {
                label: "Lifetime value",
                value: r.lifetimeValue === null ? "—" : formatCurrency(r.lifetimeValue, "USD", { decimals: 0 }),
                note: "ARPU × gross margin ÷ monthly churn. On margin, not on revenue.",
              },
              {
                label: "Gross profit per customer per month",
                value: formatCurrency(Math.max(0, price) * Math.min(1, Math.max(0, grossMargin / 100)), "USD", {
                  decimals: 2,
                }),
              },
              {
                label: "Average customer lifetime",
                value: lifetimeMonths === null ? "—" : `${formatNumber(lifetimeMonths, 1)} months`,
                note: "One over the monthly churn rate.",
              },
              {
                label: "Monthly acquisition spend at this volume",
                value: formatCurrency(Math.max(0, cac) * Math.max(0, newPerMonth), "USD", { decimals: 0 }),
                note: "The cash the growth rate above actually costs, which is the part most plans leave out.",
              },
              { label: "Gross margin used", value: formatPercent(r.grossMargin) },
            ]}
          />

          <p className="text-xs leading-relaxed text-tertiary">
            A ratio above 3× with a payback under twelve months is the shape investors
            look for, but neither is a rule. What they actually test is whether the churn
            rate is measured or hoped for — so say which, in the plan, where they will
            read it.
          </p>
        </div>
      }
    />
  );
}
