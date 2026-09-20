/**
 * The document's section list.
 *
 * Pure data, deliberately not inside `lib/plans.ts` — that module is
 * server-only, and the section list is needed by client components, the
 * section rail and the tests.
 */
export const PLAN_SECTIONS = [
  { key: "executive-summary", title: "Executive summary" },
  { key: "company", title: "Company description" },
  { key: "products", title: "Products and services" },
  { key: "market", title: "Market analysis" },
  { key: "competition", title: "Competitive landscape" },
  { key: "marketing", title: "Marketing and sales" },
  { key: "operations", title: "Operations" },
  { key: "team", title: "Team and management" },
  { key: "regulations", title: "Applicable regulations" },
  { key: "risks", title: "Risks and mitigations" },
  { key: "ai-resilience", title: "AI disruption resilience" },
  { key: "financials", title: "Financial plan" },
  { key: "next-steps", title: "Suggested next steps" },
] as const;

export type PlanSectionKey = (typeof PLAN_SECTIONS)[number]["key"];
