import { INDUSTRY_BENCHMARKS } from "@/lib/finance/benchmarks";
import type { RevenueStreamKind } from "@/lib/finance/types";

/* ==========================================================================
   The intake, defined as data.
   --------------------------------------------------------------------------
   Declarative rather than hand-built screens, because the wizard branches on
   business model and the branches must stay consistent with the engine's seven
   revenue builds. One list here, one renderer, no drift.
   ========================================================================== */

export type FieldKind = "text" | "textarea" | "number" | "currency" | "percent" | "select" | "month";

export type DriverField = {
  /** Flat key in form state. Mapped into Assumptions by buildAssumptions(). */
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  /** Numeric drivers carry a provenance tag that is printed in the plan. */
  provenance?: boolean;
};

export type IntakeStep = {
  key: string;
  title: string;
  lede: string;
  /** Returns the fields for this step given what has been answered so far. */
  fields: (state: Record<string, unknown>) => DriverField[];
};

export const REVENUE_MODELS: {
  kind: RevenueStreamKind;
  label: string;
  blurb: string;
  examples: string;
}[] = [
  { kind: "retail-footfall", label: "Walk-in trade", blurb: "People come to a location and buy.", examples: "Restaurant, cafe, shop, salon, gym" },
  { kind: "subscription", label: "Subscription", blurb: "Customers pay every month and some leave.", examples: "SaaS, membership, managed service" },
  { kind: "unit-sales", label: "Product sales", blurb: "You sell units at a price, each with a cost.", examples: "E-commerce, wholesale, manufacturing" },
  { kind: "hourly-services", label: "Billable time", blurb: "People bill hours at a rate.", examples: "Agency, consultancy, trades, clinic" },
  { kind: "contract", label: "Contracts and retainers", blurb: "Fixed-term agreements at a monthly value.", examples: "Managed services, maintenance, B2B retainers" },
  { kind: "marketplace", label: "Marketplace", blurb: "You take a cut of what flows through.", examples: "Platform, booking site, brokerage" },
  { kind: "advertising", label: "Advertising", blurb: "Impressions sold against a CPM.", examples: "Media, publishing, ad-supported app" },
];

export const PURPOSES = [
  { value: "investor", label: "Raising from investors", hint: "Angels, pre-seed or seed." },
  { value: "sba-loan", label: "A bank or SBA loan", hint: "Adds the underwriter ratios and a debt schedule." },
  { value: "immigration", label: "An immigration filing", hint: "E-2, L-1A or EB-5 document structure." },
  { value: "internal", label: "Running the business", hint: "For you and your team, not an outside reader." },
];

const industryOptions = INDUSTRY_BENCHMARKS.map((b) => ({ value: b.key, label: b.label }));

