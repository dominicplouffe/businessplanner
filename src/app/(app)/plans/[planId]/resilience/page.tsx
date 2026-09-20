import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ResilienceForm } from "@/components/app/market/resilience-form";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions, parseResilience } from "@/lib/plans";
import { getBenchmark } from "@/lib/finance/benchmarks";

export const metadata: Metadata = { title: "AI disruption" };

export default async function ResiliencePage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}/resilience`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  const benchmark = getBenchmark(plan.industryKey);

  if (!plan.intakeComplete || !assumptions) {
    return (
      <AppPageHeader
        eyebrow={benchmark.label}
        title="AI disruption"
        lede="Finish intake first — the assessment is written against the business the plan describes."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`}>
            Continue intake
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
        }
      />
    );
  }

  return (
    <>
      <AppPageHeader
        eyebrow={plan.companyName || plan.title}
        title="AI disruption"
        lede="Since March 2026 lenders have been asking borrowers how AI could disrupt their industry over the life of a ten-year loan, and declining the ones that look automatable. No other product in this category asks the question. This answers it."
      />

      <div className="px-6 py-8 sm:px-10">
        <ResilienceForm planId={plan.id} resilience={parseResilience(plan.resilienceJson)} />

        <p className="mt-10 text-sm text-tertiary">
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
