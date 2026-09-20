/* ==========================================================================
   Comparison pages.
   --------------------------------------------------------------------------
   Deliberately not a feature table.

   The honest reason: from our build environment the vendors' own pricing and
   feature pages are unreachable, so anything we printed about them would be
   second-hand and undated. This product's whole argument is that a claim
   without a retrievable, dated source is not evidence — restating a competitor's
   price we could not verify would be the most conspicuous possible way to
   contradict ourselves, and a feature grid comparing our own product to a
   version of theirs we could not see would be worth nothing to a buyer anyway.

   So these pages make claims about exactly one product: ours. Everything about
   the alternative is a question, phrased so the reader can go and ask it. That
   is more useful than a grid, it cannot go stale, and it is the only version of
   this page we can stand behind.

   ⚠ Rule for anyone editing these: no statement of fact about a competitor's
   price, feature set, ownership or behaviour. A test enforces the price half of
   that. If we ever reach the vendor pages, a dated evidence table can be added
   and this comment revised — not before.
   ========================================================================== */

export type CompareSlug = "liveplan" | "upmetrics" | "chatgpt";

export type ComparePage = {
  slug: CompareSlug;
  /** The competitor, named plainly. Linked so the reader can go and check. */
  competitor: string;
  competitorUrl: string;
  title: string;
  /** The search this page answers, verbatim. */
  query: string;
  demand: { volume: number; difficulty: number };
  lede: string;
  /** Why there is no feature table, in this page's own words. Held per page
   *  because the reason differs: for a vendor it is an unreachable pricing
   *  page, for a general assistant there is no comparable surface at all. */
  noTableReason: string;
  /** Why this alternative gets considered at all. Written without condescension:
   *  a buyer who is looking at it has a reason, and pretending otherwise reads
   *  as marketing. */
  whyConsidered: string;
  /** The honest case for not choosing us. */
  whenNotUs: string[];
  /** Questions specific to this comparison, on top of the shared checklist. */
  questions: { question: string; why: string; ourAnswer: string }[];
};

/** Asked of any business-plan tool, us included. Rendered on every comparison
 *  page above the page-specific ones, because these are the ones that decide it. */
export const SHARED_QUESTIONS: { question: string; why: string; ourAnswer: string }[] = [
  {
    question: "Does a language model ever write a number that lands in a financial statement?",
    why: "This is the whole question. If prose and figures come from the same generator, nothing downstream can be trusted, and a plausible-sounding number is worse than an obviously wrong one because nobody catches it.",
    ourAnswer:
      "No. The engine is pure TypeScript with no model in it. A model proposes assumptions before the engine runs and describes results after it has run; a test asserts mechanically that every currency figure in generated prose traces to a value the engine computed.",
  },
  {
    question: "Is there a balance sheet, and does it balance in every period?",
    why: "A profit and loss and a cash flow can each look fine while contradicting each other. The balance sheet is what proves they do not — and its absence is the most common structural gap in this category.",
    ourAnswer:
      "Yes, monthly across sixty periods, with the tie row visible in the statements and asserted in every period. A randomised property test runs the engine over generated assumptions and checks it, which is how two real engine defects were found.",
  },
  {
    question: "What happens when you change a price after the plan is written?",
    why: "Every tool claims the numbers and the words cannot drift apart. The thing to test is whether that survives a revision, because that is when it breaks.",
    ourAnswer:
      "Every dependent figure updates — in the statements, the charts, and every sentence citing one — and a version snapshot is taken with a visible diff. Nothing is overwritten without a way back.",
  },
  {
    question: "Does anything block export when the prose contradicts the model?",
    why: "The classic failure is text claiming forty per cent growth against a model showing twelve. It is trivially findable by a reader, which is exactly why it costs so much when they find it.",
    ourAnswer:
      "Yes. Every marked figure in the narrative is extracted and matched against the model, and export stays locked until they reconcile. Twelve checks block and eight advise.",
  },
  {
    question: "Does it compute what a credit analyst computes?",
    why: "Founders submit plans; banks compute ratios. If the ratio is not in the document, the reader works it out using assumptions you did not choose.",
    ourAnswer:
      "Coverage by year against the threshold in force for the programme, the amortisation schedule, current ratio, debt to equity, sources and uses, and owner compensation as a named line. Thresholds are dated configuration with a source and a confidence level, printed beside the figure.",
  },
  {
    question: "Where do the market statistics come from, and do they carry a date?",
    why: "Unsourced market claims are the most commonly cited reason plans get rejected, and AI tools are notorious for citing reports that do not exist.",
    ourAnswer:
      "Live web search, and anything returned without a retrievable http source and an ISO date is dropped — including when the model is confident about it. With research unavailable we return nothing and say why, rather than composing a citation.",
  },
  {
    question: "Does the Excel export contain formulas or pasted values?",
    why: "A banker who wants to audit the model changes a driver and watches what moves. A workbook of pasted values cannot be audited, which is the point at which they go back to asking for a spreadsheet.",
    ourAnswer:
      "Live formulas over a Drivers sheet, so changing a driver recalculates revenue, margin, coverage and the debt schedule. A Filed sheet carries the engine's figures at export with a variance row that reads zero on open — or the workbook and the plan disagree.",
  },
  {
    question: "What does cancelling look like, and what is the refund policy?",
    why: "The reputational damage in this category is almost entirely here rather than in the software. It is worth two minutes before you enter a card.",
    ourAnswer:
      "The core purchase is one-time per plan and does not renew. The optional subscription cancels in one click, runs to the end of the period you paid for, and there is no form asking you to document what was unsatisfactory.",
  },
];

