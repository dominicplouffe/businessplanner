import type { FinancialModel } from "./engine";
import type { Metrics } from "./metrics";
import { getBenchmark, isOutOfBand } from "./benchmarks";
import { dscrThreshold, inForce, EQUITY_INJECTION_MINIMUM, type SbaProgramme } from "@/lib/content/regulatory";

/* ==========================================================================
   The validator suite. Blocking checks gate export; warnings are surfaced.
   --------------------------------------------------------------------------
   This is what turns "make it credible" into something enforceable. Every
   check here corresponds to a documented reason plans get rejected by lenders,
   investors or adjudicators.
   ========================================================================== */

export type Severity = "blocking" | "warning";

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  /** What is wrong, in the reader's terms — not ours. */
  detail: string;
  /** What to change. A finding without a remedy is just a complaint. */
  remedy: string;
  /** Where in the product to go and fix it. */
  anchor?: string;
};

export type ValidationResult = {
  findings: Finding[];
  blockingCount: number;
  warningCount: number;
  /** Export is permitted only when nothing is blocking. */
  canExport: boolean;
};

export type ValidationContext = {
  /** Which reader the plan is being validated for. */
  purpose?: "sba-loan" | "investor" | "immigration" | "internal";
  sbaProgramme?: SbaProgramme;
  /** Named competitors gathered in the market section, with dated evidence. */
  competitorCount?: number;
  competitorsHaveDatedEvidence?: boolean;
  /** Whether a bottom-up market size with visible arithmetic exists. */
  hasBottomUpMarketSizing?: boolean;
  /** Ratio of top-down to bottom-up TAM, when both exist. */
  tamDivergence?: number;
  /** Whether a downside scenario exists and how many drivers it moves. */
  downsideScenarioDriverCount?: number;
  /** Statistics in the narrative that lack a dated source. */
  uncitedStatisticCount?: number;
  /** Figures in the narrative that do not resolve to a model cell. */
  unreconciledFigureCount?: number;
  asOf?: Date;
};

