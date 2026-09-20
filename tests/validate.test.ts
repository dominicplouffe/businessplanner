import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { AssumptionsSchema, type AssumptionsInput } from "@/lib/finance/types";
import { getBenchmark } from "@/lib/finance/benchmarks";
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
