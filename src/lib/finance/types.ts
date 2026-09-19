import { z } from "zod";

/* ==========================================================================
   Assumptions — the only user-supplied input to the model.
   --------------------------------------------------------------------------
   Everything the financial statements contain is DERIVED from this object by
   buildModel(). No number in a statement is ever written by a language model:
   the AI proposes assumptions, the engine computes, the AI then narrates what
   the engine produced.
   ========================================================================== */

/** Where a number came from. Rendered in the finished plan, because a plan that
 *  distinguishes "the owner told us this" from "we used the industry median" is
 *  more credible than one that flattens both into confident prose. */
export const ProvenanceSchema = z.enum(["known", "estimated", "benchmark_default"]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const SourceRefSchema = z.object({
  label: z.string().min(1),
  url: z.string().url().optional(),
  /** Publication or retrieval date, ISO yyyy-mm-dd. Undated sources are not citations. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  publisher: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/** Keyed by dotted path into Assumptions, e.g. "revenueStreams.0.pricePerMonth".
 *  Kept alongside the assumptions rather than wrapped around every number, so
 *  the engine stays readable and the register can be validated as a whole. */
export const AssumptionRegistrySchema = z.record(
  z.string(),
  z.object({
    provenance: ProvenanceSchema,
    source: SourceRefSchema.optional(),
    note: z.string().optional(),
  }),
);
export type AssumptionRegistry = z.infer<typeof AssumptionRegistrySchema>;

/* -------------------------------------------------------------------------- */
/* Revenue                                                                    */
/* -------------------------------------------------------------------------- */

const streamBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  /** 1-based month of the model horizon in which this stream first bills. */
  startMonth: z.number().int().min(1).default(1),
  /** Fraction of this stream's revenue consumed by direct costs, when the model
   *  has no explicit unit cost. 0.3 = 70% gross margin. */
  cogsPercent: z.number().min(0).max(1).default(0),
  /** Twelve multipliers indexed by calendar month, mean ~1. Flat when absent. */
  seasonality: z.array(z.number().min(0)).length(12).optional(),
};

export const RevenueStreamSchema = z.discriminatedUnion("kind", [
  /** Seats × price, with churn and expansion — SaaS and memberships. */
  z.object({
    ...streamBase,
    kind: z.literal("subscription"),
    initialCustomers: z.number().min(0).default(0),
    newCustomersMonth1: z.number().min(0),
    newCustomerGrowthRate: z.number().min(-1).default(0),
    monthlyChurnRate: z.number().min(0).max(1),
    pricePerCustomerPerMonth: z.number().min(0),
    /** Net revenue expansion on the retained base, per month. */
    expansionRate: z.number().min(0).default(0),
    /** Months of service billed up front. Drives deferred revenue. */
    prepaidMonths: z.number().int().min(0).default(0),
  }),

  /** Units × price with an explicit unit cost — product and ecommerce. */
  z.object({
    ...streamBase,
    kind: z.literal("unit-sales"),
    unitsMonth1: z.number().min(0),
    monthlyGrowthRate: z.number().min(-1).default(0),
    pricePerUnit: z.number().min(0),
    costPerUnit: z.number().min(0).default(0),
  }),

  /** Billable hours × rate × utilisation — agencies and professional services. */
  z.object({
    ...streamBase,
    kind: z.literal("hourly-services"),
    billableHeadcount: z.number().min(0),
    hoursPerHeadPerMonth: z.number().min(0).default(160),
    utilisation: z.number().min(0).max(1).default(0.7),
    hourlyRate: z.number().min(0),
    headcountGrowthPerMonth: z.number().min(0).default(0),
  }),

  /** Traffic × conversion × ticket × open days — restaurants and retail. */
  z.object({
    ...streamBase,
    kind: z.literal("retail-footfall"),
    dailyTraffic: z.number().min(0),
    conversionRate: z.number().min(0).max(1),
    averageTicket: z.number().min(0),
    openDaysPerMonth: z.number().min(0).max(31).default(26),
    monthlyGrowthRate: z.number().min(-1).default(0),
  }),

  /** GMV × take rate — marketplaces and platforms. */
  z.object({
    ...streamBase,
    kind: z.literal("marketplace"),
    gmvMonth1: z.number().min(0),
    monthlyGrowthRate: z.number().min(-1).default(0),
    takeRate: z.number().min(0).max(1),
  }),

  /** Recurring contracts of a fixed term — retainers and managed services. */
  z.object({
    ...streamBase,
    kind: z.literal("contract"),
    initialContracts: z.number().min(0).default(0),
    newContractsPerMonth: z.number().min(0),
    monthlyValuePerContract: z.number().min(0),
    termMonths: z.number().int().min(1).default(12),
  }),

  /** Impressions × fill × CPM — ad-supported media. */
  z.object({
    ...streamBase,
    kind: z.literal("advertising"),
    impressionsMonth1: z.number().min(0),
    monthlyGrowthRate: z.number().min(-1).default(0),
    fillRate: z.number().min(0).max(1).default(0.7),
    cpm: z.number().min(0),
  }),
]);
export type RevenueStream = z.infer<typeof RevenueStreamSchema>;
export type RevenueStreamKind = RevenueStream["kind"];

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

export const OpexCategorySchema = z.enum([
  "salaries",
  "marketing",
  "rent",
  "software",
  "professional-services",
  "insurance",
  "utilities",
  "travel",
  "equipment",
  "other",
]);
export type OpexCategory = z.infer<typeof OpexCategorySchema>;

export const RoleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  department: z.string().default("General"),
  count: z.number().int().min(1).default(1),
  annualSalary: z.number().min(0),
  startMonth: z.number().int().min(1).default(1),
  endMonth: z.number().int().min(1).optional(),
  /** Owner compensation must be present and non-zero: underwriters substitute a
   *  market salary when a plan shows none, and the E-2 marginality test is
   *  assessed on the owner's income. Validated in validate.ts. */
  isOwner: z.boolean().default(false),
  /** Direct labour flows to COGS rather than operating expenses. */
  isDirectLabour: z.boolean().default(false),
});
export type Role = z.infer<typeof RoleSchema>;

