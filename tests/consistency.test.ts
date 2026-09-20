import { describe, expect, it } from "vitest";
import {
  buildCitedIndex,
  buildModelIndex,
  checkPlan,
  checkSection,
  extractFigures,
} from "@/lib/ai/consistency";
import { FixtureGenerator } from "@/lib/ai/fixture-generator";
import type { GenerationContext } from "@/lib/ai/types";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { AssumptionsSchema } from "@/lib/finance/types";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { restaurantPlan, saasPlan } from "./fixtures";

function setup(plan = restaurantPlan) {
  const assumptions = AssumptionsSchema.parse(plan);
  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);
  return { assumptions, model, metrics, index: buildModelIndex(model, metrics, assumptions) };
}

describe("extractFigures", () => {
  it("reads currency, including compact notation and the accounting parenthesis", () => {
    const figures = extractFigures("Revenue of $623,247, cash of $1.2M, a loss of ($405,498).");
    expect(figures.map((f) => f.value)).toEqual([623_247, 1_200_000, 405_498]);
    expect(figures.every((f) => f.kind === "currency")).toBe(true);
  });

  it("derives tolerance from how precisely the figure was written", () => {
    const [exact] = extractFigures("$623,247");
    const [rounded] = extractFigures("$623.2K");
    const [coarse] = extractFigures("$1.2M");
    expect(exact!.tolerance).toBeCloseTo(0.5, 6);
    expect(rounded!.tolerance).toBeCloseTo(50, 6);
    expect(coarse!.tolerance).toBeCloseTo(50_000, 6);
  });

  it("stores percentages as proportions so they compare with engine rates", () => {
    const figures = extractFigures("A 31% gross margin and 2.5% churn.");
    expect(figures.map((f) => f.value)).toEqual([0.31, 0.025]);
    expect(figures[0]!.tolerance).toBeCloseTo(0.005, 9);
    expect(figures[1]!.tolerance).toBeCloseTo(0.0005, 9);
  });

  it("reads multiples but not the x inside a dimension", () => {
    expect(extractFigures("Coverage of 1.15× and LTV:CAC of 3.4x.").map((f) => f.value))
      .toEqual([1.15, 3.4]);
    expect(extractFigures("A 10x12 storeroom.")).toEqual([]);
  });

  it("reads headcount in digits and in words", () => {
    const figures = extractFigures("We employ 12 staff, including eight full-time equivalents.");
    expect(figures.map((f) => f.value)).toEqual([12, 8]);
    expect(figures.every((f) => f.kind === "headcount")).toBe(true);
  });

  it("does not swallow the first letter of the next word as a scale suffix", () => {
    // "$927,834 by year three" is not 927,834 billion, and the captured text
    // must not trail a space into the finding either.
    const figures = extractFigures("Opex rises to $927,834 by year three.");
    expect(figures).toHaveLength(1);
    expect(figures[0]!.value).toBe(927_834);
    expect(figures[0]!.raw).toBe("$927,834");
  });

  it("does not read footfall as headcount", () => {
    // A retail model counts people through the door. Treating that as staff is
    // the false positive that teaches someone to stop reading the report.
    expect(extractFigures("Around 210 people come through the door each day.")).toEqual([]);
    expect(extractFigures("The kitchen runs on 5 staff.").map((f) => f.value)).toEqual([5]);
  });

  it("ignores bare numbers, which are years and list positions far more often than claims", () => {
    expect(extractFigures("Opened in 2026 at 47 Bridge Street, third on the block.")).toEqual([]);
  });

  it("carries enough surrounding text to find the figure again, snapped to words", () => {
    const [figure] = extractFigures(
      "The dining room seats forty covers across two services. Year one revenue reaches $623,247 before the second site opens its doors in the spring.",
    );
    expect(figure!.context).toContain("revenue reaches");
    // A quote that opens mid-word is harder to find in the document than one
    // that opens on a word, so the first word of the snippet must be a whole
    // word of the source.
    const text =
      "The dining room seats forty covers across two services. Year one revenue reaches $623,247 before the second site opens its doors in the spring.";
    const body = figure!.context.replace(/^…/, "").replace(/…$/, "");
    const firstWord = body.split(" ")[0]!;
    expect(text).toMatch(new RegExp(`(^|\\s)${firstWord}\\b`));
    expect(body.startsWith("covers")).toBe(false);
  });
});

