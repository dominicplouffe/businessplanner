"use client";

import { useId, useMemo, useState } from "react";
import { useMeasure } from "./use-measure";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Time-series chart — inline SVG.
   --------------------------------------------------------------------------
   Built by hand rather than with a chart library. Drawing the marks directly
   keeps the spec exact — 2px strokes, a recessive grid, a crosshair with a
   tooltip by default, and a legend always present for two or more series so
   identity is never carried by colour alone — and it removes a dependency from
   the part of the product that matters most. The financial workspace needs
   waterfall, tornado and stacked-variance charts that a general library styles
   awkwardly anyway, and they all build on this same geometry.
   ========================================================================== */

export type Series = {
  key: string;
  label: string;
  /** A CSS custom property reference, e.g. "var(--series-1)". */
  color: string;
  values: number[];
  /** Draw a soft fill beneath the line. At most one series should use it. */
  fill?: boolean;
};

export type TimeSeriesChartProps = {
  labels: string[];
  series: Series[];
  height?: number;
  /** Ticks every N points. 12 gives one per year on a monthly model. */
  tickEvery?: number;
  formatValue: (n: number) => string;
  /** Axis tick label. */
  formatLabel: (label: string) => string;
  /** Tooltip heading. Falls back to formatLabel. */
  formatTooltipLabel?: (label: string) => string;
  /** Accessible summary; the chart is exposed as a single image to AT. */
  description: string;
  className?: string;
};

const PAD = { top: 10, right: 12, bottom: 26, left: 58 };