export const OpexItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: OpexCategorySchema.default("other"),
  monthlyAmount: z.number().min(0).default(0),
  /** Set instead of monthlyAmount for costs that scale with revenue. */
  percentOfRevenue: z.number().min(0).max(1).optional(),
  startMonth: z.number().int().min(1).default(1),
  endMonth: z.number().int().min(1).optional(),
  annualGrowthRate: z.number().min(-1).default(0),
});
export type OpexItem = z.infer<typeof OpexItemSchema>;

export const CapexItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  month: z.number().int().min(1),
  amount: z.number().min(0),
  usefulLifeYears: z.number().min(0.5).default(5),
  method: z.enum(["straight-line", "declining-balance"]).default("straight-line"),
  salvageValue: z.number().min(0).default(0),
});
export type CapexItem = z.infer<typeof CapexItemSchema>;

/* -------------------------------------------------------------------------- */
/* Funding                                                                    */
/* -------------------------------------------------------------------------- */

export const LoanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  month: z.number().int().min(1),
  principal: z.number().min(0),
  annualRate: z.number().min(0).max(1),
  termMonths: z.number().int().min(1),
  interestOnlyMonths: z.number().int().min(0).default(0),
  balloonPayment: z.number().min(0).default(0),
});
export type Loan = z.infer<typeof LoanSchema>;

export const EquityRoundSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  month: z.number().int().min(1),
  amount: z.number().min(0),
  preMoneyValuation: z.number().min(0).optional(),
});
export type EquityRound = z.infer<typeof EquityRoundSchema>;

export const GrantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  month: z.number().int().min(1),
  amount: z.number().min(0),
});
export type Grant = z.infer<typeof GrantSchema>;

/* -------------------------------------------------------------------------- */
/* Company-level                                                              */
/* -------------------------------------------------------------------------- */

