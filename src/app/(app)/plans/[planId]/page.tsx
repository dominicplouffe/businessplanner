import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download, Pencil } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions, PLAN_SECTIONS } from "@/lib/plans";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { assembleReview } from "@/lib/review/assemble";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const user = await requireUser(`/plans/${planId}`);
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plan = await getPlan(planId, workspace.id);
  if (!plan) notFound();

  const assumptions = parseAssumptions(plan.assumptionsJson);
  const benchmark = getBenchmark(plan.industryKey);

  // Intake not finished, or finished but not yet mappable to a full model.
  if (!plan.intakeComplete || !assumptions) {
    return (
      <>
        <AppPageHeader
          eyebrow={benchmark.label}
          title={plan.title}
          lede="Intake is not finished yet, so there is no model to show."
          actions={
            <ButtonLink href={`/plans/${plan.id}/intake`}>
              Continue intake
              <ArrowRight aria-hidden className="size-4" />
            </ButtonLink>
          }
        />
      </>
    );
  }

  const { model, metrics, validation, consistency, readiness } = assembleReview(plan, assumptions);

  const writtenCount = plan.sections.filter((s) => s.contentText.trim().length > 0).length;

  const year1 = model.annual[0];
  const year3 = model.annual[2] ?? model.annual.at(-1);

  return (
    <>
      <AppPageHeader
        eyebrow={benchmark.label}
        title={plan.companyName || plan.title}
        lede={
          writtenCount === 0
            ? "The model is built. Now the plan gets written around it."
            : `${writtenCount} of ${PLAN_SECTIONS.length} sections written.`
        }
        actions={
          <>
            {/* The sidebar carries the full sub-nav, and the body links
                through to financials and review — five buttons here just made
                the header wrap badly on a tablet. */}
            <ButtonLink href={`/plans/${plan.id}/export`} variant="secondary">
              <Download aria-hidden className="size-4" />
              Export and share
            </ButtonLink>
            <ButtonLink href={`/plans/${plan.id}/intake`} variant="secondary">
              <Pencil aria-hidden className="size-4" />
              Edit answers
            </ButtonLink>
          </>
        }
      />

      <div className="space-y-10 px-6 py-8 sm:px-10">
        {/* Headline numbers */}
        <section aria-labelledby="figures">
          <h2 id="figures" className="sr-only">Key figures</h2>
          <dl className="grid grid-cols-2 gap-6 rounded-lg border border-hairline bg-surface-raised p-6 lg:grid-cols-4">
            <Stat label="Year 1 revenue" value={formatCurrency(year1?.revenue ?? 0, "USD", { compact: true })} />
            <Stat label="Year 3 revenue" value={formatCurrency(year3?.revenue ?? 0, "USD", { compact: true })} />
            <Stat
              label="Breaks even"
              value={metrics.breakEven.profitMonth ? `Month ${metrics.breakEven.profitMonth}` : "Not in 5 years"}
            />
            <Stat
              label={metrics.underwriter.minimumDscr !== null ? "Minimum DSCR" : "Gross margin"}
              value={
                metrics.underwriter.minimumDscr !== null
                  ? formatMultiple(metrics.underwriter.minimumDscr)
                  : formatPercent(metrics.unitEconomics.grossMargin)
              }
            />
          </dl>
          <p className="mt-3 text-xs text-tertiary">
            Balance sheet ties in all {model.horizonMonths} periods
            <span aria-hidden className="mx-2">·</span>
            {model.annual.length}-year model
            <span aria-hidden className="mx-2">·</span>
            <Link
              href={`/plans/${plan.id}/financials`}
              className="underline-offset-4 hover:text-secondary hover:underline"
            >
              Open the statements, coverage ratios and scenarios
            </Link>
          </p>
        </section>

        {/* Readiness — a summary that links through, rather than a second
            copy of the findings. Two screens listing findings under different
            contexts is how they start disagreeing. */}
        <section aria-labelledby="review" className="rounded-lg border border-hairline p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 id="review" className="font-display text-xl">Readiness</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                {readiness.verdict}
              </p>
            </div>
            <div className="text-right">
              <p className="figure-hero font-display text-3xl tracking-[-0.02em]">
                {readiness.score}
                <span className="text-lg text-tertiary">/100</span>
              </p>
              <p
                className={cn(
                  "text-xs font-medium",
                  readiness.band === "ready"
                    ? "text-good"
                    : readiness.band === "not-ready"
                      ? "text-critical"
                      : "text-secondary",
                )}
              >
                {readiness.bandLabel}
              </p>
            </div>
          </div>

          <p className="mt-5 text-sm text-tertiary">
            <span className="numeric">{validation.blockingCount}</span> blocking
            <span aria-hidden className="mx-2">·</span>
            <span className="numeric">{validation.warningCount}</span> advisory
            {consistency.checkedCount > 0 ? (
              <>
                <span aria-hidden className="mx-2">·</span>
                <span className="numeric">{consistency.reconciledCount}</span> of{" "}
                <span className="numeric">{consistency.checkedCount}</span> figures reconciled
              </>
            ) : null}
          </p>

          <ButtonLink href={`/plans/${plan.id}/review`} size="sm" className="mt-5">
            {validation.blockingCount + validation.warningCount === 0
              ? "See what was checked"
              : "Open the fix-it queue"}
            <ArrowRight aria-hidden className="size-3.5" />
          </ButtonLink>
        </section>

        {/* Sections — placeholders until generation lands */}
        <section aria-labelledby="sections">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="sections" className="font-display text-xl">The document</h2>
            <ButtonLink href={`/plans/${plan.id}/sections/${PLAN_SECTIONS[0]!.key}`} size="sm">
              {writtenCount === 0 ? "Start writing" : "Continue writing"}
              <ArrowRight aria-hidden className="size-3.5" />
            </ButtonLink>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
            {PLAN_SECTIONS.length} sections, each written against the model above
            rather than beside it. {writtenCount} written so far.
          </p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PLAN_SECTIONS.map((section, index) => {
              const stored = plan.sections.find((s) => s.key === section.key);
              const written = (stored?.contentText.trim().length ?? 0) > 0;
              return (
                <li key={section.key}>
                  <Link
                    href={`/plans/${plan.id}/sections/${section.key}`}
                    className="flex items-center gap-3 rounded-sm border border-hairline px-4 py-3 transition-colors hover:border-strong"
                  >
                    <span className="numeric text-xs text-marker">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-secondary">{section.title}</span>
                    <span
                      aria-label={written ? "Written" : "Not written"}
                      className={cn("size-1.5 shrink-0 rounded-full", written ? "bg-emerald-600" : "bg-ink-300")}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-sm text-tertiary">
          <Link href="/dashboard" className="underline-offset-4 hover:text-secondary hover:underline">
            Back to all plans
          </Link>
        </p>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-tertiary">{label}</dt>
      <dd className="figure-hero mt-1 font-display text-2xl tracking-[-0.02em]">{value}</dd>
    </div>
  );
}
