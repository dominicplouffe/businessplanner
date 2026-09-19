/** Formatting helpers. Financial tables use tabular figures by default (set in
 *  globals.css), so these only handle value shaping. */

export function formatCurrency(
  value: number,
  currency = "USD",
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  const { compact = false, decimals } = opts;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: decimals ?? (compact ? 1 : 0),
    minimumFractionDigits: decimals ?? 0,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function formatMultiple(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}×`;
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

/** Accounting convention: negatives in parentheses, as statements are read. */
export function formatAccounting(value: number, currency = "USD"): string {
  const magnitude = formatCurrency(Math.abs(value), currency);
  return value < 0 ? `(${magnitude})` : magnitude;
}

/** A signed delta with an explicit arrow, because colour alone is unreadable
 *  under protanopia — the arrow and the sign carry the meaning. */
export function formatDelta(value: number, format: (n: number) => string): {
  text: string;
  direction: "up" | "down" | "flat";
} {
  if (Math.abs(value) < 1e-9) return { text: format(0), direction: "flat" };
  const direction = value > 0 ? "up" : "down";
  const arrow = value > 0 ? "▲" : "▼";
  return { text: `${arrow} ${format(Math.abs(value))}`, direction };
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "2026-04" -> "Apr 2026". Used in tooltips, where the month matters. */
export function formatMonthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  const idx = Number(month) - 1;
  return `${MONTH_NAMES[idx] ?? month} ${year ?? ""}`;
}

/** "2026-04" -> "2026". Used on a multi-year time axis, where a month name
 *  beside a year reads as a date rather than a period marker. */
export function formatYearLabel(iso: string): string {
  return iso.split("-")[0] ?? iso;
}
