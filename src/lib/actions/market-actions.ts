"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { MarketSizingSchema } from "@/lib/market/sizing";
import { ResilienceSchema } from "@/lib/market/resilience";
import { getResearcher } from "@/lib/research";
import { getBenchmark } from "@/lib/finance/benchmarks";

async function scopedPlan(planId: string) {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await db.plan.findFirst({
    where: { id: planId, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!plan) throw new Error("Plan not found");
  return plan;
}

/* -------------------------------------------------------------------------- */
/* Market sizing                                                              */
/* -------------------------------------------------------------------------- */

export async function saveSizingAction(raw: { planId: string; sizing: unknown }) {
  const planId = z.string().min(1).parse(raw.planId);
  const plan = await scopedPlan(planId);
  // Parsed before it is stored, so a malformed share never reaches the engine.
  const sizing = MarketSizingSchema.parse(raw.sizing);

  await db.plan.update({
    where: { id: plan.id },
    data: { marketJson: JSON.stringify(sizing) },
  });

  revalidatePath(`/plans/${plan.id}/market`);
  revalidatePath(`/plans/${plan.id}/review`);
  return { ok: true as const };
}

/* -------------------------------------------------------------------------- */
/* Competitors                                                                */
/* -------------------------------------------------------------------------- */

const CompetitorSchema = z.object({
  id: z.string().optional(),
  planId: z.string().min(1),
  name: z.string().min(1).max(200),
  url: z.string().max(500).optional(),
  positioning: z.string().max(600).default(""),
  priceLabel: z.string().max(200).default(""),
  /** Undated evidence is not evidence, so the date is kept as its own field
   *  and the blocking check reads it rather than parsing prose. */
  priceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a yyyy-mm-dd date")
    .optional(),
  strengths: z.string().max(600).default(""),
  weaknesses: z.string().max(600).default(""),
  origin: z.enum(["owner", "research"]).default("owner"),
});

export type CompetitorInput = z.input<typeof CompetitorSchema>;

export async function saveCompetitorAction(raw: CompetitorInput) {
  const input = CompetitorSchema.parse(raw);
  const plan = await scopedPlan(input.planId);

  const data = {
    name: input.name,
    url: input.url || null,
    positioning: input.positioning,
    priceLabel: input.priceLabel,
    priceDate: input.priceDate || null,
    strengths: input.strengths,
    weaknesses: input.weaknesses,
    origin: input.origin,
  };

  if (input.id) {
    // updateMany, not update: it scopes the write to this plan, so an id from
    // another workspace cannot be edited by guessing it.
    await db.competitor.updateMany({ where: { id: input.id, planId: plan.id }, data });
  } else {
    const count = await db.competitor.count({ where: { planId: plan.id } });
    await db.competitor.create({ data: { ...data, planId: plan.id, position: count } });
  }

  revalidatePath(`/plans/${plan.id}/market`);
  revalidatePath(`/plans/${plan.id}/review`);
  return { ok: true as const };
}

export async function deleteCompetitorAction(raw: { planId: string; id: string }) {
  const planId = z.string().min(1).parse(raw.planId);
  const id = z.string().min(1).parse(raw.id);
  const plan = await scopedPlan(planId);

  await db.competitor.deleteMany({ where: { id, planId: plan.id } });

  revalidatePath(`/plans/${plan.id}/market`);
  revalidatePath(`/plans/${plan.id}/review`);
  return { ok: true as const };
}

/* -------------------------------------------------------------------------- */
/* Citations                                                                  */
/* -------------------------------------------------------------------------- */

const CitationSchema = z.object({
  id: z.string().optional(),
  planId: z.string().min(1),
  label: z.string().min(1).max(300),
  url: z.string().max(1000).optional(),
  publisher: z.string().max(200).optional(),
  /** A citation without a date is not one, which is why this is required. */
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a yyyy-mm-dd date"),
  claim: z.string().max(1000).default(""),
  sectionKey: z.string().max(60).optional(),
});

export type CitationInput = z.input<typeof CitationSchema>;

export async function saveCitationAction(raw: CitationInput) {
  const input = CitationSchema.parse(raw);
  const plan = await scopedPlan(input.planId);

  const data = {
    label: input.label,
    url: input.url || null,
    publisher: input.publisher || null,
    sourceDate: input.sourceDate,
    claim: input.claim,
    sectionKey: input.sectionKey || null,
  };

  if (input.id) {
    await db.citation.updateMany({ where: { id: input.id, planId: plan.id }, data });
  } else {
    await db.citation.create({ data: { ...data, planId: plan.id } });
  }

  revalidatePath(`/plans/${plan.id}/market`);
  revalidatePath(`/plans/${plan.id}/review`);
  return { ok: true as const };
}

export async function deleteCitationAction(raw: { planId: string; id: string }) {
  const planId = z.string().min(1).parse(raw.planId);
  const id = z.string().min(1).parse(raw.id);
  const plan = await scopedPlan(planId);

  await db.citation.deleteMany({ where: { id, planId: plan.id } });

  revalidatePath(`/plans/${plan.id}/market`);
  revalidatePath(`/plans/${plan.id}/review`);
  return { ok: true as const };
}

/* -------------------------------------------------------------------------- */
/* Resilience                                                                 */
/* -------------------------------------------------------------------------- */

export async function saveResilienceAction(raw: { planId: string; resilience: unknown }) {
  const planId = z.string().min(1).parse(raw.planId);
  const plan = await scopedPlan(planId);
  const resilience = ResilienceSchema.parse(raw.resilience);

  await db.plan.update({
    where: { id: plan.id },
    data: { resilienceJson: JSON.stringify(resilience) },
  });

  revalidatePath(`/plans/${plan.id}/resilience`);
  revalidatePath(`/plans/${plan.id}/review`);
  // The overview carries the readiness score, which the assessment feeds.
  revalidatePath(`/plans/${plan.id}`);
  return { ok: true as const };
}

/* -------------------------------------------------------------------------- */
/* Grounded research                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Runs a live search and stores whatever came back that can be re-checked.
 *
 * Findings are added rather than replacing what the author wrote: research
 * assists the market section, it does not own it. Anything already recorded
 * under the same name is left alone, so running this twice does not duplicate
 * the list or overwrite a correction someone made by hand.
 */
export async function researchMarketAction(raw: { planId: string }) {
  const planId = z.string().min(1).parse(raw.planId);
  const scoped = await scopedPlan(planId);

  const plan = await db.plan.findUnique({
    where: { id: scoped.id },
    select: { companyName: true, industryKey: true, contextJson: true, title: true },
  });
  if (!plan) throw new Error("Plan not found");

  const context = safeParseObject(plan.contextJson);
  const ctx = {
    companyName: plan.companyName || plan.title,
    industryLabel: getBenchmark(plan.industryKey).label,
    description: typeof context["description"] === "string" ? context["description"] : "",
    ...(typeof context["location"] === "string" ? { location: context["location"] } : {}),
  };

  const researcher = getResearcher();
  const [competitors, market] = await Promise.all([
    researcher.findCompetitors(ctx),
    researcher.sizeMarket(ctx),
  ]);

  if (competitors.status === "unavailable" || market.status === "unavailable") {
    const reason =
      competitors.status === "unavailable" ? competitors.reason : "Research is unavailable.";
    return { ok: false as const, status: "unavailable" as const, reason };
  }
  if (competitors.status === "error") {
    return { ok: false as const, status: "error" as const, reason: competitors.message };
  }
  if (market.status === "error") {
    return { ok: false as const, status: "error" as const, reason: market.message };
  }

  const existing = await db.competitor.findMany({
    where: { planId: scoped.id },
    select: { name: true },
  });
  const known = new Set(existing.map((c) => c.name.trim().toLowerCase()));

  let added = 0;
  let position = existing.length;
  for (const found of competitors.data.competitors) {
    if (known.has(found.name.trim().toLowerCase())) continue;
    await db.competitor.create({
      data: {
        planId: scoped.id,
        name: found.name,
        url: found.url,
        positioning: found.positioning,
        priceLabel: found.priceLabel,
        priceDate: found.priceDate ?? null,
        strengths: found.strengths,
        weaknesses: found.weaknesses,
        origin: "research",
        position: position++,
      },
    });
    added++;
    known.add(found.name.trim().toLowerCase());
  }

  const sources = [...competitors.data.sources, ...market.data.sources];
  const seen = await db.citation.findMany({
    where: { planId: scoped.id },
    select: { url: true, claim: true },
  });
  const knownSources = new Set(seen.map((c) => `${c.url ?? ""}|${c.claim}`));

  let cited = 0;
  for (const source of sources) {
    const key = `${source.url}|${source.claim}`;
    if (knownSources.has(key)) continue;
    await db.citation.create({
      data: {
        planId: scoped.id,
        label: source.label,
        url: source.url,
        publisher: source.publisher || null,
        sourceDate: source.sourceDate,
        claim: source.claim,
        sectionKey: "market",
      },
    });
    cited++;
    knownSources.add(key);
  }

  revalidatePath(`/plans/${scoped.id}/market`);
  revalidatePath(`/plans/${scoped.id}/review`);

  return {
    ok: true as const,
    status: "ok" as const,
    added,
    cited,
    populationLabel: market.data.populationLabel,
    populationCount: market.data.populationCount ?? null,
    notes: market.data.notes,
  };
}

function safeParseObject(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
