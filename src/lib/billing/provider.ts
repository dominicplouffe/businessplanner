import "server-only";
import Stripe from "stripe";
import { brand, pricing } from "@/lib/brand";

/* ==========================================================================
   The billing seam.
   --------------------------------------------------------------------------
   Two implementations behind one interface, as the AI and research layers
   have — but with one critical difference, and it is worth being explicit
   about why.

   `FixtureGenerator` is a first-class mode: composing prose from computed
   figures is a real thing to do, and shipping it is a feature. A fake payment
   provider is not. It exists so the product can be developed and end-to-end
   tested without a Stripe account, and it grants entitlements without money
   changing hands — which is a catastrophic bug if it ever runs in production.

   So `DevBilling` refuses to construct outside development, loudly. The check
   is in the constructor rather than at the call site because a call site can be
   added later by somebody who has not read this comment.
   ========================================================================== */

export type CheckoutRequest = {
  workspaceId: string;
  planId: string;
  planTitle: string;
  /** Stripe customer for this workspace, when one already exists. */
  stripeCustomerId: string | null;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = {
  /** Where to send the browser. */
  url: string;
  /** Null for the dev provider, which creates no Stripe session. */
  sessionId: string | null;
};

export interface Billing {
  readonly kind: "stripe" | "dev";
  /** True when webhooks are the only path to an entitlement. */
  readonly verifiesPayments: boolean;
  createUnlockCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  createSubscriptionCheckout(request: Omit<CheckoutRequest, "planId" | "planTitle">): Promise<CheckoutResult>;
  /** Stripe's hosted billing portal, where cancellation is one click. */
  createPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<string>;
}

/* -------------------------------------------------------------------------- */
/* Stripe                                                                     */
/* -------------------------------------------------------------------------- */

let client: Stripe | null = null;

/** Lazily constructed so importing this module does not require a key. */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!client) client = new Stripe(key);
  return client;
}

export class StripeBilling implements Billing {
  readonly kind = "stripe" as const;
  readonly verifiesPayments = true;

  async createUnlockCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      ...customerFields(request),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pricing.unlock.price * 100,
            product_data: {
              name: `${brand.name} — ${pricing.unlock.name}`,
              description: `Export and sharing for “${request.planTitle}”. One payment, no renewal.`,
            },
          },
        },
      ],
      // Read back on the webhook. The plan id is NOT trusted from the success
      // URL: anybody can visit that, and only the webhook is signed.
      metadata: { workspaceId: request.workspaceId, planId: request.planId, kind: "unlock" },
      payment_intent_data: {
        metadata: { workspaceId: request.workspaceId, planId: request.planId, kind: "unlock" },
      },
    });
    if (!session.url) throw new Error("Stripe returned a session with no URL.");
    return { url: session.url, sessionId: session.id };
  }

  async createSubscriptionCheckout(
    request: Omit<CheckoutRequest, "planId" | "planTitle">,
  ): Promise<CheckoutResult> {
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      ...customerFields(request),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pricing.live.price * 100,
            recurring: { interval: "month" },
            product_data: {
              name: `${brand.name} — ${pricing.live.name}`,
              description: "Actuals tracking, re-forecasting and lender updates. Cancel any time.",
            },
          },
        },
      ],
      metadata: { workspaceId: request.workspaceId, kind: "subscription" },
      subscription_data: { metadata: { workspaceId: request.workspaceId } },
    });
    if (!session.url) throw new Error("Stripe returned a session with no URL.");
    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<string> {
    const session = await stripeClient().billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
    });
    return session.url;
  }
}

/** Stripe rejects `customer` and `customer_email` together. */
function customerFields(request: { stripeCustomerId: string | null; customerEmail: string }) {
  return request.stripeCustomerId
    ? { customer: request.stripeCustomerId }
    : { customer_email: request.customerEmail, customer_creation: "always" as const };
}

/* -------------------------------------------------------------------------- */
/* Development                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Sends the browser to a local page that simulates the Stripe hand-off, so the
 * whole purchase path can be walked and tested with no account and no spend.
 *
 * It grants nothing by itself. The simulated checkout posts a synthetic event
 * to the same webhook handler Stripe posts to, which is the only code that can
 * write an entitlement — so the dev path exercises the real grant rather than
 * bypassing it, and a bug in the grant is found here rather than in production.
 */
export class DevBilling implements Billing {
  readonly kind = "dev" as const;
  readonly verifiesPayments = false;

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DevBilling must never run in production: it grants entitlements without a payment. " +
          "Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
      );
    }
  }

  async createUnlockCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const params = new URLSearchParams({
      kind: "unlock",
      planId: request.planId,
      workspaceId: request.workspaceId,
      next: request.successUrl,
      cancel: request.cancelUrl,
    });
    return { url: `/billing/simulate?${params}`, sessionId: null };
  }

  async createSubscriptionCheckout(
    request: Omit<CheckoutRequest, "planId" | "planTitle">,
  ): Promise<CheckoutResult> {
    const params = new URLSearchParams({
      kind: "subscription",
      workspaceId: request.workspaceId,
      next: request.successUrl,
      cancel: request.cancelUrl,
    });
    return { url: `/billing/simulate?${params}`, sessionId: null };
  }

  async createPortalSession(input: { returnUrl: string }): Promise<string> {
    return `/billing/simulate?kind=portal&next=${encodeURIComponent(input.returnUrl)}`;
  }
}

/* -------------------------------------------------------------------------- */

/** True when a real Stripe key is configured. */
export function billingIsLive(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getBilling(): Billing {
  return billingIsLive() ? new StripeBilling() : new DevBilling();
}
