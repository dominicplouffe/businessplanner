import type { RevenueStream } from "./types";
import { ceilingAt, projectCurve, type GrowthCurve } from "./growth";

export type StreamResult = {
  id: string;
  name: string;
  kind: RevenueStream["kind"];
  /** Gross revenue per month, 1-based index 0 = month 1. */
  revenue: number[];
  /** Direct cost per month attributable to this stream. */
  cogs: number[];
  /** Units, customers, contracts or covers — whatever this model counts. */
  volume: number[];
  volumeLabel: string;
  /** Revenue billed but not yet earned, from prepaid subscription terms. */
  deferred: number[];
  /** The capacity in force each month, in `volumeLabel` units. Null where the
   *  stream declares no bound — which the validator treats as a defect. */
  ceiling: (number | null)[];
  /** Volume as a share of that capacity. The number an operator can argue
   *  with, and what `capacity-never-approached` reads. */
  saturation: (number | null)[];
  /** Billable people the revenue model implies. Only `hourly-services`, and
   *  only so the payroll side can be checked against it rather than the test
   *  re-deriving the arithmetic. */
  billableHeads?: number[];
};

/**
 * The curve a stream grows on.
 *
 * Falls back to the legacy rate as an explicitly `unbounded` curve, which is
 * the same arithmetic the engine has always done. That fallback is what lets
 * the curve be introduced without moving a number; it is also exactly what
 * `growth-declared-unbounded` refuses to export.
 */
function curveFor(stream: RevenueStream): GrowthCurve {
  if (stream.growth) return stream.growth;
  switch (stream.kind) {
    case "hourly-services":
      return { shape: "linear", perMonth: stream.headcountGrowthPerMonth };
    case "subscription":
      return { shape: "unbounded", monthlyRate: stream.newCustomerGrowthRate };
    case "contract":
      return { shape: "flat" };
    default:
      return { shape: "unbounded", monthlyRate: stream.monthlyGrowthRate };
  }
}

function seasonalFactor(stream: RevenueStream, month: number, startCalendarMonth: number): number {
  if (!stream.seasonality) return 1;
  const calendarIndex = (startCalendarMonth - 1 + (month - 1)) % 12;
  return stream.seasonality[calendarIndex] ?? 1;
}

/**
 * Projects one revenue stream across the horizon.
 *
 * Every model is a driver build — volume × price — rather than a growth rate
 * applied to a revenue line. That is what makes the output defensible: a reader
 * can interrogate the traffic, the conversion rate or the churn, instead of
 * being asked to accept a percentage.
 */