describe("buildModelIndex", () => {
  it("indexes what the engine computed, labelled the way a person would name it", () => {
    const { index, model } = setup();
    const labels = index.map((v) => v.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        `${model.annual[0]!.label} revenue`,
        "lowest cash balance",
        "gross margin",
        "total headcount",
        "total debt",
      ]),
    );
  });

  it("indexes the owner's own inputs, which prose legitimately restates", () => {
    const { index, assumptions } = setup();
    const currency = index.filter((v) => v.kind === "currency").map((v) => v.value);
    expect(currency).toContain(assumptions.loans[0]!.principal);
    expect(currency).toContain(assumptions.roles[0]!.annualSalary);
    const counts = index.filter((v) => v.kind === "headcount").map((v) => v.value);
    expect(counts).toContain(assumptions.roles.reduce((sum, r) => sum + r.count, 0));
  });
});

describe("reconciliation", () => {
  it("accepts a figure written in compact notation", () => {
    const { index, model } = setup();
    const revenue = model.annual[0]!.revenue;
    const compact = `Year one revenue is $${(revenue / 1000).toFixed(1)}K.`;
    const result = checkSection({ key: "s", title: "S", text: compact }, index);
    expect(result.findings).toEqual([]);
    expect(result.reconciled).toBe(1);
  });

  it("accepts a negative written as a positive magnitude in words", () => {
    const { index, model } = setup();
    const loss = model.annual.find((y) => y.netIncome < 0);
    if (!loss) return; // The fixture may be profitable throughout.
    const text = `The business posts a loss of $${Math.round(Math.abs(loss.netIncome)).toLocaleString("en-US")} in ${loss.label}.`;
    expect(checkSection({ key: "s", title: "S", text }, index).findings).toEqual([]);
  });

  it("catches a figure that exists nowhere in the model", () => {
    const { index } = setup();
    const result = checkSection(
      { key: "market", title: "Market analysis", text: "We expect revenue of $9,400,000 in year one." },
      index,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.figure.value).toBe(9_400_000);
  });

  it("names the nearest computed value, because that is what makes it fixable", () => {
    const { index, model } = setup();
    const revenue = model.annual[0]!.revenue;
    // Off by about 3%: close enough to be a typo, far enough to be wrong.
    const wrong = Math.round(revenue * 1.03);
    const result = checkSection(
      { key: "s", title: "S", text: `Revenue of $${wrong.toLocaleString("en-US")}.` },
      index,
    );
    expect(result.findings).toHaveLength(1);

    /* The suggestion has to be the nearest thing the engine holds, derived
       here by brute force rather than assumed to be year-one revenue. It used
       to assert exactly that, which passed only while no other computed value
       happened to sit closer — a coincidence of the fixture, not a property of
       the checker, and it broke the moment the fixture's numbers moved. */
    const nearestInIndex = index
      .filter((v) => v.kind === "currency")
      .reduce((best, v) =>
        Math.abs(v.value - wrong) < Math.abs(best.value - wrong) ? v : best,
      );
    expect(result.findings[0]!.nearest?.value).toBeCloseTo(nearestInIndex.value, 6);
    // And it has to be in the same territory, or the suggestion is noise.
    expect(Math.abs(nearestInIndex.value - revenue) / revenue).toBeLessThan(0.1);
  });

  it("withholds a suggestion when nothing is in the same territory", () => {
    const { index } = setup();
    const result = checkSection(
      { key: "s", title: "S", text: "The market is worth $4,200,000,000." },
      index,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.nearest).toBeUndefined();
  });

  it("does not reconcile a headcount against an unrelated integer in the model", () => {
    // The restaurant trades 26 days a month. A claim of 26 staff must not pass
    // just because the number appears somewhere in the assumptions.
    const { index, assumptions } = setup();
    const openDays = assumptions.revenueStreams[0] as { openDaysPerMonth?: number };
    if (openDays.openDaysPerMonth === undefined) return;
    const result = checkSection(
      { key: "team", title: "Team", text: `The restaurant employs ${openDays.openDaysPerMonth} staff.` },
      index,
    );
    expect(result.findings).toHaveLength(1);
    // And it must not offer trading days as the correction.
    expect(result.findings[0]!.nearest?.label ?? "").not.toMatch(/open days/i);
  });

  it("catches the headcount mismatch, which is the documented failure mode", () => {
    const { index, assumptions } = setup();
    const actual = assumptions.roles.reduce((sum, r) => sum + r.count, 0);
    const text = `The team grows to ${actual + 3} employees by the end of year one.`;
    const findings = checkSection({ key: "team", title: "Team", text }, index).findings;
    expect(findings).toHaveLength(1);
    expect(findings[0]!.nearest).toEqual({ label: "total headcount", value: actual });
  });

  it("always names the payroll headcount, however far the claim is from it", () => {
    // The distance rule that withholds a currency suggestion would withhold
    // this one too, and this is precisely the comparison worth printing.
    const { index, assumptions } = setup();
    const actual = assumptions.roles.reduce((sum, r) => sum + r.count, 0);
    const findings = checkSection(
      { key: "team", title: "Team", text: "The restaurant employs 340 staff." },
      index,
    ).findings;
    expect(findings[0]!.nearest).toEqual({ label: "total headcount", value: actual });
  });

  it("does not check a section that has not been written", () => {
    const { index } = setup();
    const report = checkPlan(
      [
        { key: "a", title: "A", text: "" },
        { key: "b", title: "B", text: "   " },
      ],
      index,
    );
    expect(report.skippedSections).toEqual(["a", "b"]);
    expect(report.checkedCount).toBe(0);
    expect(report.findings).toEqual([]);
  });
});

