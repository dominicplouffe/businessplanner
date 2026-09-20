"use client";

import { useId, useMemo } from "react";
import { useMeasure } from "./use-measure";
import { niceScale } from "./scale";

/* ==========================================================================
   Threshold bar chart.
   --------------------------------------------------------------------------
   Several ratios read against one limit — which is what an underwriter does
   with DSCR. The limit is drawn as a labelled reference line rather than left
   implicit, and a bar that falls short is marked three ways: a hatch overlay,
   a "below" label and the diverging-negative colour. Colour is the last of the
   three, never the only one.
   ========================================================================== */

export type ThresholdBarRow = {
  key: string;
  label: string;
  /** Null where the ratio is undefined — no debt service in that period. */
  value: number | null;
};

export type ThresholdBarChartProps = {
  rows: ThresholdBarRow[];
  threshold: number;
  /** Printed against the reference line, e.g. "1.15× SBA 7(a) minimum". */
  thresholdLabel: string;
  formatValue: (n: number) => string;
  /** Shown under a bar that falls short. */
  belowLabel?: string;
  /** Accessible summary; the chart is exposed as a single image to AT. */
  description: string;
  height?: number;
  className?: string;
};

const PAD = { top: 26, right: 10, bottom: 38, left: 46 };
const MAX_BAR_WIDTH = 72;

export function ThresholdBarChart({
  rows,
  threshold,
  thresholdLabel,
  formatValue,
  belowLabel = "below",
  description,
  height = 220,
  className,
}: ThresholdBarChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const hatchId = useId();

  const geometry = useMemo(() => {
    const innerW = Math.max(0, width - PAD.left - PAD.right);
    const innerH = Math.max(0, height - PAD.top - PAD.bottom);
    const present = rows.map((r) => r.value).filter((v): v is number => v !== null);
    // The domain has to reach below zero when a ratio does: a year with
    // negative cash available has a negative coverage, and clamping the scale
    // at zero would draw it as no bar at all — the one result a reader most
    // needs to see.
    const { min, max, ticks } = niceScale(
      Math.min(0, ...present),
      Math.max(threshold, ...present, 0),
      4,
    );
    const y = (v: number) => (max === min ? innerH : innerH - ((v - min) / (max - min)) * innerH);
    const slot = rows.length === 0 ? innerW : innerW / rows.length;
    const barWidth = Math.min(MAX_BAR_WIDTH, slot * 0.55);
    const centre = (i: number) => slot * i + slot / 2;
    return { innerW, innerH, min, max, ticks, y, centre, barWidth, zero: y(0) };
  }, [width, height, rows, threshold]);

  const ready = width > 0 && rows.length > 0;

  return (
    <div ref={ref} className={className} style={{ minHeight: height }}>
      {ready ? (
        <svg width={width} height={height} role="img" aria-label={description} className="block">
          <defs>
            <pattern id={hatchId} width={6} height={6} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1={0} y1={0} x2={0} y2={6} stroke="var(--chart-surface)" strokeWidth={2} opacity={0.55} />
            </pattern>
          </defs>

          <g transform={`translate(${PAD.left},${PAD.top})`}>
            {/* Value axis, recessive */}
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

            {rows.map((row, i) => {
              const cx = geometry.centre(i);
              const x = cx - geometry.barWidth / 2;
              const below = row.value !== null && row.value < threshold;

              return (
                <g key={row.key}>
                  {row.value === null ? (
                    <>
                      <line
                        x1={x}
                        x2={x + geometry.barWidth}
                        y1={geometry.zero}
                        y2={geometry.zero}
                        stroke="var(--chart-axis)"
                        strokeWidth={2}
                      />
                      <text
                        x={cx}
                        y={geometry.zero - 8}
                        textAnchor="middle"
                        fontSize={10}
                        fill="var(--text-tertiary)"
                      >
                        no debt
                      </text>
                    </>
                  ) : (
                    <>
                      {/* Bars grow from zero, not from the floor, so a negative
                          ratio hangs below the line instead of vanishing. */}
                      <rect
                        x={x}
                        y={Math.min(geometry.y(row.value), geometry.zero)}
                        width={geometry.barWidth}
                        height={Math.abs(geometry.y(row.value) - geometry.zero)}
                        fill={below ? "var(--diverge-neg)" : "var(--diverge-pos)"}
                        opacity={0.9}
                      />
                      {below ? (
                        <rect
                          x={x}
                          y={Math.min(geometry.y(row.value), geometry.zero)}
                          width={geometry.barWidth}
                          height={Math.abs(geometry.y(row.value) - geometry.zero)}
                          fill={`url(#${hatchId})`}
                        />
                      ) : null}
                      {/* One rule for every bar: the figure sits above the
                          bar's top edge, which for a negative bar is the zero
                          line. A plate keeps it readable where that lands on
                          the reference line. */}
                      {row.value < 0 ? (
                        <rect
                          x={cx - 26}
                          y={geometry.zero - 19}
                          width={52}
                          height={16}
                          rx={2}
                          fill="var(--chart-surface)"
                          opacity={0.92}
                        />
                      ) : null}
                      <text
                        x={cx}
                        y={Math.min(geometry.y(row.value), geometry.zero) - 7}
                        textAnchor="middle"
                        className="numeric"
                        fontSize={11}
                        fill="var(--text-primary)"
                      >
                        {formatValue(row.value)}
                      </text>
                      {below ? (
                        <text
                          x={cx}
                          y={geometry.innerH + 32}
                          textAnchor="middle"
                          fontSize={10}
                          fill="var(--status-critical)"
                        >
                          {`▼ ${belowLabel}`}
                        </text>
                      ) : null}
                    </>
                  )}

                  <text
                    x={cx}
                    y={geometry.innerH + 16}
                    textAnchor="middle"
                    fontSize={11}
                    fill="var(--text-tertiary)"
                  >
                    {row.label}
                  </text>
                </g>
              );
            })}

            {geometry.min < 0 ? (
              <line
                x1={0}
                x2={geometry.innerW}
                y1={geometry.zero}
                y2={geometry.zero}
                stroke="var(--chart-axis)"
                strokeWidth={1}
              />
            ) : null}

            {/* The limit itself, drawn over the bars so it is never ambiguous
                which side of it a bar lands on. */}
            <line
              x1={0}
              x2={geometry.innerW}
              y1={geometry.y(threshold)}
              y2={geometry.y(threshold)}
              stroke="var(--chart-axis)"
              strokeWidth={1.5}
              strokeDasharray="5 3"
            />
            {/* A backing plate, because the label sits wherever the limit
                falls and a tall bar is often directly behind it. SVG cannot
                measure text before layout, so the width is estimated from the
                character count at this size. */}
            <rect
              x={geometry.innerW - (thresholdLabel.length * 5.9 + 10)}
              y={geometry.y(threshold) - 19}
              width={thresholdLabel.length * 5.9 + 10}
              height={16}
              rx={2}
              fill="var(--chart-surface)"
              opacity={0.92}
            />
            <text
              x={geometry.innerW - 5}
              y={geometry.y(threshold) - 7}
              textAnchor="end"
              fontSize={11}
              fill="var(--text-secondary)"
            >
              {thresholdLabel}
            </text>
          </g>
        </svg>
      ) : null}
    </div>
  );
}
