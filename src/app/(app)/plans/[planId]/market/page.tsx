import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { SizingBuilder } from "@/components/app/market/sizing-builder";
import { CompetitorMatrix } from "@/components/app/market/competitor-matrix";
import { SourcesAppendix } from "@/components/app/market/sources-appendix";
import { ResearchButton } from "@/components/app/market/research-button";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions, parseSizing } from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { researcherKind } from "@/lib/research";

export const metadata: Metadata = { title: "Market" };

export default async function MarketPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}/market`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  const benchmark = getBenchmark(plan.industryKey);

  if (!plan.intakeComplete || !assumptions) {
    return (
      <AppPageHeader
        eyebrow={benchmark.label}
        title="Market"
        lede="Intake is not finished yet, so there is no model to check the market against."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`}>
            Continue intake
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
        }
      />
    );
  }

  const model = buildModel(assumptions);
  const sizing = parseSizing(plan.marketJson);

  return (
    <>
      <AppPageHeader
        eyebrow={plan.companyName || plan.title}
        title="Market"
        lede="The market built from the ground up, the competitors named with dated evidence, and every outside claim carrying a source a reader can follow."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`} variant="secondary">
            <Pencil aria-hidden className="size-4" />
            Edit answers
          </ButtonLink>
        }
      />

      <div className="space-y-10 px-6 py-8 sm:px-10">
        <ResearchButton planId={plan.id} available={researcherKind() === "anthropic"} />

        <SizingBuilder
          planId={plan.id}
          sizing={sizing}
          model={model}
          currency={assumptions.company.currency}
        />

        <CompetitorMatrix planId={plan.id} competitors={plan.competitors} />

        <SourcesAppendix planId={plan.id} citations={plan.citations} />

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
