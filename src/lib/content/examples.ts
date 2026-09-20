import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { buildExportDocument, type ExportDocument } from "@/lib/export/document";
import { assembleReview } from "@/lib/review/assemble";
import { composeSection } from "@/lib/ai/fixture-generator";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { getIndustryPage, benchmarkFor, type IndustryPage } from "@/lib/content/industries";
import { MarketSizingSchema, type MarketSizingInput } from "@/lib/market/sizing";
import { ResilienceSchema, type ResilienceInput } from "@/lib/market/resilience";
import type { AssumptionsInput } from "@/lib/finance/types";

/* ==========================================================================
   Sample plans.
   --------------------------------------------------------------------------
   Whole documents, built during the site build from the same assumptions the
   industry pages carry, run through the same engine, written by the same
   deterministic generator that runs when no API key is present, and rendered
   with the same component a reader of a shared plan receives. Nothing here is
   transcribed and nothing is a mock-up.

   ⚠ What is deliberately absent: competitors and citations. A sample plan is
   the easiest possible place to invent a plausible competitor with a plausible
   price, and inventing one would contradict the guarantee the whole product
   rests on. So the competitive section of every sample is empty, and the page
   says why. The market *sizing* is present because it is arithmetic over
   assumptions the sample owner states, not a claim about the outside world.
   ========================================================================== */

export type ExamplePlan = {
  slug: string;
  /** Joins INDUSTRY_PAGES — the assumptions come from there, never duplicated. */
  industrySlug: string;
  companyName: string;
  documentTitle: string;
  location: string;
  purpose: "sba-loan" | "investor" | "immigration" | "internal";
  /** One line for the index. */
  summary: string;
  /** Free-text the generator writes around, as an owner would have typed it. */
  description: string;
  /** What this plan is asking its reader for. */
  ask: string;
  sizing: MarketSizingInput;
  resilience: ResilienceInput;
};

