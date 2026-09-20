import type {
  AssumptionsInput,
  AssumptionRegistry,
  Provenance,
  RevenueStreamKind,
} from "@/lib/finance/types";

/* ==========================================================================
   Flat intake answers -> the engine's Assumptions object.
   --------------------------------------------------------------------------
   The wizard keeps state flat and dotted ("rev.averageTicket") because that is
   far simpler to autosave and validate per field. This is the single place
   where that flat shape becomes the nested object the engine consumes, so the
   mapping is auditable rather than scattered through the UI.
   ========================================================================== */

export type IntakeState = Record<string, string | number>;
export type ProvenanceState = Record<string, Provenance>;

const num = (state: IntakeState, key: string, fallback = 0): number => {
  const raw = state[key];
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) ? value : fallback;
};
/** Percent fields are entered as 0–100 and stored as 0–1. */
const pct = (state: IntakeState, key: string, fallback = 0): number => num(state, key, fallback * 100) / 100;
const str = (state: IntakeState, key: string, fallback = ""): string => {
  const raw = state[key];
  return raw === undefined || raw === null || raw === "" ? fallback : String(raw);
};

export function buildAssumptions(
  state: IntakeState,
  provenance: ProvenanceState,
): AssumptionsInput {
  const kind = (str(state, "rev.kind", "retail-footfall") as RevenueStreamKind);
  const industryKey = str(state, "company.industryKey", "other");
  const startMonth = str(state, "company.startDate", "2026-01");
  const startDate = /^\d{4}-\d{2}$/.test(startMonth) ? `${startMonth}-01` : startMonth;
  const firstTradingMonth = Math.max(1, Math.round(num(state, "company.firstTradingMonth", 1)));

  const cogsPercent = pct(state, "costs.cogsPercent", 0);
  const staffCount = Math.max(0, Math.round(num(state, "team.staffCount", 0)));
  const staffAreDirect = str(state, "team.staffAreDirect", "yes") === "yes";

  const revenueStream = buildStream(kind, state, firstTradingMonth, cogsPercent);
  const annualRaise = pct(state, "team.annualRaise", 0);

  const roles: NonNullable<AssumptionsInput["roles"]> = [
    {
      id: "owner",
      title: "Owner",
      annualSalary: num(state, "team.ownerSalary", 0),
      isOwner: true,
      startMonth: 1,
      ...(annualRaise > 0 ? { annualRaiseRate: annualRaise } : {}),
    },
  ];
  /* Staff that grow with the work, when the owner says the business needs
     them to. The flat alternative is what produced the reported plan: $4.3
     trillion of revenue against $11,965 of salary, unchanged for five years,
     because headcount was a constant nobody related to volume.

     The condition below used to be `staffCount > 0` alone, and that was wrong
     in the most common case there is. `team.staffCount` is how many people
     exist on *day one*; it is optional and defaults to zero. So a business
     that starts alone and hires as it grows — which is what "more customers
     means more staff" describes — had its whole payroll discarded, along with
     the two answers it had just given about how many people it would need.
     One user drove it to $2.55M of year-five revenue on a single owner. */
  const scales = str(state, "team.staffScaleWithVolume", "no") === "yes";
  const perHead = num(state, "team.volumePerStaffMember", 0);
  const maxStaff = num(state, "team.maxStaffCount", 0);
  const willHire = scales && perHead > 0;

  if (staffCount > 0 || willHire) {
    roles.push({
      id: "staff",
      title: staffAreDirect ? "Delivery staff" : "Support staff",
      // A schema placeholder when the business starts with nobody: RoleSchema
      // requires at least one. It changes no arithmetic — the engine ignores
      // `count` entirely for a role that carries a staffing rule, and
      // `minCount` below is the real floor.
      count: Math.max(1, staffCount),
      annualSalary: num(state, "team.staffAverageSalary", 0),
      startMonth: firstTradingMonth,
      isDirectLabour: staffAreDirect,
      ...(willHire
        ? {
            staffing: {
              driver: "stream-volume" as const,
              streamId: "primary",
              perHead,
              // Never fewer than the team they said they are starting with,
              // which is legitimately nobody until the work arrives.
              minCount: staffCount,
              ...(maxStaff > 0 ? { maxCount: Math.max(maxStaff, staffCount) } : {}),
            },
          }
        : {}),
    });
  }

  const opex: NonNullable<AssumptionsInput["opex"]> = [];
  const addOpex = (id: string, name: string, category: string, key: string) => {
    const amount = num(state, key, 0);
    if (amount > 0) {
      opex.push({
        id, name,
        category: category as never,
        monthlyAmount: amount,
        annualGrowthRate: 0.03,
        startMonth: 1,
      });
    }
  };
  addOpex("rent", "Premises", "rent", "costs.rent");
  addOpex("utilities", "Utilities", "utilities", "costs.utilities");
  addOpex("software", "Software", "software", "costs.software");
  addOpex("insurance", "Insurance", "insurance", "costs.insurance");
  addOpex("other", "Other operating costs", "other", "costs.other");

  const marketingPercent = pct(state, "costs.marketingPercent", 0);
  if (marketingPercent > 0) {
    opex.push({
      id: "marketing", name: "Marketing", category: "marketing",
      percentOfRevenue: marketingPercent, startMonth: firstTradingMonth,
    });
  }

  const capexAmount = num(state, "funding.capexAmount", 0);
  const loanAmount = num(state, "funding.loanAmount", 0);
  const ownerInjection = num(state, "funding.ownerInjection", 0);
  const equityRaise = num(state, "funding.equityRaise", 0);
  const enterpriseCost = num(state, "funding.enterpriseCost", 0);

  return {
    company: {
      name: str(state, "company.name", "Untitled business"),
      startDate,
      horizonMonths: 60,
      currency: "USD",
      fiscalYearStartMonth: 1,
      industryKey,
      firstTradingMonth,
      householdSize: Math.max(1, Math.round(num(state, "team.householdSize", 1))),
    },
    revenueStreams: [revenueStream],
    roles,
    opex,
    capex: capexAmount > 0
      ? [{
          id: "capex", name: "Equipment and fit-out", month: 1,
          amount: capexAmount,
          usefulLifeYears: Math.max(1, num(state, "funding.capexLifeYears", 7)),
          method: "straight-line",
        }]
      : [],
    loans: loanAmount > 0
      ? [{
          id: "loan", name: "Term loan", month: 1, principal: loanAmount,
          annualRate: pct(state, "funding.loanRate", 0.11),
          termMonths: Math.max(1, Math.round(num(state, "funding.loanTermMonths", 120))),
          interestOnlyMonths: Math.max(0, Math.round(num(state, "funding.loanInterestOnlyMonths", 0))),
        }]
      : [],
    equityRounds: [
      ...(ownerInjection > 0 ? [{ id: "owner-injection", name: "Owner injection", month: 1, amount: ownerInjection }] : []),
      ...(equityRaise > 0 ? [{ id: "equity", name: "Equity raise", month: 1, amount: equityRaise }] : []),
    ],
    workingCapital: {
      receivableDays: num(state, "wc.receivableDays", 0),
      payableDays: num(state, "wc.payableDays", 30),
      inventoryDays: num(state, "wc.inventoryDays", 0),
    },
    tax: {
      corporateRate: pct(state, "tax.corporateRate", 0.21),
      lossCarryforward: true,
    },
    ...(enterpriseCost > 0 ? { enterpriseEstablishmentCost: enterpriseCost } : {}),
    registry: buildRegistry(provenance),
  };
}

