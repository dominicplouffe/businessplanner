/* ==========================================================================
   Solutions pages.
   --------------------------------------------------------------------------
   Two segments, built deeply. SBA/bank, franchise and advisory firms are
   scaffolded elsewhere and come later.

   ⚠ The immigration page is compliance-sensitive. What is safe to publish is
   the *document structure* — which fields a filing needs and why — because that
   follows from the regulations' own enumeration of plan contents. What is NOT
   safe, and is deliberately absent, is any dollar threshold, any pin cite to a
   FAM subsection letter, and any claim about a numeric job-creation requirement
   for E-2, which does not exist. Thresholds live in dated configuration and are
   rendered only where their confidence level can be shown beside them.
   ========================================================================== */

export type SolutionSlug = "investor-raise" | "immigration";

export type SolutionPage = {
  slug: SolutionSlug;
  eyebrow: string;
  label: string;
  title: string;
  lede: string;
  /** The claim we are willing to be held to on this page. */
  promise: string;
  sections: { heading: string; body: string; points?: string[] }[];
  /** What the reader of this document is actually testing for. */
  reader: { heading: string; items: { title: string; detail: string }[] };
  limits: string[];
  /** Rendered as a standing notice above the fold, where it is unavoidable. */
  notice?: string;
};

export const SOLUTION_PAGES: SolutionPage[] = [
  {
    slug: "investor-raise",
    eyebrow: "Raising capital",
    label: "Raising from investors",
    title: "A seed plan that survives the second meeting",
    lede: "The first meeting is about the story. The second is about the model — and that is the one where most decks quietly fall apart, because the numbers on the slides were typed rather than computed.",
    promise:
      "The figure on slide nine is the figure in the model, because it is a reference into the model rather than text.",
    sections: [
      {
        heading: "Bottom-up sizing, because share-of-a-large-market is a tell",
        body: "A market section that starts from a published industry total and claims a percentage of it is the classic unfundable one. We build from the buyers up — how many there are, what they spend, what share your capacity can actually serve — and print the arithmetic line by line, then cross-check it against a published figure and against your own model's year-three revenue.",
        points: [
          "TAM, SAM and SOM with every step's working shown",
          "An uncited published figure is inadmissible, not quietly accepted",
          "A model that outruns the market it claims is caught before you send it",
        ],
      },
      {
        heading: "Unit economics an investor can interrogate",
        body: "Lifetime value computed on gross margin rather than revenue, which is the most common way the figure gets inflated threefold. Payback in months of gross profit. Acquisition cost with the monthly spend the growth rate actually implies, which is the line most plans leave out entirely.",
        points: [
          "LTV, CAC, the ratio and payback, from the same metrics module the product uses",
          "Contribution margin and break-even on both profit and cash",
          "Cohort-style churn treated as an estimate and labelled as one",
        ],
      },
      {
        heading: "A cap table that survives a SAFE",
        body: "Pre-money and post-money, SAFE conversion with caps and discounts, priced rounds, the option pool and where it is taken from, and the dilution waterfall that follows. The founder ownership figure in the narrative is read from that table, not typed beside it.",
      },
      {
        heading: "The deck is generated from the plan",
        body: "Problem, solution, why now, market, product, model, traction, competition, team, financials, ask — in the sequence investors expect, exported to PowerPoint or PDF. Because it is built from the same model as the document, there is no second copy of the truth to fall out of date between the raise starting and the term sheet arriving.",
      },
    ],
    reader: {
      heading: "What they are actually testing",
      items: [
        {
          title: "Whether you know your own numbers",
          detail:
            "An investor changes one assumption out loud and watches what you do. When the model is driver-built rather than growth-rate-built, you can answer; when it is not, you cannot.",
        },
        {
          title: "Whether the market claim is arithmetic or vibes",
          detail:
            "Nobody believes a TAM. What they are checking is whether you can derive one — and whether the customer count that falls out of your obtainable share is a number your own operations could serve.",
        },
        {
          title: "Whether the deck and the plan agree",
          detail:
            "Diligence finds the discrepancy, and the discrepancy is what costs you credibility rather than the number itself. Ours cannot disagree: the consistency checker covers the deck exactly as it covers the plan, and blocks export until they reconcile.",
        },
      ],
    },
    limits: [
      "We will not make a weak business look fundable. A model built on drivers is easier to interrogate, and that cuts both ways.",
      "Traction is traction. We can present it precisely; we cannot manufacture it.",
    ],
  },
  {
    slug: "immigration",
    eyebrow: "Immigration",
    label: "Immigration business plans",
    title: "E-2, L-1A and EB-5, structured the way the regulations are",
    lede: "Adjudicators read the same templates over and over, and a recognisable template is a credibility problem rather than a formatting one. These documents are derived from your business, in the structure the rules themselves enumerate.",
    promise:
      "The fields the tests turn on — owner compensation, household size, a cost-of-enterprise denominator — are first-class inputs to the model, not paragraphs bolted onto the end.",
    notice:
      "This is a document preparation and financial modelling tool. It does not provide legal advice, it does not represent you, and nothing here is a substitute for licensed immigration counsel. Regulatory figures in the product carry their own effective dates and confidence levels, and anything we have not confirmed against a primary source is labelled unverified in place rather than presented as settled.",
    sections: [
      {
        heading: "The E-2 tests drive the model, not the prose",
        body: "Marginality asks whether the business will generate more than a minimal living for the investor and their family. That is a financial question, so it needs financial inputs: owner compensation as a named, visible line in the profit and loss, and household size as a required field, because the test is assessed against the family rather than the individual.",
        points: [
          "Owner compensation is a first-class role in the model and appears in every statement",
          "Household size is captured at intake because the test needs a denominator",
          "The five-year horizon runs from commencement of normal business activity — not from incorporation, and not from visa issuance",
        ],
      },
      {
        heading: "Substantiality is proportional, so the use of funds needs a denominator",
        body: "The investment test is not a dollar threshold; it is a ratio against the total cost of the enterprise. A use-of-funds table that states an amount and no denominator fails the proportionality question on its face, whatever the amount is. Ours carries both, and the plan states the ratio rather than leaving the reader to compute it.",
      },
      {
        heading: "L-1A new office: the regulation enumerates the plan's contents",
        body: "For a new office petition the regulation sets out what the supporting evidence has to establish — that physical premises have been secured, the beneficiary's prior year in a qualifying managerial capacity, the nature and structure of the intended office and its financial goals, the size of the United States investment and the foreign entity's financial ability to remunerate the beneficiary, and the organisational structure of the foreign entity. The section map follows that enumeration rather than a generic template.",
        points: [
          "Premises, prior managerial year, structure and financial goals, investment size, foreign entity structure",
          "The staffing plan is modelled, so the org chart, the payroll and the narrative headcount are one number",
          "The first-year hiring schedule comes out of the model rather than being asserted beside it",
        ],
      },
      {
        heading: "EB-5: projections, and the bases therefor",
        body: "The element most commonly failed is not the projection itself but the requirement that the plan show the basis for it — and that is precisely what a driver-built model with a sources appendix produces. Where the required elements are conditional on the business model, the document branches rather than emitting an empty heading, because a non-responsive section reads worse than a missing one.",
        points: [
          "Every projection traces to a driver, and every driver carries its provenance",
          "Market and industry claims carry retrievable, dated sources or they do not appear",
          "Credibility is treated as a global constraint on the whole document, which is what it is",
        ],
      },
      {
        heading: "Anti-boilerplate is a compliance feature",
        body: "A generator that emits near-identical plans across clients actively harms outcomes in this segment. Ours derives each document from the specific drivers, the specific market and the specific staffing plan captured at intake, and the consistency checker means the derived figures cannot drift back toward a template's defaults.",
      },
    ],
    reader: {
      heading: "Where these filings come apart",
      items: [
        {
          title: "Owner compensation shown as zero",
          detail:
            "It is the most common silent failure in the whole category. A lender substitutes a market salary; an adjudicator reads it as a business that does not support the applicant. Our validator blocks on it.",
        },
        {
          title: "Headcount that does not reconcile",
          detail:
            "The narrative says eight employees, the payroll carries five, the org chart shows six. Three unrelated research paths identified this mechanical inconsistency as the highest-value thing to check, and the product blocks export until the figures agree.",
        },
        {
          title: "A recognisable template",
          detail:
            "Adjudicators see the same documents repeatedly. Where credibility is itself a requirement, a plan that reads as a filled-in form is a problem the content cannot rescue.",
        },
      ],
    },
    limits: [
      "We are not a law firm and we do not file anything on your behalf. Have licensed counsel review the document before it is submitted.",
      "Regulatory thresholds change on statutory schedules. Ours are dated configuration with sources, and the ones we have not verified against a primary source say so — but a figure's presence in the product is not a representation that it is current for your filing.",
      "Country eligibility, treaty status and case-specific history are outside what a document tool can assess.",
    ],
  },
];

export function getSolutionPage(slug: string): SolutionPage | undefined {
  return SOLUTION_PAGES.find((s) => s.slug === slug);
}
