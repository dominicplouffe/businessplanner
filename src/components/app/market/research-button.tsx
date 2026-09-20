"use client";

import { useState, useTransition } from "react";
import { Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { researchMarketAction } from "@/lib/actions/market-actions";

/* ==========================================================================
   Grounded research, or an honest account of why there is none.
   --------------------------------------------------------------------------
   With no API key the offline researcher returns nothing at all, and this
   renders that reason rather than hiding the button. Hiding it would suggest
   the feature does not exist; showing it disabled with the reason attached
   tells the truth, which is the same standard the rest of the product holds
   itself to about its own numbers.
   ========================================================================== */

type Outcome =
  | { kind: "idle" }
  | { kind: "done"; added: number; cited: number; notes: string }
  | { kind: "failed"; reason: string };

export function ResearchButton({ planId, available }: { planId: string; available: boolean }) {
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  const run = () => {
    setOutcome({ kind: "idle" });
    startTransition(async () => {
      try {
        const result = await researchMarketAction({ planId });
        setOutcome(
          result.ok
            ? { kind: "done", added: result.added, cited: result.cited, notes: result.notes }
            : { kind: "failed", reason: result.reason },
        );
      } catch (cause) {
        setOutcome({
          kind: "failed",
          reason: cause instanceof Error ? cause.message : "Research failed.",
        });
      }
    });
  };

  return (
    <div>
      <Button type="button" variant="secondary" onClick={run} disabled={pending || !available}>
        <Search aria-hidden className="size-4" />
        {pending ? "Searching…" : "Research this for me"}
      </Button>

      {!available ? (
        <p className="mt-3 flex max-w-2xl items-start gap-2 text-xs leading-relaxed text-tertiary">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Live search needs <span className="numeric">ANTHROPIC_API_KEY</span> configured.
            Unlike the writing, this has no offline mode on purpose: prose can be
            composed from figures the engine already computed, but a citation
            cannot be composed from nothing. A fabricated source would be worse
            than none, so nothing is returned.
          </span>
        </p>
      ) : null}

      {outcome.kind === "done" ? (
        <p role="status" className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          Added {outcome.added} {outcome.added === 1 ? "competitor" : "competitors"} and{" "}
          {outcome.cited} {outcome.cited === 1 ? "source" : "sources"}. Anything already
          on the list was left as you had it.
          {outcome.notes ? ` ${outcome.notes}` : ""}
        </p>
      ) : null}

      {outcome.kind === "failed" ? (
        <p role="alert" className="mt-3 max-w-2xl text-sm leading-relaxed text-warning">
          {outcome.reason}
        </p>
      ) : null}
    </div>
  );
}
