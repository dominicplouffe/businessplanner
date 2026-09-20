import type { Assumptions } from "@/lib/finance/types";
import type { FinancialModel } from "@/lib/finance/engine";
import type { Metrics } from "@/lib/finance/metrics";
import { buildStatements, summariseScheduleByYear, type StatementTable } from "@/lib/finance/statements";
import { buildAmortisation, roundScheduleForDisplay } from "@/lib/finance/loans";
import {
  computeSizing,
  MarketSizingSchema,
  type MarketSizing,
  type MarketSizingResult,
} from "@/lib/market/sizing";
import { assessResilience, ResilienceSchema, type ResilienceResult } from "@/lib/market/resilience";
import { getBenchmark } from "@/lib/finance/benchmarks";
import {
  dscrThreshold,
  inForce,
  sbaProgrammeForLoan,
  CONFIG_VINTAGE,
  EQUITY_INJECTION_MINIMUM,
  type DatedValue,
} from "@/lib/content/regulatory";
import { PLAN_SECTIONS } from "@/lib/content/sections";
import { formatCurrency } from "@/lib/finance/format";

/* ==========================================================================
   The export document.
   --------------------------------------------------------------------------
   One assembled document that every format renders from. PDF, DOCX, XLSX and
   the deck each have their own idea of a heading and a table, but none of them
   gets its own idea of what the plan says — four builders reading four
   different assemblies is how a spreadsheet ends up disagreeing with the PDF
   it was exported beside.

   It also carries the methodology note. A plan that prints which SOP version
   and which benchmark vintage its figures were computed against is one a loan
   officer can verify rather than doubt, and that note is the cheapest
   credibility in the whole product.
   ========================================================================== */

export type DocumentSection = {
  key: string;
  title: string;
  /** Plain-text paragraphs. Empty when the section was never written. */
  paragraphs: string[];
  written: boolean;
};

export type DocumentCitation = {
  index: number;
  label: string;
  url: string | null;
  publisher: string | null;
  sourceDate: string;
  claim: string;
};

export type DocumentCompetitor = {
  name: string;
  url: string | null;
  positioning: string;
  priceLabel: string;
  priceDate: string | null;
  strengths: string;
  weaknesses: string;
  /** True when it carries both a link and a dated price. */
  evidenced: boolean;
};

export type KeyFigure = { label: string; value: string; note?: string };

export type UnderwriterTable = {
  /** Null when the plan carries no debt. */
  dscr: {
    programme: string;
    threshold: DatedValue<number>;
    rows: { year: string; cashAvailable: number; debtService: number; dscr: number | null; short: boolean }[];
  } | null;
  schedules: {
    loanName: string;
    terms: string;
    rows: { label: string; openingBalance: number; interest: number; principal: number; closingBalance: number }[];
  }[];
  sources: { label: string; amount: number }[];
  uses: { label: string; amount: number }[];
  equityInjection: { share: number | null; minimum: DatedValue<number> };
  ownerCompensation: { year: string; amount: number }[];
};

export type MethodologyNote = {
  /** Every dated value the document's figures depended on. */
  entries: { label: string; value: string; source: string; effectiveFrom: string; confidence: string }[];
  benchmarkLabel: string;
  benchmarkSource: string;
  configReviewed: string;
  /** Values still awaiting confirmation against a primary source. */
  verificationQueue: readonly string[];
  generator: "anthropic" | "fixture";
};

export type ExportDocument = {
  planId: string;
  title: string;
  companyName: string;
  industryLabel: string;
  purpose: string;
  purposeLabel: string;
  currency: string;
  preparedOn: string;
  horizonYears: number;

  keyFigures: KeyFigure[];
  sections: DocumentSection[];
  statements: StatementTable[];
  monthlyStatements: StatementTable[];
  underwriter: UnderwriterTable;
  market: {
    sizing: MarketSizingResult;
    competitors: DocumentCompetitor[];
  };
  /** The sizing inputs as entered, which the workbook turns back into cells. */
  assumptionsMarket: MarketSizing;
  resilience: ResilienceResult & { moatStatement: string; moatKind: string };
  citations: DocumentCitation[];
  methodology: MethodologyNote;

  /** Everything the model and the assembly computed, for the workbook. */
  assumptions: Assumptions;
  model: FinancialModel;
  metrics: Metrics;
};

export type ExportablePlan = {
  id: string;
  title: string;
  companyName: string;
  industryKey: string;
  purpose: string;
  marketJson: string;
  resilienceJson: string;
  sections: { key: string; contentText: string }[];
  competitors: DocumentCompetitor[] | {
    name: string;
    url: string | null;
    positioning: string;
    priceLabel: string;
    priceDate: string | null;
    strengths: string;
    weaknesses: string;
  }[];
  citations: {
    label: string;
    url: string | null;
    publisher: string | null;
    sourceDate: string;
    claim: string;
  }[];
};

