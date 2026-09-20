"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { INTAKE_STEPS, REVENUE_MODELS, type DriverField } from "@/lib/content/intake";
import { defaultsForIndustry, SEEDED_KEYS } from "@/lib/content/intake-defaults";
import { buildAssumptions, type IntakeState, type ProvenanceState } from "@/lib/content/intake-mapper";
import { saveIntakeAction } from "@/lib/actions/plan-actions";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { formatCurrency, formatMultiple } from "@/lib/finance/format";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DriverFieldControl } from "./driver-field";
import { cn } from "@/lib/utils";

const REVIEW_STEP = INTAKE_STEPS.length;

/**
 * Answers that are decisions rather than seeded numbers.
 *
 * These are never re-seeded when the industry changes. They carry no
 * `provenance` flag, so they stay tagged `benchmark_default` forever and the
 * re-seed loop would overwrite them every time — resetting the plan's
 * audience, its start date and its whole revenue model as a side effect of
 * correcting the industry on the first step.
 */
/**
 * The seeds belonging to one revenue model.
 *
 * `defaultsForIndustry` returns the seeds for the industry's *default* model,
 * so picking a different one has to take the fields that model actually asks
 * for. Derived from the step definition rather than a second hardcoded list,
 * which is what stops the two drifting.
 */
function REVENUE_SEEDS_BY_KIND(kind: string, seeds: IntakeState): IntakeState {
  const revenueStep = INTAKE_STEPS.find((s) => s.key === "revenue");
  if (!revenueStep) return {};
  const wanted = revenueStep.fields({ "rev.kind": kind }).map((f) => f.key);
  const out: IntakeState = {};
  for (const key of wanted) if (seeds[key] !== undefined) out[key] = seeds[key];
  return out;
}

const DECISIONS = new Set([
  "company.purpose",
  "company.startDate",
  "company.firstTradingMonth",
  "company.name",
  "rev.kind",
  "context.description",
]);

