import type { Finding, ValidationResult } from "@/lib/finance/validate";
import type { ConsistencyReport } from "@/lib/ai/consistency";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";

/* ==========================================================================
   The fix-it queue.
   --------------------------------------------------------------------------
   A score without a queue is a grade; a queue is a morning's work. Every item
   carries what is wrong, what to change, and a link to the screen where the
   change is made — a finding with no remedy is just a complaint.

   The validator's own narrative-model-mismatch finding is the roll-up that
   gates export; the queue instead lists each unreconciled figure individually,
   because "three figures do not reconcile" is not something anyone can act on
   and "the market section says $9,400,000" is.
   ========================================================================== */

export type QueueItem = {
  id: string;
  severity: "blocking" | "warning";
  source: "validator" | "consistency";
  title: string;
  detail: string;
  remedy: string;
  /** Where in the product this gets fixed. */
  href?: string;
};

/** The aggregate the queue expands, so it is not also listed as an item. */
const ROLLUP_IDS = new Set(["narrative-model-mismatch"]);

function hrefForFinding(planId: string, finding: Finding): string | undefined {
  const anchor = finding.anchor;
  if (!anchor) return undefined;
  if (anchor.startsWith("/financials")) return `/plans/${planId}/financials`;
  if (anchor.startsWith("/market") || anchor.startsWith("/competition")) {
    return `/plans/${planId}/sections/market`;
  }
  if (anchor.startsWith("/intake") || anchor.startsWith("/assumptions")) {
    return `/plans/${planId}/intake`;
  }
  return `/plans/${planId}${anchor}`;
}

function describeFigure(value: number, kind: string, currency: string): string {
  switch (kind) {
    case "currency":
      return formatCurrency(value, currency);
    case "percent":
      return formatPercent(value);
    case "multiple":
      return formatMultiple(value);
    case "headcount":
      return `${value}`;
    default:
      return String(value);
  }
}

export function buildFixQueue(
  planId: string,
  validation: ValidationResult,
  consistency: ConsistencyReport,
  currency: string,
): QueueItem[] {
  const items: QueueItem[] = [];

  for (const finding of validation.findings) {
    if (ROLLUP_IDS.has(finding.id)) continue;
    items.push({
      id: finding.id,
      severity: finding.severity,
      source: "validator",
      title: finding.title,
      detail: finding.detail,
      remedy: finding.remedy,
      ...(hrefForFinding(planId, finding) ? { href: hrefForFinding(planId, finding)! } : {}),
    });
  }

  consistency.findings.forEach((finding, i) => {
    const { figure, nearest, sectionTitle, sectionKey } = finding;
    items.push({
      id: `consistency-${sectionKey}-${i}`,
      severity: "blocking",
      source: "consistency",
      title: `${sectionTitle} states ${figure.raw}, which the model does not produce`,
      detail: `“${figure.context}”`,
      remedy: nearest
        ? `The closest computed value is ${describeFigure(nearest.value, figure.kind, currency)} — ${nearest.label}. Either use it, or change the assumption so the model produces the figure you meant.`
        : "Nothing the engine computed is close to this. Either the figure belongs to a source that should be cited, or it needs removing.",
      href: `/plans/${planId}/sections/${sectionKey}`,
    });
  });

  // Blocking first, then the validator's ordering, which already runs from the
  // structural to the advisory.
  return items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1;
    return 0;
  });
}
