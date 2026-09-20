"use client";

import { TimeSeriesChart, type Series } from "./time-series-chart";
import { formatCurrency, formatMonthLabel, formatYearLabel } from "@/lib/finance/format";

/**
 * A currency time series with the formatters supplied on this side of the
 * boundary.
 *
 * `TimeSeriesChart` takes formatter functions, which a server component cannot
 * pass across — functions are not serialisable. Rather than duplicate the chart
 * or make its API weaker, this wrapper holds the one set of formatters every
 * money chart wants. Server pages pass data only.
 */
export function MoneyTimeSeries({
  labels,
  series,
  height,
  description,
  className,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  description: string;
  className?: string;
}) {
  return (
    <TimeSeriesChart
      labels={labels}
      series={series}
      height={height}
      description={description}
      className={className}
      formatValue={(n) => formatCurrency(n, "USD", { compact: true })}
      formatLabel={formatYearLabel}
      formatTooltipLabel={formatMonthLabel}
    />
  );
}