const PURPOSE_LABELS: Record<string, string> = {
  "sba-loan": "Prepared for a bank or SBA lender",
  investor: "Prepared for investors",
  immigration: "Prepared to accompany an immigration filing",
  internal: "Prepared for internal use",
};

const PROGRAMME_LABELS: Record<string, string> = {
  "7a-small": "SBA 7(a) Small Loan",
  "7a-standard": "SBA 7(a) standard",
  "504": "SBA 504",
};

export function buildExportDocument(input: {
  plan: ExportablePlan;
  assumptions: Assumptions;
  model: FinancialModel;
  metrics: Metrics;
  generator: "anthropic" | "fixture";
  now?: Date;
}): ExportDocument {
  const { plan, assumptions, model, metrics } = input;
  const now = input.now ?? new Date();
  const benchmark = getBenchmark(plan.industryKey);

  const marketInputs = safeParse(plan.marketJson, MarketSizingSchema);
  const sizing = computeSizing(marketInputs, model);
  const resilienceInput = safeParse(plan.resilienceJson, ResilienceSchema);
  const resilience = assessResilience(resilienceInput);

  const sections: DocumentSection[] = PLAN_SECTIONS.map((section) => {
    const text = plan.sections.find((s) => s.key === section.key)?.contentText ?? "";
    return {
      key: section.key,
      title: section.title,
      paragraphs: toParagraphs(text),
      written: text.trim().length > 0,
    };
  });

  const competitors: DocumentCompetitor[] = plan.competitors.map((c) => ({
    name: c.name,
    url: c.url,
    positioning: c.positioning,
    priceLabel: c.priceLabel,
    priceDate: c.priceDate,
    strengths: c.strengths,
    weaknesses: c.weaknesses,
    evidenced: Boolean(c.url && c.priceDate),
  }));

  return {
    planId: plan.id,
    title: plan.title,
    companyName: plan.companyName || plan.title,
    industryLabel: benchmark.label,
    purpose: plan.purpose,
    purposeLabel: PURPOSE_LABELS[plan.purpose] ?? PURPOSE_LABELS["internal"]!,
    currency: assumptions.company.currency,
    preparedOn: now.toISOString().slice(0, 10),
    horizonYears: model.annual.length,

    keyFigures: keyFigures(model, metrics, assumptions.company.currency),
    sections,
    statements: buildStatements(model, "annual"),
    monthlyStatements: buildStatements(model, "monthly"),
    underwriter: underwriterTable(assumptions, model, metrics, now),
    market: { sizing, competitors },
    assumptionsMarket: marketInputs,
    resilience: {
      ...resilience,
      moatStatement: resilienceInput.moatStatement,
      moatKind: resilienceInput.moatKind,
    },
    citations: plan.citations.map((c, i) => ({ ...c, index: i + 1 })),
    methodology: methodology(assumptions, plan.industryKey, input.generator, now),

    assumptions,
    model,
    metrics,
  };
}

/* -------------------------------------------------------------------------- */

function keyFigures(model: FinancialModel, metrics: Metrics, currency: string): KeyFigure[] {
  const y1 = model.annual[0];
  const y3 = model.annual[2] ?? model.annual.at(-1);

  const figures: KeyFigure[] = [
    { label: "Year 1 revenue", value: fmtMoney(y1?.revenue ?? 0, currency) },
    { label: `Year ${Math.min(3, model.annual.length)} revenue`, value: fmtMoney(y3?.revenue ?? 0, currency) },
    {
      label: "Operating profit from",
      value: metrics.breakEven.profitMonth ? `Month ${metrics.breakEven.profitMonth}` : "Not inside the horizon",
    },
    { label: "Lowest cash balance", value: fmtMoney(metrics.cash.lowestCash, currency), note: `Month ${metrics.cash.lowestCashMonth}` },
  ];

  if (metrics.underwriter.minimumDscr !== null) {
    figures.push({ label: "Minimum debt service coverage", value: `${metrics.underwriter.minimumDscr.toFixed(2)}×` });
  }
  if (metrics.cash.peakFundingNeed > 0) {
    figures.push({ label: "Peak funding requirement", value: fmtMoney(metrics.cash.peakFundingNeed, currency) });
  }
  return figures;
}