export const COMPARE_PAGES: ComparePage[] = [
  {
    slug: "liveplan",
    competitor: "LivePlan",
    competitorUrl: "https://www.liveplan.com",
    title: "LivePlan alternatives: what to check before you switch",
    query: "liveplan alternative",
    demand: { volume: 4_400, difficulty: 49 },
    lede:
      "We are not going to print a comparison table. What follows is the list of questions we would ask of any business-plan tool, our own answers to them, and a link so you can go and ask the same questions of theirs.",
    noTableReason:
      "We could not reach LivePlan's own pricing and feature pages from the environment this site is built in, so anything we printed about them would be second-hand and undated. Publishing an unverified claim about a competitor would contradict the one rule this whole product rests on.",
    whyConsidered:
      "LivePlan is the established name in this category and has been for a long time. Anybody choosing business-plan software will look at it, and they should — it is a mature product with a large installed base, and for a lot of businesses that is exactly the right answer.",
    whenNotUs: [
      "You want ongoing bookkeeping integration and month-by-month actuals against forecast as the main event. That is a different product shape from ours, and ours is built around producing a document that survives a reader rather than around running your management accounts.",
      "You want the cheapest possible monthly subscription. We are not competing on that and will not pretend to.",
      "You need it in a language other than English today.",
    ],
    questions: [
      {
        question: "Is the financial model driver-built, or is revenue a growth rate?",
        why: "A growth rate is unfalsifiable — there is nothing underneath it to argue about, which means there is nothing to defend either. It is also the single fastest way for a reader to tell that a plan's numbers were typed.",
        ourAnswer:
          "Seven revenue-build patterns, each asking for its own drivers: traffic, conversion and ticket for a shop; seats, price and churn for a subscription; billable hours, utilisation and rate for a service firm. Change one and the whole model responds.",
      },
      {
        question: "Can you get your model out as something a banker can audit?",
        why: "Sooner or later somebody asks for the spreadsheet. What you can hand them decides whether the conversation continues in your document or in theirs.",
        ourAnswer:
          "PDF, Word, PowerPoint and a formula-bearing Excel workbook, all assembled from one document model so they cannot disagree with each other.",
      },
      {
        question: "Is there a version history with a visible diff?",
        why: "Plans get revised under time pressure, and a regeneration that quietly overwrites a section you had already fixed is how errors get reintroduced late.",
        ourAnswer:
          "Every regeneration takes a snapshot with a diff. Nothing is overwritten without a way back.",
      },
    ],
  },

  {
    slug: "upmetrics",
    competitor: "Upmetrics",
    competitorUrl: "https://upmetrics.co",
    title: "Upmetrics alternatives: the questions that decide it",
    query: "upmetrics alternative",
    demand: { volume: 1_000, difficulty: 48 },
    lede:
      "The same approach as our other comparison page: no feature grid, no restating somebody else's pricing second-hand. Our answers, and the questions to take to theirs.",
    noTableReason:
      "Upmetrics' own pricing and feature pages are unreachable from the environment this site is built in. Rather than restate them from aggregator summaries we have not verified, we have written down our own answers and left theirs to them.",
    whyConsidered:
      "Upmetrics turns up early in any search for business-plan software and has a broad template library, which genuinely helps when the hard part is the blank page. If a large set of starting structures is what you are looking for, go and look at it.",
    whenNotUs: [
      "You want the widest possible library of industry templates as the primary feature. We ship fifteen deeply worked sectors rather than several hundred outlines, which is a real trade-off and it will not suit everyone.",
      "You are writing a plan for a class, a competition or an internal exercise where nobody will interrogate the numbers. The machinery we have built is wasted on that, and something lighter will be faster.",
      "You need multi-language output today.",
    ],
    questions: [
      {
        question: "How many industry starting points, and how deep is each one?",
        why: "Template count is the easiest number to advertise and the least informative. What matters is whether the defaults behind a template are real benchmarks with a source and a vintage, or placeholder figures.",
        ourAnswer:
          "Fifteen sectors, each with a published cost structure, benchmark bands carrying their source tier and vintage, and a complete worked model that our own review has to pass before the page can ship.",
      },
      {
        question: "Does the pitch deck read from the model, or is it a second copy?",
        why: "A deck typed alongside the plan is a second copy of the truth, and it goes stale the first time a number changes. Diligence finds the discrepancy.",
        ourAnswer:
          "Generated from the same model, with the consistency checker covering it exactly as it covers the plan. The figure on slide nine is a reference into the model, not text.",
      },
      {
        question: "Is market sizing built from the bottom up, with the arithmetic shown?",
        why: "Taking a published industry total and claiming a percentage of it is the most recognisable pattern in an unfundable market section.",
        ourAnswer:
          "Bottom-up with every step's working printed, cross-checked against a published figure — inadmissible without a dated citation — and against what your own model projects for year three. A model that outruns the market it claims is caught before you send it.",
      },
    ],
  },

  {
    slug: "chatgpt",
    competitor: "a general-purpose AI assistant",
    competitorUrl: "https://www.anthropic.com/claude",
    title: "Writing a business plan with a general AI assistant",
    query: "chatgpt business plan",
    demand: { volume: 2_400, difficulty: 52 },
    lede:
      "A fair question, and the honest answer is that for the writing itself an assistant is genuinely good. What it cannot do is the part that decides whether the plan works.",
    noTableReason:
      "There is nothing here to tabulate. A general assistant has no fixed feature set for a business plan — what it produces depends entirely on what you ask it for, which is both its strength and the reason a comparison grid would be meaningless.",
    whyConsidered:
      "Because it works. Reviewers repeatedly report that a general assistant matches the prose quality of paid business-plan tools, and the writing problem in this category is essentially solved. If what you need is a well-structured draft to think against, you already have the tool.",
    whenNotUs: [
      "You are thinking out loud and want a draft to react to. Start there — it is faster and it is free, and you can bring the thinking here afterwards.",
      "Nobody is going to check the numbers. If the plan is for you and you will not act on its figures, the machinery here is overhead.",
      "You want one conversation that also does everything else in your week.",
    ],
    questions: [
      {
        question: "Where do the numbers in the statements come from?",
        why: "An assistant writing a financial section is generating text that looks like a financial section. The figures are produced by the same process as the adjectives, and the ones that are wrong are wrong in a plausible way.",
        ourAnswer:
          "From a deterministic engine that a model cannot write to. The assistant proposes assumptions; the engine computes; the prose describes what it computed.",
      },
      {
        question: "Do the three statements reconcile with each other?",
        why: "Generated financial tables typically do not. Interest appears on the profit and loss but principal never leaves the cash flow; depreciation reduces profit but net book value never moves. It reads correctly and it does not tie.",
        ourAnswer:
          "Nine roll-forward checks and a balance-sheet assertion in every one of sixty periods, enforced by a randomised property test rather than by review.",
      },
      {
        question: "Are the citations real?",
        why: "This is the well-documented failure mode, and it is the most damaging one here specifically: a fabricated market statistic in a funding application is not a formatting error.",
        ourAnswer:
          "A source is kept only if it comes back with a retrievable http URL and an ISO date, and is dropped otherwise. When research is unavailable we return nothing and say why rather than composing something plausible.",
      },
      {
        question: "What happens when you revise something in month two?",
        why: "A plan lives in a chat thread until the moment it does not. Re-asking for one section produces prose that no longer agrees with the twelve sections you are not re-asking for.",
        ourAnswer:
          "Change a driver and every dependent figure and sentence updates together, with a snapshot and a diff. The consistency checker then refuses to export a document whose words and numbers disagree.",
      },
    ],
  },
];

export function getComparePage(slug: string): ComparePage | undefined {
  return COMPARE_PAGES.find((p) => p.slug === slug);
}
