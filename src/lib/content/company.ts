import { brand } from "@/lib/brand";

/* ==========================================================================
   The trust pages.
   --------------------------------------------------------------------------
   About, Security, Changelog, Contact and the legal documents, as data. These
   are the pages a careful buyer opens before they open the pricing page, and a
   site that positions on credibility cannot 404 on any of them.

   ⚠ The legal documents describe what the product actually does, which is the
   only kind of policy worth publishing — but they have not been reviewed by
   counsel. That review is a launch prerequisite, not a formality. Do not treat
   the wording here as settled.
   ========================================================================== */

/** Reviewed and dated in one place, so a policy cannot silently go stale. */
export const LEGAL_EFFECTIVE = "2026-09-20";

export type ProseSection = { heading: string; paragraphs: string[]; points?: string[] };

export const ABOUT = {
  lede:
    "We build one thing: business plans whose numbers hold up when somebody checks them. Everything else follows from that.",
  sections: [
    {
      heading: "Why this exists",
      paragraphs: [
        "The writing problem is solved. Every tool in this category drafts serviceable prose, and a general-purpose assistant matches most of them. What is not solved is the part that gets plans declined: the arithmetic, the sourcing, the internal consistency, and the craft of the document itself.",
        "So we compete there. A deterministic engine computes every figure in every statement. A language model proposes assumptions and describes results, and is never permitted to author a number that lands in a financial statement. Claims in the prose are diffed against the model before the document can leave the building.",
      ],
    },
    {
      heading: "What we will not do",
      paragraphs: [
        "We do not meter AI usage. Limits belong on plans and companies, not on requests — a credit counter turns writing into rationing and nobody thinks better under a meter.",
        "We do not make cancelling difficult. The reputational rot in this category is almost entirely auto-renewal and refund friction, and one competitor's published policy requires the customer to document ten unsatisfactory sections before a refund is considered. One click cancels, in plain English, and we would rather say so here than in a help article.",
        "We do not present an unverified regulatory figure as authoritative. Where we have not confirmed something against a primary source, the product says so in place, and the whole queue is published on the methodology page.",
      ],
    },
    {
      heading: "Who it is for",
      paragraphs: [
        "Owners applying for an SBA or bank loan, founders raising a first institutional round, and applicants preparing an immigration filing — three readers who share a habit of checking the numbers.",
        "We are a document preparation and financial modelling tool. We do not give legal, tax or investment advice, and a plan headed for a lender, an investor or a government filing should be reviewed by a qualified professional before it is sent.",
      ],
    },
  ] satisfies ProseSection[],
};

export const SECURITY = {
  lede:
    "What is actually implemented, and what is not yet. A security page listing only intentions is a marketing page.",
  implemented: [
    {
      heading: "Your plan data",
      paragraphs: [
        "Plans belong to a workspace and are readable only by its members. Every route that loads a plan checks the workspace membership of the signed-in user before it reads anything.",
        "The PDF export renders the same authenticated route you see in the browser, using your own session — it is not a privileged path around authorisation, and the preview is exactly what the reader receives.",
      ],
    },
    {
      heading: "Shared links",
      paragraphs: [
        "A share link is a random token, can be given an expiry, and can be revoked. View tracking records a salted SHA-256 hash of the viewer's address rather than the address itself, so the read analytics work without us holding a log of who read your plan from where.",
      ],
    },
    {
      heading: "The AI layer",
      paragraphs: [
        "Generation runs against the Anthropic API. Content sent through the API is not used to train models. The only per-plan content sent is what the generator needs for the section being written; the long system prompt that precedes it carries no customer data.",
        "With no API key configured the product falls back to a deterministic generator that composes prose from engine output alone, which is how the demo and the test suite run with no external call at all.",
      ],
    },
    {
      heading: "In the browser",
      paragraphs: [
        "The free calculators, the homepage demo and the scenario switcher all run the financial engine locally. Nothing typed into a calculator is transmitted anywhere — there is no request to send it in.",
      ],
    },
  ] satisfies ProseSection[],
  notYet: [
    "No third-party security audit or SOC 2 report. We will not imply one before it exists.",
    "No single sign-on or SCIM provisioning. Email and password, plus OAuth, is what there is today.",
    "No customer-managed encryption keys. Data is encrypted in transit and at rest by the platform, not by a key you hold.",
    "No published bug-bounty programme, though reports are very welcome at the address below and we will credit them.",
  ],
};

