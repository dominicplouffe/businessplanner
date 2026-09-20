import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import {
  billingIsLive,
  grantUnlock,
  recordWebhookEvent,
  rememberStripeCustomer,
  stripeClient,
  upsertSubscription,
} from "@/lib/billing";
import { db } from "@/lib/db";

/* ==========================================================================
   The webhook.
   --------------------------------------------------------------------------
   The only code in this product that can grant an entitlement.

   Three properties matter and each is load-bearing:

   1. **Signed.** The body is verified against Stripe's signature before it is
      parsed. An unsigned POST to this URL from anywhere on the internet must
      not be able to unlock a plan, which is exactly what it could do if we
      trusted the JSON.
   2. **Idempotent.** Stripe retries any delivery that is not answered 2xx, and
      it retries for days. Every handler is keyed on the event id, so a
      redelivery is recorded and ignored rather than granting twice.
   3. **Forgiving about what it does not know.** An unrecognised event type is
      recorded and answered 200. Returning an error would make Stripe retry an
      event we are never going to handle, forever.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = await readEvent(request, raw);
  } catch (error) {
    // A signature failure is the mechanism working. 400 so Stripe stops.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signature verification failed." },
      { status: 400 },
    );
  }

  const seen = await recordWebhookEvent({ stripeEventId: event.id, type: event.type });
  if (!seen.firstDelivery) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const note = await handle(event);
    await db.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: { outcome: note.handled ? "processed" : "ignored", note: note.note },
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Handler failed.";
    await db.webhookEvent.update({
      where: { stripeEventId: event.id },
      data: { outcome: "failed", note: message },
    });
    // 500 so Stripe retries: the event was real and we failed to act on it.
    // The recorded row is updated rather than deleted, so the retry is seen as
    // a duplicate — which is why the retry path also re-checks Purchase.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Verifies and parses, or — in development only — accepts a synthetic event.
 *
 * The development path exists so the whole purchase flow can be walked with no
 * Stripe account. It is gated on three separate conditions, all of which must
 * hold: not production, no live Stripe key configured, and an explicit header.
 * Any one of them failing falls through to real verification, which then fails.
 */
async function readEvent(request: NextRequest, raw: string): Promise<Stripe.Event> {
  const isDevEvent =
    process.env.NODE_ENV !== "production" &&
    !billingIsLive() &&
    request.headers.get("x-venturelly-dev-webhook") === "1";

  if (isDevEvent) {
    const parsed = JSON.parse(raw) as Stripe.Event;
    if (!parsed?.id || !parsed?.type) throw new Error("Malformed development event.");
    return parsed;
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new Error("Missing stripe-signature header.");

  return stripeClient().webhooks.constructEventAsync(raw, signature, secret);
}

async function handle(event: Stripe.Event): Promise<{ handled: boolean; note: string }> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode !== "payment") {
        // Subscription state arrives on its own events, which carry the period
        // end and the cancellation flag this one does not.
        await learnCustomer(session.metadata?.workspaceId, session.customer);
        return { handled: true, note: "subscription checkout; awaiting subscription event" };
      }
      if (session.payment_status !== "paid") {
        return { handled: false, note: `payment_status=${session.payment_status}` };
      }

      const workspaceId = session.metadata?.workspaceId;
      const planId = session.metadata?.planId;
      if (!workspaceId || !planId) {
        return { handled: false, note: "checkout session carried no workspace or plan metadata" };
      }

      // Deliberately after the metadata check and before anything is written:
      // an event we are going to reject must not leave a customer id behind on
      // a workspace as a side effect.
      await learnCustomer(workspaceId, session.customer);

      const result = await grantUnlock({
        stripeEventId: event.id,
        workspaceId,
        planId,
        // What was actually charged, not what our price table says it should
        // have been. If those ever differ, the charge is the truth.
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "usd",
        stripeSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
      });
      return {
        handled: result.granted,
        note: result.granted ? `unlocked ${planId}` : (result.reason ?? "not granted"),
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata?.workspaceId;
      if (!workspaceId) return { handled: false, note: "subscription carried no workspace metadata" };

      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await learnCustomer(workspaceId, customerId);

      await upsertSubscription({
        workspaceId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: customerId,
        // Mirrored verbatim. Deriving our own status is how a local view ends
        // up disagreeing with the one the customer can see in Stripe.
        status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
        currentPeriodEnd: periodEnd(subscription),
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      });
      return { handled: true, note: `${subscription.id} -> ${subscription.status}` };
    }

    default:
      return { handled: false, note: "no handler for this type" };
  }
}

/**
 * Stores the Stripe customer the first time we see one for a workspace.
 *
 * Failures here are swallowed on purpose. `stripeCustomerId` is unique, so a
 * customer already attached to another workspace makes this throw — and if
 * that took the handler down, Stripe would retry an event we can never process
 * for days. Remembering the customer is a convenience for opening the billing
 * portal; it is not what grants anything, so it must not be able to block what
 * does.
 */
async function learnCustomer(
  workspaceId: string | undefined,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): Promise<void> {
  if (!workspaceId || !customer) return;
  const id = typeof customer === "string" ? customer : customer.id;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { stripeCustomerId: true },
  });
  if (!workspace || workspace.stripeCustomerId === id) return;
  try {
    await rememberStripeCustomer(workspaceId, id);
  } catch {
    // Left unset. The portal route reports "nothing to manage yet", which is
    // recoverable; a poisoned webhook is not.
  }
}

/**
 * The period end, wherever this API version puts it.
 *
 * Stripe moved `current_period_end` from the subscription onto its items. Both
 * are read because the value decides how long a cancelled customer keeps
 * access, and silently returning null would cut them off immediately.
 */
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const onSubscription = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  const onItem = subscription.items?.data?.[0]?.current_period_end;
  const seconds = onSubscription ?? onItem;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}
