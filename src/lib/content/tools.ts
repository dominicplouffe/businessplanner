/* ==========================================================================
   Free calculators.
   --------------------------------------------------------------------------
   Seven real tools, ungated. No email wall, no credit meter, no "see your
   result" button that opens a signup form — the category does that and it is
   why nobody links to their calculators.

   Each one runs the product's own code in the browser: the amortisation
   schedule comes from `buildAmortisation`, coverage from the dated SBA config,
   sizing from `computeSizing`, and break-even, unit economics and runway from
   `buildModel` + `computeMetrics`. A calculator that disagreed with the product
   would be worse than not shipping one.

   `demand` records why each page exists. It is not rendered.
   ========================================================================== */

/** Closed on purpose: the route's slug-to-calculator map is a Record over this
 *  union, so adding a tool here without wiring its component fails typecheck
 *  rather than 404ing in production. */
export type ToolSlug =
  | "loan-amortisation"
  | "sba-loan"
  | "tam-sam-som"
  | "dscr"
  | "unit-economics"
  | "break-even"
  | "burn-runway";

export type ToolPage = {
  slug: ToolSlug;
  label: string;
  /** The H1, written as the job rather than the noun. */
  title: string;
  /** The search this page answers, verbatim. */
  query: string;
  demand: { volume: number; difficulty: number };
  lede: string;
  /** Who reaches for this and what they are about to be asked. */
  audience: string;
  /** How the number is actually computed, in plain language. */
  method: string[];
  /** What the tool will not tell you. A calculator with no limits is a toy. */
  limits: string[];
  /** Deep link into the product page that carries this properly. */
  related: { label: string; href: string }[];
};