export const CHANGELOG: {
  date: string;
  title: string;
  entries: string[];
}[] = [
  {
    date: "2026-09-20",
    title: "Industry pages and free calculators",
    entries: [
      "Fifteen industry pages, each carrying a complete worked model run through the engine at build time, with the sector's cost structure, the questions a reader opens with, and the licences to budget for.",
      "Seven free calculators — amortisation, SBA 7(a), TAM/SAM/SOM, coverage, unit economics, break-even, burn and runway — running the product's own modules in the browser, ungated.",
      "Fixed a real defect in the benchmark comparison: industry gross-margin bands are quoted on different cost bases, and comparing a labour-inclusive margin against a materials-only band reported a shortfall on every hospitality plan. Each band now declares its own basis.",
      "Five new industry benchmark sets — food truck, bar, laundromat, short-term rental, landscaping — replacing mappings that were borrowing a neighbouring sector's band.",
      "This methodology page now prints the verification queue directly from the configuration.",
    ],
  },
  {
    date: "2026-09-19",
    title: "Exports, the print document and share links",
    entries: [
      "PDF, Word, PowerPoint and Excel exports, all assembled from one document model so a spreadsheet cannot disagree with the PDF exported beside it.",
      "The workbook is the model rather than a picture of it: the statements are live formulas over a drivers sheet, so changing a driver recalculates revenue, margin, coverage and the debt schedule. A Filed sheet carries the engine's figures at export and a variance row, which reads zero on open or the workbook and the plan disagree.",
      "Tokenised read-only share links with expiry, revocation and page-level read tracking.",
      "Export is gated on the plan review: blocking findings have to be cleared first.",
    ],
  },
  {
    date: "2026-09-18",
    title: "Research, review and the consistency checker",
    entries: [
      "Every figure in the written plan is now diffed against the model, and export is blocked until they reconcile.",
      "Readiness scoring against a purpose-weighted rubric, with a severity-ranked fix-it queue that links to the field that fixes each finding.",
      "Bottom-up market sizing with visible arithmetic, cross-checked against a published figure and against the model's own year-three revenue.",
      "Grounded competitor research with dated, retrievable citations. An undated source is excluded rather than quietly accepted.",
      "The AI-disruption resilience module, answering the question lenders started asking this year.",
    ],
  },
  {
    date: "2026-09-17",
    title: "The financial workspace",
    entries: [
      "Three linked statements, monthly and annual, with the balance-sheet tie row visible in every period.",
      "The underwriter panel: coverage by year against the threshold in force for the programme, the amortisation schedule, current ratio, debt to equity, and owner compensation as its own line.",
      "Scenarios and one-at-a-time sensitivity, computed in the browser so switching cases is instant.",
    ],
  },
];

export const CONTACT = {
  lede:
    "A real address, answered by the people who build it. There is no support tier and no queue to escalate through.",
  channels: [
    {
      label: "General and sales",
      value: brand.email.hello,
      note: "Questions about whether this fits what you are doing. Answered within a business day.",
    },
    {
      label: "Support",
      value: brand.email.support,
      note: "Something is wrong, or a figure looks wrong. Include the plan link if you can — it helps enormously.",
    },
    {
      label: "Security",
      value: brand.email.support,
      note: "Vulnerability reports go here and are read the same day. We will credit you unless you ask us not to.",
    },
  ],
};
