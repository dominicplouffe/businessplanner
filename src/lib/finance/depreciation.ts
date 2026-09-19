import type { CapexItem } from "./types";

/**
 * Monthly depreciation charge per capex item, summed across the horizon.
 *
 * Straight-line spreads (cost − salvage) evenly across the useful life.
 * Declining-balance applies a double-declining rate to the carrying value and
 * never depreciates below salvage.
 */
export function depreciationByMonth(capex: CapexItem[], horizonMonths: number): number[] {
  const charge = new Array<number>(horizonMonths).fill(0);

  for (const item of capex) {
    const lifeMonths = Math.max(1, Math.round(item.usefulLifeYears * 12));
    const salvage = Math.min(item.salvageValue, item.amount);
    const depreciable = item.amount - salvage;
    if (depreciable <= 0) continue;

    if (item.method === "straight-line") {
      const monthly = depreciable / lifeMonths;
      for (let k = 0; k < lifeMonths; k++) {
        const idx = item.month - 1 + k;
        if (idx < 0 || idx >= horizonMonths) continue;
        charge[idx] = (charge[idx] ?? 0) + monthly;
      }
    } else {
      // Double-declining balance, floored at salvage value.
      const annualRate = 2 / item.usefulLifeYears;
      const monthlyRate = annualRate / 12;
      let carrying = item.amount;
      for (let k = 0; k < lifeMonths; k++) {
        const idx = item.month - 1 + k;
        const raw = carrying * monthlyRate;
        const allowed = Math.max(0, Math.min(raw, carrying - salvage));
        carrying -= allowed;
        if (idx < 0 || idx >= horizonMonths) continue;
        charge[idx] = (charge[idx] ?? 0) + allowed;
      }
    }
  }

  return charge;
}

/** Capital expenditure cash outflow by month (1-based). */
export function capexByMonth(capex: CapexItem[], horizonMonths: number): number[] {
  const out = new Array<number>(horizonMonths).fill(0);
  for (const item of capex) {
    const idx = item.month - 1;
    if (idx < 0 || idx >= horizonMonths) continue;
    out[idx] = (out[idx] ?? 0) + item.amount;
  }
  return out;
}
