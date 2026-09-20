import type { AssumptionsInput } from "@/lib/finance/types";
import { getBenchmark, type IndustryBenchmark } from "@/lib/finance/benchmarks";

/* ==========================================================================
   Industry pages.
   --------------------------------------------------------------------------
   The volume engine, and the part of the site most likely to be built badly.
   A programmatic page per sector is only worth publishing if it carries
   something a reader cannot get from the first ten results: a cost structure
   with real shares, the question a lender actually asks about this sector, and
   a worked revenue build they can check.

   So each entry carries a real `build`, and the page runs it through the same
   engine the product uses at build time. The figures on a page Google sends
   someone to are the figures the product would produce — there is no separate
   "example output" anywhere, which is the same rule the homepage demo follows.

   `demand` records what the page is for. It is not rendered; it is here so the
   build order is legible and so nobody adds a sector on a hunch.
   ========================================================================== */

export type CostLine = {
  label: string;
  /** Typical share of revenue. Shown as a band, never as a target. */
  shareOfRevenue: number;
  note: string;
};

/** The groupings the index page renders. Held here so the index cannot drift
 *  out of step with the page list — the same rule nav.ts follows. */
export const INDUSTRY_SECTORS = [
  {
    key: "food-drink",
    heading: "Food and drink",
    blurb: "Thin net margins, heavy fit-out, and a reader who knows the prime-cost rule.",
  },
  {
    key: "trades",
    heading: "Trades and services",
    blurb: "Labour is the cost of sale, and the receivable cycle is what actually strains the plan.",
  },
  {
    key: "place",
    heading: "Property, care and capacity",
    blurb: "Capacity is capped — by rooms, by ratios, by machines — so the build has to respect it.",
  },
  {
    key: "online",
    heading: "Online and professional",
    blurb: "No premises, but unit economics and utilisation get read forensically instead.",
  },
] as const;

export type IndustrySector = (typeof INDUSTRY_SECTORS)[number]["key"];

export type IndustryPage = {
  slug: string;
  label: string;
  sector: IndustrySector;
  /** The H1. Written as the answer to the query, not as a category name. */
  title: string;
  /** The search this page exists to answer, verbatim. */
  query: string;
  /** US monthly volume, difficulty and CPC at the time the page was planned. */
  demand: { volume: number; difficulty: number; cpc: number };
  /** Joins to INDUSTRY_BENCHMARKS — margins live there, never duplicated here. */
  benchmarkKey: string;
  naics?: string;
  lede: string;
  /** What this sector's cost base actually looks like. */
  costStructure: CostLine[];
  /** The questions a reader of this sector's plans opens with. */
  readerAsks: { question: string; answer: string }[];
  /** Where plans in this sector get sent back. */
  risks: { title: string; detail: string }[];
  /** Licences, inspections and filings that belong in the use of funds. */
  regulatory: string[];
  /** Who these plans usually go to, which changes what they must prove. */
  typicalPurpose: "sba-loan" | "investor" | "immigration" | "internal";
  /** A worked build, run through the engine at build time. */
  build: () => AssumptionsInput;
};

const estimated = { "revenueStreams.0": { provenance: "estimated" as const } };

/** Every industry page shares this frame; only the drivers differ. */
function company(name: string, industryKey: string, firstTradingMonth = 1) {
  // horizonMonths is deliberately omitted: the schema allows only 36 or 60 and
  // defaults to 60, so letting the default apply keeps one source of truth.
  return { name, startDate: "2026-01-01", industryKey, firstTradingMonth };
}

