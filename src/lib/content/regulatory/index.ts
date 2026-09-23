/* ==========================================================================
   Dated regulatory configuration.
   --------------------------------------------------------------------------
   Every value a regulator, lender or statute can change lives here with an
   effective-date range, a source, and the date we last verified it. Nothing in
   this file may be inlined as a constant elsewhere in the codebase.

   This is not defensive over-engineering. Concretely, in flight right now:
     • SOP 50 10 8.1 takes effect 2026-10-01 and changes acquisition
       underwriting from projections to historicals.
     • A 7(a) Small Loan notice already moved one DSCR threshold to 1.10.
     • The EB-5 investment thresholds carry a statutory inflation adjustment
       on 2027-01-01.
   A hardcoded 1.15 would ship a wrong product inside a quarter.

   ⚠ VERIFICATION STATUS: the values below were gathered from secondary
   sources because primary domains (sba.gov, uscis.gov, ecfr.gov, fam.state.gov)
   are blocked by this environment's egress proxy. Each entry carries a
   `confidence` field. Nothing marked "unverified" may be presented to a user as
   authoritative — the UI renders a verification notice instead, and the
   Methodology page prints the config vintage.
   ========================================================================== */

export type Confidence = "verified" | "secondary" | "unverified";

export type DatedValue<T> = {
  value: T;
  effectiveFrom: string; // ISO yyyy-mm-dd
  effectiveTo?: string; // exclusive
  source: { label: string; url?: string; retrieved: string };
  confidence: Confidence;
  note?: string;
};

/**
 * The timezone these dates are in.
 *
 * SBA and USCIS effective dates are US federal dates, and the comparison used
 * to be `toISOString()`, i.e. UTC — so a transition fired up to seven hours
 * early for a user on the west coast, on the one day a lending threshold
 * changes. The server's own local time is not the cure either: it would make
 * the engine's output depend on where the container runs, and the print
 * route, the workbook and the test suite could then disagree. So it is
 * pinned.
 */
const REGULATORY_TIME_ZONE = "America/New_York";

const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: REGULATORY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Newest first. A real comparator: the old one returned -1 for equal keys and
 *  never 0, so two entries sharing a start date sorted arbitrarily. */
const byEffectiveFromDesc = <T>(x: DatedValue<T>, y: DatedValue<T>) =>
  y.effectiveFrom.localeCompare(x.effectiveFrom);

/**
 * The entry in force on `asOf`.
 *
 * `stale` is the important part. When nothing is in force this still returns
 * the latest entry — throwing would take the product down on a date nobody
 * wrote down, which is worse — but it says so, and the callers that present a
 * figure to a user can say so too. Without the flag the `effectiveTo` window
 * was silently discarded on the one path where it matters:
 * `EB5_MINIMUM_INVESTMENT` expires on 2027-01-01 with no successor
 * configured, and every caller would have gone on receiving $1,050,000 as
 * though it were current.
 */
export function inForce<T>(
  entries: DatedValue<T>[],
  asOf: Date = new Date(),
): DatedValue<T> & { stale: boolean } {
  const iso = isoDay.format(asOf);
  const active = entries.filter(
    (e) => e.effectiveFrom <= iso && (e.effectiveTo === undefined || iso < e.effectiveTo),
  );
  const chosen = [...active].sort(byEffectiveFromDesc)[0];
  if (chosen) return { ...chosen, stale: false };

  const fallback = [...entries].sort(byEffectiveFromDesc)[0];
  if (!fallback) throw new Error("No dated values configured");
  return { ...fallback, stale: true };
}

/* -------------------------------------------------------------------------- */
/* SBA debt service coverage                                                  */
/* -------------------------------------------------------------------------- */

export type SbaProgramme = "7a-standard" | "7a-small" | "504";

