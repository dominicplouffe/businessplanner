import { describe, expect, it } from "vitest";
import { FixtureGenerator } from "@/lib/ai/fixture-generator";
import { buildFactsBlock } from "@/lib/ai/context";
import {
  buildCitedIndex,
  buildMarketIndex,
  buildModelIndex,
  buildResilienceIndex,
  checkPlan,
} from "@/lib/ai/consistency";
import type { GenerationContext } from "@/lib/ai/types";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { AssumptionsSchema } from "@/lib/finance/types";
import { MarketSizingSchema } from "@/lib/market/sizing";
import { ResilienceSchema } from "@/lib/market/resilience";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { restaurantPlan } from "./fixtures";

const assumptions = AssumptionsSchema.parse(restaurantPlan);
const model = buildModel(assumptions);
const metrics = computeMetrics(model);

const sizing = MarketSizingSchema.parse({
  populationLabel: "Households within three miles",
  populationCount: 24_000,
  qualifiedShare: 0.35,
  annualSpendPerCustomer: 480,
  servableShare: 0.6,
  targetShare: 0.12,
  populationSource: "American Community Survey, tract 4021",
});

const competitors = [
  {
    name: "The Copper Pot",
    url: "https://copperpot.example",
    positioning: "The established neighbourhood option",
    priceLabel: "$34 average cover",
    priceDate: "2026-09-02",
    strengths: "Twenty years of regulars",
    weaknesses: "Menu has not changed since 2019",
  },
  {
    name: "Sable & Oak",
    url: "https://sableoak.example",
    positioning: "Higher-end, destination dining",
    priceLabel: "$68 average cover",
    priceDate: "2026-09-02",
    strengths: "Strong reviews",
    weaknesses: "Priced out of midweek trade",
  },
  {
    name: "Tinderbox",
    url: "https://tinderbox.example",
    positioning: "Fast casual, counter service",
    priceLabel: "$19 average cover",
    priceDate: "2026-09-03",
    strengths: "High turnover",
    weaknesses: "No evening occasion trade",
  },
];

const citations = [
  {
    label: "American Community Survey, tract 4021",
    url: "https://census.example/acs/4021",
    publisher: "US Census Bureau",
    sourceDate: "2026-06-30",
    claim: "The catchment contains 24,000 households.",
  },
];

const resilience = ResilienceSchema.parse({
  tasks: [
    { id: "t1", task: "Bookkeeping and supplier invoicing", shareOfCost: 0.08, level: "high", rationale: "Already largely software." },
    { id: "t2", task: "Cooking and service", shareOfCost: 0.62, level: "low", rationale: "The work happens in a room, in front of people." },
    { id: "t3", task: "Reservations and front desk", shareOfCost: 0.12, level: "moderate", rationale: "Partly automatable, but the greeting is the product." },
  ],
  moatKind: "physical-presence",
  moatStatement: "Forty covers a night, cooked and served in a room people come to.",
  roadmap: [
    { id: "r1", horizon: "now", action: "Move bookkeeping to an automated ledger", expectedEffect: "free four hours a week" },
    { id: "r2", horizon: "year-1", action: "Adopt automated reservation handling", expectedEffect: "cut no-shows" },
  ],
});

function contextFor(sectionKey: string): GenerationContext {
  const section = PLAN_SECTIONS.find((s) => s.key === sectionKey)!;
  return {
    planId: "test",
    sectionKey,
    sectionTitle: section.title,
    companyName: assumptions.company.name,
    industryKey: assumptions.company.industryKey,
    purpose: "sba-loan",
    description: "A neighbourhood restaurant.",
    assumptions,
    model,
    metrics,
    written: [],
    market: { sizing, competitors, citations },
    resilience,
  };
}

async function collect(ctx: GenerationContext): Promise<string> {
  const generator = new FixtureGenerator();
  let text = "";
  for await (const chunk of generator.generateSection(ctx)) {
    if (chunk.type === "done") text = chunk.text;
  }
  return text;
}

