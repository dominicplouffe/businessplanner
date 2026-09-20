"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { saveCitationAction, deleteCitationAction } from "@/lib/actions/market-actions";

/* ==========================================================================
   The sources appendix.
   --------------------------------------------------------------------------
   The most cited reason a plan is rejected is an unsourced market claim, and
   the most cited failure of AI writing tools is inventing the source. So every
   claim gets a row here, and every row needs a date — a reference nobody can
   re-check is worse than a missing one, because it reads as diligence while
   providing none.
   ========================================================================== */

export type CitationRow = {
  id: string;
  label: string;
  url: string | null;
  publisher: string | null;
  sourceDate: string;
  claim: string;
};

const EMPTY = { label: "", url: "", publisher: "", sourceDate: "", claim: "" };
type Draft = typeof EMPTY & { id?: string };

export function SourcesAppendix({
  planId,
  citations,
}: {
  planId: string;
  citations: CitationRow[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      try {
        await saveCitationAction({
          planId,
          ...(draft.id ? { id: draft.id } : {}),
          label: draft.label,
          ...(draft.url ? { url: draft.url } : {}),
          ...(draft.publisher ? { publisher: draft.publisher } : {}),
          sourceDate: draft.sourceDate,
          claim: draft.claim,
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
        await deleteCitationAction({ planId, id });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not remove.");
      }
    });
  };

  return (
    <section aria-labelledby="sources" className="rounded-lg border border-hairline p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="sources" className="font-display text-xl">Sources</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">
            Every outside claim in the plan, with the source that supports it and
            the date it was published or retrieved. This prints as an appendix,
            which is the difference between a market section a reader believes
            and one they discount.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setDraft({ ...EMPTY })}>
          <Plus aria-hidden className="size-3.5" />
          Add a source
        </Button>
      </div>

      {citations.length > 0 ? (
        <ol className="mt-6 divide-y divide-hairline border-t border-hairline">
          {citations.map((citation, i) => (
            <li key={citation.id} className="flex items-start gap-4 py-4">
              <span className="numeric mt-0.5 shrink-0 text-xs text-marker">
                [{i + 1}]
              </span>
              <div className="min-w-0 flex-1">
                {citation.claim ? (
                  <p className="text-sm leading-relaxed text-primary">“{citation.claim}”</p>
                ) : null}
                <p className="mt-1 text-sm text-secondary">
                  {citation.label}
                  {citation.publisher ? ` — ${citation.publisher}` : ""}
                  <span aria-hidden className="mx-2 text-tertiary">·</span>
                  <span className="numeric text-tertiary">{citation.sourceDate}</span>
                </p>
                {citation.url ? (
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-500"
                  >
                    {shortUrl(citation.url)}
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-warning">No link — a reader cannot follow this.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(citation.id)}
                disabled={pending}
                className="shrink-0 rounded-sm p-1.5 text-tertiary transition-colors hover:bg-surface-sunken hover:text-critical"
              >
                <Trash2 aria-hidden className="size-3.5" />
                <span className="sr-only">Remove source {i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-strong px-5 py-6 text-sm text-tertiary">
          No sources yet. Every statistic the plan quotes needs one of these, or
          the review will count it as an uncited claim.
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
            <h3 className="text-sm font-medium text-primary">New source</h3>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-sm p-1 text-tertiary hover:text-primary"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">Cancel</span>
            </button>
          </div>

          <Field label="What it supports" hint="The claim in the plan, in one sentence.">
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                rows={2}
                aria-describedby={describedBy}
                value={draft.claim}
                onChange={(e) => setDraft({ ...draft, claim: e.target.value })}
                placeholder="The catchment has 24,000 households."
              />
            )}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Title of the source">
              {({ id }) => (
                <Input
                  id={id}
                  required
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="American Community Survey, tract 4021"
                />
              )}
            </Field>
            <Field label="Publisher">
              {({ id }) => (
                <Input
                  id={id}
                  value={draft.publisher}
                  onChange={(e) => setDraft({ ...draft, publisher: e.target.value })}
                  placeholder="US Census Bureau"
                />
              )}
            </Field>
            <Field label="Link">
              {({ id }) => (
                <Input
                  id={id}
                  type="url"
                  value={draft.url}
                  onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  placeholder="https://"
                />
              )}
            </Field>
            <Field
              label="Date"
              hint="Published where the page says, retrieved otherwise. Required."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  required
                  aria-describedby={describedBy}
                  className="numeric"
                  value={draft.sourceDate}
                  onChange={(e) => setDraft({ ...draft, sourceDate: e.target.value })}
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

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}
