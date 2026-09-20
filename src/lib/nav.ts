/** Navigation is data, so the header, footer and sitemap can never disagree. */
export type NavLink = { label: string; href: string; blurb?: string };

export const productNav: NavLink[] = [
  { label: "Plan generation", href: "/product/plan", blurb: "A full draft from a structured intake, not a blank prompt." },
  { label: "Financial model", href: "/product/financials", blurb: "Three linked statements, monthly, plus the underwriter's ratios." },
  { label: "Market research", href: "/product/market", blurb: "Sized bottom-up and cited — every claim traceable." },
  { label: "Pitch deck", href: "/product/deck", blurb: "Generated from the plan, so the numbers always match." },
  { label: "Plan review", href: "/product/review", blurb: "Graded against the rubric your reader actually uses." },
];

export const solutionsNav: NavLink[] = [
  { label: "Raising from investors", href: "/solutions/investor-raise", blurb: "Pre-seed and seed: model, deck, cap table." },
  { label: "Immigration plans", href: "/solutions/immigration", blurb: "E-2, L-1A and EB-5 document structure." },
];

/* Everything below points at a route that exists, and a test enforces it. The
   nav used to run ahead of the build — sixteen entries, most of them 404 — on a
   site whose entire positioning is credibility. */
export const resourcesNav: NavLink[] = [
  { label: "Learn", href: "/learn", blurb: "How to write a plan a lender will fund." },
  { label: "Sample plans", href: "/examples", blurb: "Four complete plans, readable end to end." },
  { label: "Free tools", href: "/tools", blurb: "Seven calculators on the real engine." },
  { label: "Industries", href: "/industries", blurb: "Benchmarks and cost structures by sector." },
  { label: "Glossary", href: "/learn/glossary", blurb: "The words on the other side of the table." },
  { label: "Methodology", href: "/learn/methodology", blurb: "Exactly how we compute what we compute." },
];

export const footerNav: { heading: string; links: NavLink[] }[] = [
  { heading: "Product", links: productNav },
  { heading: "Solutions", links: solutionsNav },
  { heading: "Resources", links: resourcesNav },
  {
    heading: "Compare",
    links: [
      { label: "vs LivePlan", href: "/compare/liveplan" },
      { label: "vs Upmetrics", href: "/compare/upmetrics" },
      { label: "vs a general AI", href: "/compare/chatgpt" },
      { label: "All comparisons", href: "/compare" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Security", href: "/security" },
      { label: "Changelog", href: "/changelog" },
      { label: "Contact", href: "/contact" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
];

export const legalNav: NavLink[] = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "DPA", href: "/legal/dpa" },
];
