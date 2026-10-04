import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { entitlementsFor, isSubscriptionLive } from "@/lib/billing/entitlements";
import { GrantForm } from "@/components/admin/grant-form";
import { RevokeButton } from "@/components/admin/revoke-button";

/* ==========================================================================
   Workspaces, their plans, and why each one has the access it has.
   --------------------------------------------------------------------------
   Everything on this page is read through `entitlementsFor` — the same pure
   function the export route and the share action use. An admin screen that
   computed access its own way would eventually disagree with the product, and
   the screen you check when somebody says "I paid and it is still locked" is
   the one that must not have its own opinion.
   ========================================================================== */

export default async function AdminPage() {
  await requireAdmin();

  const workspaces = await db.workspace.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      members: { include: { user: { select: { email: true, name: true } } } },
      plans: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, companyName: true, status: true, unlockedAt: true },
      },
      subscriptions: { orderBy: { createdAt: "desc" } },
      grants: {
        orderBy: { createdAt: "desc" },
        include: { grantedBy: { select: { email: true } }, plan: { select: { title: true } } },
      },
    },
  });

  return (
    <>
      <header className="mb-8">
        <h1 className="text-display-sm">Workspaces</h1>
        <p className="mt-2 max-w-2xl leading-relaxed text-secondary">
          {workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}. A grant gives
          access without a payment; it never writes a purchase, and it always records who issued it
          and why.
        </p>
      </header>

      <div className="flex flex-col gap-8">
        {workspaces.map((workspace) => {
          const subscription = workspace.subscriptions.find((s) => isSubscriptionLive(s)) ?? null;
          const live = workspace.grants.filter(
            (g) => !g.revokedAt && (!g.expiresAt || g.expiresAt > new Date()),
          );

          return (
            <section
              key={workspace.id}
              className="rounded-sm border border-hairline bg-surface-sunken"
            >
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-hairline px-5 py-4">
                <div>
                  <h2 className="font-display text-xl tracking-[-0.01em]">{workspace.name}</h2>
                  <p className="mt-1 font-mono text-xs text-tertiary">{workspace.id}</p>
                  <p className="mt-2 text-sm text-secondary">
                    {workspace.members.map((m) => m.user.email).join(", ") || "no members"}
                  </p>
                </div>
                <dl className="text-right text-sm">
                  <dt className="text-tertiary">Subscription</dt>
                  <dd>{subscription ? subscription.status : "none"}</dd>
                  <dt className="mt-2 text-tertiary">Stripe customer</dt>
                  <dd className="font-mono text-xs">{workspace.stripeCustomerId ?? "—"}</dd>
                </dl>
              </header>

              <div className="px-5 py-4">
                <h3 className="text-sm font-medium">Plans</h3>
                {workspace.plans.length === 0 ? (
                  <p className="mt-2 text-sm text-tertiary">No plans yet.</p>
                ) : (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-tertiary">
                        <th className="pb-2 font-medium">Plan</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium">Export &amp; share</th>
                        <th className="pb-2 font-medium">Id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspace.plans.map((plan) => {
                        // Scoped exactly as getGrants does: this plan, plus the
                        // workspace-wide grants that carry no plan id.
                        const scoped = live.filter((g) => !g.planId || g.planId === plan.id);
                        const ent = entitlementsFor({ plan, subscription, grants: scoped });

                        return (
                          <tr key={plan.id} className="border-b border-hairline/60 last:border-0">
                            <td className="py-2 pr-3">{plan.companyName || plan.title}</td>
                            <td className="py-2 pr-3 text-secondary">{plan.status}</td>
                            <td className="py-2 pr-3">
                              {ent.unlockSource === "purchase" ? (
                                <span className="text-accent">Purchased</span>
                              ) : ent.unlockSource === "grant" ? (
                                <span className="text-marker">Granted</span>
                              ) : (
                                <span className="text-tertiary">Locked</span>
                              )}
                            </td>
                            <td className="py-2 font-mono text-xs text-tertiary">{plan.id}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {workspace.grants.length > 0 ? (
                <div className="border-t border-hairline px-5 py-4">
                  <h3 className="text-sm font-medium">Grants</h3>
                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {workspace.grants.map((grant) => {
                      const expired = grant.expiresAt !== null && grant.expiresAt <= new Date();
                      const dead = grant.revokedAt !== null || expired;
                      return (
                        <li
                          key={grant.id}
                          className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline/60 pb-2 last:border-0"
                        >
                          <div className={dead ? "text-tertiary line-through" : undefined}>
                            <span className="font-medium">{grant.kind}</span>
                            {" · "}
                            {grant.plan ? grant.plan.title : "every plan"}
                            {" · "}
                            <span className="text-secondary">{grant.reason}</span>
                            <span className="ml-2 text-xs text-tertiary">
                              by {grant.grantedBy.email} on{" "}
                              {grant.createdAt.toISOString().slice(0, 10)}
                              {grant.expiresAt
                                ? ` · expires ${grant.expiresAt.toISOString().slice(0, 10)}`
                                : " · no expiry"}
                              {grant.revokedAt
                                ? ` · revoked ${grant.revokedAt.toISOString().slice(0, 10)}`
                                : ""}
                            </span>
                          </div>
                          {!dead ? <RevokeButton grantId={grant.id} /> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="border-t border-hairline px-5 py-4">
                <GrantForm
                  workspaceId={workspace.id}
                  plans={workspace.plans.map((p) => ({
                    id: p.id,
                    label: p.companyName || p.title,
                  }))}
                />
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
