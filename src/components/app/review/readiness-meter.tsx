import { cn } from "@/lib/utils";
import type { Readiness, ReadinessBand } from "@/lib/review/rubric";

/* ==========================================================================
   The readiness meter.
   --------------------------------------------------------------------------
   A single number is a grade, and a grade invites arguing with the grader. So
   the score is shown against the four bands it sits in, named, with the verdict
   written out beside it — and every point behind it is itemised below. The band
   is carried by its position and its label, never by colour alone.
   ========================================================================== */

const BANDS: { key: ReadinessBand; label: string; from: number }[] = [
  { key: "not-ready", label: "Not ready", from: 0 },
  { key: "needs-work", label: "Needs work", from: 60 },
  { key: "close", label: "Close", from: 70 },
  { key: "ready", label: "Ready", from: 85 },
];

export function ReadinessMeter({ readiness }: { readiness: Readiness }) {
  const { score, band, bandLabel, verdict, cappedByBlocking } = readiness;

  return (
    <section
      aria-labelledby="readiness"
      className="rounded-lg border border-hairline bg-surface-raised p-6 sm:p-7"
    >
      <h2 id="readiness" className="text-eyebrow font-medium uppercase text-tertiary">
        Readiness
      </h2>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <p className="figure-hero font-display text-5xl tracking-[-0.03em]">
          {score}
          <span className="text-2xl text-tertiary">/100</span>
        </p>
        <p
          className={cn(
            "text-lg font-medium",
            band === "ready" ? "text-good" : band === "not-ready" ? "text-critical" : "text-primary",
          )}
        >
          {bandLabel}
        </p>
      </div>

      {/* The bands, so the number has a scale to mean something against. The
          score is a marker on the track rather than a fill: a fill would make
          85 out of 100 look like an almost-empty bar, because the passing band
          is the narrow one at the end. */}
      <div className="mt-7">
        <div className="relative h-2 w-full rounded-full bg-ink-100 dark:bg-ink-800">
          <div className="flex h-full w-full" aria-hidden>
            {BANDS.map((b, i) => {
              const to = BANDS[i + 1]?.from ?? 100;
              return (
                <span
                  key={b.key}
                  style={{ width: `${to - b.from}%` }}
                  className={cn(
                    "h-full first:rounded-l-full last:rounded-r-full",
                    b.key === band ? "bg-ink-400 dark:bg-ink-600" : "bg-transparent",
                    i > 0 && "border-l border-surface-raised",
                  )}
                />
              );
            })}
          </div>
          <span
            aria-hidden
            style={{ left: `${score}%` }}
            className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-900 dark:bg-paper-100"
          />
        </div>
        <ul aria-hidden className="mt-2 flex w-full text-[0.6875rem]">
          {BANDS.map((b, i) => {
            const to = BANDS[i + 1]?.from ?? 100;
            return (
              <li
                key={b.key}
                style={{ width: `${to - b.from}%` }}
                className={cn(
                  "truncate pr-1",
                  b.key === band ? "font-medium text-primary" : "text-tertiary",
                )}
              >
                {b.label}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-6 max-w-2xl leading-relaxed text-secondary">{verdict}</p>

      {cappedByBlocking ? (
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-warning">
          The rest of this plan scores higher than {score}. The score is held
          here deliberately: a plan with something blocking in it is not
          partially ready, and a number that said otherwise would be the most
          expensive thing on this page.
        </p>
      ) : null}
    </section>
  );
}
