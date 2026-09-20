import type { FinancialModel } from "@/lib/finance/engine";
import type { Metrics } from "@/lib/finance/metrics";
import type { Assumptions } from "@/lib/finance/types";
import type { MarketSizing } from "@/lib/market/sizing";
import type { Resilience } from "@/lib/market/resilience";

/** Everything a generator is allowed to know about a plan. */
export type GenerationContext = {
  planId: string;
  sectionKey: string;
  sectionTitle: string;
  companyName: string;
  industryKey: string;
  /** "sba-loan" | "investor" | "immigration" | "internal" */
  purpose: string;
  /** Free-text description captured at intake. */
  description: string;
  assumptions: Assumptions;
  model: FinancialModel;
  metrics: Metrics;
  /** Extra steer for a regeneration, e.g. "make this shorter and less formal". */
  instruction?: string;
  /** Sections already written, so later ones do not contradict earlier ones. */
  written: { key: string; title: string; text: string }[];
  /** The market page's contents, when it has any. Supplying it is what lets a
   *  market section be written from evidence rather than from adjectives. */
  market?: {
    sizing: MarketSizing;
    competitors: {
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
  /** The AI-disruption assessment, when it has been filled in. */
  resilience?: Resilience;
};

export type GenerationChunk =
  | { type: "text"; text: string }
  | { type: "status"; message: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

/**
 * The seam between the product and the model.
 *
 * Two implementations: one that calls Claude, one that composes deterministically
 * from engine output. The fixture path is not a stub — it writes real prose
 * around the same computed figures, so the product is demonstrable and testable
 * with no API key and no spend.
 */
export interface Generator {
  readonly kind: "anthropic" | "fixture";
  generateSection(ctx: GenerationContext): AsyncIterable<GenerationChunk>;
}
