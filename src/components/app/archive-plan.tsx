"use client";

import { useState, useTransition } from "react";
import { Archive } from "lucide-react";
import { archivePlanAction } from "@/lib/actions/plan-actions";
import { Button } from "@/components/ui/button";

/* ==========================================================================
   Archiving a plan.
   --------------------------------------------------------------------------
   There was no way to remove a plan from the dashboard at all: the action
   existed, deleted rather than archived, and had no caller.

   Two-step rather than a browser `confirm()`, which is unstyled, blocks the
   main thread and reads as a bug on a page like this. The plan is recoverable
   either way — archiving hides it, it does not destroy it — and the copy says
   so, because a control that sounds destructive does not get used.
   ========================================================================== */

export function ArchivePlanButton({ planId }: { planId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        <Archive aria-hidden className="size-3.5" />
        Archive this plan
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-secondary">
        Hide it from the dashboard? Nothing is deleted — the document, the
        versions and any purchase stay exactly as they are.
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(() => archivePlanAction(planId))}
      >
        {pending ? "Archiving…" : "Archive"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}
