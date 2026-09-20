"use client";

import { useState, useTransition } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pricing } from "@/lib/brand";

/* ==========================================================================
   The unlock.
   --------------------------------------------------------------------------
   One payment, per plan, no renewal. The panel states the terms in full before
   the button rather than after it: a purchase screen that hides the refund
   policy and the renewal behaviour is the thing this category is criticised
   for, and saying it here costs nothing.
   ========================================================================== */

const INCLUDED = [
  "PDF, Word, PowerPoint and the Excel workbook with live formulas",
  "Tokenised share links with expiry, revocation and read tracking",
  "Every future regeneration and export of this plan",
];

export function UnlockPanel({
  planId,
  isDevBilling,
}: {
  planId: string;
  /** True when no Stripe key is configured, so the checkout is simulated. */
  isDevBilling: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "unlock", planId }),
        });
        const payload = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !payload.url) {
          setError(payload.error ?? "Could not start checkout.");
          return;
        }
        window.location.href = payload.url;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not start checkout.");
      }
    });
  };

  return (
    <section
      aria-labelledby="unlock"
      className="rounded-lg border border-strong bg-surface-raised p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="unlock" className="flex items-center gap-2 font-display text-xl">
            <Lock aria-hidden className="size-4 text-marker" />
            Unlock this plan
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">
            Reading the plan on screen is free and stays free. The files and the share
            links are the part you pay for, once.
          </p>
        </div>
        <p className="figure-hero shrink-0 font-display text-3xl tracking-[-0.02em]">
          ${pricing.unlock.price}
          <span className="ml-1.5 text-sm font-sans text-tertiary">once</span>
        </p>
      </div>

      <ul className="mt-6 space-y-2.5">
        {INCLUDED.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed text-secondary">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            {item}
          </li>
        ))}
      </ul>

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Button size="lg" onClick={start} disabled={pending}>
          {pending ? "Opening checkout…" : `Unlock for $${pricing.unlock.price}`}
        </Button>
        <p className="text-xs leading-relaxed text-tertiary">
          One payment. It does not renew and there is nothing to cancel.
          <br />
          {pricing.guaranteeDays}-day money-back guarantee, with no form to fill in.
        </p>
      </div>

      {isDevBilling ? (
        <p className="mt-5 rounded-sm border border-hairline p-3 text-xs leading-relaxed text-tertiary">
          No Stripe key is configured, so checkout is simulated locally. The simulated
          payment posts to the same webhook a real one does — the grant itself is not
          bypassed.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </section>
  );
}
