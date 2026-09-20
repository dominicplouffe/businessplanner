import { getBenchmark } from "@/lib/finance/benchmarks";
import type { RevenueStreamKind } from "@/lib/finance/types";

/**
 * Sensible starting values per industry, so no field begins empty.
 *
 * These are seeds the user edits, not answers. Every one is tagged
 * `benchmark_default` until touched, and that tag is printed in the finished
 * plan — a reader can see exactly which numbers came from the owner and which
 * came from an industry median.
 */
export type IntakeDefaults = Record<string, string | number>;

const REVENUE_MODEL_BY_INDUSTRY: Record<string, RevenueStreamKind> = {
  saas: "subscription",
  restaurant: "retail-footfall",
  "coffee-shop": "retail-footfall",
  retail: "retail-footfall",
  salon: "retail-footfall",
  fitness: "subscription",
  childcare: "contract",
  ecommerce: "unit-sales",
  manufacturing: "unit-sales",
  "professional-services": "hourly-services",
  construction: "hourly-services",
  cleaning: "contract",
  trucking: "contract",
  "real-estate": "hourly-services",
  nonprofit: "contract",
  other: "retail-footfall",
};

const REVENUE_SEEDS: Record<RevenueStreamKind, IntakeDefaults> = {
  "retail-footfall": {
    "rev.dailyTraffic": 150, "rev.conversionRate": 70, "rev.averageTicket": 18,
    "rev.openDaysPerMonth": 26, "rev.monthlyGrowthRate": 1,
  },
  subscription: {
    "rev.newCustomersMonth1": 15, "rev.newCustomerGrowthRate": 5,
    "rev.pricePerCustomerPerMonth": 99, "rev.monthlyChurnRate": 3, "rev.initialCustomers": 0,
  },
  "unit-sales": {
    "rev.unitsMonth1": 200, "rev.monthlyGrowthRate": 4,
    "rev.pricePerUnit": 45, "rev.costPerUnit": 18,
  },
  "hourly-services": {
    "rev.billableHeadcount": 3, "rev.hourlyRate": 125, "rev.utilisation": 65,
    "rev.hoursPerHeadPerMonth": 160, "rev.headcountGrowthPerMonth": 0.1,
  },
  contract: {
    "rev.initialContracts": 0, "rev.newContractsPerMonth": 2,
    "rev.monthlyValuePerContract": 1500, "rev.termMonths": 12,
  },
  marketplace: {
    "rev.gmvMonth1": 50000, "rev.monthlyGrowthRate": 8, "rev.takeRate": 12,
  },
  advertising: {
    "rev.impressionsMonth1": 500000, "rev.monthlyGrowthRate": 6,
    "rev.fillRate": 70, "rev.cpm": 8,
  },
};

export function defaultsForIndustry(industryKey: string): IntakeDefaults {
  const benchmark = getBenchmark(industryKey);
  const kind = REVENUE_MODEL_BY_INDUSTRY[industryKey] ?? "retail-footfall";
  const today = new Date();
  const startMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;

  // Seed direct cost from the midpoint of the industry's gross margin band.
  const cogsPercent = Math.round((1 - benchmark.grossMargin.median) * 100);

  return {
    "company.startDate": startMonth,
    "company.firstTradingMonth": 1,
    "company.industryKey": industryKey,
    "company.purpose": "internal",

    "rev.kind": kind,
    ...REVENUE_SEEDS[kind],

    "costs.cogsPercent": cogsPercent,
    "costs.rent": benchmark.occupancyRatio ? 4000 : 1500,
    "costs.utilities": 400,
    "costs.software": 300,
    "costs.insurance": 200,
    "costs.marketingPercent": 4,
    "costs.other": 500,

    "team.ownerSalary": 75000,
    "team.householdSize": 1,
    "team.staffCount": 2,
    "team.staffAverageSalary": 42000,
    "team.staffAreDirect": "yes",

    "funding.ownerInjection": 25000,
    "funding.equityRaise": 0,
    "funding.loanAmount": 0,
    "funding.loanRate": 11,
    "funding.loanTermMonths": 120,
    "funding.loanInterestOnlyMonths": 0,
    "funding.capexAmount": 0,
    "funding.capexLifeYears": 7,
    "funding.enterpriseCost": 0,

    "wc.receivableDays": 0,
    "wc.payableDays": 30,
    "wc.inventoryDays": 0,
    "tax.corporateRate": 21,
  };
}

/** Which keys the seed supplied, so untouched fields can be tagged correctly. */
export const SEEDED_KEYS = Object.keys(defaultsForIndustry("other"));
