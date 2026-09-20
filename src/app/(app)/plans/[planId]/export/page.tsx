import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ExportPanel } from "@/components/app/export/export-panel";
import { SharePanel } from "@/components/app/export/share-panel";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions } from "@/lib/plans";
import { assembleReview } from "@/lib/review/assemble";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { listShareLinks } from "@/lib/share";

export const metadata: Metadata = { title: "Export and share" };

export default async function ExportPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}/export`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  const benchmark = getBenchmark(plan.industryKey);

  if (!plan.intakeComplete || !assumptions) {
    return (
      <AppPageHeader
        eyebrow={benchmark.label}
        title="Export and share"
        lede="Intake is not finished yet, so there is nothing to export."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`}>
            Continue intake
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
        }
      />
    );
  }

  const { validation, readiness } = assembleReview(plan, assumptions);

  const rows = await listShareLinks(plan.id);

  return (
    <>
      <AppPageHeader
        eyebrow={plan.companyName || plan.title}
        title="Export and share"
        lede={
          validation.canExport
            ? "Nothing is blocking. Every file below is built from the same assembled document, so none of them can contradict another."
            : `Export is locked until ${validation.blockingCount} blocking ${
                validation.blockingCount === 1 ? "finding is" : "findings are"
              } resolved. The review page lists them with what to change.`
        }
        actions={
          <>
            <ButtonLink href={`/print/${plan.id}`} variant="secondary" target="_blank">
              Preview the document
              <ExternalLink aria-hidden className="size-4" />
            </ButtonLink>
            {!validation.canExport ? (
              <ButtonLink href={`/plans/${plan.id}/review`}>
                Open the fix-it queue
                <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="space-y-10 px-6 py-8 sm:px-10">
        {!validation.canExport ? (
          <p className="rounded-lg border border-hairline p-5 text-sm leading-relaxed text-secondary">
            Readiness is <span className="numeric">{readiness.score}</span>/100 —{" "}
            {readiness.bandLabel.toLowerCase()}. {readiness.verdict}
          </p>
        ) : null}

        <ExportPanel planId={plan.id} canExport={validation.canExport} />
        <SharePanel planId={plan.id} links={rows} />

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
