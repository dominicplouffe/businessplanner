import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";

/* ==========================================================================
   Reading a shared plan.
   --------------------------------------------------------------------------
   Resolution and view tracking live here rather than in the page so the rules
   are in one place: a link works only while it exists, has not been revoked
   and has not expired, and every open is recorded.

   Viewers are counted, not identified. The IP is hashed with a per-deployment
   salt so a founder can see "three separate readers" without the product
   holding an address it has no business keeping.
   ========================================================================== */

export type SharedPlanAccess =
  | { status: "ok"; planId: string; shareLinkId: string; label: string }
  | { status: "missing" }
  | { status: "revoked" }
  | { status: "expired"; expiredOn: string };

export async function resolveShareToken(token: string): Promise<SharedPlanAccess> {
  if (!token || token.length < 16) return { status: "missing" };

  const link = await db.shareLink.findUnique({
    where: { token },
    select: { id: true, planId: true, label: true, revokedAt: true, expiresAt: true },
  });
  if (!link) return { status: "missing" };
  if (link.revokedAt) return { status: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return { status: "expired", expiredOn: link.expiresAt.toISOString().slice(0, 10) };
  }

  return { status: "ok", planId: link.planId, shareLinkId: link.id, label: link.label };
}

export async function recordShareView(input: {
  shareLinkId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  await db.shareView.create({
    data: {
      shareLinkId: input.shareLinkId,
      ipHash: input.ip ? hashIp(input.ip) : null,
      userAgent: input.userAgent?.slice(0, 400) ?? null,
    },
  });
}

/** Salted so the hash cannot be reversed with a rainbow table of every IPv4. */
function hashIp(ip: string): string {
  const salt = process.env.BETTER_AUTH_SECRET ?? "venturally-share-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export type ShareLinkSummary = {
  id: string;
  token: string;
  label: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
  expired: boolean;
};

/**
 * The links for a plan, with their read counts.
 *
 * Whether a link has expired is decided here rather than in the page: reading
 * the clock while a component renders makes it impure, and this is a data
 * question anyway.
 */
export async function listShareLinks(planId: string): Promise<ShareLinkSummary[]> {
  const links = await db.shareLink.findMany({
    where: { planId },
    orderBy: { createdAt: "desc" },
    include: {
      views: { orderBy: { viewedAt: "desc" }, take: 1 },
      _count: { select: { views: true } },
    },
  });

  const now = Date.now();
  return links.map((link) => ({
    id: link.id,
    token: link.token,
    label: link.label,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    viewCount: link._count.views,
    lastViewedAt: link.views[0]?.viewedAt.toISOString() ?? null,
    expired: link.expiresAt !== null && link.expiresAt.getTime() < now,
  }));
}
