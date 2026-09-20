"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  assessResilience,
  EXPOSURE_LEVELS,
  HORIZONS,
  HORIZON_LABELS,
  MOAT_KINDS,
  MOAT_LABELS,
  type ExposureLevel,
  type Horizon,
  type Resilience,
} from "@/lib/market/resilience";
import { saveResilienceAction } from "@/lib/actions/market-actions";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The AI-disruption module.
   --------------------------------------------------------------------------
   Lenders started asking this in March 2026 and started declining businesses
   that look automatable. The answer they want is not reassurance, it is a
   task-level assessment — so exposure is entered per task with the share of
   the cost base it represents, and the rating is weighted by that share.
   Three exposed tasks worth 4% of costs is a different business from one
   exposed task worth 60%, and counting cannot tell them apart.
   ========================================================================== */

const EXPOSURE_LABELS: Record<ExposureLevel, string> = {
  low: "Low — hard to automate",
  moderate: "Moderate — partly automatable",
  high: "High — largely automatable",
};

export function ResilienceForm({
  planId,
  resilience,
}: {
  planId: string;
  resilience: Resilience;
}) {
  const [draft, setDraft] = useState<Resilience>(resilience);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const result = useMemo(() => assessResilience(draft), [draft]);

  const update = (next: Resilience) => {
    setDraft(next);
    setSaved(false);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        await saveResilienceAction({ planId, resilience: draft });
        setSaved(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save.");
      }
    });
  };

  const coveragePercent = Math.round(result.coverage * 100);

  return (
    <div className="space-y-10">
      {/* ---- The verdict ------------------------------------------------ */}
      <section
        aria-labelledby="exposure"
        className="rounded-lg border border-hairline bg-surface-raised p-6 sm:p-7"
      >
        <h2 id="exposure" className="text-eyebrow font-medium uppercase text-tertiary">
          Exposure
        </h2>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="figure-hero font-display text-4xl tracking-[-0.03em]">
            {result.exposure === null ? "—" : `${Math.round(result.exposure * 100)}%`}
          </p>
          <p
            className={cn(
              "text-lg font-medium",
              result.band === "high"
                ? "text-critical"
                : result.band === "low"
                  ? "text-good"
                  : "text-primary",
            )}
          >
            {result.bandLabel}
          </p>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          Weighted by what each task costs, not by how many tasks there are.
          The assessment covers <span className="numeric">{coveragePercent}%</span> of the
          cost base.
        </p>

        {result.gaps.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {result.gaps.map((gap) => (
              <li key={gap} className="flex items-start gap-2 text-sm leading-relaxed text-warning">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                {gap}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 flex items-center gap-2 text-sm text-good">
            <Check aria-hidden className="size-4" />
            All three parts are answered. This is more than any competitor in
            the category puts in front of a lender.
          </p>
        )}
      </section>

      {/* ---- Tasks ------------------------------------------------------ */}
      <section aria-labelledby="tasks" className="rounded-lg border border-hairline p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="tasks" className="font-display text-xl">What the business actually does</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-secondary">
              List the work, with roughly what share of your cost base each part
              represents. Rate how automatable it is over a ten-year horizon and
              say why — a rating with no reasoning behind it is a guess, and
              reads like one.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              update({
                ...draft,
                tasks: [
                  ...draft.tasks,
                  { id: crypto.randomUUID(), task: "", shareOfCost: 0, level: "moderate", rationale: "" },
                ],
              })
            }
          >
            <Plus aria-hidden className="size-3.5" />
            Add a task
          </Button>
        </div>

        {draft.tasks.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-strong px-5 py-6 text-sm text-tertiary">
            Nothing assessed yet. Start with whatever takes the most time or
            costs the most money.
          </p>
        ) : (
          <ul className="mt-6 space-y-6">
            {draft.tasks.map((task, i) => (
              <li key={task.id} className="rounded-lg border border-hairline p-5">
                <div className="grid gap-5 sm:grid-cols-[2fr_1fr_1.5fr]">
                  <Field label="The work">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={task.task}
                        onChange={(e) =>
                          update({
                            ...draft,
                            tasks: draft.tasks.map((t, j) =>
                              j === i ? { ...t, task: e.target.value } : t,
                            ),
                          })
                        }
                        placeholder="Bookkeeping and invoicing"
                      />
                    )}
                  </Field>
                  <Field label="Share of cost" hint="Percent.">
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        inputMode="decimal"
                        className="numeric"
                        value={task.shareOfCost ? String(Math.round(task.shareOfCost * 1000) / 10) : ""}
                        onChange={(e) => {
                          const parsed = Number(e.target.value);
                          const value = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed / 100)) : 0;
                          update({
                            ...draft,
                            tasks: draft.tasks.map((t, j) =>
                              j === i ? { ...t, shareOfCost: value } : t,
                            ),
                          });
                        }}
                      />
                    )}
                  </Field>
                  <Field label="How automatable">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={task.level}
                        onChange={(e) =>
                          update({
                            ...draft,
                            tasks: draft.tasks.map((t, j) =>
                              j === i ? { ...t, level: e.target.value as ExposureLevel } : t,
                            ),
                          })
                        }
                      >
                        {EXPOSURE_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {EXPOSURE_LABELS[level]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>

                <div className="mt-5 flex items-start gap-4">
                  <Field label="Why" className="flex-1">
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={2}
                        value={task.rationale}
                        onChange={(e) =>
                          update({
                            ...draft,
                            tasks: draft.tasks.map((t, j) =>
                              j === i ? { ...t, rationale: e.target.value } : t,
                            ),
                          })
                        }
                        placeholder="Already largely software; the remaining judgement is small."
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    onClick={() =>
                      update({ ...draft, tasks: draft.tasks.filter((_, j) => j !== i) })
                    }
                    className="mt-7 rounded-sm p-1.5 text-tertiary transition-colors hover:bg-surface-sunken hover:text-critical"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                    <span className="sr-only">Remove task {i + 1}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Moat ------------------------------------------------------- */}
      <section aria-labelledby="moat" className="rounded-lg border border-hairline p-6 sm:p-7">
        <h2 id="moat" className="font-display text-xl">What is hard to automate here</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
          Over a ten-year term this is the question the rating hangs on. Claim
          nothing you cannot defend — a lender has read the generic version many
          times.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <Field label="What kind of protection">
            {({ id }) => (
              <Select
                id={id}
                value={draft.moatKind}
                onChange={(e) => update({ ...draft, moatKind: e.target.value as typeof draft.moatKind })}
              >
                {MOAT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {MOAT_LABELS[kind]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="In your own words" className="lg:row-span-2">
            {({ id }) => (
              <Textarea
                id={id}
                rows={4}
                value={draft.moatStatement}
                onChange={(e) => update({ ...draft, moatStatement: e.target.value })}
                placeholder="A state licence takes two years and 4,000 supervised hours to obtain, and we hold three."
              />
            )}
          </Field>
        </div>
      </section>

      {/* ---- Roadmap ---------------------------------------------------- */}
      <section aria-labelledby="roadmap" className="rounded-lg border border-hairline p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 id="roadmap" className="font-display text-xl">What you intend to do about it</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-secondary">
              Exposure with no response reads as no answer at all. State what
              changes and what you expect it to do, so it can be checked later.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              update({
                ...draft,
                roadmap: [
                  ...draft.roadmap,
                  { id: crypto.randomUUID(), horizon: "now", action: "", expectedEffect: "" },
                ],
              })
            }
          >
            <Plus aria-hidden className="size-3.5" />
            Add a step
          </Button>
        </div>

        {draft.roadmap.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-strong px-5 py-6 text-sm text-tertiary">
            Nothing planned yet.
          </p>
        ) : (
          <ul className="mt-6 space-y-5">
            {draft.roadmap.map((step, i) => (
              <li key={step.id} className="grid gap-5 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-start">
                <Field label="When" className="sm:w-44">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={step.horizon}
                      onChange={(e) =>
                        update({
                          ...draft,
                          roadmap: draft.roadmap.map((r, j) =>
                            j === i ? { ...r, horizon: e.target.value as Horizon } : r,
                          ),
                        })
                      }
                    >
                      {HORIZONS.map((horizon) => (
                        <option key={horizon} value={horizon}>
                          {HORIZON_LABELS[horizon]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="What changes">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={step.action}
                      onChange={(e) =>
                        update({
                          ...draft,
                          roadmap: draft.roadmap.map((r, j) =>
                            j === i ? { ...r, action: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  )}
                </Field>
                <Field label="What you expect it to do">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={step.expectedEffect}
                      onChange={(e) =>
                        update({
                          ...draft,
                          roadmap: draft.roadmap.map((r, j) =>
                            j === i ? { ...r, expectedEffect: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  )}
                </Field>
                <button
                  type="button"
                  onClick={() =>
                    update({ ...draft, roadmap: draft.roadmap.filter((_, j) => j !== i) })
                  }
                  className="mt-7 rounded-sm p-1.5 text-tertiary transition-colors hover:bg-surface-sunken hover:text-critical"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                  <span className="sr-only">Remove step {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save the assessment"}
        </Button>
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm text-good">
            <Check aria-hidden className="size-4" />
            Saved
          </span>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-critical">{error}</p> : null}
    </div>
  );
}
