import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { FinancialWorkspace } from "@/components/app/financials/workspace";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions } from "@/lib/plans";
import { getBenchmark } from "@/lib/finance/benchmarks";

export const metadata: Metadata = { title: "Financials" };

export default async function FinancialsPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}/financials`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  const benchmark = getBenchmark(plan.industryKey);

  if (!plan.intakeComplete || !assumptions) {
    return (
      <AppPageHeader
        eyebrow={benchmark.label}
        title="Financials"
        lede="Intake is not finished yet, so there is no model to show."
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
        title="Financials"
        lede="Three linked statements, coverage ratios and scenarios, all computed in your browser from the answers you gave. Change a scenario and every figure below recomputes."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`} variant="secondary">
            <Pencil aria-hidden className="size-4" />
            Edit answers
          </ButtonLink>
        }
      />

      {/* The whole workspace is client-side: Assumptions crosses the boundary,
          the engine runs in the browser, and nothing is fetched to switch
          scenario. Intake stays the only write path into Assumptions. */}
      <FinancialWorkspace assumptions={assumptions} />

      <div className="px-6 pb-12 sm:px-10">
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
