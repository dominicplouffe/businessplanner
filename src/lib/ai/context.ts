import type { GenerationContext } from "./types";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { PURPOSES } from "@/lib/content/intake";
import { computeSizing } from "@/lib/market/sizing";
import { assessResilience } from "@/lib/market/resilience";

/* ==========================================================================
   The facts block.
   --------------------------------------------------------------------------
   This is the only source of numbers a generator may use. It is assembled from
   engine output, handed to the model as data, and the system prompt forbids
   inventing or altering anything in it. That constraint is the whole product:
   the model narrates arithmetic it did not perform.
   ========================================================================== */

export function buildFactsBlock(ctx: GenerationContext): string {
  const { model, metrics, assumptions } = ctx;
  const benchmark = getBenchmark(ctx.industryKey);
  const currency = assumptions.company.currency;
  const money = (n: number) => formatCurrency(n, currency);

  const lines: string[] = [];

  lines.push(`COMPANY: ${ctx.companyName}`);
  lines.push(`INDUSTRY: ${benchmark.label}`);
  lines.push(`PLAN IS WRITTEN FOR: ${readerLabel(ctx.purpose)}`);
  lines.push(`WHAT THE BUSINESS DOES: ${ctx.description || "(not supplied)"}`);
  lines.push("");

  lines.push("REVENUE MODEL");
  for (const stream of assumptions.revenueStreams) {
    lines.push(`- ${stream.name} (${stream.kind}), first bills in month ${stream.startMonth}`);
    for (const [key, value] of Object.entries(stream)) {
      if (["id", "name", "kind", "startMonth", "seasonality"].includes(key)) continue;
      lines.push(`  - ${humanise(key)}: ${formatDriver(key, value, currency)}`);
    }
  }
  lines.push("");

  lines.push("ANNUAL RESULTS (computed — use these figures verbatim)");
  for (const year of model.annual) {
    lines.push(
      `- ${year.label}: revenue ${money(year.revenue)}, gross profit ${money(year.grossProfit)}, ` +
        `operating expenses ${money(year.totalOpex)}, EBITDA ${money(year.ebitda)}, ` +
        `net income ${money(year.netIncome)}, closing cash ${money(year.closingCash)}`,
    );
  }
  lines.push("");

  lines.push("KEY METRICS (computed)");
  lines.push(`- Gross margin: ${formatPercent(metrics.unitEconomics.grossMargin)}`);
  lines.push(
    `- Break-even: ${
      metrics.breakEven.profitMonth
        ? `month ${metrics.breakEven.profitMonth}`
        : "not reached within the plan horizon"
    }`,
  );
  lines.push(`- Monthly revenue needed to break even: ${money(metrics.breakEven.monthlyRevenueRequired)}`);
  lines.push(`- Lowest cash balance: ${money(metrics.cash.lowestCash)} in month ${metrics.cash.lowestCashMonth}`);
  if (metrics.cash.peakFundingNeed > 0) {
    lines.push(`- Peak additional funding required: ${money(metrics.cash.peakFundingNeed)}`);
  }
  if (metrics.underwriter.minimumDscr !== null) {
    lines.push(`- Minimum debt service coverage: ${formatMultiple(metrics.underwriter.minimumDscr)}`);
    for (const row of metrics.underwriter.dscrByYear) {
      if (row.dscr !== null) {
        lines.push(`  - Year ${row.year}: ${formatMultiple(row.dscr)} (cash available ${money(row.cashAvailable)}, debt service ${money(row.debtService)})`);
      }
    }
  }
  if (metrics.unitEconomics.lifetimeValue !== null) {
    lines.push(`- Customer lifetime value: ${money(metrics.unitEconomics.lifetimeValue)}`);
  }
  if (metrics.unitEconomics.ltvToCac !== null) {
    lines.push(`- LTV to CAC: ${formatMultiple(metrics.unitEconomics.ltvToCac)}`);
  }
  lines.push(
    `- Owner compensation: ${metrics.underwriter.ownerCompensationByYear
      .map((r) => `Year ${r.year} ${money(r.amount)}`)
      .join(", ")}`,
  );
  lines.push("");

  lines.push("FUNDING");
  const equity = assumptions.equityRounds.reduce((s, r) => s + r.amount, 0);
  const debt = assumptions.loans.reduce((s, l) => s + l.principal, 0);
  lines.push(`- Equity and owner injection: ${money(equity)}`);
  lines.push(`- Debt: ${money(debt)}`);
  for (const loan of assumptions.loans) {
    lines.push(
      `  - ${loan.name}: ${money(loan.principal)} at ${formatPercent(loan.annualRate)} over ${loan.termMonths} months` +
        (loan.interestOnlyMonths > 0 ? `, ${loan.interestOnlyMonths} months interest-only` : ""),
    );
  }
  const capex = assumptions.capex.reduce((s, c) => s + c.amount, 0);
  if (capex > 0) lines.push(`- Up-front capital expenditure: ${money(capex)}`);
  lines.push("");

  lines.push("TEAM");
  for (const role of assumptions.roles) {
    lines.push(
      `- ${role.title}${role.count > 1 ? ` ×${role.count}` : ""}: ${money(role.annualSalary)}/year, ` +
        `from month ${role.startMonth}${role.isOwner ? " (owner)" : ""}${role.isDirectLabour ? " (direct labour)" : ""}`,
    );
  }
  lines.push("");

  lines.push("INDUSTRY BENCHMARKS (for context — these are medians, not this business)");
  lines.push(
    `- Gross margin band: ${formatPercent(benchmark.grossMargin.low)}–${formatPercent(benchmark.grossMargin.high)} (median ${formatPercent(benchmark.grossMargin.median)})`,
  );
  lines.push(
    `- Net margin band: ${formatPercent(benchmark.netMargin.low)}–${formatPercent(benchmark.netMargin.high)} (median ${formatPercent(benchmark.netMargin.median)})`,
  );
  lines.push(`- Source: ${benchmark.sourceLabel}, ${benchmark.vintage}`);
  if (benchmark.notes) lines.push(`- Note: ${benchmark.notes}`);
  lines.push("");

  if (ctx.market) {
    const sizing = computeSizing(ctx.market.sizing, model);
    lines.push("MARKET, BUILT FROM THE GROUND UP (use these figures verbatim)");
    if (sizing.complete) {
      for (const step of sizing.steps) {
        lines.push(
          `- ${step.label}: ${
            step.kind === "currency" ? money(step.value) : Math.round(step.value).toLocaleString("en-US")
          }${step.workings ? ` (${step.workings})` : ""}`,
        );
      }
      if (sizing.modelCheck.status === "checked" && sizing.modelCheck.overruns) {
        lines.push(
          `- WARNING: the model forecasts more revenue than this build says is obtainable. Do not claim both.`,
        );
      }
    } else {
      lines.push("- Not built yet. Do not state a market size: there is no arithmetic behind one.");
    }
    lines.push("");

    lines.push("NAMED COMPETITORS (the only ones you may name)");
    if (ctx.market.competitors.length === 0) {
      lines.push("- None recorded. Do not invent competitors; say the comparison set is not yet established.");
    }
    for (const competitor of ctx.market.competitors) {
      lines.push(
        `- ${competitor.name}${competitor.url ? ` (${competitor.url})` : ""}: ${
          competitor.positioning || "position not recorded"
        }. Price: ${
          competitor.priceLabel
            ? `${competitor.priceLabel}${competitor.priceDate ? `, observed ${competitor.priceDate}` : " (undated — do not quote it)"}`
            : "none recorded — do not state one"
        }.${competitor.weaknesses ? ` Weak on: ${competitor.weaknesses}.` : ""}`,
      );
    }
    lines.push("");

    lines.push("SOURCES ON FILE (the only outside claims you may make)");
    if (ctx.market.citations.length === 0) {
      lines.push("- None. Every statistic you write would be uncited, so write none.");
    }
    ctx.market.citations.forEach((citation, i) => {
      lines.push(
        `- [${i + 1}] ${citation.claim || citation.label} — ${citation.label}${
          citation.publisher ? `, ${citation.publisher}` : ""
        }, ${citation.sourceDate}${citation.url ? ` (${citation.url})` : ""}`,
      );
    });
    lines.push("");
  }

  if (ctx.resilience) {
    const assessment = assessResilience(ctx.resilience);
    lines.push("AI DISRUPTION ASSESSMENT");
    lines.push(
      `- Cost-weighted exposure: ${
        assessment.exposure === null ? "not assessed" : formatPercent(assessment.exposure)
      } (${assessment.bandLabel}), covering ${formatPercent(assessment.coverage)} of the cost base`,
    );
    for (const task of ctx.resilience.tasks.filter((t) => t.task.trim().length > 0)) {
      lines.push(
        `- ${task.task}: ${formatPercent(task.shareOfCost)} of costs, ${task.level} exposure${
          task.rationale ? ` — ${task.rationale}` : ""
        }`,
      );
    }
    if (ctx.resilience.moatStatement) {
      lines.push(`- What is hard to automate: ${ctx.resilience.moatStatement}`);
    }
    for (const step of ctx.resilience.roadmap.filter((r) => r.action.trim().length > 0)) {
      lines.push(`- Planned (${step.horizon}): ${step.action} → ${step.expectedEffect}`);
    }
    lines.push("");
  }

  lines.push("PROVENANCE OF THE INPUTS");
  const counts = { known: 0, estimated: 0, benchmark_default: 0 };
  for (const entry of Object.values(assumptions.registry)) {
    counts[entry.provenance] = (counts[entry.provenance] ?? 0) + 1;
  }
  lines.push(
    `- ${counts.known} measured by the owner, ${counts.estimated} estimated by the owner, ${counts.benchmark_default} industry defaults`,
  );

  return lines.join("\n");
}

function readerLabel(purpose: string): string {
  const found = PURPOSES.find((p) => p.value === purpose);
  return found ? `${found.label} — ${found.hint}` : "internal use";
}

function humanise(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatDriver(key: string, value: unknown, currency: string): string {
  if (typeof value !== "number") return String(value);
  const lower = key.toLowerCase();
  if (lower.includes("rate") || lower.includes("utilisation") || lower.includes("percent")) {
    return formatPercent(value);
  }
  if (lower.includes("price") || lower.includes("ticket") || lower.includes("cost") ||
      lower.includes("value") || lower.includes("gmv") || lower.includes("cpm")) {
    return formatCurrency(value, currency);
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