function revenueFieldsFor(kind: RevenueStreamKind): DriverField[] {
  switch (kind) {
    case "retail-footfall":
      return [
        { key: "rev.dailyTraffic", label: "People through the door per day", kind: "number", min: 0, step: 5, required: true, provenance: true, hint: "On a typical trading day once you are established." },
        { key: "rev.conversionRate", label: "Share who buy", kind: "percent", min: 0, max: 100, step: 1, required: true, provenance: true, hint: "For a shop this is under 100%. For a restaurant where everyone seated orders, it is 100%." },
        { key: "rev.averageTicket", label: "Average spend per transaction", kind: "currency", min: 0, step: 0.5, required: true, provenance: true },
        { key: "rev.openDaysPerMonth", label: "Trading days per month", kind: "number", min: 1, max: 31, step: 1, required: true, provenance: true },
        { key: "rev.monthlyGrowthRate", label: "Monthly growth once open", kind: "percent", min: -10, max: 30, step: 0.1, provenance: true, hint: "Compounding. 1% a month is roughly 13% a year." },
      ];
    case "subscription":
      return [
        { key: "rev.newCustomersMonth1", label: "New customers in month one", kind: "number", min: 0, step: 1, required: true, provenance: true },
        { key: "rev.newCustomerGrowthRate", label: "Monthly growth in new customers", kind: "percent", min: -20, max: 50, step: 0.5, provenance: true },
        { key: "rev.pricePerCustomerPerMonth", label: "Price per customer per month", kind: "currency", min: 0, step: 1, required: true, provenance: true },
        { key: "rev.monthlyChurnRate", label: "Monthly churn", kind: "percent", min: 0, max: 50, step: 0.1, required: true, provenance: true, hint: "Share of customers who leave each month. 2% a month is roughly 22% a year." },
        { key: "rev.initialCustomers", label: "Customers you already have", kind: "number", min: 0, step: 1, provenance: true },
      ];
    case "unit-sales":
      return [
        { key: "rev.unitsMonth1", label: "Units sold in month one", kind: "number", min: 0, step: 1, required: true, provenance: true },
        { key: "rev.monthlyGrowthRate", label: "Monthly growth in units", kind: "percent", min: -20, max: 50, step: 0.5, provenance: true },
        { key: "rev.pricePerUnit", label: "Price per unit", kind: "currency", min: 0, step: 0.5, required: true, provenance: true },
        { key: "rev.costPerUnit", label: "Cost per unit", kind: "currency", min: 0, step: 0.5, required: true, provenance: true, hint: "What one unit costs you to make or buy, landed." },
      ];
    case "hourly-services":
      return [
        { key: "rev.billableHeadcount", label: "People who bill time", kind: "number", min: 0, step: 1, required: true, provenance: true },
        { key: "rev.hourlyRate", label: "Blended hourly rate", kind: "currency", min: 0, step: 5, required: true, provenance: true },
        { key: "rev.utilisation", label: "Utilisation", kind: "percent", min: 0, max: 100, step: 1, required: true, provenance: true, hint: "Share of working hours that are billable. Above 80% is rarely sustainable." },
        { key: "rev.hoursPerHeadPerMonth", label: "Working hours per person per month", kind: "number", min: 0, max: 300, step: 5, provenance: true },
        { key: "rev.headcountGrowthPerMonth", label: "Billable people added per month", kind: "number", min: 0, max: 20, step: 0.1, provenance: true },
      ];
    case "contract":
      return [
        { key: "rev.initialContracts", label: "Contracts already signed", kind: "number", min: 0, step: 1, provenance: true },
        { key: "rev.newContractsPerMonth", label: "New contracts won per month", kind: "number", min: 0, step: 0.5, required: true, provenance: true },
        { key: "rev.monthlyValuePerContract", label: "Monthly value per contract", kind: "currency", min: 0, step: 50, required: true, provenance: true },
        { key: "rev.termMonths", label: "Contract term in months", kind: "number", min: 1, max: 120, step: 1, required: true, provenance: true },
      ];
    case "marketplace":
      return [
        { key: "rev.gmvMonth1", label: "Value flowing through in month one", kind: "currency", min: 0, step: 1000, required: true, provenance: true, hint: "Gross merchandise value — the total transacted, not your cut." },
        { key: "rev.monthlyGrowthRate", label: "Monthly growth", kind: "percent", min: -20, max: 50, step: 0.5, provenance: true },
        { key: "rev.takeRate", label: "Your take rate", kind: "percent", min: 0, max: 100, step: 0.5, required: true, provenance: true },
      ];
    case "advertising":
      return [
        { key: "rev.impressionsMonth1", label: "Impressions in month one", kind: "number", min: 0, step: 1000, required: true, provenance: true },
        { key: "rev.monthlyGrowthRate", label: "Monthly growth in impressions", kind: "percent", min: -20, max: 50, step: 0.5, provenance: true },
        { key: "rev.fillRate", label: "Fill rate", kind: "percent", min: 0, max: 100, step: 1, provenance: true, hint: "Share of inventory actually sold." },
        { key: "rev.cpm", label: "CPM", kind: "currency", min: 0, step: 0.5, required: true, provenance: true, hint: "Revenue per thousand impressions sold." },
      ];
  }
}

