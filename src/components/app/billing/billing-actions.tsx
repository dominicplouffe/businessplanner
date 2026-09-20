"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { pricing } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Starting a subscription, and managing one. Managing goes to Stripe's own
 *  portal rather than a screen of ours: their cancel button is one click, and
 *  building our own would only be an opportunity to make it harder. */
export function BillingActions({
  hasSubscription,
  hasCustomer,
  isDevBilling,
  className,
}: {
  hasSubscription: boolean;
  hasCustomer: boolean;
  isDevBilling: boolean;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const go = (path: string, body?: unknown) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
        const payload = (await response.json()) as { url?: string; error?: string };
        if (!response.ok || !payload.url) {
          setError(payload.error ?? "Something went wrong.");
          return;
        }
        window.location.href = payload.url;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Something went wrong.");
      }
    });
  };

  return (
    <div className={cn(className)}>
      <div className="flex flex-wrap gap-3">
        {hasSubscription || hasCustomer ? (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => go("/api/stripe/portal")}
          >
            {pending ? "Opening…" : "Manage billing"}
          </Button>
        ) : null}
        {!hasSubscription ? (
          <Button
            disabled={pending}
            onClick={() => go("/api/stripe/checkout", { kind: "subscription" })}
          >
            {pending ? "Opening…" : `Start ${pricing.live.name}`}
          </Button>
        ) : null}
      </div>

      {isDevBilling ? (
        <p className="mt-4 text-xs leading-relaxed text-tertiary">
          No Stripe key is configured, so checkout and the portal are simulated locally.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