export const EXAMPLE_PLANS: ExamplePlan[] = [
  {
    slug: "chapel-street-kitchen",
    industrySlug: "restaurant",
    companyName: "Chapel Street Kitchen",
    documentTitle: "Chapel Street Kitchen — SBA 504 application",
    location: "Providence, Rhode Island",
    purpose: "sba-loan",
    summary:
      "A 78-cover neighbourhood restaurant seeking SBA 504 financing against a kitchen build-out. The plan a credit committee reads first.",
    description:
      "A 78-cover neighbourhood restaurant in a converted textile building, opening in month four after a three-month fit-out. Dinner service six nights with a weekend lunch, a short menu built around a wood oven, and a beverage programme run at a deliberately low pour cost. The owner has managed two kitchens for another operator and is buying the building rather than leasing it.",
    ask: "SBA 504 financing of $500,000, alongside $180,000 of owner equity.",
    sizing: {
      populationLabel: "households within a fifteen-minute drive",
      populationCount: 41_000,
      qualifiedShare: 0.38,
      annualSpendPerCustomer: 940,
      /* Servable and target were the wrong shape: `targetShare` is a share of
         the *servable* slice, and these were set as though it were a share of
         the whole market. The result was four sample plans each claiming a
         market ten to twenty times smaller than the revenue they forecast —
         the product's own samples failing the check it now runs. Re-derived so
         the obtainable figure lands on what the model projects for year three. */
      servableShare: 0.34,
      targetShare: 0.4,
      populationSource:
        "Stated by the owner from census tract data for this sample. A real plan cites the source with the date it was read.",
    },
    resilience: {
      tasks: [
        {
          id: "cook",
          task: "Cooking and plating service",
          shareOfCost: 0.46,
          level: "low",
          rationale:
            "The work happens in a place, at a time, with hands. Automation has moved parts of high-volume production kitchens and has not moved à la carte service.",
        },
        {
          id: "book",
          task: "Reservations, covers management and front-of-house admin",
          shareOfCost: 0.06,
          level: "high",
          rationale:
            "Already largely automated by the booking platform. Further automation reduces cost here rather than threatening the business.",
        },
        {
          id: "acct",
          task: "Bookkeeping, payroll and supplier reconciliation",
          shareOfCost: 0.05,
          level: "high",
          rationale:
            "Routine, rules-based and already offered as a service. Expected to fall in cost over the life of the loan.",
        },
        {
          id: "buy",
          task: "Purchasing and menu costing",
          shareOfCost: 0.09,
          level: "moderate",
          rationale:
            "Price tracking and reorder points automate readily; supplier relationships and substitution judgement do not.",
        },
      ],
      moatKind: "physical-presence",
      moatStatement:
        "Dinner in a room, cooked to order, is not a task that moves to software. The exposure in this business is in its back office, where automation lowers cost rather than removing the reason customers come.",
      roadmap: [
        {
          id: "r1",
          horizon: "now",
          action: "Bookkeeping and payroll on an automated platform from opening.",
          expectedEffect: "Holds administrative cost flat as covers grow, rather than scaling with them.",
        },
        {
          id: "r2",
          horizon: "year-1",
          action: "Menu costing against live supplier pricing, reviewed monthly.",
          expectedEffect: "Keeps food cost inside the modelled band when input prices move.",
        },
      ],
    },
  },

  {
    slug: "meridian-supply",
    industrySlug: "ecommerce",
    companyName: "Meridian Supply",
    documentTitle: "Meridian Supply — seed round",
    location: "Portland, Oregon",
    purpose: "investor",
    summary:
      "A direct-to-consumer brand raising a first institutional round. Unit economics and a market section built from the buyers up.",
    description:
      "A direct-to-consumer brand selling a small range of workwear and field equipment, built on repeat purchase rather than on acquisition volume. Sold entirely through its own storefront, shipped from a single leased facility, with product developed in-house and manufactured under contract. Raising a first institutional round to fund inventory depth and a second product line.",
    ask: "A seed round to fund inventory depth ahead of the second product line.",
    sizing: {
      populationLabel: "US households buying technical workwear annually",
      populationCount: 2_400_000,
      qualifiedShare: 0.22,
      annualSpendPerCustomer: 210,
      /* Servable and target were the wrong shape: `targetShare` is a share of
         the *servable* slice, and these were set as though it were a share of
         the whole market. The result was four sample plans each claiming a
         market ten to twenty times smaller than the revenue they forecast —
         the product's own samples failing the check it now runs. Re-derived so
         the obtainable figure lands on what the model projects for year three. */
      servableShare: 0.09,
      targetShare: 0.172,
      populationSource:
        "Stated by the founder for this sample. A real plan cites a dated, retrievable source and the product refuses to export without one.",
    },
    resilience: {
      tasks: [
        {
          id: "prod",
          task: "Product design and specification",
          shareOfCost: 0.12,
          level: "moderate",
          rationale:
            "Generative tooling accelerates iteration and does not resolve fit, durability or material sourcing, which is where the returns rate is decided.",
        },
        {
          id: "content",
          task: "Photography, copy and merchandising",
          shareOfCost: 0.14,
          level: "high",
          rationale:
            "Already substantially automatable. Expected to fall in cost and to become a smaller point of differentiation.",
        },
        {
          id: "cs",
          task: "Customer service and returns handling",
          shareOfCost: 0.09,
          level: "high",
          rationale:
            "High volume, repetitive, and well served by current tooling. The judgement cases are a small share of contacts.",
        },
        {
          id: "fulfil",
          task: "Warehousing and fulfilment",
          shareOfCost: 0.28,
          level: "moderate",
          rationale:
            "Automation here is capital-intensive rather than software-driven, and is available to competitors on the same terms.",
        },
      ],
      moatKind: "trust-and-relationship",
      moatStatement:
        "The defensible asset is a repeat customer who trusts the fit, which took three years of returns data to earn and cannot be generated. The exposed cost lines are the ones where automation makes the business cheaper to run.",
      roadmap: [
        {
          id: "r1",
          horizon: "now",
          action: "Automate first-line customer service, keeping returns judgement with a person.",
          expectedEffect: "Holds service cost per order flat while order volume doubles.",
        },
        {
          id: "r2",
          horizon: "years-2-3",
          action: "Bring fit and returns data into product development as a structured input.",
          expectedEffect: "Reduces the returns rate, which is the single largest lever on contribution.",
        },
      ],
    },
  },

  {
    slug: "harborlight-early-years",
    industrySlug: "daycare",
    companyName: "Harborlight Early Years",
    documentTitle: "Harborlight Early Years — SBA 7(a) application",
    location: "Duluth, Minnesota",
    purpose: "sba-loan",
    summary:
      "A licensed childcare centre with ratio-mandated staffing. What a plan looks like when the cost base is set by regulation.",
    description:
      "A licensed childcare centre opening with two rooms and adding a third in year two, in a converted single-storey building with an enclosed outdoor space. Tuition is billed monthly in advance. Staffing is set by state child-to-staff ratios rather than by choice, which is the defining constraint on the model and the reason the margin is what it is.",
    ask: "SBA 7(a) financing of $260,000 against fit-out, playground and equipment.",
    sizing: {
      populationLabel: "children under five within the catchment",
      populationCount: 3_900,
      qualifiedShare: 0.44,
      annualSpendPerCustomer: 14_400,
      /* Servable and target were the wrong shape: `targetShare` is a share of
         the *servable* slice, and these were set as though it were a share of
         the whole market. The result was four sample plans each claiming a
         market ten to twenty times smaller than the revenue they forecast —
         the product's own samples failing the check it now runs. Re-derived so
         the obtainable figure lands on what the model projects for year three. */
      servableShare: 0.16,
      targetShare: 0.315,
      populationSource:
        "Stated by the owner for this sample from county population data. A real plan carries the citation and its date.",
    },
    resilience: {
      tasks: [
        {
          id: "care",
          task: "Supervision and care of children",
          shareOfCost: 0.62,
          level: "low",
          rationale:
            "Ratio-mandated, physically present, and licensed. There is no version of this task that a machine performs.",
        },
        {
          id: "admin",
          task: "Enrolment, billing and compliance record-keeping",
          shareOfCost: 0.08,
          level: "high",
          rationale:
            "Routine and already served by sector software. Automation reduces administrative load without touching the service.",
        },
        {
          id: "curric",
          task: "Curriculum planning and parent reporting",
          shareOfCost: 0.06,
          level: "moderate",
          rationale:
            "Preparation and reporting automate; the observation the reporting is based on does not.",
        },
      ],
      moatKind: "licence-or-regulation",
      moatStatement:
        "Licensed childcare is a regulated, physically present service with a mandated staffing floor. That floor caps the margin and it also means the core of this business cannot be automated away over the life of the loan.",
      roadmap: [
        {
          id: "r1",
          horizon: "now",
          action: "Enrolment, billing and compliance records on sector software from opening.",
          expectedEffect: "Keeps administrative cost from rising with enrolment through the second room.",
        },
      ],
    },
  },

  {
    slug: "atlas-and-vance",
    industrySlug: "consulting",
    companyName: "Atlas & Vance",
    documentTitle: "Atlas & Vance — three-year operating plan",
    location: "Chicago, Illinois",
    purpose: "internal",
    summary:
      "A professional-services firm planning internally, with no debt and no raise. Utilisation is the whole business.",
    description:
      "An operations consultancy of four, working on retained engagements with mid-market manufacturers. No debt, no outside capital, and no intention of taking either. The plan exists to decide when the fifth and sixth consultants can be hired without pushing utilisation below the level that supports the margin.",
    ask: "No external funding. The plan sets the hiring trigger and the utilisation floor.",
    sizing: {
      populationLabel: "mid-market manufacturers in the region",
      populationCount: 1_850,
      qualifiedShare: 0.3,
      annualSpendPerCustomer: 62_000,
      /* Servable and target were the wrong shape: `targetShare` is a share of
         the *servable* slice, and these were set as though it were a share of
         the whole market. The result was four sample plans each claiming a
         market ten to twenty times smaller than the revenue they forecast —
         the product's own samples failing the check it now runs. Re-derived so
         the obtainable figure lands on what the model projects for year three. */
      servableShare: 0.18,
      targetShare: 0.2,
      populationSource:
        "Stated by the partners for this sample from their own pipeline records.",
    },
    resilience: {
      tasks: [
        {
          id: "analysis",
          task: "Data analysis and model building inside engagements",
          shareOfCost: 0.22,
          level: "high",
          rationale:
            "This is the part of the work that has already changed most. The hours it used to take are not coming back, and the rate card has to reflect that.",
        },
        {
          id: "advice",
          task: "Diagnosis, recommendation and stakeholder work on site",
          shareOfCost: 0.48,
          level: "low",
          rationale:
            "Clients buy a named person taking a position in a room with their executives. That is the engagement.",
        },
        {
          id: "delivery",
          task: "Report writing and deliverable production",
          shareOfCost: 0.14,
          level: "high",
          rationale:
            "Substantially automatable and already partly automated internally. Treated as a cost reduction rather than a threat.",
        },
      ],
      moatKind: "trust-and-relationship",
      moatStatement:
        "The firm is bought for the judgement of two named partners in front of a client's executives. The analytical hours underneath that are exposed, and the plan prices the work accordingly rather than pretending otherwise.",
      roadmap: [
        {
          id: "r1",
          horizon: "now",
          action: "Shift the rate card from hours to engagement outcomes on new work.",
          expectedEffect: "Decouples fee income from the analytical hours that are falling.",
        },
        {
          id: "r2",
          horizon: "year-1",
          action: "Standardise deliverable production so consultant time moves to client-facing work.",
          expectedEffect: "Raises billable utilisation without lengthening the working week.",
        },
      ],
    },
  },
];

