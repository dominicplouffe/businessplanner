"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/* ==========================================================================
   Shared calculator chrome.
   --------------------------------------------------------------------------
   Inputs on the left, results on the right, recomputed on every keystroke.
   There is no Calculate button because there is nothing to wait for — the
   engine runs in the browser.
   ========================================================================== */

export function CalculatorFrame({
  inputs,
  results,
  wide = false,
}: {
  inputs: React.ReactNode;
  results: React.ReactNode;
  /** Gives the results side more room, for schedules and step tables. */
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-10",
        wide ? "lg:grid-cols-[minmax(0,20rem)_1fr]" : "lg:grid-cols-2",
        "lg:gap-14",
      )}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Calculator inputs"
      >
        {inputs}
      </form>
      <div className="min-w-0">{results}</div>
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange,
  hint,
  prefix,
  suffix,
  step = 1,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-primary">
        {label}
      </label>
      <div className="relative">
        {prefix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tertiary"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          step={step}
          min={min}
          max={max}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => {
            const next = e.target.valueAsNumber;
            onChange(Number.isNaN(next) ? 0 : next);
          }}
          className={cn(
            "numeric h-11 w-full rounded-sm border border-strong bg-surface-raised px-3 text-[0.95rem] text-primary",
            "transition-colors focus:border-emerald-600 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600",
            prefix && "pl-7",
            suffix && "pr-10",
          )}
        />
        {suffix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-tertiary"
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-xs leading-snug text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-primary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-11 w-full rounded-sm border border-strong bg-surface-raised px-3 text-[0.95rem] text-primary transition-colors focus:border-emerald-600 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="text-xs leading-snug text-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The answer. `tone` never carries meaning alone — every use pairs it with a
 *  word, per the palette rule. */
export function Headline({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: React.ReactNode;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-raised p-6">
      <p className="text-xs uppercase tracking-wide text-tertiary">{label}</p>
      <p
        className={cn(
          "figure-hero mt-2 font-display text-4xl tracking-[-0.02em]",
          tone === "good" && "text-good",
          tone === "warning" && "text-warning",
          tone === "critical" && "text-critical",
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-3 text-sm leading-relaxed text-secondary">{note}</p> : null}
    </div>
  );
}

export function ResultList({
  rows,
}: {
  rows: { label: string; value: string; note?: string }[];
}) {
  return (
    <dl className="divide-y divide-hairline border-y border-hairline">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
          <dt className="text-sm text-secondary">{r.label}</dt>
          <dd className="numeric shrink-0 text-sm text-primary">{r.value}</dd>
          {r.note ? (
            <dd className="mt-0.5 w-full text-xs leading-relaxed text-tertiary">{r.note}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

/** A dated regulatory value, shown with everything needed to verify it. */
export function ConfigNote({
  label,
  value,
  source,
  effectiveFrom,
  effectiveTo,
  confidence,
}: {
  label: string;
  value: string;
  source: string;
  effectiveFrom: string;
  effectiveTo?: string;
  confidence: "verified" | "secondary" | "unverified";
}) {
  return (
    <div className="rounded-sm border border-hairline p-4 text-xs leading-relaxed text-tertiary">
      <p className="text-primary">
        {label}: <span className="numeric">{value}</span>
      </p>
      <p className="mt-1.5">
        {source} · in force from {effectiveFrom}
        {effectiveTo ? ` to ${effectiveTo}` : " (no end date on record)"}
      </p>
      {confidence === "unverified" ? (
        <p className="mt-1.5 text-warning">
          Unverified — this figure is in our verification queue and must not be
          presented to a lender as authoritative.
        </p>
      ) : (
        <p className="mt-1.5">Confidence: {confidence}.</p>
      )}
    </div>
  );
}
