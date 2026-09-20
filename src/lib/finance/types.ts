import { z } from "zod";
import { GrowthCurveSchema, MONTHLY_RATE_CEILING } from "./growth";

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

/**
 * The legacy per-month growth rate, now bounded.
 *
 * These four fields are what the curve replaces. Until they are removed they
 * carry the same ceiling the curve does, because the schema is the only place
 * a 50%-a-month plan can be stopped before it reaches a statement.
 */
const legacyMonthlyRate = z.number().min(-0.5).max(MONTHLY_RATE_CEILING).default(0);

const streamBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  /** 1-based month of the model horizon in which this stream first bills. */
  startMonth: z.number().int().min(1).default(1),
  /**
   * How this stream's volume moves — see `src/lib/finance/growth.ts`.
   *
   * Optional only while the legacy rate fields below still exist. A stream
   * without one falls back to `{ shape: "unbounded" }` built from that rate,
   * which is byte-identical arithmetic, so introducing the curve moves no
   * existing number. `growth-declared-unbounded` is what makes that fallback
   * unusable in a finished plan.
   */
  growth: GrowthCurveSchema.optional(),
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
    newCustomerGrowthRate: legacyMonthlyRate,
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
    monthlyGrowthRate: legacyMonthlyRate,
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
    headcountGrowthPerMonth: z.number().min(0).max(5).default(0),
  }),

  /** Traffic × conversion × ticket × open days — restaurants and retail. */
  z.object({
    ...streamBase,
    kind: z.literal("retail-footfall"),
    dailyTraffic: z.number().min(0),
    conversionRate: z.number().min(0).max(1),
    averageTicket: z.number().min(0),
    openDaysPerMonth: z.number().min(0).max(31).default(26),
    monthlyGrowthRate: legacyMonthlyRate,
  }),

  /** GMV × take rate — marketplaces and platforms. */
  z.object({
    ...streamBase,
    kind: z.literal("marketplace"),
    gmvMonth1: z.number().min(0),
    monthlyGrowthRate: legacyMonthlyRate,
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
    monthlyGrowthRate: legacyMonthlyRate,
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

/**
 * Headcount derived from how much work there is, rather than stated once and
 * held flat for five years.
 *
 * The reported plan grew revenue to $4.3 trillion while salaries stayed at
 * $11,965 in every month of every year, because `count` is a constant and
 * nothing related it to volume. Worse, `hourly-services` already grew its
 * *billable* heads to produce revenue and charged nothing for them — the two
 * sides of the same person were modelled independently.
 */
export const StaffingSchema = z.object({
  /** What the work is measured in. */
  driver: z.enum(["revenue", "stream-volume", "billable-heads"]),
  /** Which stream, for the two drivers that are not company-wide. */
  streamId: z.string().min(1).optional(),
  /** Revenue or volume one person can carry in a month. */
  perHead: z.number().positive(),
  /** Heads carried whatever the volume — the floor, not the forecast. */
  minCount: z.number().min(0).default(0),
  /** The most this business would ever hire into this role. */
  maxCount: z.number().positive().optional(),
  /** Whole people, or halves for part-time. */
  stepSize: z.number().positive().default(1),
  /** Months between the work arriving and the hire landing. */
  hireLagMonths: z.number().int().min(0).max(12).default(0),
  /**
   * Headcount never falls once reached. On by default: without it a seasonal
   * business hires and fires the same person every November, which no plan
   * means and no lender believes.
   */
  ratchet: z.boolean().default(true),
});
export type Staffing = z.infer<typeof StaffingSchema>;

export const RoleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  department: z.string().default("General"),
  count: z.number().int().min(1).default(1),
  annualSalary: z.number().min(0),
  /** Compounded from this role's own start month, so its first twelve months
   *  sit at the quoted salary — which is what an offer letter says. Falls back
   *  to the company-wide figure when absent. */
  annualRaiseRate: z.number().min(-0.2).max(0.2).optional(),
  /** Present when this role's size follows the work. Absent means a fixed
   *  `count`, which is what every role did before. */
  staffing: StaffingSchema.optional(),
  startMonth: z.number().int().min(1).default(1),
  endMonth: z.number().int().min(1).optional(),
  /** Owner compensation must be present and non-zero: underwriters substitute a
   *  market salary when a plan shows none, and the E-2 marginality test is
   *  assessed on the owner's income. Validated in validate.ts. */
  isOwner: z.boolean().default(false),
  /** Direct labour flows to COGS rather than operating expenses. */
  isDirectLabour: z.boolean().default(false),
})
  .refine((role) => !(role.isOwner && role.staffing), {
    message: "An owner is one person — owner compensation cannot scale with volume.",
    path: ["staffing"],
  })
  .refine((role) => !role.staffing || role.staffing.driver === "revenue" || !!role.staffing.streamId, {
    message: "Staffing driven by a stream must name which stream.",
    path: ["staffing", "streamId"],
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
      /** Company-wide annual raise, for roles that do not state their own.
       *  Defaults to zero so introducing it moves no existing number; a plan
       *  that leaves it there is telling its reader nobody gets a raise for
       *  five years, which `payroll-flat` says out loud. */
      annualSalaryInflation: z.number().min(0).max(0.15).default(0),
    })
    .default({ payrollTaxRate: 0.0765, benefitsRate: 0.12, annualSalaryInflation: 0 }),

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
