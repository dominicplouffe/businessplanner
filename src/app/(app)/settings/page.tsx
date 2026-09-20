import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { db } from "@/lib/db";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Profile" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});

export default async function ProfileSettingsPage() {
  const user = await requireUser("/settings");
  const workspace = await getOrCreateWorkspace(user.id, user.name);

  const [planCount, memberCount] = await Promise.all([
    db.plan.count({ where: { workspaceId: workspace.id, status: { not: "archived" } } }),
    db.workspaceMember.count({ where: { workspaceId: workspace.id } }),
  ]);

  return (
    <div className="max-w-2xl space-y-10">
      <section aria-labelledby="you">
        <h2 id="you" className="font-display text-xl">You</h2>
        <dl className="mt-5 divide-y divide-hairline border-y border-hairline">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          <Row
            label="Joined"
            value={DATE.format(new Date(user.createdAt))}
          />
        </dl>
      </section>

      <section aria-labelledby="workspace">
        <h2 id="workspace" className="font-display text-xl">Workspace</h2>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Every plan belongs to a workspace, even for one person. It is what lets a firm
          hold a client&rsquo;s plans separately later without migrating anything.
        </p>
        <dl className="mt-5 divide-y divide-hairline border-y border-hairline">
          <Row label="Name" value={workspace.name} />
          <Row label="Plans" value={String(planCount)} numeric />
          <Row label="People" value={String(memberCount)} numeric />
        </dl>
      </section>

      <section aria-labelledby="data">
        <h2 id="data" className="font-display text-xl">Your data</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-secondary">
          <p>
            Every plan exports in four formats at any time, so your work is portable
            without asking us for it.
          </p>
          <p>
            To export everything, correct something, or close the account and have the
            data deleted, write to{" "}
            <a
              href={`mailto:${brand.email.support}`}
              className="text-primary underline underline-offset-4"
            >
              {brand.email.support}
            </a>
            . We act within thirty days, and the{" "}
            <Link href="/legal/privacy" className="text-primary underline underline-offset-4">
              privacy policy
            </Link>{" "}
            says what is held and for how long.
          </p>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 py-3.5">
      <dt className="text-sm text-secondary">{label}</dt>
      <dd className={numeric ? "numeric text-sm text-primary" : "text-sm text-primary"}>{value}</dd>
    </div>
  );
}