function buildStream(
  kind: RevenueStreamKind,
  s: IntakeState,
  startMonth: number,
  cogsPercent: number,
): NonNullable<AssumptionsInput["revenueStreams"]>[number] {
  const base = { id: "primary", startMonth, cogsPercent };

  /* Every growing stream gets a ceiling.
     
     The curve is what stops a rate compounding for sixty months, and a stream
     that declares no bound is a blocking finding — so the fallback when the
     answer is missing is a ceiling derived from the starting level rather than
     no ceiling at all. A guessed ceiling that the validator can flag as never
     approached is recoverable; an unbounded model is the defect this whole
     layer exists to prevent. */
  const curve = (v0: number, key: string, fallbackMultiple: number) => {
    const stated = num(s, key, 0);
    return {
      shape: "saturating" as const,
      monthlyRate: pct(s, "rev.monthlyGrowthRate", 0),
      ceiling: stated > 0 ? stated : Math.max(v0 * fallbackMultiple, 1),
      // Price inflation on the capacity itself. Small on purpose: this is the
      // one term that still runs past the horizon.
      terminalAnnualRate: 0.02,
    };
  };

  switch (kind) {
    case "retail-footfall":
      return {
        ...base, kind, name: "Sales",
        dailyTraffic: num(s, "rev.dailyTraffic"),
        conversionRate: pct(s, "rev.conversionRate", 1),
        averageTicket: num(s, "rev.averageTicket"),
        openDaysPerMonth: num(s, "rev.openDaysPerMonth", 26),
        growth: curve(
          num(s, "rev.dailyTraffic") * pct(s, "rev.conversionRate", 1) * num(s, "rev.openDaysPerMonth", 26),
          "rev.capacityPerMonth",
          1.5,
        ),
      };
    case "subscription":
      return {
        ...base, kind, name: "Subscriptions",
        initialCustomers: num(s, "rev.initialCustomers", 0),
        newCustomersMonth1: num(s, "rev.newCustomersMonth1"),
        growth: {
          shape: "saturating" as const,
          monthlyRate: pct(s, "rev.newCustomerGrowthRate", 0),
          ceiling: Math.max(
            num(s, "rev.acquisitionCeiling", 0) || num(s, "rev.newCustomersMonth1") * 3,
            1,
          ),
          terminalAnnualRate: 0.02,
        },
        // The stock ceiling, which is what a subscription author thinks in.
        customerCeiling: Math.max(
          num(s, "rev.customerCeiling", 0) || num(s, "rev.newCustomersMonth1") * 60,
          1,
        ),
        monthlyChurnRate: pct(s, "rev.monthlyChurnRate", 0),
        pricePerCustomerPerMonth: num(s, "rev.pricePerCustomerPerMonth"),
      };
    case "unit-sales":
      return {
        ...base, kind, name: "Product sales",
        unitsMonth1: num(s, "rev.unitsMonth1"),
        growth: curve(num(s, "rev.unitsMonth1"), "rev.capacityPerMonth", 1.5),
        pricePerUnit: num(s, "rev.pricePerUnit"),
        costPerUnit: num(s, "rev.costPerUnit", 0),
        // An explicit unit cost supersedes the percentage.
        cogsPercent: num(s, "rev.costPerUnit", 0) > 0 ? 0 : cogsPercent,
      };
    case "hourly-services":
      return {
        ...base, kind, name: "Client work",
        billableHeadcount: num(s, "rev.billableHeadcount"),
        hoursPerHeadPerMonth: num(s, "rev.hoursPerHeadPerMonth", 160),
        utilisation: pct(s, "rev.utilisation", 0.7),
        hourlyRate: num(s, "rev.hourlyRate"),
        growth: {
          shape: "linear" as const,
          perMonth: num(s, "rev.headcountGrowthPerMonth", 0),
          // Capped at the size the practice says it will reach, so the plan
          // cannot bill for a consultant it never hires.
          max: Math.max(
            num(s, "rev.capacityHeadcount", 0) || num(s, "rev.billableHeadcount") * 2,
            num(s, "rev.billableHeadcount"),
            1,
          ),
        },
      };
    case "contract":
      return {
        ...base, kind, name: "Contracts",
        initialContracts: num(s, "rev.initialContracts", 0),
        newContractsPerMonth: num(s, "rev.newContractsPerMonth"),
        monthlyValuePerContract: num(s, "rev.monthlyValuePerContract"),
        termMonths: Math.max(1, Math.round(num(s, "rev.termMonths", 12))),
        // A contract book plateaus on its own: wins age out after the term, so
        // it needs no ceiling and declaring one would be inventing a limit.
        growth: { shape: "flat" as const },
      };
    case "marketplace":
      return {
        ...base, kind, name: "Marketplace",
        gmvMonth1: num(s, "rev.gmvMonth1"),
        growth: curve(num(s, "rev.gmvMonth1"), "rev.capacityPerMonth", 2),
        takeRate: pct(s, "rev.takeRate", 0),
      };
    case "advertising":
      return {
        ...base, kind, name: "Advertising",
        impressionsMonth1: num(s, "rev.impressionsMonth1"),
        growth: curve(num(s, "rev.impressionsMonth1"), "rev.capacityPerMonth", 2),
        fillRate: pct(s, "rev.fillRate", 0.7),
        cpm: num(s, "rev.cpm"),
      };
  }
}

