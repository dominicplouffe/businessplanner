export type ProductPage = {
  slug: string;
  eyebrow: string;
  title: string;
  lede: string;
  /** The claim we are willing to be held to on this page. */
  promise: string;
  sections: { heading: string; body: string; points?: string[] }[];
  /** Honest limits. A page with no limits reads as marketing, not engineering. */
  limits: string[];
};

export const PRODUCT_PAGES: ProductPage[] = [
  {
    slug: "plan",
    eyebrow: "Plan generation",
    title: "A full draft from a structured intake, not a blank prompt.",
    lede: "Generation starts from a branching questionnaire shaped by your business model, seeded with industry defaults so no field starts empty. Every answer is tagged with where it came from, and that tag travels into the finished document.",
    promise: "Every section is written against the specific facts of your business, and against numbers the engine has already computed.",
    sections: [
      {
        heading: "The intake adapts to what you are building",
        body: "A restaurant and a SaaS company do not share a revenue model, a cost structure, or a reader. The intake branches on your business model and asks only what that model needs — footfall, conversion and average ticket for one; seats, price and churn for the other.",
        points: [
          "Seven revenue-build patterns, each asking for its own drivers",
          "Industry defaults pre-filled, so you edit rather than invent",
          "Every driver tagged known, estimated, or benchmark default",
        ],
      },
      {
        heading: "Sections that follow the model",
        body: "The financial model is built before the prose. Each written section is then generated against engine output, so a claim about growth, headcount or margin is a description of the model rather than an assertion beside it.",
        points: [
          "Executive summary, company, market, competition, operations, marketing, team, risk, financials",
          "Industry trends, applicable regulations, and a suggested next-steps section",
          "Per-section regeneration with your own instructions",
        ],
      },
      {
        heading: "Regeneration that cannot quietly break things",
        body: "Change a price or a hiring date and every dependent figure updates — in the statements, in the charts, and in every sentence that cites one. Each regeneration takes a version snapshot with a visible diff, so nothing is overwritten without a way back.",
      },
    ],
    limits: [
      "Generation needs real inputs. Vague answers produce a vague plan, and we would rather tell you that than paper over it.",
      "We draft; you decide. Nothing is submitted anywhere on your behalf.",
    ],
  },
  {
    slug: "financials",
    eyebrow: "Financial model",
    title: "Three linked statements, monthly, that actually tie.",
    lede: "A profit and loss, a cash flow and a balance sheet that move together — built from drivers you control, across sixty months, with the balance sheet asserted to balance in every single period.",
    promise: "No figure in any statement is written by a language model. The engine computes them all.",
    sections: [
      {
        heading: "Driver builds, not growth rates",
        body: "Revenue is built from the things you can actually argue about: traffic and conversion and ticket; seats and price and churn; billable hours and utilisation and rate. A reader can interrogate a driver. Nobody can interrogate a percentage.",
        points: [
          "Subscription, unit sales, hourly services, footfall, marketplace, contract and advertising models",
          "Seasonality, ramp timing, and expansion built in",
          "Loan amortisation with interest-only periods and balloons",
        ],
      },
      {
        heading: "The ratios a credit analyst computes",
        body: "Founders submit plans; banks compute ratios. The underwriter panel renders debt service coverage, the amortisation schedule, current ratio, debt to equity and owner compensation by year — measured against the threshold in force for the programme you are applying under, with the guidance version printed so a loan officer can verify rather than doubt.",
        points: [
          "Coverage measured against the SOP version in force, not a hardcoded number",
          "Sources and uses, equity injection, and the working-capital cycle",
          "Owner compensation as a named line, because a plan showing zero fails on first review",
        ],
      },
      {
        heading: "Scenarios with a cost response",
        body: "A downside that cuts revenue while holding the hiring plan constant is arithmetic, not a scenario. Ours move demand, pricing, churn, ramp timing and spend together, and hold genuinely committed costs like rent fixed. Sensitivity analysis then ranks which assumption actually moves the outcome — usually not the one you spent longest on.",
      },
    ],
    limits: [
      "Projections are projections. The model is only as good as the drivers you give it, and it says so in the document.",
      "We are not your accountant. Tax treatment is modelled simply and should be reviewed by someone who knows your jurisdiction.",
    ],
  },
  {
    slug: "market",
    eyebrow: "Market research",
    title: "Sized from the bottom up, and cited.",
    lede: "The most commonly cited reason plans get rejected is unsourced market claims — and AI tools are notorious for inventing statistics and citing reports that do not exist. Every figure we put in a market section carries a retrievable, dated source.",
    promise: "Zero uncited claims, or the plan does not export.",
    sections: [
      {
        heading: "Bottom-up first, top-down as a cross-check",
        body: "A share-of-a-large-market claim is the classic unfundable market section. We build the market from the ground up, show the arithmetic, and then cross-check it against a top-down estimate. When the two disagree by more than threefold, we say so and make you reconcile them.",
        points: [
          "TAM, SAM and SOM with the working shown",
          "Divergence between methods flagged rather than hidden",
          "Demand-side and capacity-side triangulation for location-based businesses",
        ],
      },
      {
        heading: "Named competitors, dated evidence",
        body: "At least three real competitors, each with a link and a price point carrying the date it was observed. A competitive analysis without named, dated evidence reads as generic — because it is.",
      },
      {
        heading: "A sources appendix that exports with the plan",
        body: "Every citation collects into an appendix at the back of the document, with publisher and date. It is the page a sceptical reader turns to first, and most plans do not have one.",
      },
    ],
    limits: [
      "Sourced does not mean infallible. We show you the source and its date so you can judge it.",
      "Some niches have no good public data. Where that is true the plan says so rather than inventing a number.",
    ],
  },
  {
    slug: "deck",
    eyebrow: "Pitch deck",
    title: "Generated from the plan, so the slides cannot disagree with it.",
    lede: "The deck is built from the same model as the document. When you change a number, both change. There is no second copy of the truth to fall out of date.",
    promise: "The figure on slide nine is the figure in the model.",
    sections: [
      {
        heading: "The sequence investors expect",
        body: "Problem, solution, why now, market, product, business model, traction, competition, team, financials, ask. Editable throughout, and exportable to PowerPoint or PDF.",
      },
      {
        heading: "One source of truth",
        body: "Traction figures, market size and the funding ask are all references into the model rather than typed-in text. The consistency checker covers the deck exactly as it covers the plan.",
      },
    ],
    limits: [
      "A deck is a narrative device. We give you a structurally sound one; the story is yours to tell.",
    ],
  },
  {
    slug: "review",
    eyebrow: "Plan review",
    title: "Graded against the rubric your reader actually uses.",
    lede: "Before you send it, the plan is scored against the criteria a lender, an investor or an adjudicator applies — with a severity-ranked redline and a queue of specific fixes. You can also bring a plan you wrote elsewhere and have it graded.",
    promise: "Twelve blocking checks and eight advisory ones. Each finding names the remedy, not just the problem.",
    sections: [
      {
        heading: "The consistency checker",
        body: "Every figure in the narrative is diffed against the model. Prose claiming forty per cent growth against a model showing twelve, or eight employees against a payroll carrying five, is caught and held — export stays locked until they agree.",
      },
      {
        heading: "Checks that block, and checks that advise",
        body: "Statement integrity, cash adequacy, owner compensation, monthly detail, cited statistics, named competitors, bottom-up sizing and a coherent downside all block. Benchmark deviations, thin coverage, long payback and flat cost lines advise — because they may be defensible, and that is your call to make.",
        points: [
          "Benchmarks warn; they never overwrite your assumption",
          "Findings link straight to the field that fixes them",
          "Severity reflects who is reading: an SBA submission is held to more than an internal draft",
        ],
      },
    ],
    limits: [
      "A clean review is not an approval. It means the arithmetic and the evidence will not be the reason you are declined.",
    ],
  },
];

export function getProductPage(slug: string): ProductPage | undefined {
  return PRODUCT_PAGES.find((p) => p.slug === slug);
}
