import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { AssumptionsSchema, type AssumptionsInput } from "@/lib/finance/types";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { buildValidationContext } from "@/lib/review/context";
import { restaurantPlan, saasPlan } from "./fixtures";

const run = (plan: AssumptionsInput, ctx = {}) => {
  const model = buildModel(plan);
  return validateModel(model, computeMetrics(model), ctx);
};
const ids = (r: ReturnType<typeof run>) => r.findings.map((f) => f.id);

/** A complete, well-formed submission: nothing should block. */
const cleanContext = {
  purpose: "investor" as const,
  competitorCount: 4,
  competitorsHaveDatedEvidence: true,
  hasBottomUpMarketSizing: true,
  downsideScenarioDriverCount: 6,
  uncitedStatisticCount: 0,
  unreconciledFigureCount: 0,
};

describe("validateModel — blocking checks", () => {
  it("passes a well-formed plan with a complete submission context", () => {
    const result = run(saasPlan, cleanContext);
    expect(result.blockingCount, `unexpected blockers: ${ids(result).join(", ")}`).toBe(0);
    expect(result.canExport).toBe(true);
  });

  it("blocks when owner compensation is absent", () => {
    const plan: AssumptionsInput = {
      ...saasPlan,
      roles: saasPlan.roles!.filter((r) => !("isOwner" in r && r.isOwner)),
    };
    const result = run(plan, cleanContext);
    expect(ids(result)).toContain("owner-compensation-missing");
    expect(result.canExport).toBe(false);
  });

  it("blocks when the owner's salary is zero", () => {
    const plan: AssumptionsInput = {
      ...saasPlan,
      roles: [{ id: "ceo", title: "Founder", annualSalary: 0, isOwner: true, startMonth: 1 }],
    };
    expect(ids(run(plan, cleanContext))).toContain("owner-compensation-missing");
  });

  it("blocks when the plan runs out of cash", () => {
    const plan: AssumptionsInput = { ...saasPlan, equityRounds: [], loans: [] };
    const result = run(plan, cleanContext);
    expect(ids(result)).toContain("negative-cash");
    expect(result.canExport).toBe(false);
  });

  it("blocks when the assumptions register is empty", () => {
    const plan: AssumptionsInput = { ...saasPlan, registry: {} };
    expect(ids(run(plan, cleanContext))).toContain("empty-assumption-register");
  });

  it("blocks when a narrative figure does not reconcile to the model", () => {
    const result = run(saasPlan, { ...cleanContext, unreconciledFigureCount: 2 });
    expect(ids(result)).toContain("narrative-model-mismatch");
    expect(result.canExport).toBe(false);
  });

  it("blocks on uncited statistics", () => {
    expect(ids(run(saasPlan, { ...cleanContext, uncitedStatisticCount: 3 }))).toContain(
      "uncited-statistics",
    );
  });

  it("blocks when fewer than three competitors are named", () => {
    expect(ids(run(saasPlan, { ...cleanContext, competitorCount: 2 }))).toContain(
      "insufficient-competitor-evidence",
    );
  });

  it("blocks when competitor pricing evidence is undated", () => {
    expect(
      ids(run(saasPlan, { ...cleanContext, competitorsHaveDatedEvidence: false })),
    ).toContain("insufficient-competitor-evidence");
  });

  it("blocks a top-down-only market size", () => {
    expect(ids(run(saasPlan, { ...cleanContext, hasBottomUpMarketSizing: false }))).toContain(
      "no-bottom-up-sizing",
    );
  });

  it("blocks a downside scenario that moves too few drivers", () => {
    expect(ids(run(saasPlan, { ...cleanContext, downsideScenarioDriverCount: 2 }))).toContain(
      "no-coherent-downside",
    );
  });

  /* The test above passed the count in directly, so it never noticed that
     production always passed a compile-time 6 — the check was testable and
     dead at the same time. This one goes through the real context builder. */
  it("fires on a real plan with nothing for the downside to cut", () => {
    const bare = AssumptionsSchema.parse({
      ...saasPlan,
      revenueStreams: [
        { id: "u", name: "Units", kind: "unit-sales", unitsMonth1: 100, monthlyGrowthRate: 0,
          pricePerUnit: 50, costPerUnit: 20, growth: { shape: "saturating", monthlyRate: 0.01, ceiling: 400 } },
      ],
      roles: [],
      opex: [],
    });
    const model = buildModel(bare);
    const result = validateModel(
      model,
      computeMetrics(model),
      buildValidationContext({ purpose: "sba-loan", assumptions: bare }),
    );
    expect(result.findings.map((f) => f.id)).toContain("no-coherent-downside");
  });

  it("stays quiet on a plan the shipped downside genuinely moves", () => {
    const full = AssumptionsSchema.parse(saasPlan);
    const model = buildModel(full);
    const result = validateModel(
      model,
      computeMetrics(model),
      buildValidationContext({ purpose: "sba-loan", assumptions: full }),
    );
    expect(result.findings.map((f) => f.id)).not.toContain("no-coherent-downside");
  });

  it("does not apply external-reader checks to an internal plan", () => {
    const result = run(saasPlan, { purpose: "internal", competitorCount: 0 });
    expect(ids(result)).not.toContain("insufficient-competitor-evidence");
    expect(ids(result)).not.toContain("no-bottom-up-sizing");
  });
});

