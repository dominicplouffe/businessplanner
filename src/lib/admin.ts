import "server-only";
import { notFound } from "next/navigation";
import { isAdminEmail } from "./env";
import { getSession } from "./session";

/* ==========================================================================
   The admin gate.
   --------------------------------------------------------------------------
   One function, used by the layout, every action and every route that can see
   or change another workspace's data. Not a middleware: middleware guards a
   path prefix, and the thing worth guarding is the *data access*, which a
   future route under a different prefix would quietly escape.

   It answers 404, not 403. A 403 confirms the surface exists to whoever went
   looking; there is no reason to tell someone who is not an admin that there is
   an admin area to find.
   ========================================================================== */

/** The signed-in admin, or a 404 for everyone else. */
export async function requireAdmin() {
  const session = await getSession();
  const user = session?.user;
  // Not `requireUser()`: redirecting to sign-in would say the page exists.
  if (!user || !isAdminEmail(user.email)) notFound();
  return user;
}

/** For rendering decisions only — never as the gate itself. */
export async function viewerIsAdmin(): Promise<boolean> {
  const session = await getSession();
  return isAdminEmail(session?.user?.email);
}