describe("the generated plan reconciles against its own model", () => {
  /**
   * The product's central claim, asserted end to end: run the real generator
   * over every section of two different business models and require that every
   * figure it writes traces to a value the engine computed. This is the same
   * guarantee tests/ai.test.ts asserts for currency, now through the shipped
   * checker and across all four figure kinds.
   */
  it.each([
    ["restaurant", restaurantPlan],
    ["SaaS", saasPlan],
  ])("%s", async (_name, plan) => {
    const { assumptions, model, metrics, index } = setup(plan);
    const generator = new FixtureGenerator();

    const sections: { key: string; title: string; text: string }[] = [];
    for (const section of PLAN_SECTIONS) {
      const ctx: GenerationContext = {
        planId: "test",
        sectionKey: section.key,
        sectionTitle: section.title,
        companyName: assumptions.company.name,
        industryKey: assumptions.company.industryKey,
        purpose: "sba-loan",
        description: "A business with a model behind it.",
        assumptions,
        model,
        metrics,
        written: [],
      };
      let text = "";
      for await (const chunk of generator.generateSection(ctx)) {
        if (chunk.type === "done") text = chunk.text;
      }
      sections.push({ key: section.key, title: section.title, text });
    }

    const report = checkPlan(sections, index);
    const described = report.findings.map(
      (f) => `${f.sectionKey}: ${f.figure.raw} — ${f.figure.context}`,
    );
    expect(described).toEqual([]);
    expect(report.checkedCount).toBeGreaterThan(20);
  });
});

describe("citations vouch for figures the model does not hold", () => {
  /**
   * Not every number in a plan should come from the model. "The category is
   * worth $4.2 billion, per IBISWorld 2026" is a market fact whose right
   * answer is a source, not a model cell. Without this the check would report
   * a correctly cited statistic as a fabrication — punishing the exact
   * behaviour it exists to encourage.
   */
  const CLAIM = "The category was worth $4,200,000,000 in 2026.";
  const PROSE = "Industry revenue reached $4,200,000,000 last year.";

  it("accepts a figure carried by a cited claim", () => {
    const { index } = setup();

    const bare = checkSection({ key: "market", title: "Market", text: PROSE }, index);
    expect(bare.findings).toHaveLength(1);

    const sourced = checkSection(
      { key: "market", title: "Market", text: PROSE },
      index,
      buildCitedIndex([CLAIM]),
    );
    expect(sourced.findings).toEqual([]);
    expect(sourced.sourced).toBe(1);
    expect(sourced.reconciled).toBe(0);
  });

  it("does not let one citation vouch for a different figure", () => {
    const { index } = setup();
    const result = checkSection(
      { key: "market", title: "Market", text: "Industry revenue reached $9,100,000,000 last year." },
      index,
      buildCitedIndex([CLAIM]),
    );
    expect(result.findings).toHaveLength(1);
    expect(result.sourced).toBe(0);
  });

  it("counts sourced figures separately from reconciled ones across a plan", () => {
    const { index, model } = setup();
    const revenue = Math.round(model.annual[0]!.revenue);
    const report = checkPlan(
      [
        {
          key: "market",
          title: "Market",
          text: `Revenue reaches $${revenue.toLocaleString("en-US")} in a category worth $4,200,000,000.`,
        },
      ],
      index,
      buildCitedIndex([CLAIM]),
    );
    expect(report.findings).toEqual([]);
    expect(report.reconciledCount).toBe(1);
    expect(report.sourcedCount).toBe(1);
    expect(report.checkedCount).toBe(2);
  });

  it("ignores a citation claim carrying no figure the checker would ever see", () => {
    // Bare counts are not extracted from prose either, so a claim built only
    // from one vouches for nothing. Consistent on both sides is the point.
    expect(buildCitedIndex(["Industry conditions remain competitive."])).toEqual([]);
    expect(buildCitedIndex(["The catchment holds 24,000 households."])).toEqual([]);
  });
});
