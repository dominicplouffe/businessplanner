import { NextResponse, type NextRequest } from "next/server";
import { getSession, getOrCreateWorkspace } from "@/lib/session";
import { getBilling } from "@/lib/billing";

/* Stripe's hosted portal, where cancelling is one click and no retention flow
   stands in the way. That is the whole reason we send people there rather than
   building our own cancellation screen. */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const workspace = await getOrCreateWorkspace(session.user.id, session.user.name);
  if (!workspace.stripeCustomerId) {
    return NextResponse.json(
      { error: "There is nothing to manage yet — no payment has been made from this workspace." },
      { status: 409 },
    );
  }

  try {
    const url = await getBilling().createPortalSession({
      stripeCustomerId: workspace.stripeCustomerId,
      returnUrl: `${request.nextUrl.origin}/settings/billing`,
    });
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not open the billing portal." },
      { status: 500 },
    );
  }
}
