"use client";

import { useMemo } from "react";
import { useMeasure } from "./use-measure";
import { niceScale } from "./scale";

/* ==========================================================================
   Diverging bar chart — the sensitivity tornado.
   --------------------------------------------------------------------------
   Diverging is the right form here because the job is delta-to-baseline, not
   magnitude: each bar runs from the downside outcome to the upside outcome and
   is split at the base case, so the reader sees both the direction and the
   spread of each driver at once. Sorted by spread, which is what tells a
   founder which assumption actually matters — usually not the one they spent
   the most time on.

   The pair is blue ↔ terracotta from globals.css, not emerald ↔ terracotta:
   green/red measures ΔE 0.8 under protanopia, i.e. indistinguishable. Every
   row also states both deltas as signed figures, in fixed columns either side
   of the bars, so colour is never the only channel and a label never lands on
   top of the bar it belongs to.
   ========================================================================== */

export type DivergingBarRow = {
  key: string;
  label: string;
  /** Outcome when the driver moves against the plan. */
  low: number;
  /** Outcome when it moves in the plan's favour. */
  high: number;
};

export type DivergingBarChartProps = {
  rows: DivergingBarRow[];
  /** The base-case outcome every bar is split at. */
  base: number;
  formatValue: (n: number) => string;
  /** Accessible summary; the chart is exposed as a single image to AT. */
  description: string;
  className?: string;
};

const ROW_HEIGHT = 34;
const BAR_HEIGHT = 16;
const PAD_TOP = 6;
const PAD_BOTTOM = 26;
const VALUE_WIDTH = 56;
const GAP = 8;

export function DivergingBarChart({
  rows,
  base,
  formatValue,
  description,
  className,
}: DivergingBarChartProps) {
  const { ref, width } = useMeasure<HTMLDivElement>();

  const innerH = rows.length * ROW_HEIGHT;
  const height = innerH + PAD_TOP + PAD_BOTTOM;

  const geometry = useMemo(() => {
    // The driver names take a share of the width rather than a fixed slab, so
    // the bars keep a usable plot area on a phone.
    const nameWidth = Math.max(64, Math.min(132, width * 0.28));
    const left = nameWidth + GAP + VALUE_WIDTH;
    const right = VALUE_WIDTH;
    const innerW = Math.max(0, width - left - right);

    const values = rows.flatMap((r) => [r.low, r.high]).concat(base);
    const { min, max, ticks } = niceScale(
      Math.min(...values),
      Math.max(...values),
      innerW < 260 ? 2 : 3,
    );
    const x = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * innerW);
    return { left, innerW, nameWidth, min, max, ticks, x };
  }, [width, rows, base]);

  const ready = width > 0 && rows.length > 0 && geometry.innerW > 0;

  return (
    <div ref={ref} className={className}>
      {ready ? (
        <svg width={width} height={height} role="img" aria-label={description} className="block">
          <g transform={`translate(${geometry.left},${PAD_TOP})`}>
            {/* Value axis, recessive */}
            {geometry.ticks.map((t) => (
              <g key={t}>
                <line
                  x1={geometry.x(t)}
                  x2={geometry.x(t)}
                  y1={0}
                  y2={innerH}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                />
                <text
                  x={geometry.x(t)}
                  y={innerH + 17}
                  textAnchor="middle"
                  className="numeric"
                  fontSize={11}
                  fill="var(--text-tertiary)"
                >
                  {formatValue(t)}
                </text>
              </g>
            ))}

            {rows.map((row, i) => {
              const centre = i * ROW_HEIGHT + ROW_HEIGHT / 2;
              const y = centre - BAR_HEIGHT / 2;
              const xBase = geometry.x(base);
              const deltas = [row.low - base, row.high - base];
              // Which side of the base a bar lands on is read from the delta,
              // never from which input produced it: raising payroll or opex
              // moves the outcome DOWN, so the "high" input sits on the left
              // for those drivers.
              const down = Math.min(...deltas);
              const up = Math.max(...deltas);
              const inert = up === 0 && down === 0;

              return (
                <g key={row.key}>
                  <text
                    x={-(VALUE_WIDTH + GAP)}
                    y={centre}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="var(--text-secondary)"
                  >
                    {wrapLabel(row.label, geometry.nameWidth).map((line, lineIndex, lines) => (
                      <tspan
                        key={line}
                        x={-(VALUE_WIDTH + GAP)}
                        dy={lineIndex === 0 ? -(lines.length - 1) * 6 : 12}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>

                  {inert ? (
                    <text
                      x={xBase + 8}
                      y={centre}
                      dominantBaseline="middle"
                      fontSize={10}
                      fill="var(--text-tertiary)"
                    >
                      no effect
                    </text>
                  ) : (
                    <>
                      {deltas.map((delta, endIndex) => {
                        const xEnd = geometry.x(base + delta);
                        return (
                          <rect
                            key={endIndex}
                            x={Math.min(xBase, xEnd)}
                            y={y}
                            width={Math.abs(xEnd - xBase)}
                            height={BAR_HEIGHT}
                            fill={delta > 0 ? "var(--diverge-pos)" : "var(--diverge-neg)"}
                            opacity={0.9}
                          />
                        );
                      })}

                      {/* Fixed columns either side, so a figure is never drawn
                          over its own bar however short the bar is. */}
                      <text
                        x={-6}
                        y={centre}
                        textAnchor="end"
                        dominantBaseline="middle"
                        className="numeric"
                        fontSize={10}
                        fill="var(--text-tertiary)"
                      >
                        {`−${formatValue(Math.abs(down))}`}
                      </text>
                      <text
                        x={geometry.innerW + 6}
                        y={centre}
                        dominantBaseline="middle"
                        className="numeric"
                        fontSize={10}
                        fill="var(--text-tertiary)"
                      >
                        {`+${formatValue(Math.abs(up))}`}
                      </text>
                    </>
                  )}
                </g>
              );
            })}

            {/* The base case, drawn last so it sits above the bars */}
            <line
              x1={geometry.x(base)}
              x2={geometry.x(base)}
              y1={-2}
              y2={innerH + 2}
              stroke="var(--chart-axis)"
              strokeWidth={1.5}
            />
          </g>
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

/** Approximate advance width of Inter at 11px. SVG cannot measure text before
 *  layout, so a driver name that will not fit its gutter is wrapped — and only
 *  then truncated — against this estimate. */
const CHAR_WIDTH = 5.8;

function wrapLabel(label: string, maxWidth: number): string[] {
  if (label.length * CHAR_WIDTH <= maxWidth) return [label];

  const words = label.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length * CHAR_WIDTH <= maxWidth || current === "") current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  // Two lines is the most a 34px row can carry beside a 16px bar.
  const kept = lines.slice(0, 2);
  return kept.map((line) =>
    line.length * CHAR_WIDTH > maxWidth
      ? `${line.slice(0, Math.max(1, Math.floor(maxWidth / CHAR_WIDTH) - 1))}…`
      : line,
  );
}
