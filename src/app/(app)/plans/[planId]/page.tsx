import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Pencil } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { getPlan, parseAssumptions, PLAN_SECTIONS } from "@/lib/plans";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { validateModel } from "@/lib/finance/validate";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { getBenchmark } from "@/lib/finance/benchmarks";
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

  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);
  const validation = validateModel(model, metrics, {
    purpose: plan.purpose as "sba-loan" | "investor" | "immigration" | "internal",
  });

  const blocking = validation.findings.filter((f) => f.severity === "blocking");
  const advisory = validation.findings.filter((f) => f.severity === "warning");

  const year1 = model.annual[0];
  const year3 = model.annual[2] ?? model.annual.at(-1);

  return (
    <>
      <AppPageHeader
        eyebrow={benchmark.label}
        title={plan.companyName || plan.title}
        lede="The model is built. Writing the plan around it comes next."
        actions={
          <ButtonLink href={`/plans/${plan.id}/intake`} variant="secondary">
            <Pencil aria-hidden className="size-4" />
            Edit answers
          </ButtonLink>
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
          </p>
        </section>

        {/* Review findings — the engine's validator, surfaced immediately */}
        <section aria-labelledby="review" className="rounded-lg border border-hairline p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="review" className="font-display text-xl">Plan review</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                {validation.blockingCount === 0
                  ? "Nothing is blocking export. These are the things a reader may still push on."
                  : `${validation.blockingCount} must be resolved before the plan can be exported. The rest are worth a look but are your call.`}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                validation.blockingCount === 0 ? "bg-good/10 text-good" : "bg-critical/10 text-critical",
              )}
            >
              {validation.blockingCount} blocking · {validation.warningCount} advisory
            </span>
          </div>

          {validation.findings.length === 0 ? (
            <p className="mt-5 flex items-center gap-2 text-sm text-good">
              <CheckCircle2 aria-hidden className="size-4" />
              No findings. That is rare — worth a second look at your assumptions.
            </p>
          ) : (
            <div className="mt-6 space-y-8">
              <FindingGroup
                heading="Blocking"
                caption="Export stays locked until these are resolved."
                findings={blocking}
              />
              <FindingGroup
                heading="Worth a look"
                caption="These may be perfectly defensible — but a reader will ask."
                findings={advisory}
              />
            </div>
          )}
        </section>

        {/* Sections — placeholders until generation lands */}
        <section aria-labelledby="sections">
          <h2 id="sections" className="font-display text-xl">The document</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
            Thirteen sections, each written against the model above rather than
            beside it. Generation arrives in the next phase.
          </p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PLAN_SECTIONS.map((section, index) => {
              const stored = plan.sections.find((s) => s.key === section.key);
              return (
                <li
                  key={section.key}
                  className="flex items-center gap-3 rounded-sm border border-hairline px-4 py-3"
                >
                  <span className="numeric text-xs text-brass-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-secondary">{section.title}</span>
                  <span className="shrink-0 text-xs text-tertiary">
                    {stored?.status === "empty" || !stored ? "Not written" : stored.status}
                  </span>
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

function FindingGroup({
  heading,
  caption,
  findings,
}: {
  heading: string;
  caption: string;
  findings: { id: string; severity: string; title: string; detail: string; remedy: string }[];
}) {
  if (findings.length === 0) return null;
  const isBlocking = heading === "Blocking";

  return (
    <section aria-labelledby={`findings-${heading}`}>
      <div className="flex items-baseline gap-3">
        <h3
          id={`findings-${heading}`}
          className={cn(
            "text-eyebrow font-medium uppercase",
            isBlocking ? "text-critical" : "text-warning",
          )}
        >
          {heading}
        </h3>
        <span className="numeric text-xs text-tertiary">{findings.length}</span>
      </div>
      <p className="mt-1 text-sm text-tertiary">{caption}</p>

      <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
        {findings.map((finding) => (
          <li key={finding.id} className="flex items-start gap-3 py-4">
            <AlertTriangle
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0", isBlocking ? "text-critical" : "text-warning")}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary">{finding.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">{finding.detail}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-tertiary">{finding.remedy}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
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
