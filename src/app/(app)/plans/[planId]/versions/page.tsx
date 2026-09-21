import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppPageHeader } from "@/components/app/page-header";
import { VersionBrowser } from "@/components/app/versions/version-browser";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, PLAN_SECTIONS } from "@/lib/plans";
import { db } from "@/lib/db";
import { diffPlan, parseSnapshot, reasonLabel } from "@/lib/versions";

export const metadata: Metadata = { title: "History" };

/* ==========================================================================
   History.
   --------------------------------------------------------------------------
   The direct answer to the complaint the incumbent's own reviewers make: that
   regenerating a section overwrites edits with no way back. A snapshot is taken
   before every regeneration, before intake completes, and before a restore —
   and the diff is computed here on the server, where the plan already is.
   ========================================================================== */

export default async function VersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}/versions`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const versions = await db.planVersion.findMany({
    where: { planId: plan.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, reason: true, createdAt: true },
    take: 50,
  });

  const requested = single((await searchParams).v);
  const selectedId = versions.find((v) => v.id === requested)?.id ?? versions[0]?.id ?? null;

  const selected = selectedId
    ? await db.planVersion.findFirst({ where: { id: selectedId, planId: plan.id } })
    : null;

  // Parsed once, not once per section: this sat inside the map below, so a
  // thirteen-section plan parsed the same JSON thirteen times per render.
  const snapshot = selected ? parseSnapshot(selected.snapshotJson) : null;

  /* Whether the snapshot's *model* differs, which the sentence diff cannot
     see. A restore now carries the assumptions back as well as the prose, so
     gating the button on changed sentences alone made a snapshot that
     differs only in its numbers impossible to restore. */
  const modelChanged = Boolean(
    snapshot &&
      ((snapshot.assumptions !== undefined && snapshot.assumptions !== plan.assumptionsJson) ||
        (snapshot.registry !== undefined && snapshot.registry !== plan.registryJson) ||
        (snapshot.context !== undefined && snapshot.context !== plan.contextJson)),
  );

  const diff = selected
    ? diffPlan(
        PLAN_SECTIONS.map((section) => {
          const before = snapshot?.sections?.find((s) => s.key === section.key)?.contentText ?? "";
          const after = plan.sections.find((s) => s.key === section.key)?.contentText ?? "";
          return { key: section.key, title: section.title, before, after };
        }),
      )
    : null;

  return (
    <>
      <AppPageHeader
        eyebrow={plan.companyName || plan.title}
        title="History"
        lede={
          versions.length === 0
            ? "No snapshots yet. One is taken automatically before every regeneration, so nothing you have written can be overwritten without a way back."
            : `${versions.length} snapshot${versions.length === 1 ? "" : "s"}. Each one is compared against the plan as it stands now.`
        }
      />

      <div className="space-y-8 px-6 py-8 sm:px-10">
        <VersionBrowser
          planId={plan.id}
          versions={versions.map((v) => ({
            id: v.id,
            label: v.label,
            reasonLabel: reasonLabel(v.reason),
            createdAt: v.createdAt.toISOString(),
          }))}
          selectedId={selectedId}
          diff={diff}
          modelChanged={modelChanged}
        />

        <p className="text-sm text-tertiary">
          <Link
            href={`/plans/${plan.id}`}
            className="underline-offset-4 hover:text-secondary hover:underline"
          >
            Back to the plan
          </Link>
        </p>
      </div>
    </>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
