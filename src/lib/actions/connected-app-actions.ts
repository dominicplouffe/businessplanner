"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/**
 * Disconnects an app the person connected over OAuth.
 *
 * Removes the consent, which `/mcp` requires on every call, so the app's
 * current access token stops working at once rather than when it expires; and
 * revokes its refresh tokens, so it cannot mint another. Reconnecting means
 * going through consent again.
 */
export async function disconnectAppAction(raw: { clientId: string }) {
  const clientId = z.string().min(1).parse(raw.clientId);
  const user = await requireUser("/settings");
  const now = new Date();

  // Every write is scoped to this person, so a client id is not authorisation.
  await db.$transaction([
    db.oauthConsent.deleteMany({ where: { userId: user.id, clientId } }),
    db.oauthRefreshToken.updateMany({ where: { userId: user.id, clientId, revoked: null }, data: { revoked: now } }),
    db.oauthAccessToken.updateMany({ where: { userId: user.id, clientId, revoked: null }, data: { revoked: now } }),
  ]);

  revalidatePath("/settings");
  return { ok: true as const };
}
