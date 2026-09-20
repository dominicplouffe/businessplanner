import type {
  CompetitorFindings,
  MarketFindings,
  Researcher,
  ResearchResult,
} from "./types";

/* ==========================================================================
   The offline researcher.
   --------------------------------------------------------------------------
   It returns nothing, on purpose.

   The fixture generator composes real prose around figures the engine
   computed, which invents nothing and is a first-class mode. There is no
   equivalent for a citation: a source was either retrieved or it was not, and
   a fixture citation would be a fabricated reference in a product whose entire
   claim is that it does not fabricate references.

   So this path reports its own absence, the market page renders the reason,
   and the readiness rubric scores the plan as unsourced — which is the truth.
   ========================================================================== */

const REASON =
  "Grounded research needs a live web search, which requires ANTHROPIC_API_KEY to be configured. " +
  "Nothing is returned rather than composed: a fabricated citation would be worse than none, " +
  "and everything else in this product is built on not doing that.";

export class OfflineResearcher implements Researcher {
  readonly kind = "offline" as const;

  async findCompetitors(): Promise<ResearchResult<CompetitorFindings>> {
    return { status: "unavailable", reason: REASON };
  }

  async sizeMarket(): Promise<ResearchResult<MarketFindings>> {
    return { status: "unavailable", reason: REASON };
  }
}
