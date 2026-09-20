import { AlertTriangle, Check, Info } from "lucide-react";
import { MoneyTimeSeries } from "@/components/charts/money-time-series";
import type { IndustryExample } from "@/lib/content/industry-example";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The worked example on an industry page.
   --------------------------------------------------------------------------
   Everything here was computed by the engine during the build. The point of
   printing the balance-sheet tie and the blocking count is that a reader can
   see the plan passed the same checks the product applies to theirs — an
   example that would not export is worse than no example.
   ========================================================================== */

export function IndustryExampleFigures({ example }: { example: IndustryExample }) {
  const f = example.figures;
  const b = example.benchmark;

  return (
    <div className="space-y-12">
      {/* Headline figures */}
      <div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-hairline py-8 sm:grid-cols-3 lg:grid-cols-5">
          <Figure label="Year 1 revenue" value={formatCurrency(f.year1Revenue, "USD", { compact: true })} />
          <Figure label="Year 3 revenue" value={formatCurrency(f.year3Revenue, "USD", { compact: true })} />
          <Figure
            label="Operating profit from"
            value={f.breakEvenMonth ? `Month ${f.breakEvenMonth}` : "Beyond year 5"}
          />
          <Figure
            label="Year 3 net margin"
            value={f.netMargin === null ? "—" : formatPercent(f.netMargin)}
          />
          {f.dscrFirstFullYear !== null ? (
            <Figure
              label="Coverage, first full year"
              value={formatMultiple(f.dscrFirstFullYear)}
              note="EBITDA less tax, over debt service"
            />
          ) : (
            <Figure label="Debt" value="None modelled" note="Funded from owner capital" />
          )}
        </dl>
        <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <Check aria-hidden className="size-3.5 text-emerald-600" />
            Balance sheet ties in all 60 periods
          </span>
          <span className="inline-flex items-center gap-1.5">
            {f.blockingCount === 0 ? (
              <Check aria-hidden className="size-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle aria-hidden className="size-3.5 text-warning" />
            )}
            {f.blockingCount === 0
              ? "No blocking findings — this model would export"
              : `${f.blockingCount} blocking findings`}
          </span>
          <span>
            Lowest cash {formatCurrency(f.lowestCash, "USD", { compact: true })} in month{" "}
            <span className="numeric">{f.lowestCashMonth}</span>
          </span>
        </p>
      </div>

      {/* The revenue build, driver by driver */}
      <section aria-labelledby="revenue-build">
        <h3 id="revenue-build" className="font-display text-xl">
          The revenue build
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
          Not a growth rate. These are the drivers a reader can argue with, which is
          the only kind worth putting in a plan.
        </p>
        <div className={cn("mt-6 grid gap-6", example.streams.length > 1 && "lg:grid-cols-2")}>
          {example.streams.map((stream) => (
            <div key={stream.name} className="rounded-lg border border-hairline p-5">
              <p className="font-display text-base">{stream.name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-tertiary">{stream.kindLabel}</p>
              <dl className="mt-4 divide-y divide-hairline">
                {stream.drivers.map((d) => (
                  <div key={d.label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-sm text-secondary">
                      {d.label}
                      {d.note ? (
                        <span className="block text-xs text-tertiary">{d.note}</span>
                      ) : null}
                    </dt>
                    <dd className="numeric shrink-0 text-sm text-primary">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* Chart */}
      <section aria-labelledby="trajectory">
        <h3 id="trajectory" className="font-display text-xl">
          Sixty months of it
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
          Monthly revenue against monthly EBITDA. Both are flows, so they share an
          axis honestly — plotting a cumulative cash balance beside a monthly figure
          would flatten the one that matters. The cash trough is in the strip above.
        </p>
        <div className="mt-6 rounded-lg border border-hairline bg-surface-raised p-5">
          <MoneyTimeSeries
            labels={example.chart.labels}
            series={[
              {
                key: "revenue",
                label: "Monthly revenue",
                color: "var(--series-1)",
                values: example.chart.revenue,
                fill: true,
              },
              {
                key: "ebitda",
                label: "Monthly EBITDA",
                color: "var(--series-3)",
                values: example.chart.ebitda,
              },
            ]}
            height={260}
            description={`Monthly revenue and EBITDA across sixty months for the worked ${example.slug.replace(/-/g, " ")} example.`}
          />
        </div>
      </section>

      {/* Annual summary */}
      <section aria-labelledby="annual">
        <h3 id="annual" className="font-display text-xl">
          Year by year
        </h3>
        <div
          className="mt-5 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Annual summary, scrollable"
        >
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-hairline text-left">
                <th scope="col" className="py-2.5 pr-4 font-medium text-tertiary">Year</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium text-tertiary">Revenue</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium text-tertiary">EBITDA</th>
                <th scope="col" className="py-2.5 pr-4 text-right font-medium text-tertiary">Net income</th>
                <th scope="col" className="py-2.5 text-right font-medium text-tertiary">Closing cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {example.annual.map((y) => (
                <tr key={y.label}>
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal text-secondary">{y.label}</th>
                  <td className="numeric py-2.5 pr-4 text-right">{formatCurrency(y.revenue, "USD", { compact: true })}</td>
                  <td className="numeric py-2.5 pr-4 text-right">{formatCurrency(y.ebitda, "USD", { compact: true })}</td>
                  <td className="numeric py-2.5 pr-4 text-right">{formatCurrency(y.netIncome, "USD", { compact: true })}</td>
                  <td className="numeric py-2.5 text-right">{formatCurrency(y.closingCash, "USD", { compact: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-tertiary">
          Sources and uses: {formatCurrency(f.totalDebt, "USD", { compact: true })} debt,{" "}
          {formatCurrency(f.totalEquity, "USD", { compact: true })} owner capital,{" "}
          {formatCurrency(f.totalCapex, "USD", { compact: true })} of fit-out and equipment.{" "}
          <span className="numeric">{f.year3Headcount}</span> people on the payroll by month 36.
        </p>
      </section>

      {/* Benchmark comparison */}
      <section aria-labelledby="bands" className="rounded-lg border border-hairline bg-surface-sunken p-6">
        <h3 id="bands" className="font-display text-xl">
          Against the {b.label.toLowerCase()} band
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
          Benchmarks warn; they never overwrite. An assumption outside the band is
          flagged with its source so you can justify it — substituting an industry
          median would destroy the specificity that makes a plan credible.
        </p>
        <dl className="mt-6 space-y-5">
          <BandRow
            label={
              b.grossMarginBasis === "materials"
                ? "Gross margin, before direct labour"
                : "Gross margin"
            }
            value={f.comparableGrossMargin}
            band={b.grossMargin}
            note={
              b.grossMarginBasis === "materials"
                ? `The published band is quoted on cost of goods alone, so this is the comparable figure. After direct labour the statements show ${
                    f.reportedGrossMargin === null ? "—" : formatPercent(f.reportedGrossMargin)
                  }.`
                : undefined
            }
          />
          <BandRow label="Net margin" value={f.netMargin} band={b.netMargin} />
        </dl>
        <p className="mt-6 flex gap-2.5 text-xs leading-relaxed text-tertiary">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Source: {b.sourceLabel}, {b.vintage}
            {b.naics ? ` · NAICS ${b.naics}` : ""} · {b.sourceTier} tier.
            {b.sourceTier === "secondary"
              ? " Secondary-tier bands are usable as ranges, not as something a lender will read; where a figure has to survive scrutiny we substitute RMA Annual Statement Studies or IRS SOI data."
              : ""}
            {b.notes ? ` ${b.notes}` : ""}
          </span>
        </p>
      </section>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  // The note lives inside the dd rather than as a sibling paragraph: a <p>
  // inside a dl group fails axe's definition-list rule.
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="mt-1">
        <span className="figure-hero block font-display text-2xl tracking-[-0.02em]">{value}</span>
        {note ? <span className="mt-1 block text-xs text-tertiary">{note}</span> : null}
      </dd>
    </div>
  );
}

function BandRow({
  label,
  value,
  band,
  note,
}: {
  label: string;
  value: number | null;
  band: { low: number; median: number; high: number };
  note?: string;
}) {
  // Position on the band, clamped so a wildly out-of-range figure still renders
  // a marker at the edge rather than escaping the track.
  const span = band.high - band.low;
  const raw = value === null || span <= 0 ? 0.5 : (value - band.low) / span;
  const position = Math.max(0, Math.min(1, raw));
  const inBand = value !== null && value >= band.low && value <= band.high;

  // One group div with dt and dd as direct children; the track and the note are
  // further dd entries rather than sibling divs, so the dl stays valid.
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className="flex items-baseline gap-2">
        <span className="numeric text-sm text-primary">
          {value === null ? "—" : formatPercent(value)}
        </span>
        <span className={cn("text-xs", inBand ? "text-good" : "text-marker")}>
          {inBand ? "in band" : value === null ? "" : value > band.high ? "↑ above band" : "↓ below band"}
        </span>
      </dd>
      <dd className="col-span-2 mt-2.5">
        <span className="relative block h-1.5 rounded-full bg-hairline">
          <span
            aria-hidden
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-raised bg-secondary"
            style={{ left: `${position * 100}%` }}
          />
        </span>
        <span className="mt-1.5 flex justify-between text-xs text-tertiary">
          <span className="numeric">{formatPercent(band.low)}</span>
          <span className="numeric">median {formatPercent(band.median)}</span>
          <span className="numeric">{formatPercent(band.high)}</span>
        </span>
        {note ? (
          <span className="mt-2 block text-xs leading-relaxed text-tertiary">{note}</span>
        ) : null}
      </dd>
    </div>
  );
}
