/** Home page content as data, so copy edits never touch layout. */

export const differentiators = [
  {
    key: "underwriter",
    eyebrow: "Underwriter math",
    title: "The ratios a credit analyst computes, computed first",
    body: "Founders submit plans; banks compute ratios. Venturally renders the lender's own arithmetic — debt service coverage, the amortisation schedule, coverage against the threshold in force, working-capital cycle — and tells you where you stand before an underwriter works it out for you.",
    proof: "DSCR, coverage, current ratio, debt-to-equity, owner compensation by year.",
  },
  {
    key: "sources",
    eyebrow: "Citation-grade research",
    title: "Every market claim carries a dated, retrievable source",
    body: "The most commonly cited reason plans get rejected is unsourced market claims — and AI tools are notorious for inventing statistics and citing reports that do not exist. Every figure we put in a market section is footnoted and dated, and the plan exports with a sources appendix.",
    proof: "Zero uncited claims, or the plan does not export.",
  },
  {
    key: "consistency",
    eyebrow: "Consistency engine",
    title: "The prose cannot contradict the model",
    body: "The classic tell: the narrative claims 40% growth while the model says 12%, or the text mentions eight employees and payroll carries five. We diff every figure in the written plan against the financial model and hold export until they agree. Change a price, and every dependent number and every sentence that cites one updates together — with a version history and a visible diff.",
    proof: "Reconciled on export. No silent drift, and nothing overwritten without a snapshot.",
  },
  {
    key: "review",
    eyebrow: "Plan review",
    title: "Graded against the rubric your reader actually uses",
    body: "Before you send it, the plan is scored against the criteria a lender, an investor or an adjudicator applies — with a severity-ranked redline and a queue of specific fixes. You can also bring a plan you wrote elsewhere and have it graded.",
    proof: "Twelve blocking checks, eight advisory. Each finding names the remedy.",
  },
  {
    key: "resilience",
    eyebrow: "AI-disruption resilience",
    title: "The question lenders started asking this year",
    body: "Since early 2026, lenders have been asking small-business borrowers how AI could reshape their industry over the life of a ten-year loan — and declining businesses that look automatable. No other planning tool addresses it. We ship a structured module: task-level exposure, your moat, and an adoption roadmap.",
    proof: "A section your reader is looking for and your competitors' plans do not have.",
  },
] as const;

export const engineFacts = [
  { label: "Linked statements", value: "3", detail: "P&L, cash flow and balance sheet that actually tie" },
  { label: "Monthly periods", value: "60", detail: "Monthly detail throughout, not annual summaries" },
  { label: "Revenue models", value: "7", detail: "Driver builds, from footfall to take rate" },
  { label: "Validation checks", value: "20", detail: "Twelve of them block export" },
] as const;

export const faqItems = [
  {
    q: "How is this different from asking ChatGPT to write a business plan?",
    a: "A general model writes plausible prose and invents the numbers. Here the financial model is a deterministic engine — the AI proposes assumptions, the engine computes every figure in every statement, and the narrative is then written around what the engine produced and checked against it. That is why the balance sheet ties and the growth rate in the text matches the model.",
  },
  {
    q: "Are the financials real, or illustrative?",
    a: "Real. Three linked statements with monthly detail across five years, built from drivers you control — volume, price, churn, utilisation, headcount — plus loan amortisation, depreciation, working capital and tax. The balance sheet is asserted to balance in every single period, and the export is blocked if it does not.",
  },
  {
    q: "Will a bank or the SBA accept the output?",
    a: "The model produces what a lender asks for: monthly detail for year one, five-year projections, a debt schedule, sources and uses, and debt service coverage measured against the threshold in force for the programme. We also print which version of the guidance we assumed, so a loan officer can verify rather than doubt. We are not a lender and cannot promise an approval — but the arithmetic will not be the reason you are declined.",
  },
  {
    q: "What happens to my numbers if I change one assumption later?",
    a: "Everything downstream updates — the statements, the charts, the ratios, and every sentence in the written plan that cites an affected figure. Each regeneration takes a version snapshot with a diff, so nothing is overwritten silently and you can always go back.",
  },
  {
    q: "Do you support immigration business plans?",
    a: "Yes — E-2, L-1A and EB-5 document structures, with the fields those tests actually turn on: owner compensation as a named line, household size for the marginality assessment, and a cost-of-enterprise denominator for proportionality. Venturally is a document-preparation tool, not a law firm: every immigration plan should be reviewed by licensed counsel before filing.",
  },
  {
    q: "What does it cost, and can I see it before I pay?",
    a: "Generate a complete plan and read every page for free, with no card and no watermark on screen. Unlocking export and sharing for a finished plan is $199, once, and it is yours permanently. Keeping the plan live — tracking actuals, re-forecasting, generating lender updates — is $39 a month, cancellable in one click. Thirty-day money-back guarantee, and we do not make you justify it.",
  },
] as const;
