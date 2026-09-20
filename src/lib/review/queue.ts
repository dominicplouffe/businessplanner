import type { Finding, ValidationResult } from "@/lib/finance/validate";
import type { ConsistencyReport } from "@/lib/ai/consistency";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";
import { INTAKE_STEPS } from "@/lib/content/intake";

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
  /** What that screen is, so the link says where it goes. */
  hrefLabel?: string;
};

/** The aggregate the queue expands, so it is not also listed as an item. */
const ROLLUP_IDS = new Set(["narrative-model-mismatch"]);

/* --------------------------------------------------------------------------
   Where a finding actually gets fixed.

   This used to send everything financial to /financials, which reports the
   numbers and cannot change them — the reader arrived at a page that restated
   the problem and offered no control. Almost every financial finding is an
   *assumption* problem, and intake is the only write path into assumptions, so
   the destination is the intake step that owns the driver.

   The step keys are the ones in INTAKE_STEPS; `intakeStepIndex` resolves them
   so a renamed or reordered step cannot silently produce a link to nowhere.
   -------------------------------------------------------------------------- */

type Destination = { href: string; hrefLabel: string };

/** anchor prefix → the intake step that owns those drivers, longest first. */
const ANCHOR_TO_STEP: [prefix: string, step: string, label: string][] = [
  ["/financials/payroll", "team", "Edit the team and pay"],
  ["/financials/revenue", "revenue", "Edit the revenue drivers"],
  ["/financials/expenses", "costs", "Edit the cost assumptions"],
  ["/financials/unit-economics", "costs", "Edit the cost assumptions"],
  ["/financials/debt", "funding", "Edit the funding and debt"],
  ["/financials/funding", "funding", "Edit the funding and debt"],
  ["/intake/revenue", "revenue", "Edit the revenue drivers"],
];

export function intakeStepIndex(stepKey: string): number {
  const index = INTAKE_STEPS.findIndex((s) => s.key === stepKey);
  // A key that no longer exists lands on the first step rather than a blank
  // wizard — wrong, but recoverable, and the test below stops it happening.
  return index === -1 ? 0 : index;
}

function destinationFor(planId: string, finding: Finding): Destination | undefined {
  const anchor = finding.anchor;
  if (!anchor) return undefined;

  for (const [prefix, step, label] of ANCHOR_TO_STEP) {
    if (anchor.startsWith(prefix)) {
      return { href: `/plans/${planId}/intake?step=${intakeStepIndex(step)}`, hrefLabel: label };
    }
  }

  // The scenario rules are about the shape of the downside case, which is
  // computed rather than answered — the financials page is the right screen.
  if (anchor.startsWith("/financials/scenarios")) {
    return { href: `/plans/${planId}/financials`, hrefLabel: "Open the scenarios" };
  }

  // Anything else financial is a whole-model figure — margin against a band,
  // break-even, cash. The lever is pricing and cost, so: costs.
  if (anchor.startsWith("/financials")) {
    return {
      href: `/plans/${planId}/intake?step=${intakeStepIndex("costs")}`,
      hrefLabel: "Edit the assumptions",
    };
  }

  if (anchor.startsWith("/market") || anchor.startsWith("/competition")) {
    return { href: `/plans/${planId}/sections/market`, hrefLabel: "Open the market section" };
  }

  if (anchor.startsWith("/intake") || anchor.startsWith("/assumptions")) {
    return { href: `/plans/${planId}/intake`, hrefLabel: "Open intake" };
  }

  return { href: `/plans/${planId}${anchor}`, hrefLabel: "Go to it" };
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
      ...destinationFor(planId, finding),
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
      hrefLabel: `Open ${sectionTitle.toLowerCase()}`,
    });
  });

  // Blocking first, then the validator's ordering, which already runs from the
  // structural to the advisory.
  return items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "blocking" ? -1 : 1;
    return 0;
  });
}
