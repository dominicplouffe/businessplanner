import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DimensionScore } from "@/lib/review/rubric";

/* Each dimension shows what it checked and how each check came out — open by
   default where something failed, because a collapsed failure is a hidden one. */
export function Dimensions({ dimensions }: { dimensions: DimensionScore[] }) {
  return (
    <section aria-labelledby="dimensions">
      <h2 id="dimensions" className="font-display text-xl">
        What was checked
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-secondary">
        Five dimensions, weighted for who this plan is for. Every point in the
        score above comes from one of the checks below.
      </p>

      <div className="mt-6 space-y-3">
        {dimensions.map((dimension) => {
          const failed = dimension.checks.filter((c) => !c.passed).length;
          return (
            <details
              key={dimension.key}
              open={failed > 0}
              className="group rounded-lg border border-hairline px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium text-primary">{dimension.label}</span>
                <span className="numeric text-xs text-tertiary">
                  {dimension.checks.length - failed}/{dimension.checks.length} passed
                  <span aria-hidden className="mx-2">·</span>
                  {Math.round(dimension.weight * 100)}% of the score
                </span>
              </summary>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tertiary">
                {dimension.rationale}
              </p>

              <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
                {dimension.checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-3 py-3">
                    {check.passed ? (
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-good" />
                    ) : (
                      <X aria-hidden className="mt-0.5 size-4 shrink-0 text-critical" />
                    )}
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm",
                          check.passed ? "text-secondary" : "font-medium text-primary",
                        )}
                      >
                        <span className="sr-only">{check.passed ? "Passed: " : "Failed: "}</span>
                        {check.label}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-tertiary">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}
