import "server-only";
import type { Generator } from "./types";
import { AnthropicGenerator } from "./anthropic-generator";
import { FixtureGenerator } from "./fixture-generator";

export * from "./types";
export { buildFactsBlock } from "./context";
export { composeSection } from "./fixture-generator";

/**
 * Picks the generator by whether a key is configured.
 *
 * The fixture path is a first-class mode, not a degraded one: it composes the
 * same computed figures into real prose, so the product is fully demonstrable
 * and end-to-end testable with no key and no spend.
 */
export function getGenerator(): Generator {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicGenerator() : new FixtureGenerator();
}

export function generatorKind(): "anthropic" | "fixture" {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "fixture";
}