describe("validateModel — DSCR uses the threshold in force, not a constant", () => {
  const thinCoverage: AssumptionsInput = {
    ...saasPlan,
    loans: [
      { id: "big", name: "Oversized loan", month: 1, principal: 2_000_000, annualRate: 0.13, termMonths: 60 },
    ],
  };

  it("escalates thin coverage to blocking for an SBA submission", () => {
    const result = run(thinCoverage, {
      ...cleanContext,
      purpose: "sba-loan",
      sbaProgramme: "7a-standard",
      asOf: new Date("2026-09-19"),
    });
    const finding = result.findings.find((f) => f.id === "dscr-below-threshold");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("blocking");
    // The remedy must name the threshold's own source rather than a magic number.
    expect(finding!.detail).toMatch(/SOP|Notice/);
  });

  it("treats the same coverage as a warning for an investor plan", () => {
    const result = run(thinCoverage, { ...cleanContext, purpose: "investor" });
    const finding = result.findings.find((f) => f.id === "dscr-below-threshold");
    expect(finding?.severity).toBe("warning");
  });

  it("applies the lower 7(a) Small Loan threshold once it is in force", () => {
    const before = run(thinCoverage, {
      ...cleanContext, purpose: "sba-loan", sbaProgramme: "7a-small", asOf: new Date("2026-01-15"),
    }).findings.find((f) => f.id === "dscr-below-threshold");
    const after = run(thinCoverage, {
      ...cleanContext, purpose: "sba-loan", sbaProgramme: "7a-small", asOf: new Date("2026-06-15"),
    }).findings.find((f) => f.id === "dscr-below-threshold");
    expect(before!.detail).toContain("1.15");
    expect(after!.detail).toContain("1.10");
  });
});

describe("validateModel — warnings", () => {
  it("warns when net margin exceeds the industry band", () => {
    // A restaurant earning a SaaS-like margin is the classic implausible claim.
    const result = run(
      {
        company: { name: "Implausible Diner", startDate: "2026-01-01", horizonMonths: 36, industryKey: "restaurant" },
        revenueStreams: [
          { id: "s", name: "Covers", kind: "retail-footfall", dailyTraffic: 300, conversionRate: 0.8,
            averageTicket: 60, openDaysPerMonth: 30, cogsPercent: 0.05 },
        ],
        roles: [{ id: "o", title: "Owner", annualSalary: 90_000, isOwner: true, startMonth: 1 }],
        opex: [{ id: "r", name: "Rent", category: "rent", monthlyAmount: 5_000 }],
        registry: { "revenueStreams.0.dailyTraffic": { provenance: "estimated" } },
      },
      { purpose: "internal" },
    );
    expect(ids(result).some((id) => id.startsWith("net-margin-optimistic"))).toBe(true);
  });

  it("warns about cost lines that never change across the horizon", () => {
    expect(ids(run(saasPlan, cleanContext))).not.toContain("flat-opex");
    const plan: AssumptionsInput = {
      ...saasPlan,
      opex: [{ id: "flat", name: "Frozen cost", category: "other", monthlyAmount: 5_000, annualGrowthRate: 0 }],
    };
    expect(ids(run(plan, cleanContext))).toContain("flat-opex");
  });

  it("warns when TAM methods diverge by more than threefold", () => {
    expect(ids(run(saasPlan, { ...cleanContext, tamDivergence: 7 }))).toContain("tam-divergence");
    expect(ids(run(saasPlan, { ...cleanContext, tamDivergence: 1.4 }))).not.toContain("tam-divergence");
  });

  it("warns on thin LTV:CAC", () => {
    const plan: AssumptionsInput = { ...saasPlan, unitEconomics: { customerAcquisitionCost: 9_000 } };
    expect(ids(run(plan, cleanContext))).toContain("ltv-cac-thin");
  });

  it("keeps warnings out of the export gate", () => {
    const result = run(saasPlan, { ...cleanContext, tamDivergence: 9 });
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.canExport).toBe(true);
  });

  it("gives every finding a remedy", () => {
    const result = run({ ...saasPlan, registry: {}, equityRounds: [] }, { purpose: "sba-loan" });
    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(f.remedy.length, `${f.id} has no remedy`).toBeGreaterThan(10);
      expect(f.detail.length).toBeGreaterThan(10);
    }
  });
});