export const INDUSTRY_PAGES: IndustryPage[] = [
  /* ---- Food and drink ------------------------------------------------- */
  {
    slug: "food-truck",
    sector: "food-drink",
    label: "Food truck",
    title: "A food truck business plan a lender will actually underwrite",
    query: "food truck business plan",
    demand: { volume: 6600, difficulty: 33, cpc: 2.16 },
    benchmarkKey: "food-truck",
    naics: "722330",
    lede:
      "A truck is a restaurant with a smaller kitchen and a worse landlord: the rent is a commissary fee and a pitch fee, and the trading days are decided by a permit office and the weather. Plans get rejected here for assuming a seven-day week and a fixed location.",
    costStructure: [
      { label: "Food and packaging", shareOfRevenue: 0.3, note: "Higher than a fixed kitchen — smaller orders, more waste on a slow day." },
      { label: "Labour", shareOfRevenue: 0.25, note: "Two on the truck at service, plus prep. Owner-operator counts." },
      { label: "Commissary and pitch fees", shareOfRevenue: 0.08, note: "Most jurisdictions require a licensed commissary; pitches are bid or rented." },
      { label: "Fuel, propane and maintenance", shareOfRevenue: 0.05, note: "A truck is a vehicle. Budget a major repair, not an average." },
    ],
    readerAsks: [
      {
        question: "How many days a month do you actually trade?",
        answer:
          "Not thirty. Permits, weather, events and vehicle downtime take days out. A plan showing twenty-two to twenty-six trading days reads as written by someone who has done it.",
      },
      {
        question: "What happens when the pitch goes away?",
        answer:
          "A single high-performing location is a concentration risk. A reader wants a second and third pitch named, or a catering line that does not depend on one.",
      },
    ],
    risks: [
      {
        title: "Permit dependency",
        detail: "Pitches and permits are annual and competitive. Losing one mid-year is the most common reason a truck's year two misses.",
      },
      {
        title: "Seasonality is not smoothed",
        detail: "A truck in a four-season city can do half its annual revenue in four months. A flat monthly model will not survive a first read.",
      },
    ],
    regulatory: [
      "Mobile food vendor permit, renewed annually in most jurisdictions",
      "Commissary agreement — many health departments will not license a truck without one",
      "Food handler certification for every person on the truck",
      "Fire suppression inspection for the cooking line",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Food truck", "restaurant", 2),
      revenueStreams: [
        {
          id: "service", name: "Service window", kind: "retail-footfall", startMonth: 2,
          dailyTraffic: 120, conversionRate: 1, averageTicket: 14,
          openDaysPerMonth: 24,
          // 120 covers a day now; 168 is the most the window can serve in a
          // lunch rush, and no growth rate can take a truck past its hatch.
          growth: { shape: "saturating", monthlyRate: 0.01, ceiling: 4_032, terminalAnnualRate: 0.02 },
          cogsPercent: 0.32,
          seasonality: [0.7, 0.72, 0.9, 1.05, 1.15, 1.25, 1.3, 1.25, 1.1, 0.95, 0.8, 0.73],
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 58_000, isOwner: true, startMonth: 1 },
        { id: "crew", title: "Crew", annualSalary: 34_000, count: 3, startMonth: 2, isDirectLabour: true },
      ],
      opex: [
        { id: "comm", name: "Commissary and pitch fees", category: "rent", monthlyAmount: 2_700, annualGrowthRate: 0.03 },
        { id: "fuel", name: "Fuel, propane and maintenance", category: "utilities", monthlyAmount: 1_100, annualGrowthRate: 0.04 },
        { id: "ins", name: "Vehicle and liability insurance", category: "insurance", monthlyAmount: 480 },
        { id: "mkt", name: "Local marketing", category: "marketing", percentOfRevenue: 0.02 },
        { id: "ga", name: "Point of sale, accounting and admin", category: "other", percentOfRevenue: 0.1 },
      ],
      capex: [{ id: "truck", name: "Truck and build-out", month: 1, amount: 145_000, usefulLifeYears: 7 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 120_000, annualRate: 0.112, termMonths: 84, interestOnlyMonths: 2 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 45_000 }],
      workingCapital: { receivableDays: 0, payableDays: 14, inventoryDays: 5 },
      registry: estimated,
    }),
  },

  {
    slug: "coffee-shop",
    sector: "food-drink",
    label: "Coffee shop",
    title: "A coffee shop business plan built on covers, not optimism",
    query: "coffee shop business plan",
    demand: { volume: 3600, difficulty: 21, cpc: 2.59 },
    benchmarkKey: "coffee-shop",
    naics: "722515",
    lede:
      "Coffee has the best gross margin in food service and the worst operating leverage: rent and staffing are fixed, and the whole model turns on transactions per day. The number that decides the plan is footfall, and it is the number most plans wave at.",
    costStructure: [
      { label: "Coffee, milk and food", shareOfRevenue: 0.24, note: "Drink-only would be nearer 18%; food drags it up and is usually the difference between viable and not." },
      { label: "Labour", shareOfRevenue: 0.32, note: "The binding constraint. Opening hours set headcount before revenue does." },
      { label: "Rent and occupancy", shareOfRevenue: 0.12, note: "Above 15% of revenue, most independent shops do not clear a living for the owner." },
      { label: "Marketing", shareOfRevenue: 0.02, note: "Mostly local and organic. A shop that needs paid acquisition has a location problem." },
    ],
    readerAsks: [
      {
        question: "How many transactions a day, and where does that number come from?",
        answer:
          "A counted number beats an assumed one: a morning footfall count outside the unit, a comparable shop's queue, or the previous tenant's utility load. Say which.",
      },
      {
        question: "What is rent as a share of projected revenue?",
        answer:
          "This single ratio explains most failed coffee shops. Compute it explicitly and defend it, because the lender will.",
      },
    ],
    risks: [
      {
        title: "Fit-out overruns",
        detail: "Espresso plumbing, extraction and an accessible counter routinely add twenty per cent to a build-out quote. A plan with no contingency reads as a first plan.",
      },
      {
        title: "The second bad month",
        detail: "Ramp is slower than founders model. The lowest cash point is usually month four or five, not month one.",
      },
    ],
    regulatory: [
      "Food service establishment permit and health inspection",
      "Certificate of occupancy after fit-out, which gates the opening date",
      "Grease trap and extraction sign-off where hot food is served",
      "Sales tax registration in the trading jurisdiction",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Coffee shop", "coffee-shop", 3),
      revenueStreams: [
        {
          id: "counter", name: "Counter sales", kind: "retail-footfall", startMonth: 3,
          dailyTraffic: 240, conversionRate: 1, averageTicket: 9.5,
          openDaysPerMonth: 28,
          // 240 cups a day against 336 at full throughput on one machine and
          // one barista — past that the queue is the constraint, not demand.
          growth: { shape: "saturating", monthlyRate: 0.008, ceiling: 9_408, terminalAnnualRate: 0.02 },
          cogsPercent: 0.24,
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 72_000, isOwner: true, startMonth: 1 },
        { id: "bar", title: "Baristas", annualSalary: 38_000, count: 6, startMonth: 3, isDirectLabour: true },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 8_400, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 1_400, annualGrowthRate: 0.04 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 420 },
        { id: "mkt", name: "Local marketing", category: "marketing", percentOfRevenue: 0.02 },
        { id: "ga", name: "Point of sale, accounting and admin", category: "other", percentOfRevenue: 0.08 },
      ],
      capex: [{ id: "fit", name: "Fit-out and equipment", month: 1, amount: 240_000, usefulLifeYears: 10 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 250_000, annualRate: 0.112, termMonths: 120, interestOnlyMonths: 3 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 90_000 }],
      workingCapital: { receivableDays: 1, payableDays: 21, inventoryDays: 8 },
      registry: estimated,
    }),
  },

  {
    slug: "restaurant",
    sector: "food-drink",
    label: "Restaurant",
    title: "A restaurant business plan that survives an underwriter",
    query: "restaurant business plan",
    demand: { volume: 2400, difficulty: 27, cpc: 4.58 },
    benchmarkKey: "restaurant",
    naics: "722511",
    lede:
      "Full-service restaurants are underwritten on covers, average check and prime cost. A plan that cannot state all three, and show where they came from, is a plan a credit committee reads for two minutes.",
    costStructure: [
      { label: "Food and beverage", shareOfRevenue: 0.31, note: "Beverage mix moves this more than menu pricing does." },
      { label: "Labour", shareOfRevenue: 0.33, note: "Front and back of house. Prime cost — food plus labour — is the number a lender computes first." },
      { label: "Occupancy", shareOfRevenue: 0.09, note: "Rent, insurance and utilities. Above 10% the margin rarely recovers." },
      { label: "Marketing", shareOfRevenue: 0.03, note: "Mostly local and event-driven." },
    ],
    readerAsks: [
      {
        question: "What is your prime cost?",
        answer:
          "Food plus labour as a share of revenue. Above about 65% the business does not clear its occupancy and debt service, and the reader knows the number before you say it.",
      },
      {
        question: "How many covers, at what average check, on what days?",
        answer:
          "A weekday lunch and a Saturday dinner are different businesses. A single blended average hides the question a reader is actually asking.",
      },
    ],
    risks: [
      {
        title: "Owner compensation set to zero",
        detail: "The most common silent failure. An underwriter substitutes a market salary and recomputes coverage, and the plan fails on their arithmetic rather than yours.",
      },
      {
        title: "No seasonality",
        detail: "A flat twelve months signals a model built from an annual figure divided by twelve. Restaurants are seasonal everywhere.",
      },
    ],
    regulatory: [
      "Food service establishment permit and scheduled health inspections",
      "Liquor licence where alcohol is served — often the longest lead time in the whole build",
      "Certificate of occupancy, which sets the true opening month",
      "Employer registration, workers' compensation and payroll tax accounts",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Restaurant", "restaurant", 4),
      revenueStreams: [
        {
          id: "covers", name: "Dining room", kind: "retail-footfall", startMonth: 4,
          dailyTraffic: 210, conversionRate: 0.62, averageTicket: 38,
          openDaysPerMonth: 26,
          // 130 covers a day in a 40-seat room is about 1.6 turns a service.
          // 182 is 2.2 turns, which is a full house — the room cannot do more.
          growth: { shape: "saturating", monthlyRate: 0.012, ceiling: 4_739, terminalAnnualRate: 0.02 },
          cogsPercent: 0.31,
          seasonality: [0.88, 0.9, 0.97, 1.02, 1.06, 1.08, 1.05, 1.03, 1.0, 1.01, 0.99, 1.01],
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 85_000, isOwner: true, startMonth: 1 },
        // Sized against the sector's 28–38% payroll ratio. The first draft ran
        // 42% and the second-year rota additions took coverage to 0.17× — a plan
        // no lender would have read past, produced entirely by over-rostering.
        { id: "kitchen", title: "Kitchen staff", annualSalary: 46_000, count: 4, startMonth: 3, isDirectLabour: true },
        { id: "kitchen2", title: "Kitchen staff, second section", annualSalary: 46_000, startMonth: 18, isDirectLabour: true },
        { id: "foh", title: "Front of house", annualSalary: 38_000, count: 5, startMonth: 4 },
        { id: "foh2", title: "Front of house, added rota", annualSalary: 38_000, count: 2, startMonth: 22 },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 11_500, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 3_200, annualGrowthRate: 0.04 },
        { id: "mkt", name: "Local marketing", category: "marketing", percentOfRevenue: 0.03 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 1_450 },
        { id: "ga", name: "Point of sale, accounting, licences and admin", category: "other", percentOfRevenue: 0.07 },
      ],
      capex: [
        { id: "kit", name: "Kitchen build", month: 1, amount: 420_000, usefulLifeYears: 10 },
        { id: "ff", name: "Furniture", month: 2, amount: 85_000, usefulLifeYears: 7 },
      ],
      loans: [{ id: "sba504", name: "SBA 504", month: 1, principal: 500_000, annualRate: 0.098, termMonths: 240, interestOnlyMonths: 3 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 180_000 }],
      workingCapital: { receivableDays: 2, payableDays: 21, inventoryDays: 9 },
      registry: estimated,
    }),
  },

  {
    slug: "bakery",
    sector: "food-drink",
    label: "Bakery",
    title: "A bakery business plan with a wholesale line that carries the rent",
    query: "bakery business plan",
    demand: { volume: 1000, difficulty: 21, cpc: 2.53 },
    benchmarkKey: "restaurant",
    naics: "311811",
    lede:
      "Retail bakery margins are good and retail bakery volumes are small. The plans that fund are the ones with a wholesale or café line underneath, because a production kitchen that runs four hours a day cannot cover its own build-out.",
    costStructure: [
      { label: "Ingredients and packaging", shareOfRevenue: 0.28, note: "Flour and butter move with commodity prices; a fixed-margin assumption will drift." },
      { label: "Production labour", shareOfRevenue: 0.3, note: "Overnight shifts carry a premium almost everywhere." },
      { label: "Occupancy", shareOfRevenue: 0.1, note: "Production space plus retail frontage. Splitting the two is often cheaper." },
      { label: "Waste", shareOfRevenue: 0.04, note: "Unsold fresh product. A plan with no waste line has not run a bakery." },
    ],
    readerAsks: [
      {
        question: "What share of revenue is wholesale?",
        answer:
          "Wholesale is lower margin and far more predictable. A reader treats a contracted wholesale base as the floor under the whole model.",
      },
      {
        question: "What is your waste rate, and is it in the model?",
        answer:
          "Fresh product unsold at close is a real cost with a real number. Leaving it out overstates gross margin by several points.",
      },
    ],
    risks: [
      {
        title: "Ingredient price exposure",
        detail: "Butter, flour and eggs have all moved thirty per cent inside a year in recent memory. A fixed COGS percentage across five years will be challenged.",
      },
      {
        title: "Production capacity as the real ceiling",
        detail: "Oven hours, not demand, cap revenue. A plan forecasting growth past the equipment's capacity needs the capex to match.",
      },
    ],
    regulatory: [
      "Food manufacturing or retail food establishment licence, depending on the wholesale share",
      "Allergen labelling for anything sold wholesale or packaged",
      "Health inspection and food handler certification",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Bakery", "restaurant", 3),
      revenueStreams: [
        {
          id: "retail", name: "Retail counter", kind: "retail-footfall", startMonth: 3,
          dailyTraffic: 150, conversionRate: 1, averageTicket: 13,
          openDaysPerMonth: 26,
          // The counter sells what the ovens bake. 210 transactions a day is
          // the morning bake plus an afternoon run, and there is no third.
          growth: { shape: "saturating", monthlyRate: 0.01, ceiling: 5_460, terminalAnnualRate: 0.02 },
          cogsPercent: 0.28,
          seasonality: [0.92, 0.95, 1.0, 1.0, 1.02, 0.98, 0.94, 0.94, 1.0, 1.04, 1.1, 1.15],
        },
        {
          // The line the page argues for: contracted, lower margin, and the
          // reason a production kitchen covers its own build-out.
          id: "wholesale", name: "Wholesale accounts", kind: "contract", startMonth: 4,
          initialContracts: 0, newContractsPerMonth: 0.3,
          monthlyValuePerContract: 3_200, termMonths: 24, cogsPercent: 0.34,
        },
      ],
      roles: [
        { id: "own", title: "Owner-baker", annualSalary: 66_000, isOwner: true, startMonth: 1 },
        { id: "prod", title: "Production staff", annualSalary: 42_000, count: 3, startMonth: 2, isDirectLabour: true },
        { id: "prod2", title: "Production staff, wholesale shift", annualSalary: 42_000, count: 2, startMonth: 16, isDirectLabour: true },
        { id: "counter", title: "Counter staff", annualSalary: 34_000, count: 2, startMonth: 3 },
      ],
      opex: [
        { id: "rent", name: "Production and retail space", category: "rent", monthlyAmount: 6_400, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 2_100, annualGrowthRate: 0.05 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 380 },
        { id: "ga", name: "Packaging, delivery and admin", category: "other", percentOfRevenue: 0.09 },
      ],
      capex: [{ id: "ovens", name: "Ovens, mixers and fit-out", month: 1, amount: 210_000, usefulLifeYears: 10 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 180_000, annualRate: 0.112, termMonths: 120, interestOnlyMonths: 2 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 125_000 }],
      workingCapital: { receivableDays: 12, payableDays: 21, inventoryDays: 7 },
      registry: estimated,
    }),
  },

  {
    slug: "bar",
    sector: "food-drink",
    label: "Bar",
    title: "A bar business plan where the licence is on the critical path",
    query: "bar business plan",
    demand: { volume: 720, difficulty: 17, cpc: 3.52 },
    benchmarkKey: "bar",
    naics: "722410",
    lede:
      "Bars have the best gross margin in hospitality and the tightest regulatory gate. The licence, not the fit-out, usually sets the opening date — and a plan whose first trading month ignores that is already wrong.",
    costStructure: [
      { label: "Beverage cost", shareOfRevenue: 0.24, note: "Spirits run nearer 18%, draught nearer 28%. The mix is the margin." },
      { label: "Labour", shareOfRevenue: 0.28, note: "Peaky. Two people on a Tuesday, eight on a Saturday." },
      { label: "Occupancy", shareOfRevenue: 0.1, note: "Late licences command higher rents." },
      { label: "Security and compliance", shareOfRevenue: 0.03, note: "Door staff, cameras, training. Often a licence condition rather than a choice." },
    ],
    readerAsks: [
      {
        question: "When does the licence actually issue?",
        answer:
          "Months, not weeks, and it can be objected to. The plan should show the business carrying fixed costs from lease signature until the licence lands.",
      },
      {
        question: "What is the draught-to-spirits mix?",
        answer:
          "It moves gross margin by six or seven points, which is the difference between servicing the debt and not.",
      },
    ],
    risks: [
      {
        title: "Licensing delay",
        detail: "The single most common cause of a bar running out of cash before it opens. Model the rent from lease signature, not from the first pour.",
      },
      {
        title: "Concentration in two trading nights",
        detail: "If Friday and Saturday carry the week, one closed weekend is a month's profit.",
      },
    ],
    regulatory: [
      "Liquor licence, with a public notice and objection period in most jurisdictions",
      "Responsible service certification for all serving staff",
      "Occupancy and fire capacity limits, which cap the revenue model",
      "Late-hours or entertainment permit where applicable",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Bar", "restaurant", 5),
      revenueStreams: [
        {
          id: "bar", name: "Bar service", kind: "retail-footfall", startMonth: 5,
          dailyTraffic: 160, conversionRate: 0.9, averageTicket: 26,
          openDaysPerMonth: 24,
          // 144 served a night against 202 at capacity — the licence, the
          // room and the number of people one bar can pour for.
          growth: { shape: "saturating", monthlyRate: 0.011, ceiling: 4_838, terminalAnnualRate: 0.02 },
          cogsPercent: 0.26,
          seasonality: [0.85, 0.88, 0.96, 1.0, 1.08, 1.12, 1.12, 1.08, 1.02, 1.0, 0.95, 1.14],
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 78_000, isOwner: true, startMonth: 1 },
        { id: "bar", title: "Bar staff", annualSalary: 36_000, count: 8, startMonth: 5, isDirectLabour: true },
        { id: "door", title: "Door staff", annualSalary: 32_000, count: 3, startMonth: 5 },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 12_500, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 2_400, annualGrowthRate: 0.04 },
        { id: "lic", name: "Licensing and compliance", category: "other", monthlyAmount: 900 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 1_100 },
        { id: "ga", name: "Point of sale, entertainment and admin", category: "other", percentOfRevenue: 0.07 },
      ],
      capex: [{ id: "fit", name: "Fit-out, bar and cellar", month: 1, amount: 320_000, usefulLifeYears: 10 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 300_000, annualRate: 0.115, termMonths: 120, interestOnlyMonths: 5 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 130_000 }],
      workingCapital: { receivableDays: 0, payableDays: 24, inventoryDays: 14 },
      registry: estimated,
    }),
  },

  /* ---- Services and trades -------------------------------------------- */
  {
    slug: "cleaning",
    sector: "trades",
    label: "Commercial cleaning",
    title: "A cleaning business plan built on contracts, not hours",
    query: "cleaning business plan",
    demand: { volume: 2400, difficulty: 20, cpc: 3.18 },
    benchmarkKey: "cleaning",
    naics: "561720",
    lede:
      "Cleaning is one of the few sectors where a plan can show contracted, recurring revenue from month one — which is exactly what a lender wants and exactly what most cleaning plans fail to present. The model is a contract book, not an hourly rate.",
    costStructure: [
      { label: "Direct labour", shareOfRevenue: 0.45, note: "The whole business. Everything else is a rounding error beside it." },
      { label: "Supplies and consumables", shareOfRevenue: 0.06, note: "Chemicals, paper, bags. Low and predictable." },
      { label: "Vehicles and travel", shareOfRevenue: 0.05, note: "Route density decides this. Scattered contracts cost more than they look." },
      { label: "Insurance and bonding", shareOfRevenue: 0.03, note: "Commercial clients require both before they sign." },
    ],
    readerAsks: [
      {
        question: "How many contracts, at what monthly value, on what term?",
        answer:
          "A contract book with terms is underwritable. A projected hourly rate multiplied by projected hours is not.",
      },
      {
        question: "What is your churn, and what replaces a lost contract?",
        answer:
          "Commercial cleaning contracts are rebid. A plan assuming a contract runs five years without re-tender will be challenged.",
      },
    ],
    risks: [
      {
        title: "Labour supply, not demand",
        detail: "Growth is capped by the ability to hire and retain cleaners. A revenue ramp without a matching hiring plan is the most common gap here.",
      },
      {
        title: "Customer concentration",
        detail: "One contract at forty per cent of revenue makes the whole plan a single-customer bet, and a lender prices it that way.",
      },
    ],
    regulatory: [
      "General liability insurance and a fidelity bond, usually required by the client",
      "Workers' compensation coverage in every state you operate in",
      "Employment eligibility verification for all staff",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Commercial cleaning", "cleaning"),
      revenueStreams: [
        {
          id: "contracts", name: "Cleaning contracts", kind: "contract", startMonth: 1,
          initialContracts: 0, newContractsPerMonth: 1.2,
          monthlyValuePerContract: 2_900, termMonths: 24, cogsPercent: 0.06,
        },
      ],
      roles: [
        { id: "own", title: "Owner-manager", annualSalary: 72_000, isOwner: true, startMonth: 1 },
        // Cleaners are the cost of the service, so headcount tracks the contract
        // book rather than arriving in three big steps. One cleaner covers a
        // little over two contracts a night, which is what sets the cohorts.
        { id: "clean", title: "Cleaners", annualSalary: 34_000, count: 2, startMonth: 1, isDirectLabour: true },
        { id: "clean2", title: "Cleaners, second crew", annualSalary: 34_000, count: 2, startMonth: 6, isDirectLabour: true },
        { id: "clean3", title: "Cleaners, third crew", annualSalary: 34_000, count: 2, startMonth: 10, isDirectLabour: true },
        { id: "clean4", title: "Cleaners, fourth crew", annualSalary: 34_000, count: 2, startMonth: 15, isDirectLabour: true },
        { id: "clean5", title: "Cleaners, fifth crew", annualSalary: 34_000, count: 2, startMonth: 21, isDirectLabour: true },
        { id: "clean6", title: "Cleaners, sixth crew", annualSalary: 34_000, count: 2, startMonth: 27, isDirectLabour: true },
        { id: "sup", title: "Supervisor", annualSalary: 46_000, startMonth: 10 },
        { id: "sup2", title: "Supervisor, second", annualSalary: 46_000, startMonth: 24 },
      ],
      opex: [
        { id: "veh", name: "Vehicles and fuel", category: "other", monthlyAmount: 2_200, annualGrowthRate: 0.04 },
        { id: "ins", name: "Insurance and bonding", category: "insurance", monthlyAmount: 1_300 },
        { id: "admin", name: "Office and admin", category: "other", monthlyAmount: 900, annualGrowthRate: 0.03 },
        { id: "mkt", name: "Sales and marketing", category: "marketing", percentOfRevenue: 0.03 },
        { id: "ga", name: "Scheduling, payroll processing and admin", category: "other", percentOfRevenue: 0.05 },
      ],
      capex: [{ id: "eq", name: "Equipment and vehicles", month: 1, amount: 95_000, usefulLifeYears: 6 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 125_000, annualRate: 0.115, termMonths: 84 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 120_000 }],
      workingCapital: { receivableDays: 38, payableDays: 21, inventoryDays: 0 },
      registry: estimated,
    }),
  },

  {
    slug: "trucking",
    sector: "trades",
    label: "Trucking",
    title: "A trucking business plan underwritten on revenue per mile",
    query: "trucking business plan",
    demand: { volume: 1600, difficulty: 18, cpc: 3.54 },
    benchmarkKey: "trucking",
    naics: "484121",
    lede:
      "Trucking is a capital-intensive business with a thin margin and a volatile top line. A lender reads three numbers: revenue per loaded mile, deadhead percentage, and the fixed cost of the truck whether it moves or not.",
    costStructure: [
      { label: "Driver pay", shareOfRevenue: 0.32, note: "Per mile or percentage of load. The single largest line." },
      { label: "Fuel", shareOfRevenue: 0.22, note: "Moves with diesel. A fixed assumption across five years will be challenged." },
      { label: "Maintenance and tyres", shareOfRevenue: 0.094, note: "Modelled per mile, not per month — it is a variable cost, and it rises sharply after the warranty period." },
      { label: "Insurance and permits", shareOfRevenue: 0.08, note: "Authority, cargo and liability. New authorities pay materially more." },
    ],
    readerAsks: [
      {
        question: "What is your revenue per loaded mile, and your deadhead rate?",
        answer:
          "Gross revenue means nothing without both. Fifteen per cent deadhead against ten per cent is the difference between a profitable truck and a loss-making one.",
      },
      {
        question: "What happens when a truck is off the road for three weeks?",
        answer:
          "With one or two units that is a material share of annual revenue. A reader wants the cash cushion or the arrangement that covers it.",
      },
    ],
    risks: [
      {
        title: "Fuel exposure",
        detail: "A fifty-cent move in diesel can take the whole margin. Fuel surcharge arrangements belong in the plan explicitly.",
      },
      {
        title: "New authority insurance",
        detail: "Carriers under two years old pay substantially more for insurance. Plans built on established-carrier quotes understate cost badly.",
      },
    ],
    regulatory: [
      "USDOT number and operating authority before the first load",
      "Commercial vehicle insurance at the filing minimums for the authority type",
      "Hours-of-service and electronic logging compliance",
      "International Fuel Tax Agreement registration for interstate operation",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Trucking", "trucking"),
      revenueStreams: [
        {
          id: "loads", name: "Loaded miles", kind: "unit-sales", startMonth: 1,
          // Fuel and per-mile maintenance both sit in the unit cost: the trade
          // quotes gross margin after driver pay, fuel and maintenance, so
          // holding maintenance as a flat monthly overhead reported a margin
          // eight points above the band for no real reason.
          unitsMonth1: 17_000,
          // Miles are trucks multiplied by hours a driver may legally work.
          // 23,800 a month is the fleet running hard, not a bigger fleet.
          growth: { shape: "saturating", monthlyRate: 0.008, ceiling: 23_800, terminalAnnualRate: 0.02 },
          pricePerUnit: 2.55, costPerUnit: 0.86, cogsPercent: 0,
        },
      ],
      roles: [
        { id: "own", title: "Owner-driver", annualSalary: 65_000, isOwner: true, startMonth: 1 },
        { id: "drv", title: "Drivers", annualSalary: 62_000, count: 2, startMonth: 2, isDirectLabour: true },
      ],
      opex: [
        { id: "maint", name: "Out-of-warranty repairs", category: "other", monthlyAmount: 1_800, annualGrowthRate: 0.12 },
        { id: "ins", name: "Insurance and permits", category: "insurance", monthlyAmount: 4_200, annualGrowthRate: 0.05 },
        { id: "admin", name: "Dispatch and admin", category: "other", monthlyAmount: 1_600, annualGrowthRate: 0.03 },
        { id: "ga", name: "Factoring fees, compliance and admin", category: "other", percentOfRevenue: 0.03 },
      ],
      capex: [{ id: "trucks", name: "Tractors and trailers", month: 1, amount: 215_000, usefulLifeYears: 7 }],
      loans: [{ id: "eq", name: "Equipment finance", month: 1, principal: 170_000, annualRate: 0.118, termMonths: 72 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 70_000 }],
      // Factoring is paid for in opex above, so receivable days have to reflect
      // it. Charging the fee and still carrying 42 days counts the same cash gap
      // twice — the kind of internal contradiction the review catches.
      workingCapital: { receivableDays: 8, payableDays: 18, inventoryDays: 0 },
      registry: estimated,
    }),
  },

  {
    slug: "salon",
    sector: "trades",
    label: "Hair salon",
    title: "A salon business plan built on chair utilisation",
    query: "salon business plan",
    demand: { volume: 1600, difficulty: 9, cpc: 5.13 },
    benchmarkKey: "salon",
    naics: "812112",
    lede:
      "A salon is a property business with scissors: the rent is fixed, the chairs are finite, and everything turns on how full they are. Whether stylists are employed or rent their chair changes the whole model, and a plan that does not say which is unreadable.",
    costStructure: [
      { label: "Stylist compensation", shareOfRevenue: 0.42, note: "Commission or salary. Chair rental flips this into a rent line instead." },
      { label: "Product and colour", shareOfRevenue: 0.08, note: "Colour services carry far more product cost than cuts." },
      { label: "Occupancy", shareOfRevenue: 0.13, note: "High for the revenue base. Location drives footfall, so it is rarely worth cutting." },
      { label: "Retail cost of goods", shareOfRevenue: 0.04, note: "Retail is a margin line, not a revenue line — treat it separately." },
    ],
    readerAsks: [
      {
        question: "Employed stylists or chair rental?",
        answer:
          "They are two different businesses with different risk. Employment carries payroll and utilisation risk; chair rental carries vacancy risk and caps the upside.",
      },
      {
        question: "What is your chair utilisation at steady state?",
        answer:
          "Chairs times open hours times utilisation times average ticket is the whole revenue model. Anything else is a guess dressed as a forecast.",
      },
    ],
    risks: [
      {
        title: "Stylists leave with their clients",
        detail: "The book often belongs to the stylist, not the salon. A plan with no answer to this is a plan with an undeclared concentration risk.",
      },
      {
        title: "Ramp on a new location",
        detail: "A new salon takes six to twelve months to fill chairs. A plan at full utilisation in month three will not be believed.",
      },
    ],
    regulatory: [
      "Cosmetology establishment licence, plus individual licences for every operator",
      "Health and sanitation inspection, often unannounced",
      "Chair rental agreements, where used, must be genuine independent contracts",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Hair salon", "salon", 2),
      revenueStreams: [
        {
          id: "chairs", name: "Services", kind: "hourly-services", startMonth: 2,
          // Chairs are the constraint, so most of the growth has to come from
          // utilisation and price rather than heads. The head count here is
          // matched by the stylist cohort below — a salon billing seven chairs
          // and paying five is the contradiction the review is built to catch.
          billableHeadcount: 5, hoursPerHeadPerMonth: 150, utilisation: 0.72,
          hourlyRate: 85,
          // Five chairs today, six at most: the room has no seventh station.
          growth: { shape: "linear", perMonth: 0.02, max: 6.2 },
          cogsPercent: 0.08,
        },
      ],
      roles: [
        { id: "own", title: "Owner-stylist", annualSalary: 64_000, isOwner: true, startMonth: 1 },
        { id: "sty", title: "Stylists", annualSalary: 42_000, count: 4, startMonth: 2, isDirectLabour: true },
        { id: "sty2", title: "Stylist, fifth chair", annualSalary: 42_000, startMonth: 26, isDirectLabour: true },
        { id: "recep", title: "Reception", annualSalary: 32_000, startMonth: 2 },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 5_800, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 900, annualGrowthRate: 0.04 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 320 },
        { id: "mkt", name: "Marketing", category: "marketing", percentOfRevenue: 0.03 },
        { id: "ga", name: "Booking software, card fees and admin", category: "other", percentOfRevenue: 0.06 },
      ],
      capex: [{ id: "fit", name: "Fit-out, chairs and basins", month: 1, amount: 130_000, usefulLifeYears: 8 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 110_000, annualRate: 0.115, termMonths: 84, interestOnlyMonths: 2 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 45_000 }],
      workingCapital: { receivableDays: 0, payableDays: 21, inventoryDays: 25 },
      registry: estimated,
    }),
  },

  {
    slug: "landscaping",
    sector: "trades",
    label: "Landscaping",
    title: "A landscaping business plan that survives the winter",
    query: "landscaping business plan",
    demand: { volume: 880, difficulty: 7, cpc: 4.23 },
    benchmarkKey: "landscaping",
    naics: "561730",
    lede:
      "Landscaping plans fail on seasonality and cash. Revenue arrives in seven months, equipment finance is due in twelve, and the crews you cannot afford to lose in November are the crews you cannot replace in April.",
    costStructure: [
      { label: "Crew labour", shareOfRevenue: 0.38, note: "Seasonal. Retaining crews through winter is a real cost with a real return." },
      { label: "Materials", shareOfRevenue: 0.16, note: "Plant, mulch, stone. Pass-through on install work, near zero on maintenance." },
      { label: "Equipment and fuel", shareOfRevenue: 0.09, note: "Mowers, trucks, trailers. Maintenance rises with hours, not months." },
      { label: "Insurance", shareOfRevenue: 0.03, note: "Liability plus vehicles. Tree work carries a materially higher rate." },
    ],
    readerAsks: [
      {
        question: "What is the maintenance-to-install split?",
        answer:
          "Maintenance is recurring, contracted and low margin. Install is lumpy, higher margin and hard to forecast. A reader values them completely differently.",
      },
      {
        question: "How do you cover December to March?",
        answer:
          "Snow removal, holiday lighting, or a cash reserve built in season. A plan with a flat twelve-month revenue line has not answered this.",
      },
    ],
    risks: [
      {
        title: "Seasonal cash trough",
        detail: "The lowest cash point is late winter, not launch. A model that does not show it has almost certainly smoothed the revenue.",
      },
      {
        title: "Weather",
        detail: "A wet spring moves a month of install revenue into the next quarter. Debt service does not move with it.",
      },
    ],
    regulatory: [
      "Contractor or landscape licence where the state requires one",
      "Pesticide applicator certification for chemical treatment",
      "Commercial vehicle registration and trailer compliance",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Landscaping", "construction"),
      revenueStreams: [
        {
          id: "work", name: "Maintenance and install", kind: "contract", startMonth: 1,
          initialContracts: 0, newContractsPerMonth: 5,
          monthlyValuePerContract: 470, termMonths: 24, cogsPercent: 0.16,
          seasonality: [0.25, 0.28, 0.75, 1.25, 1.45, 1.5, 1.45, 1.4, 1.3, 1.1, 0.6, 0.27],
        },
        {
          // A five-month season against a year-round crew is what actually
          // breaks these plans. Snow and winter work is the standard answer and
          // it has to be in the model, not only in the narrative.
          id: "winter", name: "Snow and winter services", kind: "contract", startMonth: 1,
          initialContracts: 0, newContractsPerMonth: 1.4,
          monthlyValuePerContract: 640, termMonths: 24, cogsPercent: 0.12,
          seasonality: [2.7, 2.5, 1.4, 0.2, 0, 0, 0, 0, 0, 0.5, 1.7, 2.9],
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 68_000, isOwner: true, startMonth: 1 },
        { id: "crew", title: "Crew", annualSalary: 38_000, count: 2, startMonth: 1, isDirectLabour: true },
        { id: "crew2", title: "Crew, second truck", annualSalary: 38_000, count: 2, startMonth: 10, isDirectLabour: true },
        { id: "crew3", title: "Crew, third truck", annualSalary: 38_000, count: 2, startMonth: 20, isDirectLabour: true },
        { id: "crew4", title: "Crew, fourth truck", annualSalary: 38_000, count: 2, startMonth: 22, isDirectLabour: true },
        { id: "crew5", title: "Crew, fifth truck", annualSalary: 38_000, count: 2, startMonth: 30, isDirectLabour: true },
      ],
      opex: [
        { id: "eqp", name: "Equipment, fuel and maintenance", category: "other", monthlyAmount: 3_100, annualGrowthRate: 0.05 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 980 },
        { id: "yard", name: "Yard and storage", category: "rent", monthlyAmount: 1_400, annualGrowthRate: 0.03 },
        { id: "mkt", name: "Marketing", category: "marketing", percentOfRevenue: 0.02 },
        { id: "ga", name: "Scheduling, licences and admin", category: "other", percentOfRevenue: 0.05 },
      ],
      capex: [{ id: "eq", name: "Trucks, trailers and mowers", month: 1, amount: 140_000, usefulLifeYears: 6 }],
      loans: [{ id: "eqf", name: "Equipment finance", month: 1, principal: 115_000, annualRate: 0.112, termMonths: 72 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 155_000 }],
      workingCapital: { receivableDays: 28, payableDays: 24, inventoryDays: 4 },
      registry: estimated,
    }),
  },

  {
    slug: "construction",
    sector: "trades",
    label: "Construction",
    title: "A construction business plan where working capital is the real ask",
    query: "construction business plan",
    demand: { volume: 1000, difficulty: 23, cpc: 8.09 },
    benchmarkKey: "construction",
    naics: "238000",
    lede:
      "Specialty trade contractors rarely fail on margin. They fail on the gap between paying crews weekly and being paid in sixty days, on retainage held to completion, and on one job that goes wrong. The plan a lender wants is a working-capital plan.",
    costStructure: [
      { label: "Direct labour", shareOfRevenue: 0.3, note: "Paid weekly. The timing, not the amount, is what breaks contractors." },
      { label: "Materials and subcontractors", shareOfRevenue: 0.4, note: "Largely pass-through, but financed by you until the draw clears." },
      { label: "Equipment", shareOfRevenue: 0.06, note: "Owned or rented. Rental is more expensive and far more flexible early on." },
      { label: "Insurance and bonding", shareOfRevenue: 0.04, note: "Bonding capacity is often the real constraint on the size of job you can take." },
    ],
    readerAsks: [
      {
        question: "What are your payment terms, and how much is held as retainage?",
        answer:
          "Five or ten per cent held until completion, against crews paid weekly, is the whole cash story. It belongs in the model, not in a footnote.",
      },
      {
        question: "What is your bonding capacity?",
        answer:
          "It caps the size of contract you can bid. A revenue forecast above your bonding line is a forecast of work you cannot legally take.",
      },
    ],
    risks: [
      {
        title: "The one bad job",
        detail: "A single underbid or disputed contract can consume a year of profit. A reader wants to know the largest single job as a share of revenue.",
      },
      {
        title: "Retainage timing",
        detail: "Cash locked until completion is cash that cannot make payroll. Model it as a receivable that ages past the invoice.",
      },
    ],
    regulatory: [
      "State contractor licence at the classification and dollar limit you intend to bid",
      "Payment and performance bonds for public and larger private work",
      "Workers' compensation, with rates set by trade classification",
      "Lien notice filings, which have short and unforgiving deadlines",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Construction", "construction"),
      revenueStreams: [
        {
          id: "jobs", name: "Contracted work", kind: "contract", startMonth: 1,
          initialContracts: 0, newContractsPerMonth: 1,
          monthlyValuePerContract: 46_000, termMonths: 6, cogsPercent: 0.4,
        },
      ],
      roles: [
        { id: "own", title: "Owner", annualSalary: 95_000, isOwner: true, startMonth: 1 },
        // Staged deliberately. Eight tradesmen from month one against a book
        // that takes six months to fill is how a profitable contractor runs out
        // of cash, which is the whole point of this page.
        { id: "crew", title: "Crew", annualSalary: 58_000, count: 4, startMonth: 1, isDirectLabour: true },
        { id: "crew1b", title: "Crew, second gang", annualSalary: 58_000, count: 4, startMonth: 5, isDirectLabour: true },
        { id: "crew2", title: "Crew, third gang", annualSalary: 58_000, count: 6, startMonth: 12, isDirectLabour: true },
        { id: "pm", title: "Project managers", annualSalary: 78_000, count: 2, startMonth: 4 },
        { id: "est", title: "Estimator", annualSalary: 72_000, startMonth: 8 },
      ],
      opex: [
        { id: "eq", name: "Equipment and rental", category: "other", monthlyAmount: 5_400, annualGrowthRate: 0.04 },
        { id: "ins", name: "Insurance and bonding", category: "insurance", monthlyAmount: 3_800, annualGrowthRate: 0.04 },
        { id: "yard", name: "Yard and office", category: "rent", monthlyAmount: 2_600, annualGrowthRate: 0.03 },
        { id: "ga", name: "Estimating software, permits and admin", category: "other", percentOfRevenue: 0.04 },
      ],
      capex: [{ id: "eq", name: "Trucks and equipment", month: 1, amount: 185_000, usefulLifeYears: 7 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 200_000, annualRate: 0.115, termMonths: 84, interestOnlyMonths: 3 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 195_000 }],
      workingCapital: { receivableDays: 58, payableDays: 30, inventoryDays: 6 },
      registry: estimated,
    }),
  },

  /* ---- Care, property and retail -------------------------------------- */
  {
    slug: "daycare",
    sector: "place",
    label: "Daycare",
    title: "A daycare business plan that starts from licensed capacity",
    query: "daycare business plan",
    demand: { volume: 1300, difficulty: 22, cpc: 6.25 },
    benchmarkKey: "childcare",
    naics: "624410",
    lede:
      "Childcare revenue has a hard ceiling set by licence: children per room, square feet per child, and staff-to-child ratios by age. A plan that forecasts past its licensed capacity is forecasting something it is not permitted to do.",
    costStructure: [
      { label: "Staff", shareOfRevenue: 0.5, note: "Ratios are legal minimums, not a choice. Infant rooms are the most expensive and the least profitable." },
      { label: "Occupancy", shareOfRevenue: 0.14, note: "Square footage per child is licensed, so space cost scales with enrolment capacity." },
      { label: "Food and supplies", shareOfRevenue: 0.07, note: "Often partly offset by a food programme subsidy where eligible." },
      { label: "Insurance", shareOfRevenue: 0.03, note: "Liability plus abuse and molestation coverage, which is separately underwritten." },
    ],
    readerAsks: [
      {
        question: "What is your licensed capacity by age group?",
        answer:
          "Infant, toddler and preschool places have different ratios, different prices and different costs. A single blended capacity hides the economics entirely.",
      },
      {
        question: "What enrolment do you assume, and how fast do you get there?",
        answer:
          "Full enrolment in month one is not credible. Most centres take nine to eighteen months, and the cash trough is in that window.",
      },
    ],
    risks: [
      {
        title: "Staffing ratios as a hard floor",
        detail: "You cannot trade below ratio, so a staff shortage closes a room and the revenue with it. This is an operational and a revenue risk at once.",
      },
      {
        title: "Licence conditions changing the build",
        detail: "Square footage, egress and outdoor space requirements routinely add cost after a lease is signed.",
      },
    ],
    regulatory: [
      "State childcare licence, with capacity set room by room",
      "Background checks and clearances for every adult on site",
      "Staff-to-child ratios and qualification requirements by age group",
      "Fire, health and playground safety inspections before opening",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Daycare", "childcare", 3),
      revenueStreams: [
        {
          id: "places", name: "Enrolment", kind: "subscription", startMonth: 3,
          initialCustomers: 14, newCustomersMonth1: 5,
          growth: { shape: "saturating", monthlyRate: -0.02, ceiling: 5, terminalAnnualRate: 0 },
          // The licence is the ceiling and it is not negotiable. This example
          // used to enrol 79 children by month 36 against a cap the page's own
          // copy calls hard — the reported defect again, in our own childcare
          // sample. 80 is the permitted roll; the model now fills toward it.
          customerCeiling: 80,
          monthlyChurnRate: 0.03, pricePerCustomerPerMonth: 1_350,
          expansionRate: 0, prepaidMonths: 1, cogsPercent: 0.07,
        },
      ],
      roles: [
        { id: "own", title: "Director", annualSalary: 74_000, isOwner: true, startMonth: 1 },
        { id: "teach", title: "Teachers", annualSalary: 38_000, count: 4, startMonth: 2, isDirectLabour: true },
        { id: "teach2", title: "Teachers, second room", annualSalary: 38_000, count: 4, startMonth: 10, isDirectLabour: true },
        { id: "teach3", title: "Teachers, third room", annualSalary: 38_000, count: 5, startMonth: 20, isDirectLabour: true },
        { id: "admin", title: "Administrator", annualSalary: 42_000, startMonth: 2 },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 9_200, annualGrowthRate: 0.03 },
        { id: "util", name: "Utilities", category: "utilities", monthlyAmount: 1_600, annualGrowthRate: 0.04 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 1_450 },
        { id: "mkt", name: "Marketing", category: "marketing", percentOfRevenue: 0.02 },
        { id: "ga", name: "Curriculum, compliance and admin", category: "other", percentOfRevenue: 0.08 },
      ],
      capex: [{ id: "fit", name: "Fit-out, playground and equipment", month: 1, amount: 280_000, usefulLifeYears: 10 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 260_000, annualRate: 0.112, termMonths: 120, interestOnlyMonths: 3 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 150_000 }],
      workingCapital: { receivableDays: 4, payableDays: 21, inventoryDays: 0 },
      registry: estimated,
    }),
  },

  {
    slug: "laundromat",
    sector: "place",
    label: "Laundromat",
    title: "A laundromat business plan built on turns per machine per day",
    query: "laundromat business plan",
    demand: { volume: 1300, difficulty: 9, cpc: 1.95 },
    benchmarkKey: "laundromat",
    naics: "812310",
    lede:
      "A laundromat is an equipment lease with a storefront. Labour is minimal, the margin is decided by utilities, and the entire revenue model is machines times turns per day times price. It is one of the most modellable small businesses there is — which is why a vague plan stands out badly.",
    costStructure: [
      { label: "Utilities", shareOfRevenue: 0.24, note: "Water, gas, electricity and sewer. The dominant cost and the one that moves." },
      { label: "Occupancy", shareOfRevenue: 0.17, note: "Long leases. The lease term should exceed the equipment finance term." },
      { label: "Labour", shareOfRevenue: 0.12, note: "Attendant hours only, unless a wash-dry-fold service is offered." },
      { label: "Repairs", shareOfRevenue: 0.05, note: "Rises with machine age. A used-equipment plan needs a much higher line here." },
    ],
    readerAsks: [
      {
        question: "How many turns per machine per day?",
        answer:
          "Between two and four is the working range. Everything above five needs evidence, because it implies queueing.",
      },
      {
        question: "What is the utility cost per turn?",
        answer:
          "Water and gas are the margin. A plan quoting a flat monthly utility bill has not modelled the business.",
      },
    ],
    risks: [
      {
        title: "Utility rate increases",
        detail: "A municipal water rate rise goes straight to the bottom line and cannot be passed on quickly.",
      },
      {
        title: "Lease term shorter than the equipment term",
        detail: "Financing machines over seven years on a five-year lease is a plan with a hole in year six.",
      },
    ],
    regulatory: [
      "Business licence and sales tax registration",
      "Backflow prevention and sewer discharge compliance",
      "Where cash-only, anti-money-laundering reporting thresholds still apply",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Laundromat", "retail", 2),
      revenueStreams: [
        {
          id: "turns", name: "Machine turns", kind: "unit-sales", startMonth: 2,
          unitsMonth1: 6_800,
          // Machines x cycles x opening hours. A laundromat's ceiling is the
          // hardest in this file: you cannot wash more than the drums hold.
          growth: { shape: "saturating", monthlyRate: 0.009, ceiling: 9_180, terminalAnnualRate: 0.02 },
          pricePerUnit: 4.75, costPerUnit: 0, cogsPercent: 0.24,
        },
      ],
      roles: [
        { id: "own", title: "Owner-operator", annualSalary: 56_000, isOwner: true, startMonth: 1 },
        { id: "att", title: "Attendants", annualSalary: 30_000, count: 2, startMonth: 2, isDirectLabour: true },
      ],
      opex: [
        { id: "rent", name: "Lease", category: "rent", monthlyAmount: 6_100, annualGrowthRate: 0.03 },
        { id: "rep", name: "Repairs and maintenance", category: "other", monthlyAmount: 1_400, annualGrowthRate: 0.06 },
        { id: "ins", name: "Insurance", category: "insurance", monthlyAmount: 340 },
        { id: "ga", name: "Card system, security and admin", category: "other", percentOfRevenue: 0.04 },
      ],
      capex: [{ id: "mach", name: "Washers, dryers and fit-out", month: 1, amount: 390_000, usefulLifeYears: 10 }],
      loans: [{ id: "sba", name: "SBA 7(a)", month: 1, principal: 350_000, annualRate: 0.11, termMonths: 120, interestOnlyMonths: 2 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 120_000 }],
      workingCapital: { receivableDays: 0, payableDays: 21, inventoryDays: 3 },
      registry: estimated,
    }),
  },

  {
    slug: "airbnb",
    sector: "place",
    label: "Short-term rental",
    title: "A short-term rental business plan a lender will read past the first page",
    query: "airbnb business plan",
    demand: { volume: 1000, difficulty: 8, cpc: 3.63 },
    benchmarkKey: "short-term-rental",
    naics: "721199",
    lede:
      "Short-term rental plans live and die on two numbers a lender already knows how to check: occupancy and average daily rate. The regulatory position is the other half — a city that restricts nightly letting can end the business between underwriting and drawdown.",
    costStructure: [
      { label: "Cleaning and turnover", shareOfRevenue: 0.18, note: "Per stay, not per month. Shorter stays cost materially more per night." },
      { label: "Platform fees", shareOfRevenue: 0.14, note: "Host fee plus payment processing. Direct booking reduces it and costs marketing." },
      { label: "Utilities and supplies", shareOfRevenue: 0.09, note: "Guests use more of everything than tenants do." },
      { label: "Maintenance and refresh", shareOfRevenue: 0.06, note: "Soft furnishings on a two-to-three year cycle, not a ten-year one." },
    ],
    readerAsks: [
      {
        question: "What occupancy and ADR, and from what comparable?",
        answer:
          "Market data for the specific submarket, not a city-wide average. Seasonality matters more here than in almost any other small business.",
      },
      {
        question: "Is nightly letting permitted, and for how long will it be?",
        answer:
          "Registration caps, primary-residence rules and outright bans are common and change quickly. A plan that does not address the local ordinance is incomplete.",
      },
    ],
    risks: [
      {
        title: "Regulatory reversal",
        detail: "The single largest risk in the sector. A reader wants to see the long-term-let fallback modelled, not asserted.",
      },
      {
        title: "Platform dependency",
        detail: "One algorithm change or account suspension removes the entire booking channel. Direct booking share is the mitigation.",
      },
    ],
    regulatory: [
      "Short-term rental registration or permit, where the jurisdiction requires one",
      "Transient occupancy or lodging tax collection and remittance",
      "Life-safety requirements — smoke, carbon monoxide, egress — often inspected",
      "HOA or lease provisions, which frequently prohibit nightly letting outright",
    ],
    typicalPurpose: "sba-loan",
    build: () => ({
      company: company("Short-term rental", "real-estate", 2),
      revenueStreams: [
        {
          id: "nights", name: "Nightly stays", kind: "unit-sales", startMonth: 2,
          unitsMonth1: 62,
          // Nights are the hardest ceiling of all: three units cannot let more
          // than ninety nights a month, and nobody achieves full occupancy.
          growth: { shape: "saturating", monthlyRate: 0.004, ceiling: 78, terminalAnnualRate: 0.02 },
          pricePerUnit: 245, costPerUnit: 44, cogsPercent: 0,
          seasonality: [0.7, 0.75, 0.9, 1.0, 1.15, 1.35, 1.4, 1.35, 1.1, 0.95, 0.8, 0.95],
        },
      ],
      roles: [
        { id: "own", title: "Owner-manager", annualSalary: 24_000, isOwner: true, startMonth: 1 },
      ],
      opex: [
        { id: "plat", name: "Platform and payment fees", category: "other", percentOfRevenue: 0.14 },
        { id: "mort", name: "Property costs and utilities", category: "utilities", monthlyAmount: 2_400, annualGrowthRate: 0.04 },
        { id: "ins", name: "Short-term rental insurance", category: "insurance", monthlyAmount: 310 },
        { id: "mkt", name: "Direct booking marketing", category: "marketing", percentOfRevenue: 0.02 },
        { id: "ga", name: "Listing photography, software and admin", category: "other", percentOfRevenue: 0.04 },
      ],
      capex: [{ id: "furn", name: "Furnishing and refresh", month: 1, amount: 48_000, usefulLifeYears: 5 }],
      loans: [{ id: "loan", name: "Acquisition loan", month: 1, principal: 240_000, annualRate: 0.105, termMonths: 240, interestOnlyMonths: 2 }],
      equityRounds: [{ id: "inj", name: "Owner injection", month: 1, amount: 85_000 }],
      workingCapital: { receivableDays: 3, payableDays: 14, inventoryDays: 0 },
      registry: estimated,
    }),
  },

  {
    slug: "ecommerce",
    sector: "online",
    label: "E-commerce",
    title: "An e-commerce business plan where the unit economics come first",
    query: "ecommerce business plan",
    demand: { volume: 1000, difficulty: 31, cpc: 5.95 },
    benchmarkKey: "ecommerce",
    naics: "455110",
    lede:
      "Direct-to-consumer plans are read on contribution margin after acquisition, not on gross margin. A sixty per cent gross margin with a forty-dollar acquisition cost on a fifty-dollar order is a business that loses money faster the more it sells.",
    costStructure: [
      { label: "Cost of goods", shareOfRevenue: 0.38, note: "Landed, including freight and duty. Ex-works cost understates it badly." },
      { label: "Paid acquisition", shareOfRevenue: 0.22, note: "The line that decides viability. It rises as you scale, never falls." },
      { label: "Fulfilment and shipping", shareOfRevenue: 0.13, note: "Pick, pack, postage and returns. Free shipping is a margin decision, not a marketing one." },
      { label: "Platform and payments", shareOfRevenue: 0.05, note: "Store fees plus card processing." },
    ],
    readerAsks: [
      {
        question: "What is contribution margin after acquisition cost?",
        answer:
          "Revenue less goods, fulfilment and the cost of getting the order. If it is negative, growth makes the problem larger.",
      },
      {
        question: "What is repeat purchase rate?",
        answer:
          "It is the only thing that makes paid acquisition affordable. A plan with no repeat assumption has assumed the worst case without saying so.",
      },
    ],
    risks: [
      {
        title: "Acquisition cost inflation",
        detail: "Paid channels get more expensive with scale and with competition. A flat cost per acquisition across five years will not be believed.",
      },
      {
        title: "Inventory and cash",
        detail: "Inventory is paid for before it sells. Growth consumes cash even when the business is profitable on paper.",
      },
    ],
    regulatory: [
      "Sales tax nexus and registration in every state where thresholds are met",
      "Product safety, labelling and import compliance for physical goods",
      "Clear returns and refund terms, which several jurisdictions mandate",
    ],
    typicalPurpose: "investor",
    build: () => ({
      company: company("E-commerce", "ecommerce"),
      revenueStreams: [
        {
          id: "orders", name: "Online orders", kind: "unit-sales", startMonth: 1,
          unitsMonth1: 420,
          // This example used to run 7% a month with nothing stopping it,
          // reaching $14M of year-five revenue on three people who never got
          // hired — the reported defect, on our own marketing site. 3,000
          // orders a month is what the warehouse and the acquisition channel
          // can carry before the plan needs a different business in it.
          growth: { shape: "saturating", monthlyRate: 0.07, ceiling: 3_000, terminalAnnualRate: 0.03 },
          pricePerUnit: 68, costPerUnit: 26, cogsPercent: 0,
          seasonality: [0.85, 0.8, 0.9, 0.95, 1.0, 0.95, 0.9, 0.95, 1.05, 1.15, 1.45, 1.35],
        },
      ],
      roles: [
        { id: "own", title: "Founder", annualSalary: 84_000, isOwner: true, startMonth: 1 },
        {
          id: "ops", title: "Operations", annualSalary: 58_000, count: 2, startMonth: 3,
          // Somebody picks, packs and answers for every order. Holding this at
          // two people while orders grew six-fold was how the old version of
          // this example reached $4.7M of revenue per head.
          staffing: {
            driver: "stream-volume", streamId: "orders", perHead: 900, minCount: 2, maxCount: 6,
          },
        },
      ],
      opex: [
        { id: "ads", name: "Paid acquisition", category: "marketing", percentOfRevenue: 0.22 },
        { id: "ful", name: "Fulfilment and shipping", category: "other", percentOfRevenue: 0.13 },
        { id: "plat", name: "Platform and payments", category: "software", percentOfRevenue: 0.05 },
        { id: "ware", name: "Warehouse", category: "rent", monthlyAmount: 2_800, annualGrowthRate: 0.03 },
        { id: "ga", name: "Customer service, returns and admin", category: "other", percentOfRevenue: 0.05 },
      ],
      capex: [{ id: "eq", name: "Packing and studio equipment", month: 1, amount: 32_000, usefulLifeYears: 5 }],
      loans: [],
      equityRounds: [{ id: "seed", name: "Seed round", month: 1, amount: 750_000 }],
      workingCapital: { receivableDays: 2, payableDays: 30, inventoryDays: 62 },
      registry: estimated,
    }),
  },

  /* ---- Professional ---------------------------------------------------- */
  {
    slug: "consulting",
    sector: "online",
    label: "Consulting",
    title: "A consulting business plan that is not just a rate card",
    query: "consulting business plan",
    demand: { volume: 390, difficulty: 29, cpc: 7.92 },
    benchmarkKey: "professional-services",
    naics: "541611",
    lede:
      "Consulting has almost no capital requirement and almost no defensibility, which flips what a plan has to prove. The questions are utilisation, pipeline and what happens when the founder is the product.",
    costStructure: [
      { label: "Delivery payroll", shareOfRevenue: 0.45, note: "Consultants on salary. Utilisation, not headcount, decides whether it works." },
      { label: "Business development", shareOfRevenue: 0.1, note: "Unbillable time spent winning work. Most plans forget to cost it." },
      { label: "Software and tooling", shareOfRevenue: 0.04, note: "Low, and genuinely fixed." },
      { label: "Office and travel", shareOfRevenue: 0.05, note: "Client-site work carries travel that is not always recoverable." },
    ],
    readerAsks: [
      {
        question: "What is target utilisation, and what is it actually?",
        answer:
          "Seventy per cent billable is a realistic steady state for a delivery consultant. Ninety is a plan written by someone who has not done it.",
      },
      {
        question: "What happens when the founder stops selling?",
        answer:
          "Founder-led sales with founder-led delivery is a business with a hard ceiling. A reader wants to know which one gets handed over first.",
      },
    ],
    risks: [
      {
        title: "Client concentration",
        detail: "Two clients at sixty per cent of revenue is the normal state of a young consultancy and the normal reason one fails.",
      },
      {
        title: "Utilisation and pipeline out of phase",
        detail: "Fully utilised consultants are not selling, so the pipeline empties three months before the revenue does.",
      },
    ],
    regulatory: [
      "Professional liability insurance, frequently a contractual requirement",
      "Contractor classification rules where associates are used rather than employees",
      "Data processing terms where client data is handled",
    ],
    typicalPurpose: "internal",
    build: () => ({
      company: company("Consulting", "professional-services"),
      revenueStreams: [
        {
          id: "billable", name: "Billable engagements", kind: "hourly-services", startMonth: 1,
          // Head growth is deliberately slow and matches the consultant cohorts
          // in roles below. Compounding the billable base faster than the payroll
          // is the classic services-plan contradiction: revenue from twenty-three
          // consultants, salaries for three.
          billableHeadcount: 3, hoursPerHeadPerMonth: 160, utilisation: 0.68,
          hourlyRate: 185,
          // Eight consultants is the most this partnership intends to carry;
          // the cohort below is staffed from this line, so the plan cannot
          // bill for a consultant it does not pay.
          growth: { shape: "linear", perMonth: 0.072, max: 8 },
          cogsPercent: 0,
        },
      ],
      roles: [
        { id: "own", title: "Founding partner", annualSalary: 130_000, isOwner: true, startMonth: 1 },
        { id: "cons", title: "Consultants", annualSalary: 105_000, count: 3, startMonth: 1, isDirectLabour: true },
        { id: "cons2", title: "Consultant, fourth seat", annualSalary: 105_000, startMonth: 13, isDirectLabour: true },
        { id: "cons3", title: "Consultant, fifth seat", annualSalary: 105_000, startMonth: 25, isDirectLabour: true },
        { id: "cons4", title: "Consultant, sixth seat", annualSalary: 105_000, startMonth: 37, isDirectLabour: true },
        { id: "cons5", title: "Consultant, seventh seat", annualSalary: 105_000, startMonth: 49, isDirectLabour: true },
        { id: "ops", title: "Operations", annualSalary: 62_000, startMonth: 7 },
      ],
      opex: [
        { id: "office", name: "Office", category: "rent", monthlyAmount: 2_400, annualGrowthRate: 0.03 },
        { id: "sw", name: "Software and tooling", category: "software", monthlyAmount: 1_100, annualGrowthRate: 0.05 },
        { id: "trav", name: "Travel", category: "other", percentOfRevenue: 0.04 },
        { id: "mkt", name: "Business development", category: "marketing", percentOfRevenue: 0.05 },
        { id: "ga", name: "Recruiting, training and professional fees", category: "other", percentOfRevenue: 0.06 },
      ],
      capex: [],
      loans: [],
      equityRounds: [{ id: "inj", name: "Founder capital", month: 1, amount: 60_000 }],
      workingCapital: { receivableDays: 45, payableDays: 21, inventoryDays: 0 },
      registry: estimated,
    }),
  },
];

/* -------------------------------------------------------------------------- */

export function getIndustryPage(slug: string): IndustryPage | undefined {
  return INDUSTRY_PAGES.find((page) => page.slug === slug);
}

/** The benchmark bands for a page, read from the engine's own table. */
export function benchmarkFor(page: IndustryPage): IndustryBenchmark {
  return getBenchmark(page.benchmarkKey);
}

/** Most searched first, which is also the order they were worth building in. */
export function industriesByDemand(): IndustryPage[] {
  return [...INDUSTRY_PAGES].sort((a, b) => b.demand.volume - a.demand.volume);
}

/** The index page's sections, most-searched first within each. */
export function industriesBySector(): {
  key: IndustrySector;
  heading: string;
  blurb: string;
  pages: IndustryPage[];
}[] {
  const ranked = industriesByDemand();
  return INDUSTRY_SECTORS.map((sector) => ({
    key: sector.key,
    heading: sector.heading,
    blurb: sector.blurb,
    pages: ranked.filter((page) => page.sector === sector.key),
  }));
}
