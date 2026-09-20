import { z } from "zod";

/* ==========================================================================
   Grounded research.
   --------------------------------------------------------------------------
   The single largest quality gap against the incumbents is that their market
   sections are unsourced, and that AI tools in this category hallucinate
   statistics and cite reports that do not exist. The headline guarantee here
   is zero uncited claims, which only means anything if the citation path
   cannot manufacture a citation.

   So this layer is deliberately unlike the prose generator. Prose can be
   composed offline from figures the engine computed, because composing a
   sentence around a real number invents nothing. A citation cannot be composed
   offline, because a source either exists and was retrieved or it did not and
   was not. The offline provider therefore returns "unavailable" and says why,
   and the UI reports that rather than filling the page with plausible-looking
   references.
   ========================================================================== */

/** A source that was actually retrieved. Every field here is required for a
 *  reason: a reference with no date cannot be re-checked, and one with no URL
 *  cannot be followed. */
export const SourceSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
  publisher: z.string().default(""),
  /** Publication date where the page states one, retrieval date otherwise. */
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The specific claim this source supports, in one sentence. */
  claim: z.string().min(1),
});
export type Source = z.infer<typeof SourceSchema>;

export const FoundCompetitorSchema = z.object({
  name: z.string().min(1),
  url: z.string().min(1),
  positioning: z.string().default(""),
  /** As published, in the seller's own words. Empty when none was found —
   *  an invented price is worse than an absent one. */
  priceLabel: z.string().default(""),
  /** When the price was observed. */
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  strengths: z.string().default(""),
  weaknesses: z.string().default(""),
});
export type FoundCompetitor = z.infer<typeof FoundCompetitorSchema>;

export const CompetitorFindingsSchema = z.object({
  competitors: z.array(FoundCompetitorSchema).default([]),
  sources: z.array(SourceSchema).default([]),
});
export type CompetitorFindings = z.infer<typeof CompetitorFindingsSchema>;

export const MarketFindingsSchema = z.object({
  /** A published size for the market, where one was found. */
  marketSize: z.number().min(0).optional(),
  marketSizeLabel: z.string().default(""),
  /** A countable population for the bottom-up build, where one was found. */
  populationLabel: z.string().default(""),
  populationCount: z.number().min(0).optional(),
  notes: z.string().default(""),
  sources: z.array(SourceSchema).default([]),
});
export type MarketFindings = z.infer<typeof MarketFindingsSchema>;

export type ResearchContext = {
  companyName: string;
  /** The industry label, not the key — the model reads it as English. */
  industryLabel: string;
  description: string;
  /** Where the business operates, when the plan captured it. */
  location?: string;
};

export type ResearchResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable"; reason: string }
  | { status: "error"; message: string };

export interface Researcher {
  readonly kind: "anthropic" | "offline";
  findCompetitors(ctx: ResearchContext): Promise<ResearchResult<CompetitorFindings>>;
  sizeMarket(ctx: ResearchContext): Promise<ResearchResult<MarketFindings>>;
}

/**
 * Drops anything that cannot be re-checked.
 *
 * A model asked for sources will occasionally return one with an empty date or
 * a URL it inferred rather than visited. Those are removed here rather than
 * trusted, because a citation nobody can follow is worse than a missing one:
 * it reads as diligence while providing none.
 */
export function keepVerifiable(sources: unknown[]): Source[] {
  const kept: Source[] = [];
  for (const candidate of sources) {
    const parsed = SourceSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (!/^https?:\/\//i.test(parsed.data.url)) continue;
    kept.push(parsed.data);
  }
  return kept;
}