export const TOOL_PAGES: ToolPage[] = [
  {
    slug: "loan-amortisation",
    label: "Loan amortisation",
    title: "Loan amortisation schedule, month by month",
    query: "loan amortization calculator",
    demand: { volume: 33_100, difficulty: 59 },
    lede: "Every payment split into interest and principal, with interest-only periods and a balloon handled properly. The same schedule the product puts in front of an underwriter.",
    audience:
      "Anyone sizing a term loan — and anyone who has been quoted a monthly payment and wants to know what share of it is actually buying down the debt.",
    method: [
      "The level payment is the spreadsheet PMT: principal × r ÷ (1 − (1 + r)⁻ⁿ), with r the monthly rate.",
      "A balloon is sized against the amortising portion only, so the monthly payment genuinely falls — which is the reason borrowers use one, and getting it wrong overstates coverage.",
      "Interest-only months accrue interest without touching principal, then the amortising payment is recomputed over the months that remain.",
      "The ledger runs at full precision; rounding happens only where the schedule is displayed. Rounding inside it once made principal repayments differ from the amount drawn.",
    ],
    limits: [
      "Fees, points and prepayment penalties are not included. Ask the lender for the APR, not just the rate.",
      "A variable rate is modelled as if it never moves. It will.",
    ],
    related: [
      { label: "The underwriter's view of your model", href: "/product/financials" },
      { label: "Debt service coverage", href: "/tools/dscr" },
    ],
  },
  {
    slug: "sba-loan",
    label: "SBA loan",
    title: "SBA 7(a) payment and eligibility check",
    query: "sba loan calculator",
    demand: { volume: 9_900, difficulty: 55 },
    lede: "The monthly payment, the equity you will be asked to inject, and the coverage ratio the programme expects — read from dated configuration, with the version in force printed beside it.",
    audience:
      "Owners preparing a 7(a) application, and buyers sizing an acquisition against what a lender will actually approve.",
    method: [
      "The programme is derived from the loan size: under the small-loan ceiling it is 7(a) Small, above it 7(a) Standard. Both thresholds are dated configuration, not constants.",
      "Coverage is measured as EBITDA less cash taxes over scheduled debt service, which is the convention most SBA lenders apply to projections.",
      "The equity injection minimum and the coverage threshold each carry an effective-date range, a source and a confidence level, all shown.",
    ],
    limits: [
      "This is not a credit decision and not a pre-qualification. Collateral, credit history, management experience and the global cash flow of the owner all sit outside it.",
      "Values marked unverified are in the product's verification queue and must not be treated as authoritative. SOP 50 10 8.1 takes effect 2026-10-01 and changes acquisition underwriting.",
    ],
    related: [
      { label: "Debt service coverage", href: "/tools/dscr" },
      { label: "Amortisation schedule", href: "/tools/loan-amortisation" },
    ],
  },
  {
    slug: "tam-sam-som",
    label: "TAM, SAM and SOM",
    title: "TAM, SAM and SOM, built from the bottom up",
    query: "tam sam som calculator",
    demand: { volume: 8_100, difficulty: 34 },
    lede: "Count the buyers, price the category, then take the share your capacity can actually serve. The arithmetic is shown line by line, because a share-of-a-large-market claim is the classic unfundable market section.",
    audience:
      "Founders writing a market section, and anyone who has been told their market size is not credible and cannot see why.",
    method: [
      "TAM is the qualified population times what one of them spends in a year. SAM narrows it to what your geography, channel and capacity can reach. SOM is the share of that you expect to hold.",
      "Every step prints its own working, so the result reads as a derivation rather than a number.",
      "The implied customer count comes back out of SOM, which is the figure an operator can check against their own capacity — most impossible market sections fail here first.",
    ],
    limits: [
      "A top-down cross-check needs a dated, retrievable source. In the product an uncited published figure is inadmissible rather than quietly accepted, and this page follows the same rule.",
      "Bottom-up sizing is only as good as the population count. Write down where yours came from.",
    ],
    related: [
      { label: "How market research is sourced", href: "/product/market" },
      { label: "Industry benchmarks", href: "/industries" },
    ],
  },
  {
    slug: "dscr",
    label: "DSCR",
    title: "Debt service coverage ratio calculator",
    query: "dscr calculator",
    demand: { volume: 2_900, difficulty: 47 },
    lede: "The single ratio a credit decision turns on, measured against the threshold in force for the programme you are applying under — with the guidance version printed so a loan officer can verify rather than doubt.",
    audience:
      "Anyone whose plan is going to a bank. Founders submit plans; banks compute ratios, and this is the first one they compute.",
    method: [
      "Coverage is cash available for debt service over scheduled debt service. Cash available here is EBITDA less cash taxes.",
      "The threshold is read from dated configuration for the programme, never hardcoded. Changing the date changes the threshold.",
      "The headroom figure is how far EBITDA could fall before coverage reaches the threshold, which is the question a lender asks next.",
    ],
    limits: [
      "Global cash flow — the owner's personal income and obligations — is assessed alongside this in a real credit file and is not modelled here.",
      "A ratio computed on projections is not a ratio computed on historicals, and lenders weigh them differently.",
    ],
    related: [
      { label: "SBA payment and eligibility", href: "/tools/sba-loan" },
      { label: "The underwriter panel", href: "/product/financials" },
    ],
  },
  {
    slug: "unit-economics",
    label: "Unit economics",
    title: "LTV, CAC and payback on a subscription",
    query: "unit economics calculator",
    demand: { volume: 1_600, difficulty: 38 },
    lede: "Lifetime value on gross margin, not revenue; the ratio to acquisition cost; and how many months of gross profit it takes to get the acquisition cost back.",
    audience:
      "Subscription and membership businesses, and anyone being asked why their LTV:CAC is being disbelieved.",
    method: [
      "Lifetime value is ARPU × gross margin ÷ monthly churn. Computing it on revenue rather than margin is the most common way the figure gets inflated.",
      "Payback is acquisition cost over monthly gross profit per customer — the months before the customer has repaid what it cost to win them.",
      "The figures come from the product's own metrics module, run over a model built from these inputs.",
    ],
    limits: [
      "A churn rate taken from a few months of data is an estimate, and LTV divides by it — small errors there move the answer a long way.",
      "Blended acquisition cost hides the difference between paid and organic. Investors will ask for both.",
    ],
    related: [
      { label: "Break-even", href: "/tools/break-even" },
      { label: "Cash burn and runway", href: "/tools/burn-runway" },
    ],
  },
  {
    slug: "break-even",
    label: "Break-even",
    title: "Break-even point, in units and in revenue",
    query: "break even calculator",
    demand: { volume: 720, difficulty: 26 },
    lede: "How much you have to sell before the business covers its fixed costs — computed on contribution margin, and on cash as well as on paper.",
    audience:
      "Anyone pricing for the first time, and anyone whose plan has been asked when it stops losing money.",
    method: [
      "Contribution per unit is price less variable cost. Break-even units are fixed costs over that; break-even revenue is fixed costs over the contribution margin ratio.",
      "The model is run for sixty months, so the month operating profit first turns positive is a result rather than an assertion.",
      "Fixed costs here include owner compensation. A break-even that pays the owner nothing is not a break-even.",
    ],
    limits: [
      "Break-even on paper and break-even on cash are different dates when you carry receivables or stock. The product models both.",
      "A single blended price hides a mix. If two products have different margins, the answer is a range.",
    ],
    related: [
      { label: "Unit economics", href: "/tools/unit-economics" },
      { label: "Industry cost structures", href: "/industries" },
    ],
  },
  {
    slug: "burn-runway",
    label: "Burn and runway",
    title: "Cash burn and runway calculator",
    query: "burn rate calculator",
    demand: { volume: 320, difficulty: 44 },
    lede: "Gross burn, net burn, and the month the cash runs out — with the date named rather than left as a number of months to count on your fingers.",
    audience:
      "Pre-revenue and early-revenue companies, and anyone about to be asked how long their runway is by someone who will check.",
    method: [
      "Gross burn is everything going out. Net burn is that less what comes in, which is the figure runway is computed on.",
      "Runway is closing cash over net burn, recomputed each month as revenue grows rather than held flat.",
      "The model is run through the engine, so the cash-out month accounts for the revenue ramp rather than assuming today's burn forever.",
    ],
    limits: [
      "Runway assumes the plan holds. The point of a downside scenario is to find out what happens when it does not.",
      "Raising takes months. Most advice is to start when six months remain, not when the runway ends.",
    ],
    related: [
      { label: "Break-even", href: "/tools/break-even" },
      { label: "Scenarios and sensitivity", href: "/product/financials" },
    ],
  },
];

export function getToolPage(slug: string): ToolPage | undefined {
  return TOOL_PAGES.find((t) => t.slug === slug);
}

/** Most searched first — the order they were worth building in. */
export function toolsByDemand(): ToolPage[] {
  return [...TOOL_PAGES].sort((a, b) => b.demand.volume - a.demand.volume);
}
