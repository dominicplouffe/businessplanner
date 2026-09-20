import { describe, expect, it } from "vitest";
import { INDUSTRY_PAGES, benchmarkFor, getIndustryPage, industriesByDemand } from "@/lib/content/industries";
import { INDUSTRY_BENCHMARKS } from "@/lib/finance/benchmarks";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { AssumptionsSchema } from "@/lib/finance/types";

/* ==========================================================================
   The industry pages are worked examples, and a worked example that our own
   review would reject is worse than no example at all. So the calibration is a
   test, not a one-off measurement: every page must build a model that ties,
   exports, and sits inside the band it is published beside.
   ========================================================================== */

const submitted = {
  competitorCount: 4,
  competitorsHaveDatedEvidence: true,
  hasBottomUpMarketSizing: true,
  downsideScenarioDriverCount: 6,
  uncitedStatisticCount: 0,
  unreconciledFigureCount: 0,
};

const built = INDUSTRY_PAGES.map((page) => {
  const model = buildModel(page.build());
  const metrics = computeMetrics(model);
  return {
    page,
    model,
    metrics,
    benchmark: benchmarkFor(page),
    validation: validateModel(model, metrics, { ...submitted, purpose: page.typicalPurpose }),
  };
});

describe("industry pages — shape", () => {
  it("has a unique slug and a resolvable benchmark for every page", () => {
    const slugs = INDUSTRY_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const { page, benchmark } of built) {
      // getBenchmark falls back to "other", which would silently publish the
      // wrong band next to a worked example.
      expect(benchmark.key, page.slug).toBe(page.benchmarkKey);
    }
  });

  it("resolves a page by slug and orders by search demand", () => {
    expect(getIndustryPage("food-truck")?.label).toBe("Food truck");
    expect(getIndustryPage("nope")).toBeUndefined();
    const volumes = industriesByDemand().map((p) => p.demand.volume);
    expect([...volumes].sort((x, y) => y - x)).toEqual(volumes);
  });

  it("states a cost structure that leaves room for a margin", () => {
    for (const { page } of built) {
      const share = page.costStructure.reduce((sum, line) => sum + line.shareOfRevenue, 0);
      expect(share, page.slug).toBeGreaterThan(0.2);
      expect(share, page.slug).toBeLessThan(0.95);
    }
  });
});

describe("industry pages — the models behind them", () => {
  it("parses every build under the assumptions schema", () => {
    for (const { page } of built) {
      expect(() => AssumptionsSchema.parse(page.build()), page.slug).not.toThrow();
    }
  });

  it("ties the balance sheet in every period", () => {
    for (const { page, model } of built) {
      const tie = model.checks.balanceSheetTie;
      expect(tie.passes, `${page.slug}: worst ${tie.worstAbsolute} at m${tie.worstMonth}`).toBe(true);
    }
  });

  it("produces no blocking findings — every example would export", () => {
    for (const { page, validation } of built) {
      const blockers = validation.findings.filter((f) => f.severity === "blocking").map((f) => f.id);
      expect(blockers, page.slug).toEqual([]);
      expect(validation.canExport, page.slug).toBe(true);
    }
  });

  it("keeps year-3 gross margin inside the band, on the band's own basis", () => {
    for (const { page, metrics, benchmark } of built) {
      const series =
        benchmark.grossMarginBasis === "materials"
          ? metrics.materialsMarginByYear
          : metrics.grossMarginByYear;
      const margin = series.find((y) => y.year === 3)?.margin;
      expect(margin, page.slug).not.toBeNull();
      expect(margin!, `${page.slug} gross ${margin}`).toBeGreaterThanOrEqual(benchmark.grossMargin.low);
      expect(margin!, `${page.slug} gross ${margin}`).toBeLessThanOrEqual(benchmark.grossMargin.high);
    }
  });

  it("keeps year-3 net margin inside the band", () => {
    for (const { page, metrics, benchmark } of built) {
      const margin = metrics.netMarginByYear.find((y) => y.year === 3)?.margin;
      expect(margin, page.slug).not.toBeNull();
      expect(margin!, `${page.slug} net ${margin}`).toBeGreaterThanOrEqual(benchmark.netMargin.low);
      expect(margin!, `${page.slug} net ${margin}`).toBeLessThanOrEqual(benchmark.netMargin.high);
    }
  });

  it("never dips below zero cash", () => {
    for (const { page, metrics } of built) {
      expect(metrics.cash.lowestCash, `${page.slug} @m${metrics.cash.lowestCashMonth}`).toBeGreaterThan(0);
    }
  });

  it("pays somebody for every billable head it sells", () => {
    // Revenue from twenty-three consultants against a payroll carrying three is
    // the classic services-plan contradiction, and it was in the consulting
    // example until this test existed.
    for (const { page, model } of built) {
      const hourly = model.assumptions.revenueStreams.filter((s) => s.kind === "hourly-services");
      if (hourly.length === 0) continue;
      const lastMonth = model.horizonMonths;
      const billable = hourly.reduce(
        (sum, s) =>
          s.kind === "hourly-services"
            ? sum + s.billableHeadcount + s.headcountGrowthPerMonth * (lastMonth - s.startMonth)
            : sum,
        0,
      );
      const onPayroll = model.assumptions.roles
        .filter((r) => r.isDirectLabour || r.isOwner)
        .reduce((sum, r) => sum + (r.count ?? 1), 0);
      expect(billable, `${page.slug}: ${billable} billable vs ${onPayroll} paid`).toBeLessThanOrEqual(
        onPayroll + 0.5,
      );
    }
  });
});

describe("benchmark bands — internal coherence", () => {
  /* A band set is only usable if it can all be true at once. Under a materials
     basis every wage sits below the gross line, so gross margin has to cover
     payroll, occupancy and the net margin together; under a labour-inclusive
     basis the direct wages are already above it. Checking this caught a
     childcare band whose 55% floor was arithmetically impossible against its own
     55% payroll ratio. */
  for (const bm of INDUSTRY_BENCHMARKS) {
    it(`${bm.key}: the gross band can support its own payroll and net bands`, () => {
      const floor =
        bm.netMargin.median +
        (bm.occupancyRatio?.median ?? 0) +
        (bm.grossMarginBasis === "materials" ? bm.payrollRatio.median : 0);
      expect(bm.grossMargin.median, `${bm.key} needs ≥ ${floor.toFixed(2)}`).toBeGreaterThanOrEqual(floor);
      expect(bm.grossMargin.low).toBeLessThanOrEqual(bm.grossMargin.median);
      expect(bm.grossMargin.median).toBeLessThanOrEqual(bm.grossMargin.high);
    });
  }
});