/** Intake keys -> assumption paths, so provenance survives the mapping. */
const PATH_BY_KEY: Record<string, string> = {
  "rev.dailyTraffic": "revenueStreams.0.dailyTraffic",
  "rev.conversionRate": "revenueStreams.0.conversionRate",
  "rev.averageTicket": "revenueStreams.0.averageTicket",
  "rev.openDaysPerMonth": "revenueStreams.0.openDaysPerMonth",
  "rev.monthlyGrowthRate": "revenueStreams.0.growth.monthlyRate",
  "rev.capacityPerMonth": "revenueStreams.0.growth.ceiling",
  "rev.capacityHeadcount": "revenueStreams.0.growth.max",
  "rev.acquisitionCeiling": "revenueStreams.0.growth.ceiling",
  "rev.customerCeiling": "revenueStreams.0.customerCeiling",
  "team.annualRaise": "roles.owner.annualRaiseRate",
  "team.volumePerStaffMember": "roles.staff.staffing.perHead",
  "team.maxStaffCount": "roles.staff.staffing.maxCount",
  "rev.newCustomersMonth1": "revenueStreams.0.newCustomersMonth1",
  "rev.newCustomerGrowthRate": "revenueStreams.0.growth.monthlyRate",
  "rev.pricePerCustomerPerMonth": "revenueStreams.0.pricePerCustomerPerMonth",
  "rev.monthlyChurnRate": "revenueStreams.0.monthlyChurnRate",
  "rev.initialCustomers": "revenueStreams.0.initialCustomers",
  "rev.unitsMonth1": "revenueStreams.0.unitsMonth1",
  "rev.pricePerUnit": "revenueStreams.0.pricePerUnit",
  "rev.costPerUnit": "revenueStreams.0.costPerUnit",
  "rev.billableHeadcount": "revenueStreams.0.billableHeadcount",
  "rev.hourlyRate": "revenueStreams.0.hourlyRate",
  "rev.utilisation": "revenueStreams.0.utilisation",
  "rev.hoursPerHeadPerMonth": "revenueStreams.0.hoursPerHeadPerMonth",
  "rev.headcountGrowthPerMonth": "revenueStreams.0.growth.perMonth",
  "rev.initialContracts": "revenueStreams.0.initialContracts",
  "rev.newContractsPerMonth": "revenueStreams.0.newContractsPerMonth",
  "rev.monthlyValuePerContract": "revenueStreams.0.monthlyValuePerContract",
  "rev.termMonths": "revenueStreams.0.termMonths",
  "rev.gmvMonth1": "revenueStreams.0.gmvMonth1",
  "rev.takeRate": "revenueStreams.0.takeRate",
  "rev.impressionsMonth1": "revenueStreams.0.impressionsMonth1",
  "rev.fillRate": "revenueStreams.0.fillRate",
  "rev.cpm": "revenueStreams.0.cpm",
  "costs.cogsPercent": "revenueStreams.0.cogsPercent",
  "costs.rent": "opex.rent.monthlyAmount",
  "costs.utilities": "opex.utilities.monthlyAmount",
  "costs.software": "opex.software.monthlyAmount",
  "costs.insurance": "opex.insurance.monthlyAmount",
  "costs.marketingPercent": "opex.marketing.percentOfRevenue",
  "costs.other": "opex.other.monthlyAmount",
  "team.ownerSalary": "roles.owner.annualSalary",
  "team.staffCount": "roles.staff.count",
  "team.staffAverageSalary": "roles.staff.annualSalary",
  "funding.ownerInjection": "equityRounds.owner-injection.amount",
  "funding.equityRaise": "equityRounds.equity.amount",
  "funding.loanAmount": "loans.loan.principal",
  "funding.loanRate": "loans.loan.annualRate",
  "funding.loanTermMonths": "loans.loan.termMonths",
  "funding.loanInterestOnlyMonths": "loans.loan.interestOnlyMonths",
  "funding.capexAmount": "capex.capex.amount",
  "funding.capexLifeYears": "capex.capex.usefulLifeYears",
  "funding.enterpriseCost": "enterpriseEstablishmentCost",
  "wc.receivableDays": "workingCapital.receivableDays",
  "wc.payableDays": "workingCapital.payableDays",
  "wc.inventoryDays": "workingCapital.inventoryDays",
  "tax.corporateRate": "tax.corporateRate",
};

function buildRegistry(provenance: ProvenanceState): AssumptionRegistry {
  const registry: AssumptionRegistry = {};
  for (const [key, value] of Object.entries(provenance)) {
    const path = PATH_BY_KEY[key];
    if (path) registry[path] = { provenance: value };
  }
  return registry;
}