describe("buildFactsBlock carries the market evidence", () => {
  it("supplies the bottom-up build, the named competitors and the sources", () => {
    const facts = buildFactsBlock(contextFor("market"));
    expect(facts).toContain("MARKET, BUILT FROM THE GROUND UP");
    expect(facts).toContain("NAMED COMPETITORS");
    expect(facts).toContain("SOURCES ON FILE");
    expect(facts).toContain("The Copper Pot");
    expect(facts).toContain("census.example");
  });

  it("tells the generator not to invent what is missing", () => {
    const bare = buildFactsBlock({
      ...contextFor("market"),
      market: { sizing: MarketSizingSchema.parse({}), competitors: [], citations: [] },
    });
    expect(bare).toContain("Do not state a market size");
    expect(bare).toContain("Do not invent competitors");
    expect(bare).toContain("so write none");
  });

  it("flags an undated price rather than passing it on as evidence", () => {
    const facts = buildFactsBlock({
      ...contextFor("competition"),
      market: {
        sizing,
        competitors: [{ ...competitors[0]!, priceDate: null }],
        citations,
      },
    });
    expect(facts).toContain("undated — do not quote it");
  });

  it("carries the AI-disruption assessment", () => {
    const facts = buildFactsBlock(contextFor("ai-resilience"));
    expect(facts).toContain("AI DISRUPTION ASSESSMENT");
    expect(facts).toContain("Cooking and service");
    expect(facts).toContain("Forty covers a night");
  });
});

describe("the generated market section is written from evidence", () => {
  it("names only competitors that are on file", async () => {
    const text = await collect(contextFor("competition"));
    for (const competitor of competitors) {
      expect(text).toContain(competitor.name);
    }
    // And it carries the dates, which is what makes the section checkable.
    expect(text).toContain("2026-09-02");
  });

  it("says so plainly when there is no comparison set rather than inventing one", async () => {
    const text = await collect({
      ...contextFor("competition"),
      market: { sizing, competitors: [], citations },
    });
    expect(text).toMatch(/have not yet been gathered/);
    for (const competitor of competitors) {
      expect(text).not.toContain(competitor.name);
    }
  });

  it("states no market size when no build exists", async () => {
    const text = await collect({
      ...contextFor("market"),
      market: { sizing: MarketSizingSchema.parse({}), competitors, citations },
    });
    expect(text).toMatch(/No bottom-up build has been recorded/);
  });

  it("reports the exposure it was given, weighted by cost", async () => {
    const text = await collect(contextFor("ai-resilience"));
    expect(text.toLowerCase()).toMatch(/bookkeeping|reservations/);
    expect(text).toContain("Forty covers a night");
    expect(text.toLowerCase()).toContain("exposure stands at");
  });
});

describe("every figure in an evidence-backed plan still reconciles", () => {
  /**
   * The whole pass in one assertion. With a market build, named competitors,
   * a source and an AI assessment in play, the generator writes more numbers
   * than before — and every one of them must still trace to something: the
   * engine, the market arithmetic, or a citation on file.
   */
  it("traces to the engine, the market build or a citation", async () => {
    const sections: { key: string; title: string; text: string }[] = [];
    for (const section of PLAN_SECTIONS) {
      sections.push({
        key: section.key,
        title: section.title,
        text: await collect(contextFor(section.key)),
      });
    }

    const report = checkPlan(
      sections,
      [
        ...buildModelIndex(model, metrics, assumptions),
        ...buildMarketIndex(sizing, model),
        ...buildResilienceIndex(resilience),
      ],
      buildCitedIndex([
        ...citations.map((c) => c.claim),
        ...competitors.filter((c) => c.priceDate).map((c) => c.priceLabel),
      ]),
    );

    const described = report.findings.map(
      (f) => `${f.sectionKey}: ${f.figure.raw} — ${f.figure.context}`,
    );
    expect(described).toEqual([]);
    expect(report.checkedCount).toBeGreaterThan(25);
  });
});
