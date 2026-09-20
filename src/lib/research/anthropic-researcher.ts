import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import {
  CompetitorFindingsSchema,
  MarketFindingsSchema,
  keepVerifiable,
  type CompetitorFindings,
  type MarketFindings,
  type Researcher,
  type ResearchContext,
  type ResearchResult,
} from "./types";

/* ==========================================================================
   Grounded research against live sources.
   --------------------------------------------------------------------------
   Server-side web search plus a structured output, with one rule enforced on
   the way back out: anything that cannot be re-checked is dropped rather than
   trusted. The model is told the same rule, but the rule is applied here too,
   because a guarantee that depends on the model following an instruction is
   not a guarantee.
   ========================================================================== */

export const RESEARCH_MODEL = "claude-opus-5";

/** Kept byte-stable and cached: it is the same on every research call, and a
 *  reordered sentence would invalidate the cached prefix each time. */
const RESEARCH_SYSTEM = `You research businesses for a market section that a lender, an investor or an immigration adjudicator will read and check.

Rules, in order of importance:

1. Every factual claim you return must come from a page you actually retrieved in this session. If you did not retrieve it, do not return it.
2. Every source needs a URL you visited and a date — the page's publication date where it states one, otherwise today's date as a retrieval date. A source with no date cannot be re-checked and is worthless here.
3. Return fewer, better sources. Three retrievable sources beat ten plausible ones.
4. Prefer primary and industry sources over listicles and content marketing. Prefer a company's own pricing page over a third party's summary of it.
5. Never infer a URL from a company name. Never state a price you did not see.
6. Where you could not find something, leave it empty and say so in the notes. An empty field is a finding; an invented one is a defect.`;

let cached: Anthropic | null = null;
function client(): Anthropic {
  cached ??= new Anthropic({ maxRetries: 2 });
  return cached;
}

/** Shared search configuration. Five searches is enough for a market section
 *  and bounds the spend per call. */
const searchTool = {
  type: "web_search_20260318" as const,
  name: "web_search" as const,
  max_uses: 5,
};

export class AnthropicResearcher implements Researcher {
  readonly kind = "anthropic" as const;

  async findCompetitors(ctx: ResearchContext): Promise<ResearchResult<CompetitorFindings>> {
    return run(
      CompetitorFindingsSchema,
      `Find up to five real, currently-trading competitors for this business.

Business: ${ctx.companyName}
Industry: ${ctx.industryLabel}
What it does: ${ctx.description || "(not supplied)"}
${ctx.location ? `Where it operates: ${ctx.location}` : ""}

For each competitor give the name, the URL you visited, one line on where they sit in the market, and their price exactly as published with the date you saw it. If you could not find a published price, leave it empty — do not estimate one.`,
      (data) => ({
        competitors: data.competitors.filter((c) => /^https?:\/\//i.test(c.url)),
        sources: keepVerifiable(data.sources),
      }),
    );
  }

  async sizeMarket(ctx: ResearchContext): Promise<ResearchResult<MarketFindings>> {
    return run(
      MarketFindingsSchema,
      `Find the figures needed to size the market for this business from the ground up.

Business: ${ctx.companyName}
Industry: ${ctx.industryLabel}
What it does: ${ctx.description || "(not supplied)"}
${ctx.location ? `Where it operates: ${ctx.location}` : ""}

Two things are wanted, and the first matters more:

1. A countable population this business could sell to — households in a catchment, registered businesses of a given size in a region, licensed operators in a state. Give the number and say exactly what is being counted.
2. A published size for the overall market, if a credible one exists, with the source.

If you can only find one of the two, return that one and say in the notes why the other was not found.`,
      (data) => ({ ...data, sources: keepVerifiable(data.sources) }),
    );
  }
}

async function run<S extends z.ZodType, T>(
  schema: S,
  prompt: string,
  clean: (data: z.infer<S>) => T,
): Promise<ResearchResult<T>> {
  try {
    const message = await client().messages.parse({
      model: RESEARCH_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      // Research is the one place high effort earns its cost: the failure mode
      // is a confident wrong source, not a slow one.
      output_config: { effort: "high", format: zodOutputFormat(schema) },
      system: [
        { type: "text", text: RESEARCH_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      tools: [searchTool],
      messages: [{ role: "user", content: prompt }],
    });

    // A policy decline arrives as HTTP 200, so it is checked rather than caught.
    if (message.stop_reason === "refusal") {
      return {
        status: "error",
        message: "The model declined this research request. Rephrase the business description and try again.",
      };
    }
    if (!message.parsed_output) {
      return {
        status: "error",
        message: "The research came back in a shape that could not be read. Nothing was saved.",
      };
    }

    return { status: "ok", data: clean(message.parsed_output as z.infer<S>) };
  } catch (error) {
    return { status: "error", message: describeError(error) };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check network connectivity.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Research failed.";
}