export const OpeningBalancesSchema = z.object({
  cash: z.number().default(0),
  accountsReceivable: z.number().min(0).default(0),
  inventory: z.number().min(0).default(0),
  grossPPE: z.number().min(0).default(0),
  accumulatedDepreciation: z.number().min(0).default(0),
  accountsPayable: z.number().min(0).default(0),
  deferredRevenue: z.number().min(0).default(0),
  debt: z.number().min(0).default(0),
  paidInCapital: z.number().min(0).default(0),
  retainedEarnings: z.number().default(0),
});
export type OpeningBalances = z.infer<typeof OpeningBalancesSchema>;

export const AssumptionsSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    /** First month of the model. For a pre-launch business this is the buildout
     *  month, not the month trading begins — see `firstTradingMonth`. */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    horizonMonths: z.union([z.literal(36), z.literal(60)]).default(60),
    currency: z.string().length(3).default("USD"),
    /** 1 = January. Drives the annual rollups. */
    fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
    industryKey: z.string().min(1),
    /** The month normal business activity commences. The E-2 five-year
     *  marginality horizon runs from here, not from incorporation. */
    firstTradingMonth: z.number().int().min(1).default(1),
    /** Investor plus dependents. Marginality is assessed against the family,
     *  so this is required for immigration plans. */
    householdSize: z.number().int().min(1).default(1),
  }),

  revenueStreams: z.array(RevenueStreamSchema).default([]),
  roles: z.array(RoleSchema).default([]),
  opex: z.array(OpexItemSchema).default([]),
  capex: z.array(CapexItemSchema).default([]),
  loans: z.array(LoanSchema).default([]),
  equityRounds: z.array(EquityRoundSchema).default([]),
  grants: z.array(GrantSchema).default([]),

  payroll: z
    .object({
      /** Employer payroll taxes as a fraction of gross wages. */
      payrollTaxRate: z.number().min(0).max(1).default(0.0765),
      /** Benefits and other loaded costs as a fraction of gross wages. */
      benefitsRate: z.number().min(0).max(1).default(0.12),
    })
    .default({ payrollTaxRate: 0.0765, benefitsRate: 0.12 }),

  workingCapital: z
    .object({
      /** Days of revenue uncollected. 0 = cash on delivery. */
      receivableDays: z.number().min(0).max(365).default(0),
      /** Days of cost unpaid. */
      payableDays: z.number().min(0).max(365).default(30),
      /** Days of COGS held as stock. Ignored when the model has no inventory. */
      inventoryDays: z.number().min(0).max(365).default(0),
    })
    .default({ receivableDays: 0, payableDays: 30, inventoryDays: 0 }),

  tax: z
    .object({
      corporateRate: z.number().min(0).max(1).default(0.21),
      /** Carry losses forward against future taxable income. */
      lossCarryforward: z.boolean().default(true),
    })
    .default({ corporateRate: 0.21, lossCarryforward: true }),

  opening: OpeningBalancesSchema.default(() => OpeningBalancesSchema.parse({})),

  /** Unit economics inputs. Optional because not every business has a CAC. */
  unitEconomics: z
    .object({
      /** Blended cost to acquire one customer. */
      customerAcquisitionCost: z.number().min(0).optional(),
      /** Gross margin applied to lifetime value. Falls back to the modelled margin. */
      grossMarginOverride: z.number().min(0).max(1).optional(),
    })
    .optional(),

  /** Total cost of establishing the enterprise. The E-2 substantial-investment
   *  test is proportional, so a use-of-funds table without this denominator
   *  cannot demonstrate proportionality. */
  enterpriseEstablishmentCost: z.number().min(0).optional(),

  registry: AssumptionRegistrySchema.default({}),
});

export type Assumptions = z.infer<typeof AssumptionsSchema>;
/** Shape accepted by `AssumptionsSchema.parse` before defaults are applied. */
export type AssumptionsInput = z.input<typeof AssumptionsSchema>;
