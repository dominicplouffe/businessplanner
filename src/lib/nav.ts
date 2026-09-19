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

export const resourcesNav: NavLink[] = [
  { label: "Learn", href: "/learn", blurb: "How to write a plan a lender will fund." },
  { label: "Free tools", href: "/tools", blurb: "Six calculators on the real engine." },
  { label: "Examples", href: "/examples", blurb: "Complete plans, readable end to end." },
  { label: "Industries", href: "/industries", blurb: "Benchmarks and cost structures by sector." },
  { label: "Methodology", href: "/learn/methodology", blurb: "Exactly how we compute what we compute." },
];

export const footerNav: { heading: string; links: NavLink[] }[] = [
  { heading: "Product", links: productNav },
  { heading: "Solutions", links: solutionsNav },
  { heading: "Resources", links: resourcesNav },
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
