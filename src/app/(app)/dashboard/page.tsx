import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { AppPageHeader } from "@/components/app/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requireUser, getOrCreateWorkspace } from "@/lib/session";
import { listPlans, PLAN_SECTIONS, type PlanSummary } from "@/lib/plans";
import { getBenchmark } from "@/lib/finance/benchmarks";
import { TOTAL_STEPS } from "@/lib/content/intake";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "text-tertiary" },
  intake: { label: "Intake in progress", tone: "text-warning" },
  generating: { label: "Generating", tone: "text-accent" },
  ready: { label: "Ready", tone: "text-good" },
};

export default async function DashboardPage() {
  const user = await requireUser();
  const workspace = await getOrCreateWorkspace(user.id, user.name);
  const plans = await listPlans(workspace.id);

  const firstName = user.name.split(/\s+/)[0] ?? user.name;

  return (
    <>
      <AppPageHeader
        eyebrow={workspace.name}
        title={plans.length === 0 ? `Welcome, ${firstName}.` : "Your plans"}
        lede={
          plans.length === 0
            ? "A plan starts with a short intake about your business. Everything after that is computed from what you tell us."
            : undefined
        }
        actions={
          plans.length > 0 ? (
            <ButtonLink href="/plans/new">
              <Plus aria-hidden className="size-4" />
              New plan
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="px-6 py-8 sm:px-10">
        {plans.length === 0 ? <EmptyState /> : <PlanGrid plans={plans} />}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="max-w-2xl rounded-lg border border-hairline bg-surface-raised p-8">
      <div className="flex size-11 items-center justify-center rounded-full bg-surface-sunken">
        <FileText aria-hidden className="size-5 text-tertiary" />
      </div>
      <h2 className="mt-5 font-display text-2xl">No plans yet</h2>
      <p className="mt-2.5 leading-relaxed text-secondary">
        The intake takes about ten minutes. It branches on your business model, so
        you are only asked for the drivers that model actually uses — footfall and
        average ticket for a shop, seats and churn for software.
      </p>
      <ol className="mt-6 space-y-3 border-l border-hairline pl-5">
        {[
          "Answer the intake — every figure tagged with where it came from",
          "The engine builds a five-year model from your drivers",
          "The plan is written around those numbers, never over them",
        ].map((step, i) => (
          <li key={step} className="text-[0.95rem] text-secondary">
            <span className="numeric mr-2.5 text-marker">{String(i + 1).padStart(2, "0")}</span>
            {step}
          </li>
        ))}
      </ol>
      <ButtonLink href="/plans/new" size="lg" className="mt-8">
        Start your first plan
        <ArrowRight aria-hidden className="size-4" />
      </ButtonLink>
    </div>
  );
}

function PlanGrid({ plans }: { plans: PlanSummary[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan) => {
        const status = STATUS_COPY[plan.status] ?? STATUS_COPY.draft!;
        // Derived, not typed in. The denominator was a hardcoded 8, correct
        // only by coincidence — TOTAL_STEPS is 9 once Review is counted, and
        // adding a step would have made the bar read full before intake was.
        const progress = plan.intakeComplete
          ? 1
          : Math.min(1, plan.intakeStep / TOTAL_STEPS);
        const benchmark = getBenchmark(plan.industryKey);

        return (
          <li key={plan.id}>
            <Link
              href={plan.intakeComplete ? `/plans/${plan.id}` : `/plans/${plan.id}/intake`}
              className="group flex h-full flex-col rounded-lg border border-hairline bg-surface-raised p-6 transition-colors hover:border-strong"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-display text-xl leading-snug">{plan.title}</h2>
                {plan.unlockedAt ? (
                  <span className="shrink-0 rounded-full bg-emerald-800 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-paper">
                    Unlocked
                  </span>
                ) : null}
              </div>

              <p className="mt-1.5 text-sm text-tertiary">{benchmark.label}</p>

              <div className="mt-auto pt-6">
                {!plan.intakeComplete ? (
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className={cn("font-medium", status.tone)}>{status.label}</span>
                      <span className="numeric text-tertiary">{Math.round(progress * 100)}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={Math.round(progress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Intake progress"
                      className="mt-2 h-1 overflow-hidden rounded-full bg-surface-sunken"
                    >
                      <div className="h-full bg-emerald-700" style={{ width: `${progress * 100}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium", status.tone)}>{status.label}</span>
                    <span className="text-tertiary">
                      {PLAN_SECTIONS.length} sections
                    </span>
                  </div>
                )}

                <p className="mt-3 text-xs text-tertiary">
                  Updated{" "}
                  <time dateTime={plan.updatedAt.toISOString()}>
                    {plan.updatedAt.toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </time>
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
