import type { FinancialModel } from "@/lib/finance/engine";
import type { Metrics } from "@/lib/finance/metrics";
import type { Assumptions } from "@/lib/finance/types";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { computeSizing, MarketSizingSchema, type MarketSizingInput } from "@/lib/market/sizing";
import { assessResilience, ResilienceSchema, type ResilienceInput } from "@/lib/market/resilience";

/* ==========================================================================
   Narrative ↔ model consistency.
   --------------------------------------------------------------------------
   The classic killer: the prose says "40% year-on-year growth" while the model
   says 12%, or the text describes eight employees while payroll carries five.
   Every reader who has ever rejected a plan lists this first, and no product in
   the category checks it.

   So: pull every figure out of the written sections, and reconcile each one
   against an index of what the engine actually computed. A figure that matches
   nothing is reported with the nearest value the model does hold, because
   "you wrote $640,000, the model says $623,247" is actionable and "inconsistent"
   is not.

   Two deliberate limits keep this from crying wolf, which would be worse than
   not checking at all:

     • Only figures carrying an explicit marker are checked — a currency symbol,
       a percent sign, a multiplication sign, or a headcount noun. A bare number
       in prose is usually a year, a street number or a list position, and
       chasing those produces noise that trains people to ignore the report.

     • Tolerance comes from how precisely the figure was written. "$623.2K" was
       rounded to the nearest hundred, so it matches anything within fifty of
       the model's value; "$623,247" must be exact. This is what lets the check
       accept legitimate compact notation without accepting a fabrication.
   ========================================================================== */

export type FigureKind = "currency" | "percent" | "multiple" | "headcount";

export type ExtractedFigure = {
  /** As it appears in the prose, e.g. "$623.2K". */
  raw: string;
  /** Parsed to the model's own units: dollars, a proportion, a ratio, a headcount. */
  value: number;
  kind: FigureKind;
  /** How far the written form may legitimately sit from the model value. */
  tolerance: number;
  /** Character offset in the section text. */
  index: number;
  /** Surrounding words, so a finding can be located without a line number. */
  context: string;
};

export type ModelValue = {
  value: number;
  kind: FigureKind;
  /** How a person would name it: "Year 2 revenue", "minimum coverage". */
  label: string;
};

export type ConsistencyFinding = {
  sectionKey: string;
  sectionTitle: string;
  figure: ExtractedFigure;
  /** The closest thing the model holds, when one is close enough to name. */
  nearest?: { label: string; value: number };
};

export type ConsistencyReport = {
  findings: ConsistencyFinding[];
  /** Figures that did trace to a computed value. */
  reconciledCount: number;
  /** Figures that are not the model's but are carried by a cited source. */
  sourcedCount: number;
  /** Every figure examined, reconciled or not. */
  checkedCount: number;
  /** Sections that carried no prose yet, so were not checked. */
  skippedSections: string[];
};

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

// Deliberately excludes "people" and "persons": a retail model counts people
// through the door, and treating footfall as headcount is exactly the kind of
// false positive that teaches someone to stop reading the report.
const HEADCOUNT_NOUNS =
  "employees?|staff|hires?|jobs?|roles?|positions?|" +
  "headcount|team members?|full-time equivalents?|FTEs?";

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/**
 * Half the rounding step the written form implies.
 *
 * "$1.2M" carries one decimal on a millions scale, so it stands for anything
 * between 1.15M and 1.25M; "31%" stands for 30.5% to 31.5%. Deriving the
 * tolerance rather than fixing it is what makes compact notation safe to allow.
 */
function toleranceFor(numeric: string, scale: number): number {
  const decimals = numeric.includes(".") ? (numeric.split(".")[1]?.length ?? 0) : 0;
  const step = scale * Math.pow(10, -decimals);
  return step / 2 + 1e-9;
}

/** Snaps to word boundaries: a quote that opens mid-word ("…y the end of") is
 *  harder to find in the document than one that opens on a word. */
