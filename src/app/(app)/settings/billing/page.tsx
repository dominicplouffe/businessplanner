import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import {
  billingIsLive,
  describeSubscription,
  getSubscription,
  listPurchases,
} from "@/lib/billing";
import { BillingActions } from "@/components/app/billing/billing-actions";
import { formatCurrency } from "@/lib/finance/format";
import { pricing } from "@/lib/brand";

export const metadata: Metadata = { title: "Billing" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

export default async function BillingSettingsPage() {
  const user = await requireUser("/settings/billing");
  const workspace = await getOrCreateWorkspace(user.id, user.name);

  const [subscription, purchases] = await Promise.all([
    getSubscription(workspace.id),
    listPurchases(workspace.id),
  ]);
  // Read on the server, which already knows the time — a component that calls
  // new Date() during render is impure and the lint rule says so.
  const state = describeSubscription(subscription, new Date());

  return (
    <div className="max-w-2xl space-y-10">
      <section aria-labelledby="unlocks">
        <h2 id="unlocks" className="font-display text-xl">Plans you have unlocked</h2>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          One payment each, no renewal. An unlocked plan stays unlocked whatever happens
          to a subscription.
        </p>

        {purchases.length === 0 ? (
          <p className="mt-5 rounded-lg border border-hairline p-5 text-sm leading-relaxed text-secondary">
            Nothing yet. Generating and reading a plan is free — the unlock is for the
            files and the share links.
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-hairline border-y border-hairline">
            {purchases.map((purchase) => (
              <li
                key={purchase.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4"
              >
                <div>
                  <p className="text-sm text-primary">
                    {purchase.plan ? (
                      <Link
                        href={`/plans/${purchase.plan.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {purchase.plan.companyName || purchase.plan.title}
                      </Link>
                    ) : (
                      "A plan that has since been deleted"
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-tertiary">
                    <time dateTime={purchase.createdAt.toISOString()}>
                      {DATE.format(purchase.createdAt)}
                    </time>
                  </p>
                </div>
                <p className="numeric shrink-0 text-sm text-primary">
                  {/* What was charged, from the payment record — never recomputed
                      from the price table, which can change. */}
                  {formatCurrency(purchase.amount / 100, purchase.currency.toUpperCase())}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="subscription">
        <h2 id="subscription" className="font-display text-xl">
          {pricing.live.name} — ${pricing.live.price}/month
        </h2>
        <div className="mt-5 rounded-lg border border-hairline p-5">
          <p className="text-sm font-medium text-primary">{state.label}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-secondary">{state.detail}</p>
          <ul className="mt-4 space-y-2">
            {[
              "Track actuals against the forecast, month by month",
              "Re-forecast without starting again",
              "A lender variance summary you can send",
            ].map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-secondary">
                <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))}
          </ul>

          <BillingActions
            hasSubscription={subscription !== null}
            hasCustomer={Boolean(workspace.stripeCustomerId)}
            isDevBilling={!billingIsLive()}
            className="mt-6"
          />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-tertiary">
          Cancelling takes one click and runs to the end of the period you have paid for.
          There is no form asking you to justify it, and no retention call.{" "}
          {pricing.guaranteeDays}-day money-back guarantee on any payment.
        </p>
      </section>
    </div>
  );
}
