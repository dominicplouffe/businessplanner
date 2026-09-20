"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Calls the server action, then follows the success URL Stripe would have. */
export function SimulateButton({
  kind,
  workspaceId,
  planId,
  next,
  action,
}: {
  kind: "unlock" | "subscription";
  workspaceId: string;
  planId?: string;
  next: string;
  action: (input: { kind: string; workspaceId: string; planId?: string }) => Promise<{ ok: true }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        size="lg"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await action({ kind, workspaceId, planId });
              router.push(next);
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "The simulated payment failed.");
            }
          });
        }}
      >
        {pending ? "Confirming…" : "Confirm simulated payment"}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 max-w-md text-sm text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}