function at(arr: number[], i: number): number {
  return arr[i] ?? 0;
}
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
/** "1 figure", "3 figures", "no competitors" — findings are read by people. */
function count(n: number, singular: string, plural = `${singular}s`): string {
  if (n === 0) return `no ${plural}`;
  return `${n} ${n === 1 ? singular : plural}`;
}
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function validateModel(
  model: FinancialModel,
  metrics: Metrics,
  ctx: ValidationContext = {},
): ValidationResult {
  const findings: Finding[] = [];
  const a = model.assumptions;
  const n = model.horizonMonths;
  const purpose = ctx.purpose ?? "internal";

  const add = (f: Finding) => findings.push(f);

  /* ==== BLOCKING ======================================================== */

  // 1. The three statements must tie in every period.
  if (!model.checks.balanceSheetTie.passes) {
    add({
      id: "statements-do-not-tie",
      severity: "blocking",
      title: "The balance sheet does not balance",
      detail: `Assets differ from liabilities plus equity by ${money(
        model.checks.balanceSheetTie.worstAbsolute,
      )} in month ${model.checks.balanceSheetTie.worstMonth}.`,
      remedy: "This is an engine fault, not an input problem. Report it — the model cannot be trusted until it ties.",
      anchor: "/financials",
    });
  }

  // 2. Monthly detail for year one. SBA-shaped plans require it.
  if (n < 12) {
    add({
      id: "insufficient-horizon",
      severity: "blocking",
      title: "The model is shorter than one year",
      detail: `The horizon is ${n} months. Lenders expect monthly detail across the whole of year one.`,
      remedy: "Extend the horizon to at least 36 months.",
      anchor: "/financials",
    });
  }

  // 3. Cash must never go negative without a financing line to absorb it.
  if (metrics.cash.cashOutMonth !== null) {
    add({
      id: "negative-cash",
      severity: "blocking",
      title: "The plan runs out of cash",
      detail: `Cash goes negative in month ${metrics.cash.cashOutMonth}, reaching ${money(
        metrics.cash.lowestCash,
      )} in month ${metrics.cash.lowestCashMonth}. A plan that cannot fund itself is not fundable.`,
      remedy: `Raise funding of at least ${money(
        metrics.cash.peakFundingNeed,
      )}, reduce spend, or slow hiring until the trough clears.`,
      anchor: "/financials",
    });
  }

  // 4. Owner compensation. The single most common silent DSCR fabrication:
  //    underwriters substitute a market salary when a plan shows none, and the
  //    E-2 marginality test is assessed on the owner's income.
  const ownerMonths = a.roles.filter((r) => r.isOwner);
  const hasOwnerRole = ownerMonths.length > 0;
  const zeroOwnerComp = !hasOwnerRole || a.roles.every((r) => !r.isOwner || r.annualSalary <= 0);
  if (zeroOwnerComp) {
    add({
      id: "owner-compensation-missing",
      severity: "blocking",
      title: "No owner compensation in the model",
      detail:
        "The plan shows the owner taking nothing. An underwriter will substitute a market salary and recompute coverage, so the plan fails on first review rather than on its merits.",
      remedy: "Add an owner role with a realistic market salary, even if the owner intends to defer it.",
      anchor: "/financials/payroll",
    });
  } else {
    // Present but zero in some month once trading has begun.
    const firstTrading = a.company.firstTradingMonth - 1;
    for (let i = firstTrading; i < n; i++) {
      if (at(model.pnl.ownerCompensation, i) <= 0) {
        add({
          id: "owner-compensation-gap",
          severity: "blocking",
          title: "Owner compensation drops to zero",
          detail: `Owner compensation is zero in month ${i + 1}, after trading has begun.`,
          remedy: "Extend the owner role across the full horizon, or explain the gap in the narrative.",
          anchor: "/financials/payroll",
        });
        break;
      }
    }
  }

  // 5. The assumptions register must be populated — provenance is the product.
  const registryKeys = Object.keys(a.registry).length;
  if (registryKeys === 0) {
    add({
      id: "empty-assumption-register",
      severity: "blocking",
      title: "No provenance recorded for any assumption",
      detail:
        "Every driver should be tagged as known, estimated, or a benchmark default, and that provenance is shown in the finished plan.",
      remedy: "Complete the intake so each driver carries a provenance tag.",
      anchor: "/intake",
    });
  }

  // 6. Revenue must come from somewhere.
  if (a.revenueStreams.length === 0) {
    add({
      id: "no-revenue-streams",
      severity: "blocking",
      title: "The model has no revenue streams",
      detail: "There is nothing to project.",
      remedy: "Add at least one revenue stream built from volume and price.",
      anchor: "/intake/revenue",
    });
  }

  // 7. Every figure in the narrative must resolve to a model cell.
  if ((ctx.unreconciledFigureCount ?? 0) > 0) {
    add({
      id: "narrative-model-mismatch",
      severity: "blocking",
      title: "The narrative contradicts the model",
      detail: `${count(ctx.unreconciledFigureCount ?? 0, "figure")} in the written sections ${
        (ctx.unreconciledFigureCount ?? 0) === 1 ? "does" : "do"
      } not match any value in the financial model.`,
      remedy: "Reconcile each one. Export stays locked until the prose and the statements agree.",
      anchor: "/review/consistency",
    });
  }

  // 8. Every statistic needs a dated source.
  if ((ctx.uncitedStatisticCount ?? 0) > 0) {
    add({
      id: "uncited-statistics",
      severity: "blocking",
      title: "Uncited statistics in the narrative",
      detail: `${count(ctx.uncitedStatisticCount ?? 0, "claim")} ${
        (ctx.uncitedStatisticCount ?? 0) === 1 ? "carries" : "carry"
      } no dated, retrievable source. Unsourced market claims are the most commonly cited reason plans are rejected.`,
      remedy: "Cite each claim or remove it.",
      anchor: "/market/sources",
    });
  }

  // 9. Debt requires a schedule and a coverage figure.
  const hasDebt = a.loans.length > 0 || a.opening.debt > 0;
  if (hasDebt && metrics.underwriter.minimumDscr === null) {
    add({
      id: "missing-dscr",
      severity: "blocking",
      title: "Debt with no coverage calculation",
      detail: "The plan carries debt but no debt service coverage ratio could be computed.",
      remedy: "Give each loan a rate and a term so the amortisation schedule can be built.",
      anchor: "/financials/debt",
    });
  }

  // 10–12 apply when the plan is going to an external reader.
  if (purpose !== "internal") {
    const competitors = ctx.competitorCount ?? 0;
    if (competitors < 3 || ctx.competitorsHaveDatedEvidence === false) {
      add({
        id: "insufficient-competitor-evidence",
        severity: "blocking",
        title: "Fewer than three named competitors with dated evidence",
        detail: `The market section names ${count(competitors, "competitor")}${
          ctx.competitorsHaveDatedEvidence === false ? " and the pricing evidence is undated" : ""
        }. A competitive analysis without named, dated evidence reads as generic.`,
        remedy: "Name at least three real competitors with a URL and a dated price point each.",
        anchor: "/market/competitors",
      });
    }

    if (ctx.hasBottomUpMarketSizing === false) {
      add({
        id: "no-bottom-up-sizing",
        severity: "blocking",
        title: "Market size is top-down only",
        detail:
          "A share-of-a-large-market claim is the classic unfundable market section. Bottom-up arithmetic is what a reader can check.",
        remedy: "Build the market from the ground up and show the arithmetic.",
        anchor: "/market/sizing",
      });
    }

    if ((ctx.downsideScenarioDriverCount ?? 0) < 5) {
      add({
        id: "no-coherent-downside",
        severity: "blocking",
        title: "No coherent downside scenario",
        detail: `The downside case moves ${count(
          ctx.downsideScenarioDriverCount ?? 0,
          "driver",
        )}. A credible downside moves revenue and spend together — cutting revenue alone is not a scenario.`,
        remedy: "Build a downside that adjusts at least five drivers, including cost response.",
        anchor: "/financials/scenarios",
      });
    }
  }

  /* ==== WARNINGS ======================================================== */

  const benchmark = getBenchmark(a.company.industryKey);

  // Margins against the industry band, for years that actually trade.
  //
  // Which gross margin gets compared depends on how the band was quoted, which
  // the benchmark declares. A restaurant's band is food cost only, so the
  // labour-inclusive figure the statements show is below it by construction and
  // reported a false shortfall on every plan flagging its service staff as
  // direct — which the intake does by default. A cleaning contractor's band is
  // quoted after the cleaners' wages, so the materials figure would read as
  // extraordinary profit. Same finding, opposite errors.
  const materialsBasis = benchmark.grossMarginBasis === "materials";
  const comparable = materialsBasis ? metrics.materialsMarginByYear : metrics.grossMarginByYear;
  const basisNote = materialsBasis
    ? " The band is quoted before direct labour, so this is the comparable figure."
    : "";
  for (const y of comparable) {
    if (y.margin === null || y.year > 3) continue;
    const off = isOutOfBand(y.margin, benchmark.grossMargin);
    if (off) {
      add({
        id: `gross-margin-out-of-band-y${y.year}`,
        severity: "warning",
        title: `Year ${y.year} gross margin is ${off === "high" ? "above" : "below"} the industry band`,
        detail: `${pct(y.margin)}${
          materialsBasis ? " before direct labour" : ""
        } against a ${benchmark.label} band of ${pct(benchmark.grossMargin.low)}–${pct(
          benchmark.grossMargin.high,
        )} (median ${pct(benchmark.grossMargin.median)}).${basisNote} Source: ${
          benchmark.sourceLabel
        }, ${benchmark.vintage}.`,
        remedy: "Justify the difference in the narrative, or revisit pricing and direct costs. The benchmark is a prompt, not a correction.",
        anchor: "/financials",
      });
      break;
    }
  }

  for (const y of metrics.netMarginByYear) {
    if (y.margin === null || y.year > 3) continue;
    const off = isOutOfBand(y.margin, benchmark.netMargin);
    if (off === "high") {
      add({
        id: `net-margin-optimistic-y${y.year}`,
        severity: "warning",
        title: `Year ${y.year} net margin is above the industry band`,
        detail: `${pct(y.margin)} against a ${benchmark.label} band topping out at ${pct(
          benchmark.netMargin.high,
        )}. A reader will challenge this before anything else in the plan.`,
        remedy: "Show what makes this business structurally more profitable than its sector, or moderate the assumption.",
        anchor: "/financials",
      });
      break;
    }
  }

  // DSCR against the threshold in force — never a hardcoded number.
  if (hasDebt && metrics.underwriter.dscrFirstFullYear !== null) {
    const programme: SbaProgramme = ctx.sbaProgramme ?? "7a-standard";
    const threshold = dscrThreshold(programme, ctx.asOf);
    if (metrics.underwriter.dscrFirstFullYear < threshold.value) {
      add({
        id: "dscr-below-threshold",
        severity: purpose === "sba-loan" ? "blocking" : "warning",
        title: `Debt service coverage is ${metrics.underwriter.dscrFirstFullYear.toFixed(2)}×`,
        detail: `Below the ${threshold.value.toFixed(
          2,
        )}× expected for ${programme} under ${threshold.source.label}. Coverage is the ratio the credit decision turns on.`,
        remedy: "Lengthen the term, reduce the borrowing, increase the equity injection, or improve operating cash flow.",
        anchor: "/financials/debt",
      });
    }
  }

  // Equity injection.
  if (purpose === "sba-loan") {
    const equity = a.equityRounds.reduce((s, r) => s + r.amount, 0) + a.opening.paidInCapital;
    const debtRaised = a.loans.reduce((s, l) => s + l.principal, 0) + a.opening.debt;
    const total = equity + debtRaised;
    const minimum = inForce(EQUITY_INJECTION_MINIMUM, ctx.asOf);
    if (total > 0 && equity / total < minimum.value) {
      add({
        id: "equity-injection-thin",
        severity: "warning",
        title: `Equity injection is ${pct(equity / total)} of total capital`,
        detail: `Below the ${pct(minimum.value)} lenders generally look for (${minimum.source.label}).`,
        remedy: "Increase the owner's injection or reduce the loan request.",
        anchor: "/financials/funding",
      });
    }
  }

  // Unit economics sanity.
  const ue = metrics.unitEconomics;
  if (ue.ltvToCac !== null && ue.ltvToCac < 3) {
    add({
      id: "ltv-cac-thin",
      severity: "warning",
      title: `LTV to CAC is ${ue.ltvToCac.toFixed(1)}×`,
      detail: "Below the 3× that investors typically treat as the floor for a scalable acquisition model.",
      remedy: "Improve retention or pricing, or reduce acquisition cost, before claiming the model scales.",
      anchor: "/financials/unit-economics",
    });
  }
  if (ue.paybackMonths !== null && ue.paybackMonths > 18) {
    add({
      id: "payback-long",
      severity: "warning",
      title: `CAC payback is ${ue.paybackMonths.toFixed(0)} months`,
      detail: "Payback beyond ~18 months makes growth expensive to finance.",
      remedy: "Raise price, improve gross margin, or lower acquisition cost.",
      anchor: "/financials/unit-economics",
    });
  }

  // TAM reconciliation.
  if (ctx.tamDivergence !== undefined && (ctx.tamDivergence > 3 || ctx.tamDivergence < 1 / 3)) {
    add({
      id: "tam-divergence",
      severity: "warning",
      title: "Top-down and bottom-up market sizes disagree",
      detail: `They differ by ${ctx.tamDivergence.toFixed(1)}×. One of the two methods has a flawed assumption.`,
      remedy: "Reconcile the two and explain which you rely on and why.",
      anchor: "/market/sizing",
    });
  }

  // Revenue growth with no driver behind it.
  for (const g of metrics.revenueGrowthByYear) {
    if (g.growth !== null && g.growth > 3) {
      add({
        id: `growth-unsupported-y${g.year}`,
        severity: "warning",
        title: `Year ${g.year} revenue grows ${pct(g.growth)}`,
        detail: "Growth above 300% in a year needs an explicit driver — a funded hiring plan, a channel, a contracted pipeline.",
        remedy: "Point the growth at a driver in the model, or moderate it.",
        anchor: "/financials/revenue",
      });
      break;
    }
  }

  // A driver held constant for years reads as unmodelled.
  const longHorizonFlat = a.opex.filter(
    (o) => o.annualGrowthRate === 0 && o.percentOfRevenue === undefined && (o.endMonth ?? n) - o.startMonth > 24,
  );
  if (longHorizonFlat.length > 0) {
    add({
      id: "flat-opex",
      severity: "warning",
      title: `${count(longHorizonFlat.length, "cost line")} never ${
        longHorizonFlat.length === 1 ? "changes" : "change"
      } across the horizon`,
      detail: `${longHorizonFlat
        .slice(0, 3)
        .map((o) => o.name)
        .join(", ")}${longHorizonFlat.length > 3 ? "…" : ""} ${
        longHorizonFlat.length === 1 ? "stays" : "stay"
      } flat for more than two years.`,
      remedy: "Apply an inflation rate, or note why the cost is genuinely fixed.",
      anchor: "/financials/expenses",
    });
  }

  // Break-even that never arrives.
  if (metrics.breakEven.profitMonth === null) {
    add({
      id: "never-profitable",
      severity: "warning",
      title: "The plan never reaches an operating profit",
      detail: `Across ${n} months the business does not turn EBITDA-positive.`,
      remedy: "Either extend the horizon to where it does, or reconsider the cost base. Lenders will not fund this shape.",
      anchor: "/financials",
    });
  }

  const blockingCount = findings.filter((f) => f.severity === "blocking").length;
  return {
    findings,
    blockingCount,
    warningCount: findings.length - blockingCount,
    canExport: blockingCount === 0,
  };
}