export function getExamplePlan(slug: string): ExamplePlan | undefined {
  return EXAMPLE_PLANS.find((e) => e.slug === slug);
}

export type BuiltExample = {
  example: ExamplePlan;
  industry: IndustryPage;
  industryLabel: string;
  doc: ExportDocument;
  review: ReturnType<typeof assembleReview>;
};

/**
 * Builds the whole document.
 *
 * The assumptions come from the industry page, so a sample plan and the sector
 * page it sits behind cannot drift apart. The prose is composed section by
 * section with the previously written ones supplied, which is exactly how the
 * product writes a real plan — later sections are told what earlier ones said
 * so they cannot contradict them.
 */
export function buildExample(example: ExamplePlan): BuiltExample {
  const industry = getIndustryPage(example.industrySlug);
  if (!industry) throw new Error(`Unknown industry for example: ${example.industrySlug}`);

  const assumptionsInput: AssumptionsInput = {
    ...industry.build(),
    company: { ...industry.build().company, name: example.companyName },
  };
  const model = buildModel(assumptionsInput);
  const metrics = computeMetrics(model);
  const assumptions = model.assumptions;

  // Parsed through the schemas rather than cast: the generator is handed the
  // same shape the product hands it, defaults and all.
  const sizing = MarketSizingSchema.parse(example.sizing);
  const resilience = ResilienceSchema.parse(example.resilience);

  const written: { key: string; title: string; text: string }[] = [];
  for (const section of PLAN_SECTIONS) {
    const text = composeSection({
      planId: example.slug,
      sectionKey: section.key,
      sectionTitle: section.title,
      companyName: example.companyName,
      industryKey: assumptions.company.industryKey,
      purpose: example.purpose,
      description: example.description,
      assumptions,
      model,
      metrics,
      written: [...written],
      market: {
        sizing,
        // Empty on purpose. See the note at the top of this file.
        competitors: [],
        citations: [],
      },
      resilience,
    });
    written.push({ key: section.key, title: section.title, text });
  }

  const marketJson = JSON.stringify(example.sizing);
  const resilienceJson = JSON.stringify(example.resilience);
  const sections = written.map((s) => ({ key: s.key, contentText: s.text }));

  const review = assembleReview(
    {
      id: example.slug,
      purpose: example.purpose,
      marketJson,
      resilienceJson,
      sections,
      competitors: [],
      citations: [],
    },
    assumptions,
  );

  const doc = buildExportDocument({
    plan: {
      id: example.slug,
      title: example.documentTitle,
      companyName: example.companyName,
      industryKey: assumptions.company.industryKey,
      purpose: example.purpose,
      marketJson,
      resilienceJson,
      sections,
      competitors: [],
      citations: [],
    },
    assumptions,
    model,
    metrics,
    generator: "fixture",
    // Fixed, so the same source produces the same document on every build.
    now: new Date(`${SAMPLE_PREPARED_ON}T00:00:00Z`),
  });

  return {
    example,
    industry,
    industryLabel: benchmarkFor(industry).label,
    doc,
    review,
  };
}

/** The date printed on every sample's cover. Held constant so the build is
 *  reproducible and a diff of the site is not a diff of today's date. */
export const SAMPLE_PREPARED_ON = "2026-09-20";
