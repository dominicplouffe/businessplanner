"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Lock, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Exports.
   --------------------------------------------------------------------------
   Four files, all built from the same assembled document so none of them can
   contradict the others. The workbook is the one that matters commercially:
   it is the model, not a picture of it, and a banker can change a driver cell
   and watch coverage move.

   Two locks, and the panel never conflates them. The review lock is about the
   document and is cleared by fixing findings; the unlock is about payment and
   is cleared by paying. A single greyed-out button with one reason would send
   somebody to the fix-it queue to solve a billing problem, or to checkout to
   solve an arithmetic one.
   ========================================================================== */

type Blocking = { id: string; title: string; remedy: string };

const FORMATS = [
  {
    key: "pdf",
    label: "PDF",
    icon: FileText,
    blurb: "The document as a reader receives it — typeset, with the sources appendix and the methodology note.",
  },
  {
    key: "xlsx",
    label: "Excel workbook",
    icon: FileSpreadsheet,
    blurb: "The model itself, as live formulas. Change a driver and revenue, margin and coverage all recalculate.",
    feature: true,
  },
  {
    key: "docx",
    label: "Word",
    icon: FileText,
    blurb: "The same document in the format lawyers and lenders annotate.",
  },
  {
    key: "pptx",
    label: "Pitch deck",
    icon: Presentation,
    blurb: "Generated from the plan, so the deck cannot drift from the document behind it.",
  },
] as const;

export function ExportPanel({
  planId,
  reviewClear,
  unlocked,
}: {
  planId: string;
  /** No blocking findings. */
  reviewClear: boolean;
  /** The one-time unlock has been paid for this plan. */
  unlocked: boolean;
}) {
  const canExport = reviewClear && unlocked;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<Blocking[]>([]);

  const run = async (format: string) => {
    setBusy(format);
    setError(null);
    setBlocking([]);
    try {
      const response = await fetch(`/api/export/${format}?planId=${encodeURIComponent(planId)}`);
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string; blocking?: Blocking[] };
        setError(payload.error ?? "The export failed.");
        setBlocking(payload.blocking ?? []);
        return;
      }
      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
        `plan.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="exports" className="rounded-lg border border-hairline p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="exports" className="font-display text-xl">Exports</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">
            Every format is built from one assembled document, so the workbook,
            the PDF and the deck cannot say different things.
          </p>
        </div>
        {!reviewClear ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-critical/10 px-3 py-1 text-xs font-medium text-critical">
            <Lock aria-hidden className="size-3.5" />
            Locked by the review
          </span>
        ) : !unlocked ? (
          // Neutral, not warning-coloured. Not having paid yet is a state, not
          // a fault in the document — and the warning tint measured 4.34:1
          // against its own tinted background, just under AA at this size.
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-strong px-3 py-1 text-xs font-medium text-secondary">
            <Lock aria-hidden className="size-3.5" />
            Not unlocked yet
          </span>
        ) : null}
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {FORMATS.map((format) => {
          const Icon = format.icon;
          return (
            <li
              key={format.key}
              className={cn(
                "rounded-lg border p-5",
                "feature" in format && format.feature ? "border-strong" : "border-hairline",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon aria-hidden className="size-4 text-tertiary" />
                <h3 className="text-sm font-medium text-primary">{format.label}</h3>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-secondary">{format.blurb}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-4"
                disabled={!canExport || busy !== null}
                onClick={() => run(format.key)}
              >
                <Download aria-hidden className="size-3.5" />
                {busy === format.key ? "Building…" : `Download ${format.label}`}
              </Button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <div role="alert" className="mt-6 rounded-lg border border-hairline p-5">
          <p className="text-sm font-medium text-critical">{error}</p>
          {blocking.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {blocking.map((item) => (
                <li key={item.id}>
                  <p className="text-sm text-primary">{item.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-tertiary">{item.remedy}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
