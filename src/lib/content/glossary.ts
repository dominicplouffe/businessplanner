/* ==========================================================================
   Glossary.
   --------------------------------------------------------------------------
   The vocabulary a lender, an investor or an adjudicator uses, defined the way
   they use it rather than the way a textbook does. Where a term is something
   the product computes, the entry links to the calculator that computes it —
   a definition you can immediately run on your own numbers is worth more than
   a definition you have to translate.

   `trap` is the field that earns this page its place. Every one of these has a
   way of being got subtly wrong, and the wrong version is usually the one that
   ends up in a plan.
   ========================================================================== */

export type GlossaryTerm = {
  term: string;
  /** Alternative spellings and abbreviations, for the on-page filter. */
  also?: string[];
  category: "financing" | "statements" | "growth" | "market" | "process";
  definition: string;
  /** How it goes wrong. Optional, but most of them have one. */
  trap?: string;
  link?: { label: string; href: string };
};

export const GLOSSARY_CATEGORIES = [
  { key: "financing", label: "Debt and financing" },
  { key: "statements", label: "The statements" },
  { key: "growth", label: "Growth and unit economics" },
  { key: "market", label: "Market and competition" },
  { key: "process", label: "How plans get read" },
] as const;

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  /* ---- Debt and financing ---------------------------------------------- */
  {
    term: "Debt service coverage ratio",
    also: ["DSCR"],
    category: "financing",
    definition:
      "Cash available for debt service divided by scheduled debt service, usually measured annually. For projections most SBA lenders take cash available as EBITDA less cash taxes. It is the single number a credit decision turns on.",
    trap:
      "Computing it before owner compensation. A ratio that clears the threshold only because nobody is paid is not a ratio that clears the threshold.",
    link: { label: "Coverage calculator", href: "/tools/dscr" },
  },
  {
    term: "Amortisation schedule",
    category: "financing",
    definition:
      "The month-by-month split of each loan payment into interest and principal. Early payments are mostly interest; the crossover point is later than most people expect.",
    trap:
      "Rounding inside the schedule. Round each row and the principal repaid stops equalling the amount borrowed, which quietly breaks the balance sheet.",
    link: { label: "Amortisation calculator", href: "/tools/loan-amortisation" },
  },
  {
    term: "Balloon payment",
    category: "financing",
    definition:
      "A large final payment at maturity, with the monthly payments sized against only the portion of principal that actually amortises. It is why a balloon loan costs less each month.",
    trap:
      "Treating the balloon as somebody else's problem. A lender will ask how it gets refinanced or repaid, and the answer belongs in the plan.",
  },
  {
    term: "Interest-only period",
    category: "financing",
    definition:
      "Months at the start of a loan where payments cover interest and touch no principal. Common on construction and start-up facilities.",
    trap:
      "Sizing coverage against an interest-only year. It flatters the ratio; the year a lender actually sizes against is the first fully amortising one.",
  },
  {
    term: "Equity injection",
    category: "financing",
    definition:
      "The cash the borrower puts into a project themselves, expressed as a share of total project cost. SBA programmes set a minimum, and it is dated configuration rather than a fixed number.",
    trap:
      "Counting borrowed money as injection. Funds borrowed against the business generally do not qualify.",
    link: { label: "SBA calculator", href: "/tools/sba-loan" },
  },
  {
    term: "Global cash flow",
    category: "financing",
    definition:
      "The combined cash flow of the business and its owner, including personal income and personal obligations. Banks underwrite small-business credit on it, not on the business alone.",
    trap:
      "Assuming a strong business ratio is sufficient. Personal debt can sink an application whose business coverage looks comfortable.",
  },
  {
    term: "Sources and uses",
    category: "financing",
    definition:
      "A two-column table showing where every dollar of funding comes from and what each dollar buys. The two columns must total the same figure.",
    trap:
      "Omitting the soft costs — licences, deposits, professional fees and the working capital to survive the ramp. They are the usual reason a project costs more than the table says.",
  },

  /* ---- The statements --------------------------------------------------- */
  {
    term: "EBITDA",
    category: "statements",
    definition:
      "Earnings before interest, tax, depreciation and amortisation. A proxy for operating cash generation, and the starting point for most coverage calculations.",
    trap:
      "Reading it as cash. It excludes working capital movements, capital expenditure and principal repayments, all of which are real money leaving the account.",
  },
  {
    term: "Gross margin",
    category: "statements",
    definition:
      "Revenue less the cost of what you sold, as a percentage. What counts as cost of sales varies by industry, which matters more than it sounds.",
    trap:
      "Comparing against a published band quoted on a different basis. A restaurant's band is food cost alone; a cleaning contractor's is quoted after the cleaners' wages. Compare the wrong pair and a healthy business reads as failing.",
    link: { label: "Bands by industry", href: "/industries" },
  },
  {
    term: "Contribution margin",
    category: "statements",
    definition:
      "Price less variable cost, per unit or as a ratio. What each additional sale contributes toward covering fixed costs.",
    trap:
      "Including a fixed cost in the variable figure. Rent does not rise with the next sale, and putting it here makes break-even look unreachable.",
    link: { label: "Break-even calculator", href: "/tools/break-even" },
  },
  {
    term: "Working capital",
    category: "statements",
    definition:
      "The cash tied up in running the business day to day: money owed to you, stock on the shelf, less money you owe suppliers. Growth consumes it.",
    trap:
      "Modelling growth without it. Collecting in sixty days while paying in thirty means the faster you grow, the less cash you have — which is how profitable businesses fail.",
  },
  {
    term: "Roll-forward",
    category: "statements",
    definition:
      "The check that each balance-sheet line moves from its opening to its closing value by exactly the flows the other statements report. Nine of these together are what make three statements one model.",
    trap:
      "Clamping a balance to zero to make it look sensible. The clamp hides the inconsistency the check exists to find.",
  },
  {
    term: "Flow and stock",
    category: "statements",
    definition:
      "A flow happens over a period — revenue, interest, wages. A stock exists at a point in time — cash, debt, inventory. The annual view of a flow is the year's sum; the annual view of a stock is the closing balance.",
    trap:
      "Summing a stock. It overstates the figure roughly twelvefold and the statements still balance, so nothing downstream catches it.",
  },
  {
    term: "Owner compensation",
    category: "statements",
    definition:
      "A named, visible line paying the person running the business. Distinct from distributions or draws.",
    trap:
      "Showing zero to make the numbers work. A lender substitutes a market salary and recomputes; an immigration adjudicator reads it as a business that does not support the applicant.",
  },
  {
    term: "Break-even",
    category: "statements",
    definition:
      "The point at which revenue covers costs. There are two dates: the month operating profit first turns positive, and the month cash stops going down. They are rarely the same month.",
    trap:
      "Quoting only the profit date. The cash date is the one that determines how much funding you actually need.",
    link: { label: "Break-even calculator", href: "/tools/break-even" },
  },

  /* ---- Growth and unit economics ---------------------------------------- */
  {
    term: "Customer acquisition cost",
    also: ["CAC"],
    category: "growth",
    definition:
      "Everything spent to win one customer — advertising, sales salaries, commissions — divided by the customers won.",
    trap:
      "Blending paid and organic into one figure. It hides whether the paid channel works, which is the only part an investor is really asking about.",
    link: { label: "Unit economics calculator", href: "/tools/unit-economics" },
  },
  {
    term: "Lifetime value",
    also: ["LTV", "CLV"],
    category: "growth",
    definition:
      "The gross profit a customer generates over their whole relationship with you. Average revenue per customer, times gross margin, divided by monthly churn.",
    trap:
      "Computing it on revenue instead of margin. It is the most common way the figure gets inflated, often threefold.",
    link: { label: "Unit economics calculator", href: "/tools/unit-economics" },
  },
  {
    term: "Payback period",
    category: "growth",
    definition:
      "How many months of gross profit it takes to recover what a customer cost to acquire. Under twelve months is the shape investors look for.",
    trap:
      "Measuring it in months of revenue. Revenue is not yours to keep; the gross profit is.",
  },
  {
    term: "Churn",
    category: "growth",
    definition:
      "The share of customers who leave in a period. Lifetime value divides by it, so it has outsized influence on everything downstream.",
    trap:
      "Quoting a rate measured over two months as though it were stable. Say whether it is measured or estimated — investors ask, and the honest answer costs less than the discovered one.",
  },
  {
    term: "Burn and runway",
    category: "growth",
    definition:
      "Gross burn is everything going out. Net burn is that less what comes in. Runway is cash divided by net burn — the months before you need more money.",
    trap:
      "Computing net burn from a month where the bills had not been paid yet. Trade credit can make a burning business look cash-positive for exactly one month.",
    link: { label: "Burn and runway calculator", href: "/tools/burn-runway" },
  },
  {
    term: "Utilisation",
    category: "growth",
    definition:
      "For a service business, the share of available hours that are actually billed. The lever that usually decides whether the margin is real.",
    trap:
      "Modelling a utilisation the team has never hit. Below about sixty per cent, most professional-services models stop supporting the margin they claim.",
  },

  /* ---- Market and competition ------------------------------------------- */
  {
    term: "TAM, SAM and SOM",
    category: "market",
    definition:
      "Total addressable market, the part of it you can serve, and the part of that you expect to hold. Built from the bottom up: how many buyers, times what they spend, narrowed twice.",
    trap:
      "Starting from a published industry total and claiming a percentage. It is the single most recognisable pattern in an unfundable market section.",
    link: { label: "Market sizing calculator", href: "/tools/tam-sam-som" },
  },
  {
    term: "Bottom-up sizing",
    category: "market",
    definition:
      "Building the market from countable units — households in a catchment, businesses in a sector, seats in a room — rather than dividing a published total.",
    trap:
      "Not checking the implied customer count against your own capacity. If the obtainable share implies more customers than you could physically serve, the sizing is wrong.",
  },
  {
    term: "Top-down cross-check",
    category: "market",
    definition:
      "Comparing a bottom-up build against a published market figure. Useful as a sanity check, not as a primary method.",
    trap:
      "Using an uncited figure. A published number with no retrievable, dated source is inadmissible — and if the two methods diverge more than about threefold, one of them is wrong.",
  },
  {
    term: "Dated evidence",
    category: "market",
    definition:
      "A claim with a publisher, a retrievable link and the date it was observed. A competitor price without a date is not evidence, because prices move.",
    trap:
      "Citing from memory. AI-written plans are now notorious for citing reports that do not exist, which means every uncited claim in your plan is read with that in mind.",
  },
  {
    term: "Prime cost",
    category: "market",
    definition:
      "In hospitality, food and beverage cost plus labour cost, as a share of revenue. The industry's standard single-number health check.",
    trap:
      "Reading it against a gross-margin band. They are different measures on different bases; above roughly sixty-five per cent prime cost is the conventional red flag.",
    link: { label: "Restaurant benchmarks", href: "/industries/restaurant" },
  },

  /* ---- How plans get read ------------------------------------------------ */
  {
    term: "Provenance",
    category: "process",
    definition:
      "Where each assumption came from: something the owner knows, something they estimated, or an industry default. Tagged at intake and printed in the finished document.",
    trap:
      "Flattening all three into confident prose. A plan that distinguishes them is more credible, not less.",
  },
  {
    term: "Consistency check",
    category: "process",
    definition:
      "Diffing every figure in the narrative against the model behind it. The text saying forty per cent growth while the model says twelve is the classic failure, and it is trivially findable.",
    trap:
      "Assuming it cannot happen to you. It happens because the prose is written once and the model is revised four times.",
    link: { label: "How the review works", href: "/product/review" },
  },
  {
    term: "Sensitivity analysis",
    category: "process",
    definition:
      "Moving one assumption at a time and ranking which ones actually change the outcome. Usually drawn as a tornado chart, widest bar at the top.",
    trap:
      "Skipping it because the model already has scenarios. Scenarios tell you what happens; sensitivity tells you which assumption to go and verify first.",
  },
  {
    term: "Downside scenario",
    category: "process",
    definition:
      "A coherent worse case: demand, pricing, timing and spend all moving together, with genuinely committed costs like the lease held fixed.",
    trap:
      "Cutting revenue while holding the hiring plan constant. That is arithmetic, not a scenario, and a reader recognises it immediately.",
  },
  {
    term: "Marginality",
    category: "process",
    definition:
      "For an E-2 filing, the test of whether the business will generate more than a minimal living for the investor and their family. It is a financial question with financial inputs.",
    trap:
      "Treating it as a narrative section. It needs owner compensation as a visible line and household size as an actual field.",
    link: { label: "Immigration document structure", href: "/solutions/immigration" },
  },
  {
    term: "Config vintage",
    category: "process",
    definition:
      "The date and version of the regulatory values a plan was computed against, printed in the document so a reader can verify rather than assume.",
    trap:
      "Hardcoding a threshold. Guidance changes on published schedules, and a hardcoded figure ships a wrong answer without anybody noticing.",
    link: { label: "The verification queue", href: "/learn/methodology" },
  },
];

export function termsByCategory(): {
  key: GlossaryTerm["category"];
  label: string;
  terms: GlossaryTerm[];
}[] {
  return GLOSSARY_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    terms: GLOSSARY_TERMS.filter((t) => t.category === category.key),
  }));
}

/** A stable anchor for deep links into a definition. */
export function termAnchor(term: GlossaryTerm): string {
  return term.term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