describe("AssumptionsSchema — immigration-relevant fields", () => {
  it("keeps household size and the enterprise cost denominator", () => {
    const a = AssumptionsSchema.parse(saasPlan);
    // Marginality is assessed against the family, so household size is required.
    expect(a.company.householdSize).toBe(3);
    // Proportionality needs a cost-of-enterprise denominator.
    expect(a.enterpriseEstablishmentCost).toBe(850_000);
    // The five-year clock runs from the start of normal business activity.
    expect(a.company.firstTradingMonth).toBe(1);
  });
});

describe("benchmark gross margin — the basis of the comparison", () => {
  /* The engine carries direct labour in cost of sales; the published bands are
     quoted before it. Comparing the statements' own gross margin against a band
     reported a shortfall on every plan that flags its service staff as direct —
     which the intake does by default — so the comparison runs on the
     materials-only figure. */
  it("compares the materials-only margin, not the labour-inclusive one", () => {
    const model = buildModel(restaurantPlan);
    const metrics = computeMetrics(model);
    const year1 = metrics.materialsMarginByYear.find((y) => y.year === 1)!;
    const reported = metrics.grossMarginByYear.find((y) => y.year === 1)!;

    // Kitchen staff are direct, so the two figures must differ.
    expect(year1.margin!).toBeGreaterThan(reported.margin!);

    const finding = run(restaurantPlan, cleanContext).findings.find((f) =>
      f.id.startsWith("gross-margin-out-of-band"),
    );
    const band = getBenchmark(restaurantPlan.company.industryKey).grossMargin;
    const inBand = year1.margin! >= band.low && year1.margin! <= band.high;
    expect(Boolean(finding), `materials margin ${year1.margin}`).toBe(!inBand);
  });

  it("does not raise the band finding when only direct labour pushes the margin down", () => {
    // Same plan, kitchen staff reclassified as overhead. The materials margin —
    // and so the band finding — must be identical either way.
    const asOverhead: AssumptionsInput = {
      ...restaurantPlan,
      roles: restaurantPlan.roles!.map((r) => ({ ...r, isDirectLabour: false })),
    };
    const direct = run(restaurantPlan, cleanContext);
    const overhead = run(asOverhead, cleanContext);
    const bandIds = (r: ReturnType<typeof run>) =>
      ids(r).filter((id) => id.startsWith("gross-margin-out-of-band"));
    expect(bandIds(direct)).toEqual(bandIds(overhead));
  });
});

/* ==========================================================================
   Capacity and scale.
   --------------------------------------------------------------------------
   The rules that stop a plan reaching $4.3 trillion. The curve makes that hard
   to do by accident; these make it hard to do on purpose, because an author
   told to declare a ceiling can declare a ceiling of a billion.
   ========================================================================== */
