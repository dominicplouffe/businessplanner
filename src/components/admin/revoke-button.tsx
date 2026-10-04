"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeGrantAction } from "@/lib/actions/admin-actions";

/** Withdraws a grant. The row stays, struck through: a grant that really did
 *  confer access for a fortnight still has to explain that fortnight. */
export function RevokeButton({ grantId }: { grantId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => revokeGrantAction({ grantId }))}
    >
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
