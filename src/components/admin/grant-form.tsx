"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { grantAccessAction } from "@/lib/actions/admin-actions";

/** Issues a grant. The reason is required here as well as in the action and the
 *  schema — not belt and braces, but because the field that explains a grant to
 *  whoever reads it in a year is worth refusing to submit without. */
export function GrantForm({
  workspaceId,
  plans,
}: {
  workspaceId: string;
  plans: { id: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await grantAccessAction({
              workspaceId,
              planId: String(formData.get("planId") ?? ""),
              kind: String(formData.get("kind") ?? "unlock"),
              reason: String(formData.get("reason") ?? ""),
              expiresInDays: String(formData.get("expiresInDays") ?? "0"),
            });
            (document.getElementById(`grant-${workspaceId}`) as HTMLFormElement | null)?.reset();
          } catch (e) {
            setError(e instanceof Error ? e.message : "That did not work.");
          }
        });
      }}
      id={`grant-${workspaceId}`}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tertiary">Scope</span>
        <select
          name="planId"
          className="h-9 rounded-sm border border-strong bg-surface px-2 text-sm"
          defaultValue=""
        >
          <option value="">Every plan in the workspace</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-tertiary">Gives</span>
        <select
          name="kind"
          className="h-9 rounded-sm border border-strong bg-surface px-2 text-sm"
          defaultValue="unlock"
        >
          <option value="unlock">Unlock — export and share</option>
          <option value="live">Live — subscription features</option>
        </select>
      </label>

      <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
        <span className="text-tertiary">
          Reason <span className="text-marker">*</span>
        </span>
        <input
          name="reason"
          required
          maxLength={500}
          placeholder="Testing the export pipeline"
          className="h-9 rounded-sm border border-strong bg-surface px-2 text-sm"
        />
      </label>

      <label className="flex w-28 flex-col gap-1 text-sm">
        <span className="text-tertiary">Expires (days)</span>
        <input
          name="expiresInDays"
          type="number"
          min={0}
          max={3650}
          defaultValue={0}
          className="h-9 rounded-sm border border-strong bg-surface px-2 text-sm"
        />
      </label>

      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Granting…" : "Grant"}
      </Button>

      {error ? (
        <p role="alert" className="w-full text-sm text-critical">
          {error}
        </p>
      ) : null}
      <p className="w-full text-xs text-tertiary">
        0 days means it never expires. Grants never write a purchase — the billing page shows this
        as complimentary access, not as a receipt.
      </p>
    </form>
  );
}