function contextAround(text: string, index: number, length: number): string {
  let start = Math.max(0, index - 45);
  let end = Math.min(text.length, index + length + 45);
  if (start > 0) {
    const boundary = text.indexOf(" ", start);
    if (boundary !== -1 && boundary < index) start = boundary + 1;
  }
  if (end < text.length) {
    const boundary = text.lastIndexOf(" ", end);
    if (boundary > index + length) end = boundary;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${
    end < text.length ? "…" : ""
  }`;
}

export function extractFigures(text: string): ExtractedFigure[] {
  const figures: ExtractedFigure[] = [];

  const push = (raw: string, value: number, kind: FigureKind, tolerance: number, index: number) => {
    figures.push({ raw, value, kind, tolerance, index, context: contextAround(text, index, raw.length) });
  };

  // Currency, including compact suffixes and the accounting parenthesis.
  // The suffix must not be the first letter of the next word: "$927,834 by
  // year three" is not 927,834 billion. The negative lookahead makes the
  // optional group backtrack out rather than swallow the "b" of "by".
  const currency = /(?<![\w.])\(?-?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?([KMB](?![\w])))?\)?/gi;
  for (const match of text.matchAll(currency)) {
    const numeric = (match[1] ?? "").replace(/,/g, "");
    const suffix = (match[2] ?? "").toUpperCase();
    const scale = suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
    const value = Number(numeric) * scale;
    if (!Number.isFinite(value)) continue;
    push(match[0], value, "currency", toleranceFor(numeric, scale), match.index);
  }

  // Percentages, stored as proportions so they compare with engine rates.
  for (const match of text.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)\s?%/g)) {
    const numeric = match[1] ?? "";
    push(match[0], Number(numeric) / 100, "percent", toleranceFor(numeric, 1) / 100, match.index);
  }

  // Multiples: "1.15×" or "3.4x", but never the x inside "10x12".
  for (const match of text.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)\s?[×x](?![\w])/g)) {
    const numeric = match[1] ?? "";
    push(match[0], Number(numeric), "multiple", toleranceFor(numeric, 1), match.index);
  }

  // Headcount, the one bare-number case worth checking: it is the documented
  // failure mode (text says eight staff, payroll carries five) and it is what
  // an E-2 or EB-5 adjudicator counts.
  const counts = new RegExp(
    `(?<![\\w.])(\\d{1,4}|${Object.keys(WORD_NUMBERS).join("|")})\\s+(?:${HEADCOUNT_NOUNS})\\b`,
    "gi",
  );
  for (const match of text.matchAll(counts)) {
    const token = (match[1] ?? "").toLowerCase();
    const value = WORD_NUMBERS[token] ?? Number(token);
    if (!Number.isFinite(value)) continue;
    push(match[0], value, "headcount", 0.5, match.index);
  }

  return figures.sort((a, b) => a.index - b.index);
}

/* -------------------------------------------------------------------------- */
/* The index of what the engine computed                                      */
/* -------------------------------------------------------------------------- */

export function buildModelIndex(
  model: FinancialModel,
  metrics: Metrics,
  assumptions: Assumptions,
): ModelValue[] {
  const values: ModelValue[] = [];
  const add = (value: number | null | undefined, kind: FigureKind, label: string) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    values.push({ value, kind, label });
  };

  add(0, "currency", "zero");

  for (const year of model.annual) {
    const y = year.label;
    add(year.revenue, "currency", `${y} revenue`);
    add(year.cogs, "currency", `${y} cost of sales`);
    add(year.grossProfit, "currency", `${y} gross profit`);
    add(year.totalOpex, "currency", `${y} operating expenses`);
    add(year.ownerCompensation, "currency", `${y} owner compensation`);
    add(year.ebitda, "currency", `${y} EBITDA`);
    add(year.depreciation, "currency", `${y} depreciation`);
    add(year.interest, "currency", `${y} interest`);
    add(year.tax, "currency", `${y} tax`);
    add(year.netIncome, "currency", `${y} net income`);
    add(year.operatingCashFlow, "currency", `${y} operating cash flow`);
    add(year.closingCash, "currency", `${y} closing cash`);
    add(year.closingDebt, "currency", `${y} closing debt`);
    add(year.debtService, "currency", `${y} debt service`);
  }

  add(metrics.breakEven.monthlyRevenueRequired, "currency", "monthly revenue at break-even");
  add(metrics.breakEven.averageMonthlyFixedCosts, "currency", "average monthly fixed costs");
  add(metrics.breakEven.contributionMarginRatio, "percent", "contribution margin");
  add(metrics.cash.lowestCash, "currency", "lowest cash balance");
  add(metrics.cash.peakFundingNeed, "currency", "peak funding need");
  add(metrics.cash.averageNetBurn, "currency", "average net burn");
  add(metrics.cash.grossBurnLastMonth, "currency", "gross burn, final month");

  add(metrics.unitEconomics.grossMargin, "percent", "gross margin");
  add(metrics.unitEconomics.monthlyChurnRate, "percent", "monthly churn");
  add(metrics.unitEconomics.customerAcquisitionCost, "currency", "customer acquisition cost");
  add(metrics.unitEconomics.averageRevenuePerCustomerPerMonth, "currency", "revenue per customer per month");
  add(metrics.unitEconomics.lifetimeValue, "currency", "customer lifetime value");
  add(metrics.unitEconomics.ltvToCac, "multiple", "LTV to CAC");

  add(metrics.underwriter.minimumDscr, "multiple", "minimum debt service coverage");
  add(metrics.underwriter.dscrFirstFullYear, "multiple", "coverage, first full year");
  for (const row of metrics.underwriter.dscrByYear) {
    add(row.dscr, "multiple", `Year ${row.year} coverage`);
    add(row.cashAvailable, "currency", `Year ${row.year} cash available for debt service`);
    add(row.debtService, "currency", `Year ${row.year} debt service`);
  }
  for (const row of metrics.underwriter.currentRatioByYear) {
    add(row.ratio, "multiple", `Year ${row.year} current ratio`);
  }
  for (const row of metrics.underwriter.debtToEquityByYear) {
    add(row.ratio, "multiple", `Year ${row.year} debt to equity`);
  }
  for (const row of metrics.underwriter.ownerCompensationByYear) {
    add(row.amount, "currency", `Year ${row.year} owner compensation`);
  }
  for (const row of metrics.revenueGrowthByYear) {
    add(row.growth, "percent", `Year ${row.year} revenue growth`);
  }
  for (const row of metrics.grossMarginByYear) {
    add(row.margin, "percent", `Year ${row.year} gross margin`);
  }
  for (const row of metrics.netMarginByYear) {
    add(row.margin, "percent", `Year ${row.year} net margin`);
  }

  /* ---- Inputs the owner gave us, which prose legitimately restates -------- */

  for (const role of assumptions.roles) {
    add(role.annualSalary, "currency", `${role.title} salary`);
    add(role.count, "headcount", `${role.title} headcount`);
  }
  const headcount = assumptions.roles.reduce((sum, r) => sum + r.count, 0);
  add(headcount, "headcount", "total headcount");
  add(assumptions.roles.filter((r) => !r.isOwner).reduce((sum, r) => sum + r.count, 0), "headcount", "headcount excluding the owner");

  for (const loan of assumptions.loans) {
    add(loan.principal, "currency", `${loan.name} principal`);
    add(loan.annualRate, "percent", `${loan.name} rate`);
    add(loan.balloonPayment, "currency", `${loan.name} balloon`);
  }
  for (const round of assumptions.equityRounds) add(round.amount, "currency", round.name);
  for (const grant of assumptions.grants) add(grant.amount, "currency", grant.name);
  for (const item of assumptions.capex) add(item.amount, "currency", item.name);
  for (const item of assumptions.opex) {
    add(item.monthlyAmount, "currency", `${item.name}, monthly`);
    add(item.monthlyAmount * 12, "currency", `${item.name}, annual`);
    add(item.percentOfRevenue, "percent", `${item.name}, share of revenue`);
    add(item.annualGrowthRate, "percent", `${item.name}, annual growth`);
  }
  for (const stream of assumptions.revenueStreams) {
    for (const [key, value] of Object.entries(stream)) {
      if (typeof value !== "number") continue;
      // Only the drivers that can appear in prose as a marked figure. A raw
      // count like "210 covers a day" is not extractable, so indexing it would
      // do nothing but widen the pool a real claim could wrongly match.
      // Currency is tested first, because `hourlyRate` is money and would
      // otherwise be caught by the `rate` pattern and indexed as 18,500% —
      // which left a consulting plan's own rate card reported as fabricated.
      const kind: FigureKind | null = /price|ticket|cost|value|gmv|cpm|revenue|fee|hourlyrate/i.test(key)
        ? "currency"
        : /rate|percent|utilisation|share|margin|churn/i.test(key)
          ? "percent"
          : null;
      if (kind) add(value, kind, `${stream.name}: ${humaniseKey(key)}`);
    }
  }

  // Everything the facts block licenses the generator to use has to be in the
  // index, or the check reports the generator's own honest citations as
  // fabrications. Benchmarks and payroll loading are supplied to it as data.
  const benchmark = getBenchmark(assumptions.company.industryKey);
  for (const [name, band] of [
    ["gross margin", benchmark.grossMargin],
    ["net margin", benchmark.netMargin],
    ["payroll ratio", benchmark.payrollRatio],
    ...(benchmark.occupancyRatio ? ([["occupancy ratio", benchmark.occupancyRatio]] as const) : []),
  ] as const) {
    add(band.low, "percent", `industry ${name}, low`);
    add(band.median, "percent", `industry ${name}, median`);
    add(band.high, "percent", `industry ${name}, high`);
  }
  if (benchmark.revenuePerEmployee) {
    add(benchmark.revenuePerEmployee.low, "currency", "industry revenue per employee, low");
    add(benchmark.revenuePerEmployee.median, "currency", "industry revenue per employee, median");
    add(benchmark.revenuePerEmployee.high, "currency", "industry revenue per employee, high");
  }

  add(assumptions.payroll.payrollTaxRate, "percent", "employer payroll tax rate");
  add(assumptions.payroll.benefitsRate, "percent", "benefits rate");
  add(
    assumptions.payroll.payrollTaxRate + assumptions.payroll.benefitsRate,
    "percent",
    "payroll loading above gross wages",
  );

  // Gross margin's complement: prose says "costs run at 24.6% of revenue" as
  // readily as it says "a 75.4% margin", and both are the same model cell.
  add(1 - metrics.unitEconomics.grossMargin, "percent", "cost of sales as a share of revenue");
  for (const row of metrics.grossMarginByYear) {
    if (row.margin !== null) add(1 - row.margin, "percent", `Year ${row.year} cost of sales share`);
  }

  add(assumptions.tax.corporateRate, "percent", "corporate tax rate");
  add(assumptions.opening.cash, "currency", "opening cash");
  add(assumptions.opening.debt, "currency", "opening debt");
  add(assumptions.opening.paidInCapital, "currency", "opening paid-in capital");
  if (assumptions.enterpriseEstablishmentCost !== undefined) {
    add(assumptions.enterpriseEstablishmentCost, "currency", "total cost of establishing the enterprise");
  }

  const equity = assumptions.equityRounds.reduce((s, r) => s + r.amount, 0);
  const debt = assumptions.loans.reduce((s, l) => s + l.principal, 0);
  const capex = assumptions.capex.reduce((s, c) => s + c.amount, 0);
  const grants = assumptions.grants.reduce((s, g) => s + g.amount, 0);
  add(equity, "currency", "total equity raised");
  add(debt, "currency", "total debt");
  add(capex, "currency", "total capital expenditure");
  add(grants, "currency", "total grants");
  add(equity + debt + grants, "currency", "total sources of funds");
  if (equity + debt > 0) add(equity / (equity + debt), "percent", "equity injection");

  return values;
}

/**
 * The market build's own figures.
 *
 * TAM, SAM and the obtainable share are computed, not claimed — they come from
 * a countable population and a spend per customer the author entered, through
 * the same pure function the market page renders. So they belong in the index
 * exactly as the engine's figures do; leaving them out would report a plan for
 * quoting its own arithmetic.
 */
export function buildMarketIndex(
  sizing: MarketSizingInput,
  model?: FinancialModel,
): ModelValue[] {
  const result = computeSizing(sizing, model);
  if (!result.complete) return [];

  const values: ModelValue[] = [
    { value: result.tam, kind: "currency", label: "total addressable market" },
    { value: result.sam, kind: "currency", label: "serviceable market" },
    { value: result.som, kind: "currency", label: "obtainable market" },
  ];
  for (const step of result.steps) {
    if (step.kind === "currency") {
      values.push({ value: step.value, kind: "currency", label: step.label });
    }
  }
  const parsed = MarketSizingSchema.parse(sizing);
  values.push(
    { value: parsed.qualifiedShare, kind: "percent", label: "share who are plausible buyers" },
    { value: parsed.servableShare, kind: "percent", label: "serviceable share" },
    { value: parsed.targetShare, kind: "percent", label: "target share" },
  );
  if (parsed.topDownMarketSize !== undefined && parsed.topDownCitationId) {
    values.push({
      value: parsed.topDownMarketSize,
      kind: "currency",
      label: "published market size",
    });
  }
  return values;
}

/**
 * The AI-disruption assessment's own arithmetic.
 *
 * Exposure and coverage are computed from the shares the author entered, the
 * same way the module renders them, so prose quoting either is quoting a
 * derived figure rather than making a claim.
 */
export function buildResilienceIndex(resilience: ResilienceInput): ModelValue[] {
  const result = assessResilience(resilience);
  const values: ModelValue[] = [];
  if (result.exposure !== null) {
    values.push({ value: result.exposure, kind: "percent", label: "AI exposure" });
  }
  values.push({ value: result.coverage, kind: "percent", label: "share of costs assessed" });
  for (const task of ResilienceSchema.parse(resilience).tasks) {
    values.push({ value: task.shareOfCost, kind: "percent", label: `${task.task} share of costs` });
  }
  return values;
}

/* -------------------------------------------------------------------------- */
/* Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Sign is carried by the words around a figure — "a loss of $405,498" is the
 * model's −$405,498 written correctly — so magnitudes are compared. A wrong
 * sign is a narrative error this check is not trying to catch; a fabricated
 * magnitude is.
 */
function matches(figure: ExtractedFigure, candidate: ModelValue): boolean {
  if (candidate.kind !== figure.kind) return false;
  return Math.abs(Math.abs(candidate.value) - Math.abs(figure.value)) <= figure.tolerance;
}

function nearest(figure: ExtractedFigure, index: ModelValue[]): ModelValue | undefined {
  let best: ModelValue | undefined;
  let bestDistance = Infinity;
  for (const candidate of index) {
    if (candidate.kind !== figure.kind) continue;
    const distance = Math.abs(Math.abs(candidate.value) - Math.abs(figure.value));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  if (!best) return undefined;

  // Headcount is the exception to the distance rule. The model holds exactly
  // one authoritative answer, and "the text says 34, payroll carries 12" is
  // the whole point of the check however far apart the two numbers are.
  if (figure.kind === "headcount") {
    return index.find((v) => v.label === "total headcount") ?? best;
  }

  // Otherwise only name a neighbour that is actually in the same territory:
  // a suggestion from the wrong order of magnitude is worse than none.
  const scale = Math.max(Math.abs(figure.value), Math.abs(best.value), 1e-6);
  return bestDistance / scale <= 0.5 ? best : undefined;
}

/**
 * Figures a citation vouches for.
 *
 * Not every number in a plan comes from the model, and it should not: "the
 * catchment holds 24,000 households" is a market fact, and the right answer is
 * a source, not a model cell. So citation claims are run through the same
 * extractor, and a figure matching one of them is sourced rather than invented.
 * Without this, citing a statistic correctly would be reported as fabricating
 * one — the check would punish exactly the behaviour it exists to encourage.
 */
export function buildCitedIndex(claims: string[]): ModelValue[] {
  return claims.flatMap((claim) =>
    extractFigures(claim).map((figure) => ({
      value: figure.value,
      kind: figure.kind,
      label: "a cited source",
    })),
  );
}

export function checkSection(
  section: { key: string; title: string; text: string },
  index: ModelValue[],
  cited: ModelValue[] = [],
): { findings: ConsistencyFinding[]; checked: number; reconciled: number; sourced: number } {
  const figures = extractFigures(section.text);
  const findings: ConsistencyFinding[] = [];
  let reconciled = 0;
  let sourced = 0;

  for (const figure of figures) {
    if (index.some((candidate) => matches(figure, candidate))) {
      reconciled++;
      continue;
    }
    if (cited.some((candidate) => matches(figure, candidate))) {
      sourced++;
      continue;
    }
    const near = nearest(figure, index);
    findings.push({
      sectionKey: section.key,
      sectionTitle: section.title,
      figure,
      ...(near ? { nearest: { label: near.label, value: near.value } } : {}),
    });
  }

  return { findings, checked: figures.length, reconciled, sourced };
}

export function checkPlan(
  sections: { key: string; title: string; text: string }[],
  index: ModelValue[],
  cited: ModelValue[] = [],
): ConsistencyReport {
  const findings: ConsistencyFinding[] = [];
  const skippedSections: string[] = [];
  let checkedCount = 0;
  let reconciledCount = 0;
  let sourcedCount = 0;

  for (const section of sections) {
    if (section.text.trim().length === 0) {
      skippedSections.push(section.key);
      continue;
    }
    const result = checkSection(section, index, cited);
    findings.push(...result.findings);
    checkedCount += result.checked;
    reconciledCount += result.reconciled;
    sourcedCount += result.sourced;
  }

  return { findings, checkedCount, reconciledCount, sourcedCount, skippedSections };
}

function humaniseKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();
}