describe("capacity", () => {
  const subscription = saasPlan.revenueStreams?.[0];
  if (!subscription) throw new Error("the SaaS fixture must carry a stream to vary");

  /** The SaaS fixture with its stream's growth fields replaced. */
  const withStream = (stream: Record<string, unknown>): AssumptionsInput => ({
    ...saasPlan,
    revenueStreams: [{ ...subscription, ...stream }],
  });

  it("blocks a stream that declares no limit at all", () => {
    const result = run(
      withStream({ growth: { shape: "unbounded", monthlyRate: 0.05 }, customerCeiling: undefined }),
      cleanContext,
    );
    const finding = result.findings.find((f) => f.id.startsWith("growth-declared-unbounded"));
    expect(finding, `got: ${ids(result).join(", ")}`).toBeDefined();
    expect(finding!.severity).toBe("blocking");
    expect(result.canExport).toBe(false);
  });

  it("lets a stream that states its capacity through", () => {
    const result = run(withStream({}), cleanContext);
    expect(ids(result).some((id) => id.startsWith("growth-declared-unbounded"))).toBe(false);
  });

  /* The other way round the ceiling. `linear` makes `max` optional, and
     without one nothing measures the stream: `ceilingAt` is null, so
     `saturationAt` is null, so `capacity-never-approached` skips it — and
     this rule only ever looked at `unbounded`. Worse, it was the default
     path, because the engine's own fallback hands `hourly-services` exactly
     that curve and the validator kept a separate table that called its
     growth rate zero. */
  const hourly = (extra: Record<string, unknown>): AssumptionsInput => ({
    ...saasPlan,
    revenueStreams: [
      {
        id: "svc",
        name: "Client work",
        kind: "hourly-services",
        billableHeadcount: 4,
        hoursPerHeadPerMonth: 160,
        utilisation: 0.7,
        hourlyRate: 150,
        cogsPercent: 0.05,
        ...extra,
      } as never,
    ],
  });

  it("blocks an hourly stream that grows head count with no stated ceiling", () => {
    const result = run(hourly({ headcountGrowthPerMonth: 0.5 }), cleanContext);
    const finding = result.findings.find((f) => f.id.startsWith("growth-declared-unbounded"));
    expect(finding, `got: ${ids(result).join(", ")}`).toBeDefined();
    expect(finding!.severity).toBe("blocking");
  });

  it("blocks a linear curve that declares no maximum", () => {
    const result = run(
      hourly({ headcountGrowthPerMonth: 0, growth: { shape: "linear", perMonth: 1 } }),
      cleanContext,
    );
    expect(ids(result).some((id) => id.startsWith("growth-declared-unbounded"))).toBe(true);
  });

  it("lets a linear curve with a maximum through", () => {
    const result = run(
      hourly({ headcountGrowthPerMonth: 0.5, growth: { shape: "linear", perMonth: 0.5, max: 12 } }),
      cleanContext,
    );
    expect(ids(result).some((id) => id.startsWith("growth-declared-unbounded"))).toBe(false);
  });

  it("does not ask a flat head count for a ceiling", () => {
    const result = run(hourly({ headcountGrowthPerMonth: 0 }), cleanContext);
    expect(ids(result).some((id) => id.startsWith("growth-declared-unbounded"))).toBe(false);
  });

  it("says so when the stated ceiling is nowhere near being reached", () => {
    // The loophole: satisfy the field with a number so large it constrains
    // nothing. The ceiling is then not a ceiling, and the plan says nothing.
    const result = run(
      withStream({
        growth: { shape: "saturating", monthlyRate: 0.05, ceiling: 4_000, terminalAnnualRate: 0 },
        customerCeiling: 500_000,
      }),
      cleanContext,
    );
    const finding = result.findings.find((f) => f.id.startsWith("capacity-never-approached"));
    expect(finding, `got: ${ids(result).join(", ")}`).toBeDefined();
    expect(finding!.severity).toBe("warning");
  });

  it("treats perpetual capacity growth as the same defect wearing a different field", () => {
    const warned = run(
      withStream({
        growth: { shape: "saturating", monthlyRate: 0.05, ceiling: 46, terminalAnnualRate: 0.2 },
      }),
      cleanContext,
    );
    expect(ids(warned).some((id) => id.startsWith("terminal-growth-implausible"))).toBe(true);
    expect(warned.canExport).toBe(true);

    const blocked = run(
      withStream({
        growth: { shape: "saturating", monthlyRate: 0.05, ceiling: 46, terminalAnnualRate: 0.45 },
      }),
      cleanContext,
    );
    const finding = blocked.findings.find((f) => f.id.startsWith("terminal-growth-implausible"));
    expect(finding!.severity).toBe("blocking");
  });
});

