"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { grantAccess, revokeGrant } from "@/lib/billing";

/* ==========================================================================
   Admin actions.
   --------------------------------------------------------------------------
   Every one of these re-checks `requireAdmin()` rather than trusting that the
   layout did. A server action is a POST endpoint with a generated name, not a
   child of the page it was rendered on — anybody who has the name can call it,
   signed in as anybody. The layout guards what is *rendered*; these guard what
   is *done*, and only the second one matters to somebody who is not using the
   UI at all.
   ========================================================================== */

const GrantSchema = z.object({
  workspaceId: z.string().min(1),
  /** Empty grants every plan in the workspace, present and future. */
  planId: z.string().optional(),
  kind: z.enum(["unlock", "live"]),
  reason: z.string().min(1, "A grant needs a reason.").max(500),
  /** Days from now. Zero means it never expires, which is a decision. */
  expiresInDays: z.coerce.number().int().min(0).max(3650).default(0),
});

export async function grantAccessAction(raw: unknown) {
  const admin = await requireAdmin();
  const input = GrantSchema.parse(raw);

  await grantAccess({
    workspaceId: input.workspaceId,
    planId: input.planId || null,
    kind: input.kind,
    reason: input.reason,
    grantedById: admin.id,
    expiresAt:
      input.expiresInDays > 0
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
  });

  revalidatePath("/admin");
}

export async function revokeGrantAction(raw: unknown) {
  await requireAdmin();
  const { grantId } = z.object({ grantId: z.string().min(1) }).parse(raw);
  await revokeGrant(grantId);
  revalidatePath("/admin");
}
