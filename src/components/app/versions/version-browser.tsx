"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { restoreVersionAction, createSnapshotAction } from "@/lib/actions/section-actions";
import type { PlanDiff } from "@/lib/versions";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Browsing history.
   --------------------------------------------------------------------------
   The list on the left, the diff on the right. Selection is a URL parameter
   rather than component state so a particular comparison can be linked to, and
   so the diff is computed on the server where the plan already is.

   Sentences the regeneration left alone are rendered plainly rather than
   greyed out: the point of the view is to make the *changes* findable, and
   dimming eighty per cent of the text to achieve that makes the section
   unreadable instead.
   ========================================================================== */

export type VersionRow = {
  id: string;
  label: string;
  reasonLabel: string;
  createdAt: string;
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function VersionBrowser({
  planId,
  versions,
  selectedId,
  diff,
  modelChanged = false,
}: {
  planId: string;
  versions: VersionRow[];
  selectedId: string | null;
  diff: PlanDiff | null;
  /** The snapshot's assumptions differ from the plan's, which the sentence
   *  diff cannot show. A restore carries those back too, so it must be
   *  offered even when not a word of prose has changed. */
  modelChanged?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const restore = (versionId: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await restoreVersionAction({ planId, versionId });
        if (!result.ok) {
          setError(result.reason);
          return;
        }
        setNotice(`Restored “${result.label}”. The state before this restore was snapshotted first.`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not restore that snapshot.");
      }
    });
  };

  const checkpoint = () => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await createSnapshotAction({ planId });
        setNotice("Checkpoint taken.");
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not take a checkpoint.");
      }
    });
  };

  if (versions.length === 0) {
    return (
      <section className="rounded-lg border border-hairline p-6">
        <p className="text-sm leading-relaxed text-secondary">
          Nothing to compare yet. A snapshot is taken before every regeneration and when
          intake completes — you can also take one now, before making a change you are
          not sure about.
        </p>
        <Button size="sm" variant="secondary" className="mt-4" disabled={pending} onClick={checkpoint}>
          <History aria-hidden className="size-3.5" />
          Take a checkpoint
        </Button>
      </section>
    );
  }

  const selected = versions.find((v) => v.id === selectedId);

  return (
    <div className="space-y-5">
      {notice ? (
        <p role="status" className="rounded-lg border border-hairline p-4 text-sm text-secondary">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-hairline p-4 text-sm text-critical">
          {error}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,18rem)_1fr] lg:gap-12">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">Snapshots</h2>
            <Button size="sm" variant="ghost" disabled={pending} onClick={checkpoint}>
              <History aria-hidden className="size-3.5" />
              Checkpoint
            </Button>
          </div>
          <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
            {versions.map((version) => (
              <li key={version.id}>
                <Link
                  href={`/plans/${planId}/versions?v=${version.id}`}
                  aria-current={version.id === selectedId ? "true" : undefined}
                  className={cn(
                    "block py-3.5 pl-3 transition-colors",
                    version.id === selectedId
                      ? "-ml-px border-l-2 border-emerald-700 bg-surface-sunken"
                      : "border-l-2 border-transparent hover:bg-surface-sunken",
                  )}
                >
                  <p className="text-sm text-primary">{version.label}</p>
                  <p className="mt-0.5 text-xs text-tertiary">
                    {version.reasonLabel}
                    <span aria-hidden className="mx-1.5">·</span>
                    <time dateTime={version.createdAt}>
                      {WHEN.format(new Date(version.createdAt))}
                    </time>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          {selected && diff ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <h2 className="font-display text-lg">
                    {selected.label} <span className="text-tertiary">vs now</span>
                  </h2>
                  <p className="mt-1 text-sm text-secondary">
                    {diff.changedCount === 0 ? (
                      modelChanged
                        ? "No prose has changed, but the assumptions behind it have. Restoring brings the model back too."
                        : "Nothing has changed since this snapshot."
                    ) : (
                      <>
                        <span className="numeric">{diff.changedCount}</span>{" "}
                        {diff.changedCount === 1 ? "section" : "sections"} changed —{" "}
                        <span className="numeric text-good">+{diff.totalAdded}</span>{" "}
                        <span className="numeric text-critical">−{diff.totalRemoved}</span>{" "}
                        sentences.
                      </>
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || (diff.changedCount === 0 && !modelChanged)}
                  onClick={() => restore(selected.id)}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  {pending ? "Restoring…" : "Restore this"}
                </Button>
              </div>

              {diff.changedCount > 0 ? (
                <div className="mt-6 space-y-6">
                  {diff.sections
                    .filter((section) => !section.unchanged)
                    .map((section) => (
                      <section
                        key={section.key}
                        className="rounded-lg border border-hairline p-5"
                        aria-labelledby={`diff-${section.key}`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                          <h3 id={`diff-${section.key}`} className="text-sm font-medium text-primary">
                            {section.title}
                          </h3>
                          <p className="numeric text-xs">
                            <span className="text-good">+{section.addedCount}</span>{" "}
                            <span className="text-critical">−{section.removedCount}</span>
                          </p>
                        </div>
                        {section.addedEntirely ? (
                          <p className="mt-1 text-xs text-tertiary">
                            Written after this snapshot was taken.
                          </p>
                        ) : section.removedEntirely ? (
                          <p className="mt-1 text-xs text-tertiary">
                            Emptied since this snapshot was taken.
                          </p>
                        ) : null}

                        <div className="mt-4 space-y-1.5 text-sm leading-relaxed">
                          {section.parts.map((part, i) => (
                            <p
                              key={i}
                              className={cn(
                                "rounded-sm px-2 py-0.5",
                                part.op === "added" && "bg-emerald-600/10 text-primary",
                                part.op === "removed" &&
                                  "bg-critical/10 text-secondary line-through decoration-critical/50",
                                part.op === "same" && "text-secondary",
                              )}
                            >
                              {/* Colour never carries meaning alone: the sign is
                                  read out for anyone not seeing the tint. */}
                              {part.op !== "same" ? (
                                <span className="sr-only">
                                  {part.op === "added" ? "Added: " : "Removed: "}
                                </span>
                              ) : null}
                              {part.op !== "same" ? (
                                <span aria-hidden className="numeric mr-1.5 text-xs text-tertiary">
                                  {part.op === "added" ? "+" : "−"}
                                </span>
                              ) : null}
                              {part.text}
                            </p>
                          ))}
                        </div>
                      </section>
                    ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-secondary">Select a snapshot to see what changed.</p>
          )}
        </div>
      </div>
    </div>
  );
}
