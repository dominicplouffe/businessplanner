import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

/** Deduped per request, so a layout and its pages share one lookup. */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * For pages that require a signed-in user. Redirects to sign-in with a `next`
 * parameter so the user lands back where they were trying to go.
 */
export async function requireUser(returnTo?: string) {
  const session = await getSession();
  if (!session?.user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/sign-in${target}`);
  }
  return session.user;
}

/**
 * Every user gets a personal workspace on first use. Plans belong to a
 * workspace from day one — the immigration and advisory segments sell through
 * firms, and retrofitting tenancy later would mean migrating every plan.
 */
export const getOrCreateWorkspace = cache(async (userId: string, userName: string) => {
  const existing = await db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.workspace;

  const base = slugify(userName || "workspace");
  const slug = `${base}-${Math.random().toString(36).slice(2, 8)}`;

  const created = await db.workspace.create({
    data: {
      name: userName ? `${userName}'s workspace` : "My workspace",
      slug,
      kind: "personal",
      members: { create: { userId, role: "owner" } },
    },
  });

  /* Find-then-create, and nothing in the schema stops two. `cache()` dedupes
     within one request only, so a prefetch racing a navigation on a user's
     very first visit could create two workspaces — after which their plans
     split across both and half of them simply stop appearing. Re-reading the
     oldest membership settles it: both requests then agree on the same
     workspace, and the loser's is left empty rather than holding plans
     nobody can see. */
  const earliest = await db.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  return earliest?.workspace ?? created;
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "workspace";
}
