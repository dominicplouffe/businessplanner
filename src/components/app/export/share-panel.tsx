"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Eye, Link2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { createShareLinkAction, revokeShareLinkAction } from "@/lib/actions/share-actions";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Share links.
   --------------------------------------------------------------------------
   Knowing an investor opened the plan twice and came back to it a week later
   is worth more to a founder than anything in the editor, and nothing in this
   category offers it. Each recipient gets their own link so the reads are
   attributable to the person, not to an anonymous total.
   ========================================================================== */

export type ShareRow = {
  id: string;
  token: string;
  label: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  /** Decided on the server: reading the clock during render makes the
   *  component impure, and the server already knows what time it is. */
  expired: boolean;
};

export function SharePanel({
  planId,
  links,
  unlocked,
}: {
  planId: string;
  links: ShareRow[];
  /** Creating a link is a paid action. Revoking one never is — somebody must
   *  always be able to take a link down, whatever their billing state. */
  unlocked: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      try {
        await createShareLinkAction({ planId, label, expiresInDays: Number(expiresInDays) });
        setLabel("");
        setCreating(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create the link.");
      }
    });
  };

  const revoke = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await revokeShareLinkAction({ planId, id });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not revoke the link.");
      }
    });
  };

  const copy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not reach the clipboard. The link is shown below to copy by hand.");
      setCopied(token);
    }
  };

  return (
    <section aria-labelledby="share" className="rounded-lg border border-hairline p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 id="share" className="font-display text-xl">Share a read-only link</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">
            One link per recipient, so you can tell who actually read it. Each
            one can expire, and any of them can be revoked without affecting
            the others.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!unlocked}
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden className="size-3.5" />
          New link
        </Button>
      </div>

      {!unlocked ? (
        <p className="mt-5 rounded-sm border border-hairline p-4 text-sm leading-relaxed text-secondary">
          Share links are part of the unlock. Existing links keep working and can still
          be revoked from here.
        </p>
      ) : null}

      {creating ? (
        <form
          className="mt-6 rounded-lg border border-strong p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-primary">New link</h3>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-sm p-1 text-tertiary hover:text-primary"
            >
              <X aria-hidden className="size-4" />
              <span className="sr-only">Cancel</span>
            </button>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field label="Who is it for?" hint="Shown only to you.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Meridian Capital — first meeting"
                />
              )}
            </Field>
            <Field label="Expires">
              {({ id }) => (
                <Select id={id} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
                  <option value="7">In a week</option>
                  <option value="30">In a month</option>
                  <option value="90">In three months</option>
                  <option value="0">Never</option>
                </Select>
              )}
            </Field>
          </div>
          <Button type="submit" size="sm" className="mt-5" disabled={pending}>
            {pending ? "Creating…" : "Create the link"}
          </Button>
        </form>
      ) : null}

      {links.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-strong px-5 py-6 text-sm text-tertiary">
          No links yet. Create one per recipient rather than sending the same
          one to everybody — that is what makes the read counts mean something.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-hairline border-t border-hairline">
          {links.map((link) => {
            const dead = Boolean(link.revokedAt) || link.expired;
            return (
              <li key={link.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", dead ? "text-tertiary line-through" : "text-primary")}>
                    {link.label || "Untitled link"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary">
                    <span className="flex items-center gap-1.5">
                      <Eye aria-hidden className="size-3.5" />
                      <span className="numeric">{link.viewCount}</span>{" "}
                      {link.viewCount === 1 ? "open" : "opens"}
                    </span>
                    {link.lastViewedAt ? (
                      <span className="numeric">last read {link.lastViewedAt.slice(0, 10)}</span>
                    ) : (
                      <span>not opened yet</span>
                    )}
                    {link.revokedAt ? (
                      <span className="text-critical">revoked</span>
                    ) : link.expired ? (
                      <span className="text-warning">expired {link.expiresAt?.slice(0, 10)}</span>
                    ) : link.expiresAt ? (
                      <span className="numeric">expires {link.expiresAt.slice(0, 10)}</span>
                    ) : (
                      <span>no expiry</span>
                    )}
                  </p>
                  {copied === link.token ? (
                    <p className="numeric mt-2 break-all text-xs text-tertiary">
                      /share/{link.token}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!dead ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => copy(link.token)}>
                      {copied === link.token ? (
                        <>
                          <Check aria-hidden className="size-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy aria-hidden className="size-3.5" />
                          Copy link
                        </>
                      )}
                    </Button>
                  ) : null}
                  {!link.revokedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => revoke(link.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-critical">{error}</p>
      ) : null}

      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-tertiary">
        <Link2 aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Anyone with a live link can read the plan without signing in. Readers
        are counted, never identified — the address they read from is hashed
        before it is stored.
      </p>
    </section>
  );
}
