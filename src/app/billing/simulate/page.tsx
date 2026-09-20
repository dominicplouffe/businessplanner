import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Section } from "@/components/ui/section";
import { billingIsLive } from "@/lib/billing";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { simulatePaymentAction } from "@/lib/actions/billing-actions";
import { pricing } from "@/lib/brand";
import { SimulateButton } from "@/components/app/billing/simulate-button";

/* The development stand-in for Stripe's hosted checkout. Present only when no
   Stripe key is configured, and gone entirely in production — the route 404s
   rather than rendering a disabled screen, because a page that says "payments
   are simulated" has no business existing on a production deployment. */

export const dynamic = "force-dynamic";

export default async function SimulateCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production" || billingIsLive()) notFound();

  const params = await searchParams;
  const kind = single(params.kind);
  const next = single(params.next) ?? "/dashboard";

  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);

  // The portal has nothing to simulate: there is no Stripe customer to manage.
  if (kind === "portal") redirect(next);
  if (kind !== "unlock" && kind !== "subscription") notFound();

  const planId = single(params.planId);
  const cancel = single(params.cancel) ?? "/dashboard";
  const isUnlock = kind === "unlock";

  return (
    <Section className="flex min-h-dvh items-center">
      <Container width="prose">
        <Eyebrow className="mb-5">Development checkout</Eyebrow>
        <h1 className="text-display-sm">
          {isUnlock
            ? `Unlock this plan — $${pricing.unlock.price}`
            : `Start ${pricing.live.name} — $${pricing.live.price}/month`}
        </h1>

        <div className="mt-8 flex gap-3.5 rounded-lg border border-hairline bg-surface-sunken p-5">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm leading-relaxed text-secondary">
            <p>
              <strong className="text-primary">No money moves here.</strong> This screen
              stands in for Stripe&rsquo;s hosted checkout while no{" "}
              <code className="numeric text-xs">STRIPE_SECRET_KEY</code> is configured.
            </p>
            <p className="mt-3">
              Confirming posts a synthetic Stripe event to the real webhook handler — the
              only code in this product that can grant an entitlement. The development
              path and the paid path run the same code from the webhook inwards, so a bug
              in the grant shows up here rather than after somebody has paid.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <SimulateButton
            kind={isUnlock ? "unlock" : "subscription"}
            workspaceId={workspace.id}
            planId={planId}
            next={next}
            action={simulatePaymentAction}
          />
          <Link
            href={cancel}
            className="text-sm text-secondary underline-offset-4 hover:text-primary hover:underline"
          >
            Cancel
          </Link>
        </div>
      </Container>
    </Section>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
