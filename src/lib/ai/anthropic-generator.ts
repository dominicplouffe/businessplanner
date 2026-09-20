import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Generator, GenerationChunk, GenerationContext } from "./types";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompts";
import { buildFactsBlock } from "./context";

export const MODEL = "claude-opus-5";

let cached: Anthropic | null = null;
function client(): Anthropic {
  cached ??= new Anthropic({ maxRetries: 2 });
  return cached;
}

export class AnthropicGenerator implements Generator {
  readonly kind = "anthropic" as const;

  async *generateSection(ctx: GenerationContext): AsyncIterable<GenerationChunk> {
    const facts = buildFactsBlock(ctx);

    yield { type: "status", message: "Reading the financial model…" };

    let accumulated = "";

    try {
      const stream = client().messages.stream({
        model: MODEL,
        max_tokens: 8000,
        // Adaptive thinking is on by default on Opus 5; medium effort suits
        // prose written against facts that are already settled.
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Byte-stable prefix, so every section in a plan reuses the cache.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: buildUserMessage(ctx, facts) }],
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          accumulated += event.delta.text;
          yield { type: "text", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();

      // A policy decline arrives as HTTP 200 with stop_reason "refusal", so it
      // must be checked explicitly rather than caught.
      if (final.stop_reason === "refusal") {
        yield {
          type: "error",
          message:
            "The model declined to write this section. Rephrase the business description and try again.",
        };
        return;
      }
      if (final.stop_reason === "max_tokens") {
        yield { type: "status", message: "Section was truncated at the length limit." };
      }

      yield { type: "done", text: accumulated.trim() };
    } catch (error) {
      yield { type: "error", message: describeError(error) };
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The request was rejected: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check network connectivity.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error ${error.status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Generation failed.";
}