describe("scale", () => {
  it("blocks a business that bills more per head than anyone could deliver", () => {
    // One owner, no other staff, against a model that sells millions.
    const plan: AssumptionsInput = {
      ...saasPlan,
      roles: [{ id: "owner", title: "Owner", annualSalary: 120_000, isOwner: true }],
      revenueStreams: [
        {
          id: "subs", name: "Subscriptions", kind: "subscription",
          newCustomersMonth1: 400, monthlyChurnRate: 0.01,
          pricePerCustomerPerMonth: 900, cogsPercent: 0.2,
          growth: { shape: "saturating", monthlyRate: 0.05, ceiling: 900, terminalAnnualRate: 0 },
          customerCeiling: 30_000,
        },
      ],
    };
    const result = run(plan, cleanContext);
    const finding = result.findings.find((f) => f.id.startsWith("revenue-per-employee-implausible"));
    expect(finding, `got: ${ids(result).join(", ")}`).toBeDefined();
    expect(finding!.severity).toBe("blocking");
    expect(result.canExport).toBe(false);
  });

  it("leaves a plausibly-staffed plan alone", () => {
    expect(
      ids(run(saasPlan, cleanContext)).some((id) => id.startsWith("revenue-per-employee-implausible")),
    ).toBe(false);
  });

  it("warns against the sourced band where one exists", () => {
    // Only two of the twenty-one benchmarks carry this band, and the rule is
    // deliberately silent for the rest rather than inventing nineteen more.
    expect(getBenchmark("saas").revenuePerEmployee).toBeDefined();
    expect(getBenchmark("laundromat").revenuePerEmployee).toBeUndefined();
  });

  it("notices when nobody is paid more in year five than in year one", () => {
    const result = run(saasPlan, cleanContext);
    expect(ids(result)).toContain("payroll-flat");

    const withRaises = run(
      { ...saasPlan, payroll: { payrollTaxRate: 0.0765, benefitsRate: 0.12, annualSalaryInflation: 0.03 } },
      cleanContext,
    );
    expect(ids(withRaises)).not.toContain("payroll-flat");
  });

  it("reports the worst year of growth, not the first", () => {
    // It used to break on the earliest offender, sending an author to the
    // wrong screen when the trouble was three years later.
    const result = run(saasPlan, cleanContext);
    const growth = result.findings.find((f) => f.id.startsWith("growth-unsupported-y"));
    if (!growth) return; // The fixture may be calm throughout.
    const model = buildModel(saasPlan);
    const metrics = computeMetrics(model);
    const worst = metrics.revenueGrowthByYear
      .filter((g): g is { year: number; growth: number } => g.growth !== null)
      .reduce((a, b) => (b.growth > a.growth ? b : a));
    expect(growth.id).toBe(`growth-unsupported-y${worst.year}`);
  });
});

describe("the market the plan says it can serve", () => {
  const checked = (ratio: number) => ({
    status: "checked" as const,
    year: 3,
    projectedRevenue: 1_000_000 * ratio,
    obtainableRevenue: 1_000_000,
    ratio,
    overruns: ratio > 1,
    understates: ratio < 1,
  });

  it("ignores a model that fits inside its market", () => {
    expect(ids(run(saasPlan, { ...cleanContext, marketModelCheck: checked(0.9) }))).not.toContain(
      "revenue-exceeds-servable-market",
    );
  });

  it("warns when the model slightly outruns it", () => {
    const result = run(saasPlan, { ...cleanContext, marketModelCheck: checked(1.5) });
    const finding = result.findings.find((f) => f.id === "revenue-exceeds-servable-market");
    expect(finding!.severity).toBe("warning");
  });

  it("blocks when the model outruns it by more than double, for an outside reader", () => {
    const result = run(saasPlan, { ...cleanContext, marketModelCheck: checked(3) });
    const finding = result.findings.find((f) => f.id === "revenue-exceeds-servable-market");
    expect(finding!.severity).toBe("blocking");

    const internal = run(saasPlan, {
      ...cleanContext,
      purpose: "internal" as const,
      marketModelCheck: checked(3),
    });
    expect(
      internal.findings.find((f) => f.id === "revenue-exceeds-servable-market")!.severity,
    ).toBe("warning");
  });
});
