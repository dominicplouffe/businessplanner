import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";

/* ==========================================================================
   Competitors and citations: the plan's outside evidence.
   --------------------------------------------------------------------------
   Validated and written here so the market page and the MCP endpoint hold
   evidence to the same bar. Callers scope the plan to a workspace first;
   these take a plan id that has already been authorised.
   ========================================================================== */

export const CompetitorSchema = z.object({
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

export const CitationSchema = z.object({
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

/** Creates or updates a competitor. Returns its id. */
export async function upsertCompetitor(input: z.output<typeof CompetitorSchema>) {
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
    await db.competitor.updateMany({ where: { id: input.id, planId: input.planId }, data });
    return input.id;
  }
  const count = await db.competitor.count({ where: { planId: input.planId } });
  const created = await db.competitor.create({
    data: { ...data, planId: input.planId, position: count },
  });
  return created.id;
}

/** Creates or updates a citation. Returns its id. */
export async function upsertCitation(input: z.output<typeof CitationSchema>) {
  const data = {
    label: input.label,
    url: input.url || null,
    publisher: input.publisher || null,
    sourceDate: input.sourceDate,
    claim: input.claim,
    sectionKey: input.sectionKey || null,
  };

  if (input.id) {
    await db.citation.updateMany({ where: { id: input.id, planId: input.planId }, data });
    return input.id;
  }
  const created = await db.citation.create({ data: { ...data, planId: input.planId } });
  return created.id;
}