export function projectStream(
  stream: RevenueStream,
  horizonMonths: number,
  startCalendarMonth: number,
): StreamResult {
  const revenue = new Array<number>(horizonMonths).fill(0);
  const cogs = new Array<number>(horizonMonths).fill(0);
  const volume = new Array<number>(horizonMonths).fill(0);
  const deferred = new Array<number>(horizonMonths).fill(0);
  const ceiling = new Array<number | null>(horizonMonths).fill(null);
  const saturation = new Array<number | null>(horizonMonths).fill(null);
  const heads = new Array<number>(horizonMonths).fill(0);
  let volumeLabel = "Units";
  const curve = curveFor(stream);

  // Carried across months for the stateful models.
  let customers = 0;
  let activeContracts: { remaining: number; count: number }[] = [];
  let expansionMultiplier = 1;
  let billableHeads = 0;

  for (let m = 1; m <= horizonMonths; m++) {
    const i = m - 1;
    if (m < stream.startMonth) continue;
    const elapsed = m - stream.startMonth; // 0 in the first active month
    const season = seasonalFactor(stream, m, startCalendarMonth);

    switch (stream.kind) {
      case "subscription": {
        volumeLabel = "Customers";
        if (elapsed === 0) customers = stream.initialCustomers;
        const additions = projectCurve(curve, stream.newCustomersMonth1, elapsed);
        // Churn applies to the base before additions; additions bill in full.
        const churned = customers * stream.monthlyChurnRate;
        customers = customers - churned + additions;
        expansionMultiplier =
          elapsed === 0 ? 1 : expansionMultiplier * (1 + stream.expansionRate);
        const gross =
          customers * stream.pricePerCustomerPerMonth * expansionMultiplier * season;
        revenue[i] = gross;
        volume[i] = customers;
        // Prepaid terms bill n months up front; the unearned portion is a liability.
        if (stream.prepaidMonths > 1) {
          deferred[i] = gross * (stream.prepaidMonths - 1);
        }
        break;
      }

      case "unit-sales": {
        volumeLabel = "Units";
        const units = projectCurve(curve, stream.unitsMonth1, elapsed) * season;
        revenue[i] = units * stream.pricePerUnit;
        cogs[i] = units * stream.costPerUnit;
        volume[i] = units;
        break;
      }

      case "hourly-services": {
        volumeLabel = "Billable hours";
        billableHeads = projectCurve(curve, stream.billableHeadcount, elapsed);
        heads[i] = billableHeads;
        const hours = billableHeads * stream.hoursPerHeadPerMonth * stream.utilisation * season;
        revenue[i] = hours * stream.hourlyRate;
        volume[i] = hours;
        break;
      }

      case "retail-footfall": {
        volumeLabel = "Transactions";
        // The curve carries the whole transaction count, so the ceiling is
        // stated in covers or tickets a month — the seats-times-turns number an
        // owner already knows — rather than in a rate nobody can picture.
        const perMonth = stream.dailyTraffic * stream.conversionRate * stream.openDaysPerMonth;
        const transactions = projectCurve(curve, perMonth, elapsed) * season;
        revenue[i] = transactions * stream.averageTicket;
        volume[i] = transactions;
        break;
      }

      case "marketplace": {
        volumeLabel = "GMV";
        const gmv = projectCurve(curve, stream.gmvMonth1, elapsed) * season;
        revenue[i] = gmv * stream.takeRate;
        volume[i] = gmv;
        break;
      }

      case "contract": {
        volumeLabel = "Active contracts";
        if (elapsed === 0) {
          activeContracts = stream.initialContracts > 0
            ? [{ remaining: stream.termMonths, count: stream.initialContracts }]
            : [];
        }
        // Age the book, drop expiries, then add this month's wins.
        activeContracts = activeContracts
          .map((c) => ({ ...c, remaining: c.remaining - 1 }))
          .filter((c) => c.remaining > 0);
        if (stream.newContractsPerMonth > 0) {
          activeContracts.push({ remaining: stream.termMonths, count: stream.newContractsPerMonth });
        }
        const count = activeContracts.reduce((sum, c) => sum + c.count, 0);
        revenue[i] = count * stream.monthlyValuePerContract * season;
        volume[i] = count;
        break;
      }

      case "advertising": {
        volumeLabel = "Impressions";
        const impressions = projectCurve(curve, stream.impressionsMonth1, elapsed) * season;
        const sold = impressions * stream.fillRate;
        revenue[i] = (sold / 1000) * stream.cpm;
        volume[i] = sold;
        break;
      }
    }

    // What capacity this month was, and how much of it is being used. Written
    // once here rather than in seven branches, because every kind measures it
    // against the same `volume` line.
    const capacity = ceilingAt(curve, elapsed);
    ceiling[i] = capacity;
    saturation[i] = capacity !== null && capacity > 0 ? (volume[i] ?? 0) / capacity : null;

    // A percentage COGS applies to any stream that has no explicit unit cost.
    if (cogs[i] === 0 && stream.cogsPercent > 0) {
      cogs[i] = (revenue[i] ?? 0) * stream.cogsPercent;
    }
  }

  return {
    id: stream.id,
    name: stream.name,
    kind: stream.kind,
    revenue,
    cogs,
    volume,
    volumeLabel,
    deferred,
    ceiling,
    saturation,
    ...(stream.kind === "hourly-services" ? { billableHeads: heads } : {}),
  };
}