function underwriterTable(
  assumptions: Assumptions,
  model: FinancialModel,
  metrics: Metrics,
  now: Date,
): UnderwriterTable {
  const currency = assumptions.company.currency;
  const debt = assumptions.loans.reduce((sum, l) => sum + l.principal, 0) + assumptions.opening.debt;
  const { programme } = sbaProgrammeForLoan(debt, now);
  const threshold = dscrThreshold(programme, now);

  const equity =
    assumptions.equityRounds.reduce((sum, r) => sum + r.amount, 0) + assumptions.opening.paidInCapital;
  const grants = assumptions.grants.reduce((sum, g) => sum + g.amount, 0);
  const capex = assumptions.capex.reduce((sum, c) => sum + c.amount, 0);
  const totalSources = equity + debt + grants;

  return {
    dscr:
      debt > 0
        ? {
            programme: PROGRAMME_LABELS[programme] ?? programme,
            threshold,
            rows: metrics.underwriter.dscrByYear.map((row) => ({
              year: model.annual[row.year - 1]?.label ?? `Year ${row.year}`,
              cashAvailable: row.cashAvailable,
              debtService: row.debtService,
              dscr: row.dscr,
              short: row.dscr !== null && row.dscr < threshold.value,
            })),
          }
        : null,
    schedules: assumptions.loans.map((loan) => ({
      loanName: loan.name,
      terms: `${fmtMoney(loan.principal, currency)} at ${(loan.annualRate * 100).toFixed(2)}% over ${loan.termMonths} months${
        loan.interestOnlyMonths > 0 ? `, ${loan.interestOnlyMonths} interest-only` : ""
      }`,
      rows: summariseScheduleByYear(roundScheduleForDisplay(buildAmortisation(loan)), model).map((row) => ({
        label: row.label,
        openingBalance: row.openingBalance,
        interest: row.interest,
        principal: row.principal,
        closingBalance: row.closingBalance,
      })),
    })),
    sources: [
      ...assumptions.equityRounds.map((r) => ({ label: r.name, amount: r.amount })),
      ...(assumptions.opening.paidInCapital > 0
        ? [{ label: "Paid-in capital at open", amount: assumptions.opening.paidInCapital }]
        : []),
      ...assumptions.loans.map((l) => ({ label: l.name, amount: l.principal })),
      ...(assumptions.opening.debt > 0 ? [{ label: "Debt at open", amount: assumptions.opening.debt }] : []),
      ...assumptions.grants.map((g) => ({ label: g.name, amount: g.amount })),
    ],
    uses: [
      ...assumptions.capex.map((c) => ({ label: c.name, amount: c.amount })),
      { label: "Working capital and operating runway", amount: totalSources - capex },
    ],
    equityInjection: {
      share: equity + debt > 0 ? equity / (equity + debt) : null,
      minimum: inForce(EQUITY_INJECTION_MINIMUM, now),
    },
    ownerCompensation: metrics.underwriter.ownerCompensationByYear.map((row) => ({
      year: model.annual[row.year - 1]?.label ?? `Year ${row.year}`,
      amount: row.amount,
    })),
  };
}

/**
 * The note that lets a reader verify rather than doubt.
 *
 * Every regulatory figure the document leaned on, with its source, when it
 * took effect and how confident we are in it — plus what is still waiting on a
 * primary source. Printing the queue rather than hiding it is the point: a
 * plan that marks its own unverified inputs is more trustworthy than one that
 * presents everything with equal confidence.
 */
function methodology(
  assumptions: Assumptions,
  industryKey: string,
  generator: "anthropic" | "fixture",
  now: Date,
): MethodologyNote {
  const currency = assumptions.company.currency;
  const benchmark = getBenchmark(industryKey);
  const debt = assumptions.loans.reduce((sum, l) => sum + l.principal, 0) + assumptions.opening.debt;
  const { programme, ceiling } = sbaProgrammeForLoan(debt, now);
  const threshold = dscrThreshold(programme, now);
  const injection = inForce(EQUITY_INJECTION_MINIMUM, now);

  const entries = [
    {
      label: `Debt service coverage threshold (${PROGRAMME_LABELS[programme] ?? programme})`,
      value: `${threshold.value.toFixed(2)}×`,
      source: threshold.source.label,
      effectiveFrom: threshold.effectiveFrom,
      confidence: threshold.confidence,
    },
    {
      label: "7(a) Small Loan ceiling",
      value: fmtMoney(ceiling.value, currency),
      source: ceiling.source.label,
      effectiveFrom: ceiling.effectiveFrom,
      confidence: ceiling.confidence,
    },
    {
      label: "Minimum equity injection",
      value: `${(injection.value * 100).toFixed(1)}%`,
      source: injection.source.label,
      effectiveFrom: injection.effectiveFrom,
      confidence: injection.confidence,
    },
  ];

  return {
    entries,
    benchmarkLabel: benchmark.label,
    benchmarkSource: `${benchmark.sourceLabel}, ${benchmark.vintage}`,
    configReviewed: CONFIG_VINTAGE.lastReviewed,
    verificationQueue: CONFIG_VINTAGE.verificationQueue,
    generator,
  };
}

/* -------------------------------------------------------------------------- */

/** Splits stored plain text into paragraphs, dropping the fixture footer rule. */
function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0 && p !== "—");
}

function safeParse<T>(json: string, schema: { parse: (value: unknown) => T }): T {
  try {
    return schema.parse(json ? JSON.parse(json) : {});
  } catch {
    return schema.parse({});
  }
}

/** The plan's own currency, not the developer's. A hardcoded USD here would
 *  quietly mislabel every figure in a plan denominated in anything else. */
function fmtMoney(value: number, currency: string): string {
  return formatCurrency(value, currency);
}
