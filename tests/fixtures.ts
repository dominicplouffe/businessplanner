import type { AssumptionsInput } from "@/lib/finance/types";

/** A funded SaaS business: subscriptions, a seed round, an SBA loan with an
 *  interest-only period, capex, and receivables. Exercises most of the engine. */
export const saasPlan: AssumptionsInput = {
  company: {
    name: "Northgate Analytics",
    startDate: "2026-01-01",
    horizonMonths: 60,
    industryKey: "saas",
    firstTradingMonth: 1,
    householdSize: 3,
  },
  revenueStreams: [
    {
      id: "subs",
      name: "Subscriptions",
      kind: "subscription",
      initialCustomers: 0,
      newCustomersMonth1: 18,
      // Acquisition the channel can carry, and the seats the product can
      // serve. Both are required now: a stream that declares no limit is a
      // blocking finding, which is the point.
      growth: { shape: "saturating", monthlyRate: 0.05, ceiling: 46, terminalAnnualRate: 0.02 },
      customerCeiling: 1_400,
      monthlyChurnRate: 0.02,
      pricePerCustomerPerMonth: 149,
      expansionRate: 0.004,
      cogsPercent: 0.22,
    },
  ],
  roles: [
    { id: "ceo", title: "Founder & CEO", annualSalary: 130_000, isOwner: true, startMonth: 1 },
    { id: "eng", title: "Engineer", annualSalary: 155_000, count: 2, startMonth: 3 },
    { id: "cs", title: "Customer success", annualSalary: 78_000, startMonth: 10, isDirectLabour: true },
  ],
  opex: [
    { id: "rent", name: "Office", category: "rent", monthlyAmount: 3_800, annualGrowthRate: 0.03 },
    { id: "ads", name: "Paid acquisition", category: "marketing", percentOfRevenue: 0.16 },
    { id: "tools", name: "Software", category: "software", monthlyAmount: 1_900, annualGrowthRate: 0.05 },
  ],
  capex: [{ id: "fitout", name: "Fit-out and equipment", month: 1, amount: 95_000, usefulLifeYears: 7 }],
  loans: [
    {
      id: "sba",
      name: "SBA 7(a)",
      month: 1,
      principal: 250_000,
      annualRate: 0.115,
      termMonths: 120,
      interestOnlyMonths: 6,
    },
  ],
  equityRounds: [{ id: "seed", name: "Seed", month: 1, amount: 600_000, preMoneyValuation: 4_000_000 }],
  workingCapital: { receivableDays: 30, payableDays: 30, inventoryDays: 0 },
  unitEconomics: { customerAcquisitionCost: 640 },
  enterpriseEstablishmentCost: 850_000,
  registry: {
    "revenueStreams.0.pricePerCustomerPerMonth": { provenance: "known", note: "Published price list." },
    "revenueStreams.0.monthlyChurnRate": {
      provenance: "benchmark_default",
      source: { label: "SaaS retention benchmarks", date: "2026-01-15" },
    },
  },
};

/** A restaurant: footfall-driven, inventory-bearing, no equity round. */
export const restaurantPlan: AssumptionsInput = {
  company: {
    name: "Rowan & Fig",
    startDate: "2026-03-01",
    horizonMonths: 60,
    industryKey: "restaurant",
    firstTradingMonth: 4,
    householdSize: 4,
  },
  revenueStreams: [
    {
      id: "covers",
      name: "Dining room",
      kind: "retail-footfall",
      startMonth: 4,
      dailyTraffic: 210,
      conversionRate: 0.62,
      averageTicket: 38,
      openDaysPerMonth: 26,
      // 130 covers a day in the room today; 182 is a full house at every
      // service, and no growth rate takes a dining room past its seats.
      growth: { shape: "saturating", monthlyRate: 0.012, ceiling: 4_739, terminalAnnualRate: 0.02 },
      cogsPercent: 0.31,
      seasonality: [0.88, 0.9, 0.97, 1.02, 1.06, 1.08, 1.05, 1.03, 1.0, 1.01, 0.99, 1.01],
    },
  ],
  roles: [
    { id: "owner", title: "Owner-operator", annualSalary: 85_000, isOwner: true, startMonth: 1 },
    { id: "kitchen", title: "Kitchen staff", annualSalary: 46_000, count: 5, startMonth: 3, isDirectLabour: true },
    { id: "foh", title: "Front of house", annualSalary: 38_000, count: 6, startMonth: 4 },
  ],
  opex: [
    { id: "rent", name: "Lease", category: "rent", monthlyAmount: 11_500, annualGrowthRate: 0.03 },
    { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 3_200, annualGrowthRate: 0.04 },
    { id: "mkt", name: "Local marketing", category: "marketing", percentOfRevenue: 0.03 },
    { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 1_450 },
  ],
  capex: [
    { id: "kit", name: "Kitchen build", month: 1, amount: 420_000, usefulLifeYears: 10 },
    { id: "ff", name: "Furniture", month: 2, amount: 85_000, usefulLifeYears: 7 },
  ],
  loans: [
    { id: "sba504", name: "SBA 504", month: 1, principal: 500_000, annualRate: 0.098, termMonths: 240, interestOnlyMonths: 3 },
  ],
  equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 180_000 }],
  workingCapital: { receivableDays: 2, payableDays: 21, inventoryDays: 9 },
  registry: { "revenueStreams.0.dailyTraffic": { provenance: "estimated", note: "Footfall count, two weekdays." } },
};