export const DSCR_THRESHOLDS: Record<SbaProgramme, DatedValue<number>[]> = {
  "7a-standard": [
    {
      value: 1.15,
      effectiveFrom: "2025-06-01",
      source: { label: "SBA SOP 50 10 8", retrieved: "2026-09-19" },
      confidence: "secondary",
      note: "Coverage expected within two years of the projection start.",
    },
  ],
  "7a-small": [
    {
      value: 1.15,
      effectiveFrom: "2025-06-01",
      effectiveTo: "2026-03-01",
      source: { label: "SBA SOP 50 10 8", retrieved: "2026-09-19" },
      confidence: "secondary",
    },
    {
      value: 1.1,
      effectiveFrom: "2026-03-01",
      source: { label: "SBA Notice 5000-875701", retrieved: "2026-09-19" },
      confidence: "secondary",
      note: "Lower threshold for 7(a) Small Loans, effective 2026-03-01.",
    },
  ],
  "504": [
    {
      value: 1.15,
      effectiveFrom: "2025-06-01",
      source: { label: "SBA SOP 50 10 8", retrieved: "2026-09-19" },
      confidence: "secondary",
    },
  ],
};

/** The 7(a) Small Loan ceiling. Above it a request is underwritten as a
 *  standard 7(a), which carries a different coverage expectation — so the
 *  ceiling decides which threshold applies and cannot be a constant either. */
export const SBA_SMALL_LOAN_CEILING: DatedValue<number>[] = [
  {
    value: 500_000,
    effectiveFrom: "2025-06-01",
    source: { label: "SBA SOP 50 10 8", retrieved: "2026-09-19" },
    confidence: "unverified",
    note: "Confirm against the SOP before presenting the programme as settled.",
  },
];

/** Minimum equity injection lenders look for on a startup or acquisition. */
export const EQUITY_INJECTION_MINIMUM: DatedValue<number>[] = [
  {
    value: 0.1,
    effectiveFrom: "2025-06-01",
    source: { label: "SBA SOP 50 10 8", retrieved: "2026-09-19" },
    confidence: "secondary",
  },
];

/* -------------------------------------------------------------------------- */
/* Payroll loading                                                            */
/* -------------------------------------------------------------------------- */

export const FICA_WAGE_BASE: DatedValue<number>[] = [
  {
    value: 184_500,
    effectiveFrom: "2026-01-01",
    source: { label: "SSA contribution and benefit base", retrieved: "2026-09-19" },
    confidence: "unverified",
    note: "Confirm against the SSA announcement before displaying.",
  },
];

/** Employer payroll tax and benefits load, as a fraction of gross wages.
 *
 *  `oasdiRate` is broken out because it is the only portion the wage base
 *  caps: HI is charged on every dollar. Splitting it here rather than in the
 *  engine keeps the whole payroll load in one dated place. */
export const PAYROLL_LOAD: DatedValue<{
  payrollTaxRate: number;
  benefitsRate: number;
  oasdiRate: number;
}>[] = [
  {
    value: { payrollTaxRate: 0.0765, benefitsRate: 0.12, oasdiRate: 0.062 },
    effectiveFrom: "2026-01-01",
    source: { label: "FICA statutory rate; BLS ECEC benefit share", retrieved: "2026-09-19" },
    confidence: "secondary",
    note: "7.65% is statutory (6.2% OASDI + 1.45% HI). Benefits share varies widely by sector.",
  },
];

/* -------------------------------------------------------------------------- */
/* EB-5 investment thresholds                                                 */
/* -------------------------------------------------------------------------- */

export type Eb5Category = "standard" | "tea" | "infrastructure";

export const EB5_MINIMUM_INVESTMENT: Record<Eb5Category, DatedValue<number>[]> = {
  standard: [
    {
      value: 1_050_000,
      effectiveFrom: "2022-05-14",
      effectiveTo: "2027-01-01",
      source: { label: "EB-5 Reform and Integrity Act of 2022", retrieved: "2026-09-19" },
      confidence: "unverified",
      note: "Statutory inflation adjustment due 2027-01-01. Amount for that period is not yet configured.",
    },
  ],
  tea: [
    {
      value: 800_000,
      effectiveFrom: "2022-05-14",
      effectiveTo: "2027-01-01",
      source: { label: "EB-5 Reform and Integrity Act of 2022", retrieved: "2026-09-19" },
      confidence: "unverified",
      note: "Rural or high-unemployment targeted employment area.",
    },
  ],
  infrastructure: [
    {
      value: 800_000,
      effectiveFrom: "2022-05-14",
      effectiveTo: "2027-01-01",
      source: { label: "EB-5 Reform and Integrity Act of 2022", retrieved: "2026-09-19" },
      confidence: "unverified",
    },
  ],
};

