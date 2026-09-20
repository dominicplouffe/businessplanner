import { NextResponse, type NextRequest } from "next/server";
import { getSession, getOrCreateWorkspace } from "@/lib/session";
import { getPlan } from "@/lib/plans";
import { getBilling } from "@/lib/billing";

/* ==========================================================================
   Starting a checkout.
   --------------------------------------------------------------------------
   This route creates a session and returns a URL. It grants nothing: the
   entitlement is written by the webhook and nowhere else, because a browser
   that can reach the success URL can reach it without paying.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    planId?: string;
  };
  const workspace = await getOrCreateWorkspace(session.user.id, session.user.name);
  const origin = request.nextUrl.origin;
  const billing = getBilling();

  try {
    if (body.kind === "subscription") {
      const result = await billing.createSubscriptionCheckout({
        workspaceId: workspace.id,
        stripeCustomerId: workspace.stripeCustomerId,
        customerEmail: session.user.email,
        successUrl: `${origin}/settings/billing?welcome=1`,
        cancelUrl: `${origin}/settings/billing`,
      });
      return NextResponse.json(result);
    }

    if (!body.planId) {
      return NextResponse.json({ error: "No plan specified." }, { status: 400 });
    }
    // Checked against the caller's own workspace before any session is created,
    // so a plan id from somebody else's account cannot be paid for — or, more
    // to the point, cannot be unlocked by paying.
    const plan = await getPlan(body.planId, workspace.id);
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

    if (plan.unlockedAt) {
      return NextResponse.json({ error: "This plan is already unlocked." }, { status: 409 });
    }

    const result = await billing.createUnlockCheckout({
      workspaceId: workspace.id,
      planId: plan.id,
      planTitle: plan.companyName || plan.title,
      stripeCustomerId: workspace.stripeCustomerId,
      customerEmail: session.user.email,
      successUrl: `${origin}/plans/${plan.id}/export?unlocked=1`,
      cancelUrl: `${origin}/plans/${plan.id}/export`,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start checkout." },
      { status: 500 },
    );
  }
}
