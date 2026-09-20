"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { saveCompetitorAction, deleteCompetitorAction } from "@/lib/actions/market-actions";
import { cn } from "@/lib/utils";

/* ==========================================================================
   The competitor matrix.
   --------------------------------------------------------------------------
   Three named competitors with a URL and a dated price point each is a
   blocking check, so this is structured data rather than a paragraph. The
   date is its own field for the same reason: "priced around $30" is a memory,
   "$29/user/month, seen 2026-09-14" is evidence, and only one of those can be
   re-checked by the person reading the plan.
   ========================================================================== */

export type CompetitorRow = {
  id: string;
  name: string;
  url: string | null;
  positioning: string;
  priceLabel: string;
  priceDate: string | null;
  strengths: string;
  weaknesses: string;
  origin: string;
};

const EMPTY = {
  name: "",
  url: "",
  positioning: "",
  priceLabel: "",
  priceDate: "",
  strengths: "",
  weaknesses: "",
};

type Draft = typeof EMPTY & { id?: string };

export function CompetitorMatrix({
  planId,
  competitors,
}: {
  planId: string;
  competitors: CompetitorRow[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dated = competitors.filter((c) => c.priceDate && c.url).length;

  const submit = () => {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      try {
        await saveCompetitorAction({
          planId,
          ...(draft.id ? { id: draft.id } : {}),
          name: draft.name,
          ...(draft.url ? { url: draft.url } : {}),
          positioning: draft.positioning,
          priceLabel: draft.priceLabel,
          ...(draft.priceDate ? { priceDate: draft.priceDate } : {}),
          strengths: draft.strengths,
          weaknesses: draft.weaknesses,
        });
        setDraft(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save.");
      }
    });
  };

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await deleteCompetitorAction({ planId, id });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not remove.");
      }
    });
  };

  return (
    <section aria-labelledby="competitors" className="rounded-lg border border-hairline p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="competitors" className="font-display text-xl">Competitors</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">
            Three named competitors, each with a link and a price you actually
            saw, with the date you saw it. A competitive section without dated
            evidence reads as generic, and export stays locked until there are
            three.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setDraft({ ...EMPTY })}>
          <Plus aria-hidden className="size-3.5" />
          Add one
        </Button>
      </div>

      <p
        className={cn(
          "mt-4 flex items-center gap-2 text-sm",
          dated >= 3 ? "text-good" : "text-warning",
        )}
      >
        {dated < 3 ? <AlertTriangle aria-hidden className="size-4 shrink-0" /> : null}
        <span className="numeric">{dated}</span> of {competitors.length || 0} named
        {competitors.length === 1 ? " competitor carries" : " competitors carry"} both a
        link and a dated price. Three is the bar.
      </p>

      {competitors.length > 0 ? (
        <div
          tabIndex={0}
          role="region"
          aria-label="Competitor matrix, scrollable"
          className="mt-6 overflow-x-auto rounded-lg border border-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <caption className="sr-only">Named competitors with price evidence</caption>
            <thead>
              <tr className="border-b border-strong">
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Name</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Position</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Price evidence</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-primary">Where they are weak</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium text-primary">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((competitor) => (
                <tr key={competitor.id} className="border-b border-hairline last:border-b-0 align-top">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <span className="font-medium text-primary">{competitor.name}</span>
                    {competitor.url ? (
                      <a
                        href={competitor.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-500"
                      >
                        Visit
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    ) : (
                      <span className="mt-0.5 block text-xs text-warning">No link</span>
                    )}
                    {competitor.origin === "research" ? (
                      <span className="mt-1 block text-xs text-tertiary">Found by research</span>
                    ) : null}
                  </th>
                  <td className="px-4 py-3 text-secondary">{competitor.positioning || "—"}</td>
                  <td className="px-4 py-3">
                    {competitor.priceLabel ? (
                      <>
                        <span className="numeric text-secondary">{competitor.priceLabel}</span>
                        {competitor.priceDate ? (
                          <span className="numeric mt-0.5 block text-xs text-tertiary">
                            seen {competitor.priceDate}
                          </span>
                        ) : (
                          <span className="mt-0.5 block text-xs text-warning">undated</span>
                        )}
                      </>
                    ) : (
                      <span className="text-warning">None recorded</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary">{competitor.weaknesses || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: competitor.id,
                            name: competitor.name,
                            url: competitor.url ?? "",
                            positioning: competitor.positioning,
                            priceLabel: competitor.priceLabel,
                            priceDate: competitor.priceDate ?? "",
                            strengths: competitor.strengths,
                            weaknesses: competitor.weaknesses,
                          })
                        }
                        className="rounded-sm p-1.5 text-tertiary transition-colors hover:bg-surface-sunken hover:text-primary"
                      >
                        <Pencil aria-hidden className="size-3.5" />
                        <span className="sr-only">Edit {competitor.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(competitor.id)}
                        disabled={pending}
                        className="rounded-sm p-1.5 text-tertiary transition-colors hover:bg-surface-sunken hover:text-critical"
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                        <span className="sr-only">Remove {competitor.name}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-strong px-5 py-6 text-sm text-tertiary">
          Nothing here yet. Name the three a customer would actually consider
          instead of you — not the three largest companies in the sector.
        </p>
      )}

      {draft ? (
        <form
          className="mt-6 space-y-5 rounded-lg border border-strong p-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary">
              {draft.id ? "Edit competitor" : "New competitor"}
            </h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-sm p-1 text-tertiary hover:text-primary"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">Cancel</span>
            </button>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name">
              {({ id }) => (
                <Input
                  id={id}
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              )}
            </Field>
            <Field label="Link" hint="The page you looked at.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="url"
                  aria-describedby={describedBy}
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://"
                />
              )}
            </Field>
            <Field label="Price, as published" hint="Their words, not your summary.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={draft.priceLabel}
                  onChange={(e) => setDraft({ ...draft, priceLabel: e.target.value })}
                  placeholder="$29 per user per month"
                />
              )}
            </Field>
            <Field label="Date you saw it" hint="Undated evidence is not evidence.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  aria-describedby={describedBy}
                  className="numeric"
                  value={draft.priceDate}
                  onChange={(e) => setDraft({ ...draft, priceDate: e.target.value })}
                />
              )}
            </Field>
          </div>

          <Field label="Where they sit in the market">
            {({ id }) => (
              <Input
                id={id}
                value={draft.positioning}
                onChange={(e) => setDraft({ ...draft, positioning: e.target.value })}
                placeholder="Cheapest option, self-serve only"
              />
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="What they do well">
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={draft.strengths}
                  onChange={(e) => setDraft({ ...draft, strengths: e.target.value })}
                />
              )}
            </Field>
            <Field label="Where they are weak" hint="This is the line your plan builds on.">
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  rows={3}
                  aria-describedby={describedBy}
                  value={draft.weaknesses}
                  onChange={(e) => setDraft({ ...draft, weaknesses: e.target.value })}
                />
              )}
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-critical">{error}</p>
      ) : null}
    </section>
  );
}