export function IntakeWizard({
  planId,
  planTitle,
  initialState,
  initialProvenance,
  initialStep,
}: {
  planId: string;
  planTitle: string;
  initialState: IntakeState;
  initialProvenance: ProvenanceState;
  initialStep: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(initialStep, REVIEW_STEP));
  /* The furthest step reached, which is what "how far through am I" means.
     `step` alone is not: going back used to be persisted by the debounced save
     1.2s later, writing the lower number and making the dashboard's progress
     bar regress. */
  const [furthest, setFurthest] = useState(Math.min(initialStep, REVIEW_STEP));
  const [state, setState] = useState<IntakeState>(() => ({
    ...defaultsForIndustry(String(initialState["company.industryKey"] ?? "other")),
    ...initialState,
  }));
  const [provenance, setProvenance] = useState<ProvenanceState>(() => {
    // Anything we seeded and the user has not touched is a benchmark default.
    const seeded: ProvenanceState = {};
    for (const key of SEEDED_KEYS) seeded[key] = "benchmark_default";
    return { ...seeded, ...initialProvenance };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();
  const finishing = useRef(false);

  const currentStep = step < REVIEW_STEP ? INTAKE_STEPS[step] : null;
  const fields = useMemo(
    () => (currentStep ? currentStep.fields(state) : []),
    [currentStep, state],
  );

  /* ---- Autosave ------------------------------------------------------- */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    async (nextStep: number, complete = false) => {
      setSaving(true);
      try {
        await saveIntakeAction({
          planId,
          step: nextStep,
          complete,
          assumptions: state,
          registry: provenance,
          companyName: String(state["company.name"] ?? ""),
          industryKey: String(state["company.industryKey"] ?? "other"),
          purpose: String(state["company.purpose"] ?? "internal"),
        });
        setSavedAt(new Date());
      } finally {
        setSaving(false);
      }
    },
    [planId, state, provenance],
  );

  // Debounced save as the user types, so a closed tab never loses work.
  useEffect(() => {
    if (finishing.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(step), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, provenance, step, persist]);

  /* ---- Field handling -------------------------------------------------- */
  const setField = (field: DriverField, value: string | number) => {
    setState((prev) => ({ ...prev, [field.key]: value }));
    setErrors((prev) => {
      if (!prev[field.key]) return prev;
      const next = { ...prev };
      delete next[field.key];
      return next;
    });
    // Touching a seeded field means it is no longer a benchmark default.
    setProvenance((prev) =>
      prev[field.key] === "benchmark_default" && field.provenance
        ? { ...prev, [field.key]: "estimated" }
        : prev,
    );

    /* Changing industry re-seeds anything the user has not touched.

       Two bugs lived here, and both only bite once people can move backwards —
       which is the point of this change, so they had to go first.

       The guard used to require `field.provenance`, and `company.purpose`,
       `company.startDate`, `company.firstTradingMonth` and `rev.kind` do not
       declare it. They were therefore tagged `benchmark_default` forever, so
       returning to step one and changing industry silently reset the plan's
       audience, its start date and its whole revenue model. Those four are
       decisions, not seeded numbers, and are never re-seeded now.

       And the loop read `provenance` from the closure rather than the state it
       was updating, so it acted on a stale map. */
    if (field.key === "company.industryKey") {
      const seeds = defaultsForIndustry(String(value));
      setProvenance((currentProvenance) => {
        setState((prev) => {
          const next = { ...prev };
          for (const [key, seedValue] of Object.entries(seeds)) {
            if (DECISIONS.has(key)) continue;
            if (currentProvenance[key] === "benchmark_default") next[key] = seedValue;
          }
          return { ...next, "company.industryKey": String(value) };
        });
        return currentProvenance;
      });
    }
  };

  const validate = (): boolean => {
    const found: Record<string, string> = {};
    for (const field of fields) {
      const raw = state[field.key];
      const empty = raw === undefined || raw === null || String(raw).trim() === "";
      if (field.required && empty) {
        found[field.key] = "This one is needed to build the model.";
        continue;
      }
      if (!empty && (field.kind === "number" || field.kind === "currency" || field.kind === "percent")) {
        const value = Number(raw);
        if (!Number.isFinite(value)) found[field.key] = "Please enter a number.";
        else if (field.min !== undefined && value < field.min) found[field.key] = `Cannot be below ${field.min}.`;
        else if (field.max !== undefined && value > field.max) found[field.key] = `Cannot be above ${field.max}.`;
      }
    }
    // Owner compensation is a hard gate, not a nicety: a plan showing zero
    // fails on first review, and the visa marginality test reads this line.
    if (currentStep?.key === "team" && Number(state["team.ownerSalary"] ?? 0) <= 0) {
      found["team.ownerSalary"] = "Owner compensation cannot be zero — an underwriter will substitute a market salary and recompute.";
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  /** Move to a step, remembering the furthest reached and saving as we go. */
  const goTo = (next: number, { save = true }: { save?: boolean } = {}) => {
    const target = Math.max(0, Math.min(next, REVIEW_STEP));
    setStep(target);
    const mark = Math.max(furthest, target);
    setFurthest(mark);
    if (save) void persist(mark);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = () => {
    if (!validate()) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    goTo(step + 1);
  };

  /* Backwards and sideways never validate.
     
     Somebody returning to fix one answer should not be held at the step they
     are leaving — that is the trap that made this wizard feel one-way. The
     whole plan is checked at Review instead, which is the only place it
     matters, and `finish` cannot complete while anything is missing. */
  const goBack = () => goTo(step - 1, { save: false });

  const jumpTo = (target: number) => {
    if (target > furthest) return;
    setErrors({});
    goTo(target, { save: false });
  };

  const saveAndLeave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    startTransition(async () => {
      await persist(Math.max(furthest, step));
      router.push(`/plans/${planId}`);
      router.refresh();
    });
  };

  /** Everything still unanswered, across every step — the Review list. */
  const outstanding = INTAKE_STEPS.flatMap((s, index) =>
    s
      .fields(state)
      .filter((field) => {
        if (!field.required) return false;
        const raw = state[field.key];
        return raw === undefined || raw === null || String(raw).trim() === "";
      })
      .map((field) => ({ step: index, stepTitle: s.title, label: field.label })),
  );

  const finish = () => {
    if (outstanding.length > 0) {
      jumpTo(outstanding[0]!.step);
      return;
    }
    finishing.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    startTransition(async () => {
      await persist(REVIEW_STEP, true);
      router.push(`/plans/${planId}`);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
      <ProgressRail step={step} furthest={furthest} onJump={jumpTo} />

      {currentStep ? (
        <section aria-labelledby="step-title" className="mt-10">
          <Eyebrow className="mb-4">{`Step ${step + 1} of ${REVIEW_STEP + 1}`}</Eyebrow>
          <h1 id="step-title" className="text-display-sm sm:text-display-md">{currentStep.title}</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-secondary">{currentStep.lede}</p>

          {currentStep.key === "model" ? (
            <ModelPicker
              value={String(state["rev.kind"] ?? "")}
              onChange={(kind) => {
                /* Switching model clears the old model's answers first.

                   It used to seed only keys that were `undefined`, and leave
                   everything else. Several drivers are shared by name across
                   models — `rev.monthlyGrowthRate` belongs to four of them —
                   so a rate entered for a shop silently became the rate for a
                   marketplace, and was not re-seeded because it was no longer
                   undefined. The stale keys also kept being saved, producing
                   provenance entries pointing at paths the new stream does not
                   have. */
                const seeds = defaultsForIndustry(String(state["company.industryKey"] ?? "other"));
                const seededForKind = REVENUE_SEEDS_BY_KIND(kind, seeds);

                setState((prev) => {
                  const next: IntakeState = {};
                  for (const [key, value] of Object.entries(prev)) {
                    if (!key.startsWith("rev.")) next[key] = value;
                  }
                  return { ...next, ...seededForKind, "rev.kind": kind };
                });

                // Provenance follows: the old model's tags describe fields that
                // no longer exist, and the new model's are ours until touched.
                setProvenance((prev) => {
                  const next: ProvenanceState = {};
                  for (const [key, value] of Object.entries(prev)) {
                    if (!key.startsWith("rev.")) next[key] = value;
                  }
                  for (const key of Object.keys(seededForKind)) next[key] = "benchmark_default";
                  return next;
                });
                setErrors({});
              }}
            />
          ) : (
            <div className="mt-8 space-y-7">
              {fields.map((field) => (
                <DriverFieldControl
                  key={field.key}
                  field={field}
                  value={state[field.key] ?? ""}
                  provenance={provenance[field.key] ?? "estimated"}
                  error={errors[field.key]}
                  onChange={(value) => setField(field, value)}
                  onProvenanceChange={(p) => setProvenance((prev) => ({ ...prev, [field.key]: p }))}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* What is still missing, across every step, with a way straight to
              it. Validation used to run only on Continue, so a plan could
              reach this screen with blanks behind it and the server would
              quietly decline to mark it complete while the browser navigated
              away as though it had worked. */}
          {outstanding.length > 0 ? (
            <section
              aria-labelledby="outstanding"
              className="mt-10 rounded-lg border border-strong bg-surface-raised p-6"
            >
              <h2 id="outstanding" className="font-display text-lg">
                {outstanding.length === 1
                  ? "One answer is still missing"
                  : `${outstanding.length} answers are still missing`}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary">
                The model cannot be built without these. Everything else is saved.
              </p>
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {outstanding.map((item) => (
                  <li key={`${item.step}-${item.label}`}>
                    <button
                      type="button"
                      onClick={() => jumpTo(item.step)}
                      className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm hover:bg-surface-sunken"
                    >
                      <span className="text-primary">{item.label}</span>
                      <span className="shrink-0 text-xs text-tertiary">{item.stepTitle} →</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <ReviewStep planTitle={planTitle} state={state} provenance={provenance} />
        </>
      )}

      <div className="mt-12 flex items-center justify-between gap-4 border-t border-hairline pt-6">
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={goBack}>
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </Button>
          ) : null}
          {/* There was no way out of this wizard at all. Leaving by the sidebar
              kept the answers but left the plan unfinished, and every page
              downstream then refuses to render. */}
          <Button type="button" variant="ghost" onClick={saveAndLeave} disabled={isPending}>
            Save and finish later
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <p aria-live="polite" className="text-xs text-tertiary">
            {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
          {step < REVIEW_STEP ? (
            <Button type="button" onClick={goNext}>
              Continue
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={isPending}>
              {isPending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
              {isPending ? "Building your model…" : "Build the model"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The rail, which is now navigation rather than decoration.
 *
 * It used to render an `<li>` holding a screen-reader label and an
 * `aria-hidden` coloured bar — no button, no handler, nothing to click. Any
 * step already reached can be opened directly, which is what somebody fixing
 * one answer on a finished plan actually needs.
 */
function ProgressRail({
  step,
  furthest,
  onJump,
}: {
  step: number;
  furthest: number;
  onJump: (index: number) => void;
}) {
  const labels = [...INTAKE_STEPS.map((s) => s.title), "Review"];
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2" aria-label="Intake progress">
      {labels.map((label, index) => {
        const reachable = index <= furthest;
        return (
          <li key={label} className="flex-1 basis-16">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(index)}
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "group block w-full rounded-sm py-1 text-left",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700",
                reachable ? "cursor-pointer" : "cursor-default",
              )}
            >
              <span className="sr-only">
                {label}
                {index === step
                  ? " (current step)"
                  : reachable
                    ? " — go to this step"
                    : " (not reached yet)"}
              </span>
              <span
                aria-hidden
                className={cn(
                  "block h-1 rounded-full transition-colors",
                  index < step && "bg-emerald-700",
                  index === step && "bg-brass-500",
                  index > step && index <= furthest && "bg-emerald-700/35",
                  index > furthest && "bg-surface-sunken",
                  reachable && index !== step && "group-hover:bg-emerald-700/70",
                )}
              />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ModelPicker({ value, onChange }: { value: string; onChange: (kind: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Revenue model" className="mt-8 grid gap-3 sm:grid-cols-2">
      {REVENUE_MODELS.map((model) => {
        const selected = value === model.kind;
        return (
          <button
            key={model.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(model.kind)}
            className={cn(
              "rounded-lg border p-5 text-left transition-colors",
              selected
                ? "border-emerald-700 bg-surface-raised ring-1 ring-emerald-700"
                : "border-hairline bg-surface-raised hover:border-strong",
            )}
          >
            <span className="block font-display text-lg">{model.label}</span>
            <span className="mt-1 block text-sm leading-snug text-secondary">{model.blurb}</span>
            <span className="mt-2.5 block text-xs text-tertiary">{model.examples}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The review step runs the real engine on what was entered, so the first
 * numbers the user sees are computed rather than promised.
 */
function ReviewStep({
  planTitle,
  state,
  provenance,
}: {
  planTitle: string;
  state: IntakeState;
  provenance: ProvenanceState;
}) {
  const result = useMemo(() => {
    try {
      const model = buildModel(buildAssumptions(state, provenance));
      return { model, metrics: computeMetrics(model), error: null as string | null };
    } catch (error) {
      return { model: null, metrics: null, error: error instanceof Error ? error.message : "Could not build the model." };
    }
  }, [state, provenance]);

  const counts = Object.values(provenance).reduce<Record<string, number>>((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section aria-labelledby="review-title" className="mt-10">
      <Eyebrow className="mb-4">Review</Eyebrow>
      <h1 id="review-title" className="text-display-sm sm:text-display-md">
        Here is what your answers produce.
      </h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-secondary">
        These figures come from the engine, not an estimate — the same arithmetic
        that will sit behind the finished plan. Go back and change anything that
        looks wrong.
      </p>

      {result.error ? (
        <p role="alert" className="mt-8 rounded-sm border border-critical/40 bg-critical/5 px-4 py-3 text-sm text-critical">
          {result.error} Step back and check the revenue drivers.
        </p>
      ) : result.model && result.metrics ? (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-6 rounded-lg border border-hairline bg-surface-raised p-6 sm:grid-cols-4">
            <Stat label="Year 1 revenue" value={formatCurrency(result.model.annual[0]?.revenue ?? 0, "USD", { compact: true })} />
            <Stat label="Year 3 revenue" value={formatCurrency(result.model.annual[2]?.revenue ?? 0, "USD", { compact: true })} />
            <Stat
              label="Breaks even"
              value={result.metrics.breakEven.profitMonth ? `Month ${result.metrics.breakEven.profitMonth}` : "Not in 5 years"}
            />
            <Stat
              label={result.metrics.underwriter.minimumDscr !== null ? "Min. DSCR" : "Lowest cash"}
              value={
                result.metrics.underwriter.minimumDscr !== null
                  ? formatMultiple(result.metrics.underwriter.minimumDscr)
                  : formatCurrency(result.metrics.cash.lowestCash, "USD", { compact: true })
              }
            />
          </dl>

          <p className="mt-4 text-xs text-tertiary">
            Balance sheet ties in all {result.model.horizonMonths} periods
            <span aria-hidden className="mx-2">·</span>
            {planTitle}
          </p>

          <div className="mt-8 rounded-lg border border-hairline p-6">
            <h2 className="font-display text-lg">Where these numbers came from</h2>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              Every driver is tagged, and the tags are printed in the finished plan.
              A reader can see which figures you measured and which are industry
              medians — which is the fastest way to be believed.
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <li className="text-secondary"><strong className="numeric text-primary">{counts.known ?? 0}</strong> known</li>
              <li className="text-secondary"><strong className="numeric text-primary">{counts.estimated ?? 0}</strong> estimated</li>
              <li className="text-secondary"><strong className="numeric text-primary">{counts.benchmark_default ?? 0}</strong> industry default</li>
            </ul>
          </div>
        </>
      ) : null}
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
