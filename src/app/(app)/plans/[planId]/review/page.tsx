import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { ReadinessMeter } from "@/components/app/review/readiness-meter";
import { Dimensions } from "@/components/app/review/dimensions";
import { FixQueue } from "@/components/app/review/fix-queue";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions, PLAN_SECTIONS } from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { buildModelIndex, checkPlan } from "@/lib/ai/consistency";
import { buildValidationContext } from "@/lib/review/context";
import { scorePlan, type PlanPurpose } from "@/lib/review/rubric";
import { buildFixQueue } from "@/lib/review/queue";
import { getBenchmark } from "@/lib/finance/benchmarks";

export const metadata: Metadata = { title: "Review" };

export default async function ReviewPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}/review`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  const benchmark = getBenchmark(plan.industryKey);

  if (!plan.intakeComplete || !assumptions) {
    return (
      <AppPageHeader
        eyebrow={benchmark.label}
        title="Review"
        lede="Intake is not finished yet, so there is nothing to review against."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`}>
            Continue intake
            <ArrowRight aria-hidden className="size-4" />
          </ButtonLink>
        }
      />
    );
  }

  const purpose = plan.purpose as PlanPurpose;
  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);

  // Reconcile every written sentence against the model before anything else:
  // the count it produces is what makes the validator's narrative check real
  // rather than a placeholder.
  const index = buildModelIndex(model, metrics, assumptions);
  const sections = PLAN_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    text: plan.sections.find((s) => s.key === section.key)?.contentText ?? "",
  }));
  const consistency = checkPlan(sections, index);

  const validation = validateModel(
    model,
    metrics,
    buildValidationContext({ purpose, assumptions, consistency }),
  );

  const readiness = scorePlan({
    purpose,
    assumptions,
    model,
    metrics,
    validation,
    consistency,
    sectionsWritten: sections.filter((s) => s.text.trim().length > 0).map((s) => s.key),
    sectionsExpected: sections.map((s) => s.key),
  });

  const queue = buildFixQueue(plan.id, validation, consistency, assumptions.company.currency);
  const written = readiness.dimensions.length > 0 ? consistency.checkedCount : 0;

  return (
    <>
      <AppPageHeader
        eyebrow={plan.companyName || plan.title}
        title="Review"
        lede={
          consistency.skippedSections.length === sections.length
            ? "Scored on the model alone — no section has been written yet, so there is no prose to reconcile against it."
            : `Scored against what a ${readerWord(purpose)} checks, and every figure in the prose reconciled against the model behind it.`
        }
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`} variant="secondary">
            <Pencil aria-hidden className="size-4" />
            Edit answers
          </ButtonLink>
        }
      />

      <div className="space-y-12 px-6 py-8 sm:px-10">
        <ReadinessMeter readiness={readiness} />

        {written > 0 ? (
          <p className="text-sm text-tertiary">
            <span className="numeric">{consistency.reconciledCount}</span> of{" "}
            <span className="numeric">{consistency.checkedCount}</span> figures in the
            written sections trace to a value the engine computed
            {consistency.skippedSections.length > 0 ? (
              <>
                <span aria-hidden className="mx-2">·</span>
                <span className="numeric">{consistency.skippedSections.length}</span> sections
                not yet written
              </>
            ) : null}
          </p>
        ) : null}

        <FixQueue items={queue} />
        <Dimensions dimensions={readiness.dimensions} />

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

function readerWord(purpose: PlanPurpose): string {
  switch (purpose) {
    case "sba-loan":
      return "credit analyst";
    case "investor":
      return "investment committee";
    case "immigration":
      return "adjudicator";
    default:
      return "careful reader";
  }
}
