import type { Generator, GenerationChunk, GenerationContext } from "./types";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { computeSizing } from "@/lib/market/sizing";
import { assessResilience } from "@/lib/market/resilience";

/* ==========================================================================
   The deterministic composer.
   --------------------------------------------------------------------------
   Runs when no ANTHROPIC_API_KEY is present. It is not a stub: it writes real
   sentences around the engine's real figures, so the product demonstrates its
   central claim — that numbers come from arithmetic, not from a model — with
   no key and no spend. It is also what the end-to-end tests run against, which
   keeps the test suite free and deterministic.

   It is plainly less fluent than Claude. It never invents a fact.
   ========================================================================== */

export class FixtureGenerator implements Generator {
  readonly kind = "fixture" as const;

  async *generateSection(ctx: GenerationContext): AsyncIterable<GenerationChunk> {
    yield { type: "status", message: "Composing from the financial model…" };

    const text = compose(ctx);

    // Streamed a clause at a time so the UI behaves identically either way.
    const pieces = text.match(/[^.!?]+[.!?]+\s*|\n\n/g) ?? [text];
    let accumulated = "";
    for (const piece of pieces) {
      accumulated += piece;
      yield { type: "text", text: piece };
      await sleep(18);
    }

    yield { type: "done", text: accumulated.trim() };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function compose(ctx: GenerationContext): string {
  const { model, metrics, assumptions } = ctx;
  const currency = assumptions.company.currency;
  const money = (n: number) => formatCurrency(n, currency);
  const name = ctx.companyName || "The business";
  const benchmark = getBenchmark(ctx.industryKey);
  const y1 = model.annual[0];
  const y3 = model.annual[2] ?? model.annual.at(-1);
  const y5 = model.annual.at(-1);
  const stream = assumptions.revenueStreams[0];
  const owner = assumptions.roles.find((r) => r.isOwner);
  const debt = assumptions.loans.reduce((s, l) => s + l.principal, 0);
  const equity = assumptions.equityRounds.reduce((s, r) => s + r.amount, 0);
  const breakEven = metrics.breakEven.profitMonth;

  const p: string[] = [];

  switch (ctx.sectionKey) {
    case "executive-summary":
      p.push(
        `${name} is ${article(benchmark.label)} ${benchmark.label.toLowerCase()} business. ${ctx.description || "The business plan that follows sets out how it operates and what it expects to earn."}`,
      );
      p.push(
        `The model projects revenue of ${money(y1?.revenue ?? 0)} in the first year, reaching ${money(y3?.revenue ?? 0)} by year three and ${money(y5?.revenue ?? 0)} by year five. Gross margin runs at ${formatPercent(metrics.unitEconomics.grossMargin)}, against an industry band of ${formatPercent(benchmark.grossMargin.low)} to ${formatPercent(benchmark.grossMargin.high)}.`,
      );
      p.push(
        breakEven
          ? `The business turns an operating profit in month ${breakEven}. The lowest cash balance across the plan is ${money(metrics.cash.lowestCash)}, in month ${metrics.cash.lowestCashMonth}.`
          : `The business does not reach an operating profit within the five-year horizon, and the plan should be read with that in mind. The lowest cash balance is ${money(metrics.cash.lowestCash)}, in month ${metrics.cash.lowestCashMonth}.`,
      );
      if (debt > 0 || equity > 0) {
        p.push(
          `Funding comprises ${money(equity)} of equity and owner contribution and ${money(debt)} of debt.` +
            (metrics.underwriter.minimumDscr !== null
              ? ` Debt service coverage does not fall below ${formatMultiple(metrics.underwriter.minimumDscr)} in any year of the plan.`
              : ""),
        );
      }
      break;

    case "company":
      p.push(`${name} operates in ${benchmark.label.toLowerCase()}. ${ctx.description || ""}`.trim());
      p.push(
        `The plan begins in ${assumptions.company.startDate.slice(0, 7)} and runs for ${model.annual.length} years.` +
          (assumptions.company.firstTradingMonth > 1
            ? ` Trading begins in month ${assumptions.company.firstTradingMonth}, with the preceding months given over to preparation.`
            : " The business trades from the first month of the plan."),
      );
      if (owner) {
        p.push(
          `The owner draws ${money(owner.annualSalary)} a year. That figure is stated explicitly because a plan showing no owner compensation invites a lender to substitute a market salary and recompute the coverage ratios themselves.`,
        );
      }
      break;

    case "products":
      if (stream) {
        p.push(`${name} earns from ${stream.name.toLowerCase()}, modelled as ${describeModel(stream.kind)}.`);
        p.push(describeDrivers(stream, currency));
      }
      p.push(
        `Direct costs run at ${formatPercent(1 - metrics.unitEconomics.grossMargin)} of revenue, leaving a gross margin of ${formatPercent(metrics.unitEconomics.grossMargin)}. The industry median is ${formatPercent(benchmark.grossMargin.median)}.`,
      );
      break;

    case "market": {
      p.push(
        `The market section is built from the drivers in the financial model rather than from a published market-size figure. That is deliberate: a share-of-a-large-market claim is the most common reason a market section is dismissed.`,
      );
      const sizing = ctx.market ? computeSizing(ctx.market.sizing, model) : null;
      if (sizing?.complete) {
        const som = sizing.steps.find((step) => step.key === "som");
        p.push(
          `The build starts from ${Math.round(ctx.market!.sizing.populationCount).toLocaleString("en-US")} ${
            ctx.market!.sizing.populationLabel.toLowerCase() || "potential customers"
          }, of whom ${formatPercent(ctx.market!.sizing.qualifiedShare)} are plausible buyers spending ${money(
            ctx.market!.sizing.annualSpendPerCustomer,
          )} a year. That gives a total addressable market of ${money(sizing.tam)}, of which ${money(
            sizing.sam,
          )} is serviceable and ${money(som?.value ?? sizing.som)} is realistically obtainable inside the plan horizon.`,
        );
        if (sizing.modelCheck.status === "checked" && sizing.modelCheck.overruns) {
          p.push(
            `The model and this build do not yet agree: the financial plan forecasts more revenue than the obtainable share above. One of the two needs revising before this section is defensible.`,
          );
        }
      } else {
        p.push(
          `No bottom-up build has been recorded yet, so no market size is stated here. An unsupported figure would be worse than none.`,
        );
      }
      if (stream) p.push(describeDrivers(stream, currency));
      p.push(
        `At the modelled volumes, the business needs ${money(metrics.breakEven.monthlyRevenueRequired)} of revenue a month to cover its fixed costs. Whether that level of demand exists in the catchment is the question this section has to answer, and it is the assumption most worth testing before committing capital.`,
      );
      break;
    }

    case "competition": {
      const competitors = ctx.market?.competitors ?? [];
      if (competitors.length === 0) {
        p.push(
          `A competitive analysis is only persuasive when it names real competitors with observed prices and dates. Those have not yet been gathered for this plan, and this section should not pretend otherwise.`,
        );
      } else {
        p.push(
          `The comparison set is ${joinNames(competitors.map((c) => c.name))} — the businesses a customer would actually consider instead, rather than the largest names in the sector.`,
        );
        for (const competitor of competitors.slice(0, 4)) {
          const price = competitor.priceLabel
            ? competitor.priceDate
              ? `${competitor.priceLabel}, observed ${competitor.priceDate}`
              : `${competitor.priceLabel}, though the observation is undated and should be re-checked before this is filed`
            : "no published price was found, which is itself worth noting";
          p.push(
            `${competitor.name}${competitor.positioning ? ` sits as ${competitor.positioning.toLowerCase()}` : ""}. Pricing: ${price}.${
              competitor.weaknesses ? ` Where they are weak: ${competitor.weaknesses}` : ""
            }`,
          );
        }
      }
      p.push(
        `What the model does establish is the price point the business has to defend: ${describePrice(stream, currency)}. Any competitor operating below that price, or offering materially more at the same price, is a direct threat to the volumes assumed here.`,
      );
      break;
    }

    case "marketing":
      p.push(
        `Marketing runs at ${marketingShare(ctx)} of revenue in the model. ${
          metrics.unitEconomics.customerAcquisitionCost !== null
            ? `At an acquisition cost of ${money(metrics.unitEconomics.customerAcquisitionCost)} per customer, that spend has to produce enough volume to hit the revenue line above.`
            : "No per-customer acquisition cost has been established yet, which makes the marketing line the least tested assumption in the plan."
        }`,
      );
      if (metrics.unitEconomics.ltvToCac !== null) {
        p.push(
          `Lifetime value against acquisition cost stands at ${formatMultiple(metrics.unitEconomics.ltvToCac)}. Investors generally treat three times as the floor for a model that scales on paid acquisition.`,
        );
      }
      break;

    case "operations":
      p.push(
        `Operations are modelled through the cost base rather than described separately. Operating expenses total ${money(y1?.totalOpex ?? 0)} in year one, rising to ${money(y3?.totalOpex ?? 0)} by year three.`,
      );
      p.push(
        `Working capital assumes customers pay after ${assumptions.workingCapital.receivableDays} days and suppliers are paid after ${assumptions.workingCapital.payableDays} days.` +
          (assumptions.workingCapital.inventoryDays > 0
            ? ` Stock turns every ${assumptions.workingCapital.inventoryDays} days.`
            : ""),
      );
      break;

    case "team": {
      const staff = assumptions.roles.filter((r) => !r.isOwner);
      p.push(
        owner
          ? `The business is led by its owner, who takes ${money(owner.annualSalary)} a year from month ${owner.startMonth}.`
          : `No owner compensation is recorded, which a lender will treat as an omission rather than a saving.`,
      );
      if (staff.length > 0) {
        p.push(
          `Alongside the owner, the plan carries ${staff
            .map((r) => `${r.count} ${r.title.toLowerCase()}${r.count > 1 ? "" : ""} at ${money(r.annualSalary)} each`)
            .join(", ")}. Payroll is loaded at ${formatPercent(assumptions.payroll.payrollTaxRate + assumptions.payroll.benefitsRate)} above gross wages to cover employer taxes and benefits.`,
        );
      } else {
        p.push(`No other staff are budgeted, so the plan assumes the owner covers all delivery.`);
      }
      break;
    }

    case "regulations":
      p.push(
        `Regulatory obligations for ${benchmark.label.toLowerCase()} vary by jurisdiction, and this section should be completed against the requirements of the specific city and state in which the business will operate.`,
      );
      p.push(
        `Licences, inspections and insurance requirements should be confirmed with the relevant authority before the plan is submitted. A plan that asserts a specific requirement incorrectly is worse than one that states the obligation will be confirmed.`,
      );
      break;

    case "risks":
      p.push(
        breakEven
          ? `The plan reaches operating profit in month ${breakEven}, and the cash trough of ${money(metrics.cash.lowestCash)} in month ${metrics.cash.lowestCashMonth} is the point of greatest exposure.`
          : `The plan does not reach operating profit within the horizon. That is the central risk and it should be addressed before the document goes to any external reader.`,
      );
      p.push(
        `The assumption most worth challenging is ${weakestAssumption(ctx)}. A shortfall there moves the revenue line directly, and the cost base is largely fixed in the first year, so the effect falls straight to cash.`,
      );
      if (metrics.underwriter.minimumDscr !== null && metrics.underwriter.minimumDscr < 1.25) {
        p.push(
          `Debt service coverage bottoms out at ${formatMultiple(metrics.underwriter.minimumDscr)}, which leaves little room between the plan and its obligations.`,
        );
      }
      break;

    case "ai-resilience": {
      p.push(
        `Lenders began asking small-business borrowers in 2026 how artificial intelligence might reshape their industry over the life of a long loan, and have declined applications where the business looked straightforwardly automatable. This section exists to answer that question rather than avoid it.`,
      );
      const assessment = ctx.resilience ? assessResilience(ctx.resilience) : null;
      if (assessment && assessment.exposure !== null) {
        p.push(
          `Assessed task by task and weighted by what each part costs to run, exposure stands at ${formatPercent(
            assessment.exposure,
          )} across ${formatPercent(assessment.coverage)} of the cost base — ${assessment.bandLabel.toLowerCase()}. The weighting matters: a handful of automatable tasks that cost almost nothing is a different business from one automatable task carrying most of the overhead.`,
        );
        const exposed = assessment.mostExposed.filter((t) => t.level !== "low");
        if (exposed.length > 0) {
          p.push(
            `The parts most open to it are ${joinNames(exposed.map((t) => t.task.toLowerCase()))}. ${
              exposed[0]?.rationale ?? ""
            }`.trim(),
          );
        }
        if (ctx.resilience?.moatStatement) {
          p.push(`What is genuinely hard to automate here: ${ctx.resilience.moatStatement}`);
        }
        const steps = (ctx.resilience?.roadmap ?? []).filter((r) => r.action.trim().length > 0);
        if (steps.length > 0) {
          p.push(
            `The response is planned rather than hoped for: ${steps
              .map((step) => `${step.action.toLowerCase()}${step.expectedEffect ? `, to ${step.expectedEffect.toLowerCase()}` : ""}`)
              .join("; ")}.`,
          );
        }
      } else {
        p.push(
          `For ${benchmark.label.toLowerCase()}, the exposure should be assessed task by task: which activities are largely information handling and therefore automatable, and which depend on physical presence, licensure, trust or local relationships. The defensible part of the business is whatever survives that sort. No assessment has been recorded yet, so this section states the method rather than a conclusion.`,
        );
      }
      break;
    }

    case "financials":
      p.push(
        `Revenue is built from drivers rather than from a growth rate. ${stream ? describeDrivers(stream, currency) : ""}`.trim(),
      );
      p.push(
        `The result is ${money(y1?.revenue ?? 0)} in year one and ${money(y5?.revenue ?? 0)} by year five, with EBITDA moving from ${money(y1?.ebitda ?? 0)} to ${money(y5?.ebitda ?? 0)} over the same period.`,
      );
      p.push(
        `The balance sheet ties in all ${model.horizonMonths} periods of the model. Cash reaches its low point of ${money(metrics.cash.lowestCash)} in month ${metrics.cash.lowestCashMonth}${
          metrics.cash.peakFundingNeed > 0
            ? `, at which point the plan requires a further ${money(metrics.cash.peakFundingNeed)} to remain solvent`
            : ", and does not go negative at any point"
        }.`,
      );
      if (metrics.underwriter.minimumDscr !== null) {
        p.push(
          `Debt service coverage is ${metrics.underwriter.dscrByYear
            .filter((r) => r.dscr !== null)
            .map((r) => `${formatMultiple(r.dscr!)} in year ${r.year}`)
            .join(", ")}.`,
        );
      }
      break;

    case "next-steps":
      p.push(
        `Three things determine whether this plan survives contact with a reader. First, the market section needs real evidence: named competitors, observed prices, and a bottom-up demand estimate for the specific catchment.`,
      );
      p.push(
        `Second, the assumptions currently carried as industry defaults should be replaced with measured figures wherever that is possible. The plan records which is which, and a reader will notice.`,
      );
      p.push(
        `Third, ${
          metrics.cash.peakFundingNeed > 0
            ? `the funding gap of ${money(metrics.cash.peakFundingNeed)} has to be closed before the plan is submitted anywhere.`
            : `the cash trough of ${money(metrics.cash.lowestCash)} in month ${metrics.cash.lowestCashMonth} should be stress-tested against a slower start than the one modelled.`
        }`,
      );
      break;

    default:
      p.push(
        `This section has not been drafted yet. The financial model behind it projects revenue of ${money(y1?.revenue ?? 0)} in year one.`,
      );
  }

  p.push(
    `—\nThis section was composed directly from the financial model because no language model is configured. Set ANTHROPIC_API_KEY to generate it with Claude. Every figure above is the same computed figure either way.`,
  );

  return p.filter(Boolean).join("\n\n");
}

/* -------------------------------------------------------------------------- */

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function describeModel(kind: string): string {
  const map: Record<string, string> = {
    "retail-footfall": "footfall multiplied by conversion and average spend",
    subscription: "customers multiplied by a monthly price, net of churn",
    "unit-sales": "units sold at a price, each carrying a unit cost",
    "hourly-services": "billable hours multiplied by a rate and a utilisation assumption",
    contract: "a book of fixed-term contracts at a monthly value",
    marketplace: "transaction value multiplied by a take rate",
    advertising: "impressions sold against a CPM",
  };
  return map[kind] ?? "a driver-based build";
}

function describeDrivers(stream: Record<string, unknown>, currency: string): string {
  const money = (n: number) => formatCurrency(n, currency);
  const kind = String(stream.kind);
  const n = (key: string) => Number(stream[key] ?? 0);

  switch (kind) {
    case "retail-footfall":
      return `The model assumes ${n("dailyTraffic").toLocaleString()} people a day, of whom ${formatPercent(n("conversionRate"))} buy, spending ${money(n("averageTicket"))} on average, across ${n("openDaysPerMonth")} trading days a month.`;
    case "subscription":
      return `The model assumes ${n("newCustomersMonth1").toLocaleString()} new customers in the first month at ${money(n("pricePerCustomerPerMonth"))} a month, with ${formatPercent(n("monthlyChurnRate"))} of the base leaving each month.`;
    case "unit-sales":
      return `The model assumes ${n("unitsMonth1").toLocaleString()} units in the first month at ${money(n("pricePerUnit"))} each, against a unit cost of ${money(n("costPerUnit"))}.`;
    case "hourly-services":
      return `The model assumes ${n("billableHeadcount")} billable people working ${n("hoursPerHeadPerMonth")} hours a month at ${formatPercent(n("utilisation"))} utilisation, billed at ${money(n("hourlyRate"))} an hour.`;
    case "contract":
      return `The model assumes ${n("newContractsPerMonth")} new contracts a month at ${money(n("monthlyValuePerContract"))} each, running for ${n("termMonths")} months.`;
    case "marketplace":
      return `The model assumes ${money(n("gmvMonth1"))} of transaction value in the first month, against a take rate of ${formatPercent(n("takeRate"))}.`;
    case "advertising":
      return `The model assumes ${n("impressionsMonth1").toLocaleString()} impressions in the first month at ${formatPercent(n("fillRate"))} fill and a CPM of ${money(n("cpm"))}.`;
    default:
      return "";
  }
}

function describePrice(stream: Record<string, unknown> | undefined, currency: string): string {
  if (!stream) return "the price implied by the model";
  const money = (n: number) => formatCurrency(n, currency);
  for (const key of ["averageTicket", "pricePerCustomerPerMonth", "pricePerUnit", "hourlyRate", "monthlyValuePerContract", "cpm"]) {
    const value = Number(stream[key] ?? 0);
    if (value > 0) return money(value);
  }
  return "the price implied by the model";
}

function marketingShare(ctx: GenerationContext): string {
  const marketing = ctx.assumptions.opex.find((o) => o.category === "marketing");
  if (marketing?.percentOfRevenue !== undefined) return formatPercent(marketing.percentOfRevenue);
  if (marketing) return formatCurrency(marketing.monthlyAmount, ctx.assumptions.company.currency) + " a month";
  return "nothing";
}

/** Names the driver the reader should push on first: the largest untested one. */
function weakestAssumption(ctx: GenerationContext): string {
  const registry = ctx.assumptions.registry;
  const defaults = Object.entries(registry).filter(([, v]) => v.provenance === "benchmark_default");
  if (defaults.length > 0) {
    const path = defaults[0]![0];
    const leaf = path.split(".").pop() ?? path;
    return `the ${leaf.replace(/([A-Z])/g, " $1").toLowerCase().trim()}, which is still carrying an industry default rather than a measured figure`;
  }
  const stream = ctx.assumptions.revenueStreams[0];
  if (stream?.kind === "retail-footfall") return "the daily footfall";
  if (stream?.kind === "subscription") return "the churn rate";
  return "the revenue ramp";
}

/**
 * "A, B and C" — the plain-English join, because a comma-separated list reads
 * like output and this is meant to read like a document.
 *
 * Falls back to semicolons when an item contains its own "and": "bookkeeping
 * and invoicing and reservations and front desk" is a sentence nobody can
 * parse on first reading.
 */
function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.some((name) => / and /i.test(name))) return names.join("; ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
