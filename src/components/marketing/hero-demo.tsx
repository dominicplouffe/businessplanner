"use client";

import { useId, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { formatCurrency, formatMonthLabel, formatMultiple, formatPercent, formatYearLabel } from "@/lib/finance/format";
import { DEMO_PRESETS, type DemoDriver } from "@/lib/content/demo-presets";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The homepage demo. It runs the real financial engine in the browser — the
 * numbers here are the numbers the product computes, not a mock. It also cannot
 * fail: there is no network call and no model involved.
 */
export function HeroDemo() {
  const [presetKey, setPresetKey] = useState(DEMO_PRESETS[0]!.key);
  const preset = DEMO_PRESETS.find((p) => p.key === presetKey) ?? DEMO_PRESETS[0]!;
  const [values, setValues] = useState<Record<string, [number, number]>>(() =>
    Object.fromEntries(
      DEMO_PRESETS.map((p) => [p.key, [p.drivers[0].initial, p.drivers[1].initial] as [number, number]]),
    ),
  );

  const current = useMemo<[number, number]>(
    () => values[preset.key] ?? [preset.drivers[0].initial, preset.drivers[1].initial],
    [values, preset],
  );

  const { model, metrics, chart } = useMemo(() => {
    const m = buildModel(preset.build(current[0], current[1]));
    const k = computeMetrics(m);
    const chart = {
      labels: m.monthLabels,
      series: [
        { key: "revenue", label: "Revenue", color: "var(--series-1)", values: m.pnl.revenue, fill: true },
        { key: "ebitda", label: "EBITDA", color: "var(--series-3)", values: m.pnl.ebitda },
      ],
    };
    return { model: m, metrics: k, chart };
  }, [preset, current]);

  const year3 = model.annual[2] ?? model.annual.at(-1)!;
  const setDriver = (index: 0 | 1, value: number) =>
    setValues((prev) => {
      const pair = prev[preset.key] ?? [preset.drivers[0].initial, preset.drivers[1].initial];
      const next: [number, number] = index === 0 ? [value, pair[1]] : [pair[0], value];
      return { ...prev, [preset.key]: next };
    });

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface-raised shadow-xl shadow-ink-950/[0.06]">
      {/* Preset tabs */}
      <div
        role="tablist"
        aria-label="Example business"
        className="flex overflow-x-auto border-b border-hairline"
      >
        {DEMO_PRESETS.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={p.key === preset.key}
            onClick={() => setPresetKey(p.key)}
            className={cn(
              "relative shrink-0 px-5 py-3.5 text-sm transition-colors",
              p.key === preset.key
                ? "text-primary"
                : "text-tertiary hover:text-secondary",
            )}
          >
            {p.label}
            {p.key === preset.key ? (
              <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 bg-emerald-700" />
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* Drivers */}
        <div className="border-b border-hairline p-6 lg:border-b-0 lg:border-r">
          <p className="text-sm leading-relaxed text-secondary">{preset.blurb}</p>
          <div className="mt-6 space-y-6">
            <DriverSlider
              driver={preset.drivers[0]}
              value={current[0]}
              onChange={(v) => setDriver(0, v)}
            />
            <DriverSlider
              driver={preset.drivers[1]}
              value={current[1]}
              onChange={(v) => setDriver(1, v)}
            />
          </div>
          <p className="mt-6 border-t border-hairline pt-4 text-xs leading-relaxed text-tertiary">
            Move a driver and every figure recomputes. This is the production
            engine running in your browser — not a recorded example.
          </p>
        </div>

        {/* Output */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat
              label="Year 3 revenue"
              value={formatCurrency(year3.revenue, "USD", { compact: true })}
            />
            <Stat
              label="Year 3 EBITDA"
              value={formatCurrency(year3.ebitda, "USD", { compact: true })}
              tone={year3.ebitda >= 0 ? "up" : "down"}
            />
            <Stat
              label="Breaks even"
              value={
                metrics.breakEven.profitMonth
                  ? `Month ${metrics.breakEven.profitMonth}`
                  : "Not in 5 years"
              }
              tone={metrics.breakEven.profitMonth ? undefined : "down"}
            />
            {metrics.underwriter.minimumDscr !== null ? (
              <Stat
                label="Min. DSCR"
                value={formatMultiple(metrics.underwriter.minimumDscr)}
                tone={metrics.underwriter.minimumDscr >= 1.15 ? "up" : "down"}
              />
            ) : (
              <Stat
                label="Gross margin"
                value={formatPercent(metrics.unitEconomics.grossMargin)}
              />
            )}
          </div>

          <div className="mt-7">
            <TimeSeriesChart
              labels={chart.labels}
              series={chart.series}
              height={200}
              formatValue={(n) => formatCurrency(n, "USD", { compact: true })}
              formatLabel={formatYearLabel}
              formatTooltipLabel={formatMonthLabel}
              description="Monthly revenue and EBITDA across the five-year plan"
            />
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-tertiary">
              Balance sheet ties in all {model.horizonMonths} periods
              <span aria-hidden className="mx-2 text-hairline">·</span>
              {model.annual.length}-year model
            </p>
            <ButtonLink href="/sign-up" size="sm" className="self-start sm:self-auto">
              Build this for my business
              <ArrowRight aria-hidden className="size-3.5" />
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverSlider({
  driver,
  value,
  onChange,
}: {
  driver: DemoDriver;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const display =
    driver.unit === "currency"
      ? formatCurrency(value, "USD", { decimals: value % 1 === 0 ? 0 : 2 })
      : driver.unit === "percent"
        ? formatPercent(value)
        : value.toLocaleString("en-US");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-secondary">
          {driver.label}
        </label>
        <output htmlFor={id} className="numeric text-sm font-medium text-primary">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={driver.min}
        max={driver.max}
        step={driver.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-emerald-700"
      />
      <p className="mt-1 text-xs text-tertiary">{driver.hint}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <p className="text-xs text-tertiary">{label}</p>
      <p
        className={cn(
          "figure-hero mt-1 font-display text-2xl tracking-[-0.02em]",
          tone === "up" && "text-delta-up",
          tone === "down" && "text-delta-down",
        )}
      >
        {value}
      </p>
    </div>
  );
}