export function TimeSeriesChart({
  labels,
  series,
  height = 220,
  tickEvery = 12,
  formatValue,
  formatLabel,
  formatTooltipLabel,
  description,
  className,
}: TimeSeriesChartProps) {
  const tooltipLabel = formatTooltipLabel ?? formatLabel;
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const geometry = useMemo(() => {
    const innerW = Math.max(0, width - PAD.left - PAD.right);
    const innerH = Math.max(0, height - PAD.top - PAD.bottom);
    const n = labels.length;

    const all = series.flatMap((s) => s.values);
    const rawMin = Math.min(0, ...all);
    const rawMax = Math.max(0, ...all);
    const { min, max, ticks } = niceScale(rawMin, rawMax, 4);

    const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * innerW);
    const y = (v: number) => (max === min ? innerH : innerH - ((v - min) / (max - min)) * innerH);

    return { innerW, innerH, x, y, min, max, ticks, n };
  }, [width, height, labels.length, series]);

  const ready = width > 0 && geometry.n > 0;

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!ready) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left - PAD.left;
    const ratio = geometry.innerW === 0 ? 0 : localX / geometry.innerW;
    const index = Math.round(ratio * (geometry.n - 1));
    setHover(Math.max(0, Math.min(geometry.n - 1, index)));
  };

  return (
    <div className={className}>
      {series.length > 1 ? (
        <ul className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-xs text-tertiary">
              <span
                aria-hidden
                className="h-0.5 w-4 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={ref} className="relative w-full" style={{ height }}>
        {ready ? (
          <>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={description}
              className="block touch-none"
              onPointerMove={handleMove}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect x={0} y={0} width={geometry.innerW} height={geometry.innerH} />
                </clipPath>
                {series
                  .filter((s) => s.fill)
                  .map((s) => (
                    <linearGradient key={s.key} id={`${clipId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0.015} />
                    </linearGradient>
                  ))}
              </defs>

              <g transform={`translate(${PAD.left},${PAD.top})`}>
                {/* Recessive grid and value axis */}
                {geometry.ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={0}
                      x2={geometry.innerW}
                      y1={geometry.y(t)}
                      y2={geometry.y(t)}
                      stroke="var(--chart-grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={-10}
                      y={geometry.y(t)}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="numeric"
                      fontSize={11}
                      fill="var(--text-tertiary)"
                    >
                      {formatValue(t)}
                    </text>
                  </g>
                ))}

                {/* Zero line, when the scale crosses it */}
                {geometry.min < 0 && geometry.max > 0 ? (
                  <line
                    x1={0}
                    x2={geometry.innerW}
                    y1={geometry.y(0)}
                    y2={geometry.y(0)}
                    stroke="var(--chart-axis)"
                    strokeWidth={1}
                  />
                ) : null}

                {/* Time axis */}
                {labels.map((label, i) =>
                  i % tickEvery === 0 ? (
                    <text
                      key={label}
                      x={geometry.x(i)}
                      y={geometry.innerH + 18}
                      textAnchor={i === 0 ? "start" : "middle"}
                      fontSize={11}
                      fill="var(--text-tertiary)"
                    >
                      {formatLabel(label)}
                    </text>
                  ) : null,
                )}

                <g clipPath={`url(#${clipId})`}>
                  {series.map((s) => (
                    <g key={s.key}>
                      {s.fill ? (
                        <path
                          d={areaPath(s.values, geometry.x, geometry.y, geometry.innerH)}
                          fill={`url(#${clipId}-${s.key})`}
                        />
                      ) : null}
                      <path
                        d={linePath(s.values, geometry.x, geometry.y)}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </g>
                  ))}
                </g>

                {/* Pointer capture. Unpainted SVG regions do not receive
                    pointer events, so hover needs an explicit transparent
                    target across the whole plot area. */}
                <rect
                  x={0}
                  y={0}
                  width={geometry.innerW}
                  height={geometry.innerH}
                  fill="transparent"
                />

                {/* Crosshair */}
                {hover !== null ? (
                  <g>
                    <line
                      x1={geometry.x(hover)}
                      x2={geometry.x(hover)}
                      y1={0}
                      y2={geometry.innerH}
                      stroke="var(--chart-axis)"
                      strokeWidth={1}
                    />
                    {series.map((s) => (
                      <circle
                        key={s.key}
                        cx={geometry.x(hover)}
                        cy={geometry.y(s.values[hover] ?? 0)}
                        r={4}
                        fill={s.color}
                        stroke="var(--chart-surface)"
                        strokeWidth={2}
                      />
                    ))}
                  </g>
                ) : null}
              </g>
            </svg>

            {hover !== null ? (
              <Tooltip
                x={PAD.left + geometry.x(hover)}
                containerWidth={width}
                label={tooltipLabel(labels[hover] ?? "")}
                rows={series.map((s) => ({
                  key: s.key,
                  label: s.label,
                  color: s.color,
                  value: formatValue(s.values[hover] ?? 0),
                }))}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Tooltip({
  x,
  containerWidth,
  label,
  rows,
}: {
  x: number;
  containerWidth: number;
  label: string;
  rows: { key: string; label: string; color: string; value: string }[];
}) {
  // Flip to the left of the crosshair when it would overflow the container.
  const flip = x > containerWidth - 150;
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-1 z-10 min-w-[8.5rem] rounded-md border border-hairline bg-surface-raised p-2.5 shadow-lg shadow-ink-950/10",
      )}
      style={flip ? { right: containerWidth - x + 10 } : { left: x + 10 }}
    >
      <p className="text-xs font-medium text-primary">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-tertiary">
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="numeric text-primary">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

function linePath(values: number[], x: (i: number) => number, y: (v: number) => number): string {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");
}

function areaPath(
  values: number[],
  x: (i: number) => number,
  y: (v: number) => number,
  baseline: number,
): string {
  if (values.length === 0) return "";
  const top = linePath(values, x, y);
  return `${top} L${x(values.length - 1).toFixed(2)},${baseline.toFixed(2)} L${x(0).toFixed(2)},${baseline.toFixed(2)} Z`;
}

/** Rounds a domain out to human tick values (1, 2, 2.5, 5 × 10^n). */
function niceScale(min: number, max: number, targetTicks: number) {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) *
    magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) {
    ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);
  }
  return { min: niceMin, max: niceMax, ticks };
}
