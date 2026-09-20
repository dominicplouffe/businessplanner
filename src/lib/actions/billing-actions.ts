"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { billingIsLive } from "@/lib/billing";

/* ==========================================================================
   The development stand-in for a payment.
   --------------------------------------------------------------------------
   This exists so the whole purchase path can be walked with no Stripe account:
   the button below produces a synthetic Stripe event and posts it to the real
   webhook handler, which is the only code that can grant an entitlement.

   The point is that it does NOT bypass the grant. If `grantUnlock` has a bug —
   in its idempotency, its workspace check, its transaction — this finds it,
   because the dev path and the paid path run the same code from the webhook
   inwards.

   Three independent conditions gate it, and it throws if any is missing.
   ========================================================================== */

const SimulateSchema = z.object({
  kind: z.enum(["unlock", "subscription"]),
  workspaceId: z.string().min(1),
  planId: z.string().min(1).optional(),
});

export async function simulatePaymentAction(raw: unknown) {
  assertDevelopmentOnly();

  const input = SimulateSchema.parse(raw);
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  if (workspace.id !== input.workspaceId) {
    throw new Error("That checkout belongs to another workspace.");
  }

  const event = input.kind === "unlock"
    ? unlockEvent(workspace.id, input.planId ?? "", user.email)
    : subscriptionEvent(workspace.id);

  const origin = await currentOrigin();
  const response = await fetch(`${origin}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // One of the three gates in the webhook's own check. Without this the
      // handler demands a real Stripe signature and rejects the body.
      "x-venturally-dev-webhook": "1",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The simulated webhook was rejected (${response.status}). ${detail}`.trim());
  }

  if (input.planId) revalidatePath(`/plans/${input.planId}/export`);
  revalidatePath("/settings/billing");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

function assertDevelopmentOnly(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Simulated payments are not available in production.");
  }
  if (billingIsLive()) {
    throw new Error("A live Stripe key is configured; use real checkout.");
  }
}

/** Shaped as Stripe shapes it, so the handler is exercised, not special-cased. */
function unlockEvent(workspaceId: string, planId: string, email: string) {
  const id = `evt_dev_${crypto.randomUUID()}`;
  return {
    id,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_dev_${crypto.randomUUID()}`,
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        amount_total: 19900,
        currency: "usd",
        customer: `cus_dev_${workspaceId.slice(0, 12)}`,
        customer_email: email,
        payment_intent: `pi_dev_${crypto.randomUUID()}`,
        metadata: { workspaceId, planId, kind: "unlock" },
      },
    },
  };
}

function subscriptionEvent(workspaceId: string) {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: `evt_dev_${crypto.randomUUID()}`,
    object: "event",
    type: "customer.subscription.created",
    created: now,
    data: {
      object: {
        id: `sub_dev_${crypto.randomUUID()}`,
        object: "subscription",
        status: "active",
        cancel_at_period_end: false,
        customer: `cus_dev_${workspaceId.slice(0, 12)}`,
        current_period_end: now + 30 * 24 * 60 * 60,
        items: { data: [{ current_period_end: now + 30 * 24 * 60 * 60 }] },
        metadata: { workspaceId },
      },
    },
  };
}

/** The webhook is reached over HTTP on purpose — that is the path Stripe uses. */
async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
