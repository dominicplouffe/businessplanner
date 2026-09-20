import "server-only";
import type { Researcher } from "./types";
import { AnthropicResearcher } from "./anthropic-researcher";
import { OfflineResearcher } from "./offline-researcher";

export * from "./types";

/**
 * Picks the researcher by whether a key is configured.
 *
 * Note the asymmetry with getGenerator(): the generator's offline path is a
 * first-class mode that writes real prose, while this one returns nothing at
 * all. That is deliberate and is explained in offline-researcher.ts — prose
 * composed from computed figures invents nothing; a composed citation is a
 * fabricated source.
 */
export function getResearcher(): Researcher {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicResearcher() : new OfflineResearcher();
}

export function researcherKind(): "anthropic" | "offline" {
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "offline";
}
