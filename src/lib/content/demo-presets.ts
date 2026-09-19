import type { AssumptionsInput } from "@/lib/finance/types";

/**
 * Presets for the homepage demo. These run through the real engine in the
 * browser, so the numbers on the marketing site are the same numbers the
 * product produces — there is no mocked "example output" anywhere.
 */
export type DemoPreset = {
  key: string;
  label: string;
  blurb: string;
  /** The two drivers the visitor can move, and their bounds. */
  drivers: [DemoDriver, DemoDriver];
  build: (a: number, b: number) => AssumptionsInput;
};

export type DemoDriver = {
  label: string;
  unit: "currency" | "count" | "percent";
  min: number;
  max: number;
  step: number;
  initial: number;
  hint: string;
};

const registry = {
  "revenueStreams.0": { provenance: "estimated" as const },
};

export const DEMO_PRESETS: DemoPreset[] = [
  {
    key: "coffee-shop",
    label: "Coffee shop",
    blurb: "A single site, financed with an SBA loan and an owner injection.",
    drivers: [
      { label: "Customers per day", unit: "count", min: 80, max: 600, step: 10, initial: 240, hint: "Footfall × conversion" },
      { label: "Average ticket", unit: "currency", min: 4, max: 30, step: 0.5, initial: 9.5, hint: "Per transaction" },
    ],
    build: (traffic, ticket) => ({
      company: {
        name: "Demo coffee shop",
        startDate: "2026-01-01",
        horizonMonths: 60,
        industryKey: "coffee-shop",
        firstTradingMonth: 3,
      },
      revenueStreams: [
        {
          id: "s", name: "Counter sales", kind: "retail-footfall", startMonth: 3,
          dailyTraffic: traffic, conversionRate: 1, averageTicket: ticket,
          openDaysPerMonth: 28, monthlyGrowthRate: 0.008, cogsPercent: 0.24,
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 72_000, isOwner: true, startMonth: 1 },
        { id: "bar", title: "Baristas", annualSalary: 38_000, count: 4, startMonth: 3, isDirectLabour: true },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 7_200, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 1_400, annualGrowthRate: 0.04 },
        { id: "mkt", name: "Local marketing", category: "marketing", percentOfRevenue: 0.02 },
      ],
      capex: [{ id: "fit", name: "Fit-out and equipment", month: 1, amount: 240_000, usefulLifeYears: 10 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 250_000, annualRate: 0.112, termMonths: 120, interestOnlyMonths: 3 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 90_000 }],
      workingCapital: { receivableDays: 1, payableDays: 21, inventoryDays: 8 },
      registry,
    }),
  },
  {
    key: "saas",
    label: "B2B SaaS",
    blurb: "Seed-funded, subscription revenue, sold to investors rather than a bank.",
    drivers: [
      { label: "New customers per month", unit: "count", min: 2, max: 120, step: 2, initial: 18, hint: "Month one, then compounding" },
      { label: "Price per month", unit: "currency", min: 15, max: 900, step: 5, initial: 149, hint: "Per customer" },
    ],
    build: (newCustomers, price) => ({
      company: { name: "Demo SaaS", startDate: "2026-01-01", horizonMonths: 60, industryKey: "saas" },
      revenueStreams: [
        {
          id: "s", name: "Subscriptions", kind: "subscription", initialCustomers: 0,
          newCustomersMonth1: newCustomers, newCustomerGrowthRate: 0.05,
          monthlyChurnRate: 0.02, pricePerCustomerPerMonth: price,
          expansionRate: 0.004, cogsPercent: 0.22,
        },
      ],
      roles: [
        { id: "ceo", title: "Founder & CEO", annualSalary: 130_000, isOwner: true, startMonth: 1 },
        { id: "eng", title: "Engineers", annualSalary: 155_000, count: 2, startMonth: 3 },
      ],
      opex: [
        { id: "rent", name: "Office", category: "rent", monthlyAmount: 3_800, annualGrowthRate: 0.03 },
        { id: "ads", name: "Paid acquisition", category: "marketing", percentOfRevenue: 0.16 },
        { id: "tools", name: "Software", category: "software", monthlyAmount: 1_900, annualGrowthRate: 0.05 },
      ],
      capex: [{ id: "eq", name: "Equipment", month: 1, amount: 45_000, usefulLifeYears: 4 }],
      equityRounds: [{ id: "seed", name: "Seed", month: 1, amount: 1_500_000, preMoneyValuation: 6_000_000 }],
      workingCapital: { receivableDays: 30, payableDays: 30, inventoryDays: 0 },
      unitEconomics: { customerAcquisitionCost: 640 },
      registry,
    }),
  },
  {
    key: "agency",
    label: "Professional services",
    blurb: "Billable-hours model, self-funded, no outside capital.",
    drivers: [
      { label: "Billable staff", unit: "count", min: 1, max: 40, step: 1, initial: 6, hint: "Fee earners" },
      { label: "Hourly rate", unit: "currency", min: 40, max: 500, step: 5, initial: 165, hint: "Blended" },
    ],
    build: (heads, rate) => ({
      company: { name: "Demo agency", startDate: "2026-01-01", horizonMonths: 60, industryKey: "professional-services" },
      revenueStreams: [
        {
          id: "s", name: "Client engagements", kind: "hourly-services",
          billableHeadcount: heads, hoursPerHeadPerMonth: 160, utilisation: 0.68,
          hourlyRate: rate, headcountGrowthPerMonth: 0.1, cogsPercent: 0.05,
        },
      ],
      roles: [
        { id: "own", title: "Managing partner", annualSalary: 145_000, isOwner: true, startMonth: 1 },
        { id: "team", title: "Consultants", annualSalary: 95_000, count: Math.max(1, Math.round(heads)), startMonth: 1, isDirectLabour: true },
        { id: "ops", title: "Operations", annualSalary: 62_000, startMonth: 6 },
      ],
      opex: [
        { id: "rent", name: "Office", category: "rent", monthlyAmount: 4_500, annualGrowthRate: 0.03 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 900 },
        { id: "mkt", name: "Business development", category: "marketing", percentOfRevenue: 0.05 },
      ],
      workingCapital: { receivableDays: 45, payableDays: 30, inventoryDays: 0 },
      registry,
    }),
  },
];