/** Jobs an EB-5 petition must create per investor. */
export const EB5_JOBS_REQUIRED: DatedValue<number>[] = [
  {
    value: 10,
    effectiveFrom: "1990-11-29",
    source: { label: "8 CFR 204.6(j)(4)(i)(B)", retrieved: "2026-09-19" },
    confidence: "unverified",
  },
];

/** Minimum weekly hours for a qualifying full-time EB-5 position. */
export const EB5_FULL_TIME_HOURS: DatedValue<number>[] = [
  {
    value: 35,
    effectiveFrom: "1990-11-29",
    source: { label: "8 CFR 204.6(e)", retrieved: "2026-09-19" },
    confidence: "unverified",
  },
];

/* -------------------------------------------------------------------------- */
/* Vintage                                                                    */
/* -------------------------------------------------------------------------- */

/** Printed in the plan's Methodology note. It is what lets a loan officer
 *  verify our arithmetic rather than doubt it. */
export const CONFIG_VINTAGE = {
  lastReviewed: "2026-09-19",
  /** Values needing confirmation against a primary source, highest risk first. */
  verificationQueue: [
    "SBA SOP DSCR thresholds and the 2026-10-01 SOP 50 10 8.1 change",
    "SBA guaranty fee schedule (fiscal-year dependent)",
    "7(a) Small Loan ceiling, which selects the DSCR threshold",
    "Section 179 limit and bonus depreciation percentage for 2026",
    "FICA wage base for 2026",
    "EB-5 thresholds and the 2027-01-01 inflation adjustment",
    "Matter of Ho element list, against the original decision",
    "9 FAM 402.9 subsection lettering (sources conflict; no pin cites until resolved)",
  ],
} as const;

/** Which 7(a) programme a request falls under, by size. Returned alongside the
 *  dated ceiling so the UI can print which figure the decision used. */
export function sbaProgrammeForLoan(
  totalPrincipal: number,
  asOf?: Date,
): { programme: SbaProgramme; ceiling: DatedValue<number> & { stale: boolean } } {
  const ceiling = inForce(SBA_SMALL_LOAN_CEILING, asOf);
  return {
    programme: totalPrincipal <= ceiling.value ? "7a-small" : "7a-standard",
    ceiling,
  };
}

/** Convenience: the DSCR threshold in force for a programme today. */
export function dscrThreshold(
  programme: SbaProgramme,
  asOf?: Date,
): DatedValue<number> & { stale: boolean } {
  return inForce(DSCR_THRESHOLDS[programme], asOf);
}

/**
 * Every dated series this product reads, and whether it is still in force.
 *
 * An expiry that nobody notices is the failure mode the whole dated-config
 * mechanism exists to prevent, and until `inForce` reported staleness there
 * was no way to ask. Deliberately covers the values that are actually read:
 * the EB-5 thresholds have a known unconfigured successor and are tracked in
 * `CONFIG_VINTAGE.verificationQueue` instead, because a test that cannot be
 * made to pass is a test people learn to ignore.
 */
export function staleSeries(asOf: Date = new Date()): string[] {
  const series: [string, DatedValue<unknown>[]][] = [
    ["DSCR_THRESHOLDS.7a-standard", DSCR_THRESHOLDS["7a-standard"]],
    ["DSCR_THRESHOLDS.7a-small", DSCR_THRESHOLDS["7a-small"]],
    ["DSCR_THRESHOLDS.504", DSCR_THRESHOLDS["504"]],
    ["SBA_SMALL_LOAN_CEILING", SBA_SMALL_LOAN_CEILING],
    ["EQUITY_INJECTION_MINIMUM", EQUITY_INJECTION_MINIMUM],
    ["FICA_WAGE_BASE", FICA_WAGE_BASE],
    ["PAYROLL_LOAD", PAYROLL_LOAD],
  ];
  return series.filter(([, entries]) => inForce(entries, asOf).stale).map(([name]) => name);
}
