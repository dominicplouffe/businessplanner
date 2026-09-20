"use client";

import { useId } from "react";
import type { DriverField } from "@/lib/content/intake";
import type { Provenance } from "@/lib/finance/types";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const PROVENANCE: { value: Provenance; label: string; title: string }[] = [
  { value: "known", label: "Known", title: "You measured this or have it in writing" },
  { value: "estimated", label: "Estimated", title: "Your judgement" },
  { value: "benchmark_default", label: "Benchmark", title: "An industry median we supplied" },
];

export function DriverFieldControl({
  field,
  value,
  provenance,
  error,
  onChange,
  onProvenanceChange,
}: {
  field: DriverField;
  value: string | number;
  provenance: Provenance;
  error?: string;
  onChange: (value: string | number) => void;
  onProvenanceChange: (p: Provenance) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [field.hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const isNumeric = field.kind === "number" || field.kind === "currency" || field.kind === "percent";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Label htmlFor={id}>
          {field.label}
          {field.required ? <span aria-hidden className="ml-1 text-brass-600">*</span> : null}
        </Label>

        {field.provenance ? (
          <ProvenanceToggle value={provenance} onChange={onProvenanceChange} fieldLabel={field.label} />
        ) : null}
      </div>

      {field.kind === "textarea" ? (
        <Textarea
          id={id}
          rows={4}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "select" ? (
        <Select
          id={id}
          value={String(value ?? "")}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="" disabled>Choose one…</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      ) : (
        <div className={cn("relative", isNumeric && "max-w-xs")}>
          {field.kind === "currency" ? (
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary">$</span>
          ) : null}
          <Input
            id={id}
            type={field.kind === "month" ? "month" : isNumeric ? "number" : "text"}
            inputMode={isNumeric ? "decimal" : undefined}
            value={String(value ?? "")}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
            aria-describedby={describedBy}
            aria-invalid={Boolean(error)}
            onChange={(e) => onChange(isNumeric ? e.target.value : e.target.value)}
            className={cn(
              isNumeric && "numeric",
              field.kind === "currency" && "pl-7",
              field.kind === "percent" && "pr-9",
            )}
          />
          {field.kind === "percent" ? (
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-tertiary">%</span>
          ) : null}
        </div>
      )}

      {field.hint && !error ? (
        <p id={hintId} className="max-w-prose text-sm leading-snug text-tertiary">{field.hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-critical">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * Per-driver provenance. This is the cheapest trust signal in the product: a
 * plan that distinguishes what the owner measured from what we assumed reads as
 * more credible than one that states both with equal confidence.
 */
function ProvenanceToggle({
  value,
  onChange,
  fieldLabel,
}: {
  value: Provenance;
  onChange: (p: Provenance) => void;
  fieldLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Where the value for "${fieldLabel}" came from`}
      className="flex items-center gap-0.5 rounded-full border border-hairline p-0.5"
    >
      {PROVENANCE.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.7rem] font-medium transition-colors",
            value === option.value
              ? "bg-ink-950 text-paper"
              : "text-tertiary hover:text-secondary",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