export const INTAKE_STEPS: IntakeStep[] = [
  {
    key: "business",
    title: "The business",
    lede: "Start with what it is and who is going to read the plan. The reader changes what the document has to prove.",
    fields: () => [
      { key: "company.name", label: "Business name", kind: "text", required: true, placeholder: "Rowan & Fig" },
      { key: "company.industryKey", label: "Industry", kind: "select", required: true, options: industryOptions, hint: "Sets the benchmark bands we check your assumptions against." },
      { key: "company.purpose", label: "Who is this plan for?", kind: "select", required: true, options: PURPOSES.map((p) => ({ value: p.value, label: p.label })) },
      { key: "company.startDate", label: "When does the plan start?", kind: "month", required: true, hint: "The first month of the model — including any build-out before you trade." },
      { key: "company.firstTradingMonth", label: "Month you start trading", kind: "number", min: 1, max: 24, step: 1, required: true, hint: "Month 1 if you are already open. Month 4 if you have three months of fit-out first." },
      { key: "context.description", label: "What does the business do?", kind: "textarea", required: true, placeholder: "A 40-cover neighbourhood restaurant serving a short seasonal menu…", hint: "Two or three sentences. This anchors the written sections." },
    ],
  },
  {
    key: "model",
    title: "How you make money",
    lede: "Pick the model that fits best. Each one asks for different drivers, because a restaurant and a software company have nothing in common financially.",
    fields: () => [
      { key: "rev.kind", label: "Revenue model", kind: "select", required: true, options: REVENUE_MODELS.map((m) => ({ value: m.kind, label: m.label })) },
    ],
  },
  {
    key: "revenue",
    title: "Revenue drivers",
    lede: "These build your revenue line. A reader can argue with a driver; nobody can argue with a growth percentage, which is why we do not use one.",
    fields: (state) => revenueFieldsFor((state["rev.kind"] as RevenueStreamKind) ?? "retail-footfall"),
  },
  {
    key: "costs",
    title: "Costs",
    lede: "Direct costs move with sales. Operating costs mostly do not.",
    fields: () => [
      { key: "costs.cogsPercent", label: "Direct cost as a share of revenue", kind: "percent", min: 0, max: 100, step: 1, required: true, provenance: true, hint: "Food and drink for a restaurant, hosting and support for software. Leave at zero if you entered a cost per unit already." },
      { key: "costs.rent", label: "Rent or premises per month", kind: "currency", min: 0, step: 100, provenance: true },
      { key: "costs.utilities", label: "Utilities per month", kind: "currency", min: 0, step: 50, provenance: true },
      { key: "costs.software", label: "Software and subscriptions per month", kind: "currency", min: 0, step: 50, provenance: true },
      { key: "costs.insurance", label: "Insurance per month", kind: "currency", min: 0, step: 50, provenance: true },
      { key: "costs.marketingPercent", label: "Marketing as a share of revenue", kind: "percent", min: 0, max: 50, step: 0.5, provenance: true },
      { key: "costs.other", label: "Everything else per month", kind: "currency", min: 0, step: 100, provenance: true },
    ],
  },
  {
    key: "team",
    title: "You and the team",
    lede: "Owner pay is not optional here. A plan showing the owner taking nothing fails on first review — an underwriter substitutes a market salary and recomputes, and the visa marginality test is assessed on exactly this line.",
    fields: () => [
      { key: "team.ownerSalary", label: "Your annual compensation", kind: "currency", min: 1, step: 1000, required: true, provenance: true, hint: "What the business pays you. Use a market rate even if you intend to defer it." },
      { key: "team.householdSize", label: "People in your household", kind: "number", min: 1, max: 12, step: 1, required: true, hint: "Used only for immigration plans, where marginality is assessed against the family." },
      { key: "team.staffCount", label: "Other staff at the start", kind: "number", min: 0, step: 1, provenance: true },
      { key: "team.staffAverageSalary", label: "Average salary of those staff", kind: "currency", min: 0, step: 1000, provenance: true },
      { key: "team.staffAreDirect", label: "Are those staff part of delivery?", kind: "select", options: [ { value: "yes", label: "Yes — they make or serve the product" }, { value: "no", label: "No — they are overhead" } ], hint: "Delivery staff sit in direct costs and change your gross margin." },
    ],
  },
  {
    key: "funding",
    title: "Money in",
    lede: "What you are putting in, what you are borrowing, and what you are spending up front.",
    fields: () => [
      { key: "funding.ownerInjection", label: "Your own money in", kind: "currency", min: 0, step: 1000, provenance: true },
      { key: "funding.equityRaise", label: "Outside equity raised", kind: "currency", min: 0, step: 1000, provenance: true },
      { key: "funding.loanAmount", label: "Loan amount", kind: "currency", min: 0, step: 1000, provenance: true },
      { key: "funding.loanRate", label: "Loan interest rate", kind: "percent", min: 0, max: 40, step: 0.1, provenance: true },
      { key: "funding.loanTermMonths", label: "Loan term in months", kind: "number", min: 0, max: 360, step: 12, provenance: true },
      { key: "funding.loanInterestOnlyMonths", label: "Interest-only period in months", kind: "number", min: 0, max: 36, step: 1, provenance: true },
      { key: "funding.capexAmount", label: "Up-front equipment and fit-out", kind: "currency", min: 0, step: 1000, provenance: true },
      { key: "funding.capexLifeYears", label: "Useful life of that spend, in years", kind: "number", min: 1, max: 40, step: 1, provenance: true },
      { key: "funding.enterpriseCost", label: "Total cost to establish the business", kind: "currency", min: 0, step: 1000, provenance: true, hint: "Needed for immigration plans: the substantial-investment test is proportional, so a figure without this denominator cannot demonstrate it." },
    ],
  },
  {
    key: "working-capital",
    title: "Timing and tax",
    lede: "When money actually arrives and leaves. This is what separates a profitable plan from one that runs out of cash.",
    fields: () => [
      { key: "wc.receivableDays", label: "Days customers take to pay", kind: "number", min: 0, max: 180, step: 1, provenance: true, hint: "Zero if you are paid at the point of sale." },
      { key: "wc.payableDays", label: "Days you take to pay suppliers", kind: "number", min: 0, max: 180, step: 1, provenance: true },
      { key: "wc.inventoryDays", label: "Days of stock held", kind: "number", min: 0, max: 180, step: 1, provenance: true, hint: "Zero if you hold none." },
      { key: "tax.corporateRate", label: "Tax rate on profit", kind: "percent", min: 0, max: 60, step: 0.5, provenance: true },
    ],
  },
];

export const TOTAL_STEPS = INTAKE_STEPS.length + 1; // + review
