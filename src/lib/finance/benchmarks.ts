/* ==========================================================================
   Industry benchmark bands.
   --------------------------------------------------------------------------
   Benchmarks WARN, they never overwrite. Silently substituting an industry
   median destroys the specificity that makes a plan credible — the point is to
   flag an out-of-band assumption with its source and let the author justify it.

   ⚠ SOURCE TIER: bands marked tier "secondary" came from vendor and trade
   content and are usable as ranges, not as something a lender will read. Where a
   figure must survive scrutiny, substitute RMA/ProSight Annual Statement Studies
   (the bankers' own NAICS-indexed dataset) or IRS SOI Tax Stats. `sourceTier`
   exists so that substitution can be done selectively rather than wholesale.
   ========================================================================== */

export type SourceTier = "primary" | "secondary";

export type Band = { low: number; high: number; median: number };

/** Which cost base a published gross-margin band is quoted on.
 *
 *  This is not a detail. The engine carries direct labour in cost of sales, but
 *  the trade figures do not agree with each other about that: a restaurant's
 *  gross margin is quoted on food cost alone, while a cleaning contractor's is
 *  quoted after the cleaners' wages, because the wages *are* the cost of the
 *  service. Comparing one basis against the other is wrong in both directions —
 *  labour-inclusive against a materials band reports a shortfall on every
 *  hospitality plan, and materials against a labour-inclusive band reports every
 *  labour business as extraordinarily profitable. So each band declares its own
 *  basis and the validator reads the matching figure. */
export type GrossMarginBasis = "materials" | "with-direct-labour";

export type IndustryBenchmark = {
  key: string;
  label: string;
  naics?: string;
  grossMargin: Band;
  /** The cost base `grossMargin` is quoted on. `materials` compares against
   *  `metrics.materialsMarginByYear`; `with-direct-labour` against
   *  `grossMarginByYear`. Required, so a new benchmark cannot be added without
   *  the author deciding which one its source meant. */
  grossMarginBasis: GrossMarginBasis;
  netMargin: Band;
  /** Payroll as a share of revenue. */
  payrollRatio: Band;
  /** Rent or occupancy as a share of revenue, where it is a meaningful line. */
  occupancyRatio?: Band;
  /** Typical revenue per employee, in dollars. */
  revenuePerEmployee?: Band;
  sourceTier: SourceTier;
  sourceLabel: string;
  vintage: string;
  notes?: string;
};

const b = (low: number, median: number, high: number): Band => ({ low, median, high });

export const INDUSTRY_BENCHMARKS: IndustryBenchmark[] = [
  {
    key: "saas",
    label: "B2B SaaS",
    naics: "513210",
    grossMargin: b(0.7, 0.78, 0.88),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(-0.4, 0.05, 0.2),
    payrollRatio: b(0.35, 0.5, 0.7),
    revenuePerEmployee: b(90_000, 150_000, 250_000),
    sourceTier: "secondary",
    sourceLabel: "Industry surveys, aggregated",
    vintage: "2026",
    notes: "Early-stage SaaS is expected to run a net loss; a positive net margin in year 1 invites scrutiny.",
  },
  {
    key: "restaurant",
    label: "Restaurant (full service)",
    naics: "722511",
    grossMargin: b(0.6, 0.68, 0.73),
    grossMarginBasis: "materials",
    netMargin: b(0.0, 0.05, 0.1),
    payrollRatio: b(0.28, 0.33, 0.38),
    occupancyRatio: b(0.06, 0.09, 0.12),
    sourceTier: "secondary",
    sourceLabel: "Restaurant industry operating reports",
    vintage: "2026",
    notes: "Prime cost (food + labour) above ~65% of revenue is the standard red flag.",
  },
  {
    key: "coffee-shop",
    label: "Coffee shop",
    naics: "722515",
    grossMargin: b(0.7, 0.78, 0.85),
    grossMarginBasis: "materials",
    netMargin: b(0.02, 0.07, 0.15),
    payrollRatio: b(0.28, 0.33, 0.4),
    occupancyRatio: b(0.08, 0.11, 0.15),
    sourceTier: "secondary",
    sourceLabel: "Specialty coffee trade data",
    vintage: "2026",
  },
  {
    key: "ecommerce",
    label: "E-commerce (DTC)",
    naics: "455110",
    grossMargin: b(0.35, 0.5, 0.65),
    grossMarginBasis: "materials",
    netMargin: b(-0.1, 0.04, 0.12),
    payrollRatio: b(0.1, 0.17, 0.25),
    sourceTier: "secondary",
    sourceLabel: "DTC operator benchmarks",
    vintage: "2026",
    notes: "Blended CAC and return rate drive the outcome more than gross margin.",
  },
  {
    key: "professional-services",
    label: "Professional services",
    naics: "541600",
    grossMargin: b(0.4, 0.52, 0.65),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.05, 0.14, 0.25),
    payrollRatio: b(0.45, 0.58, 0.7),
    revenuePerEmployee: b(120_000, 180_000, 300_000),
    sourceTier: "secondary",
    sourceLabel: "Consulting and agency operating surveys",
    vintage: "2026",
    notes: "Utilisation below ~60% rarely supports the modelled margin.",
  },
  {
    key: "construction",
    label: "Construction (specialty trade)",
    naics: "238000",
    grossMargin: b(0.15, 0.24, 0.35),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.02, 0.06, 0.12),
    payrollRatio: b(0.2, 0.3, 0.4),
    sourceTier: "secondary",
    sourceLabel: "Construction financial benchmarks",
    vintage: "2026",
    notes: "Working capital, not margin, is what usually fails these plans.",
  },
  {
    key: "trucking",
    label: "Trucking and freight",
    naics: "484121",
    grossMargin: b(0.2, 0.32, 0.45),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.02, 0.06, 0.12),
    payrollRatio: b(0.25, 0.35, 0.45),
    sourceTier: "secondary",
    sourceLabel: "Motor carrier operating cost surveys",
    vintage: "2026",
  },
  {
    key: "salon",
    label: "Salon and personal care",
    naics: "812112",
    grossMargin: b(0.8, 0.87, 0.92),
    grossMarginBasis: "materials",
    netMargin: b(0.03, 0.09, 0.18),
    payrollRatio: b(0.4, 0.48, 0.58),
    occupancyRatio: b(0.08, 0.12, 0.18),
    sourceTier: "secondary",
    sourceLabel: "Personal care services trade data",
    vintage: "2026",
  },
  {
    key: "fitness",
    label: "Gym and fitness studio",
    naics: "713940",
    grossMargin: b(0.7, 0.8, 0.9),
    grossMarginBasis: "materials",
    netMargin: b(0.0, 0.08, 0.18),
    payrollRatio: b(0.3, 0.4, 0.5),
    occupancyRatio: b(0.15, 0.22, 0.3),
    sourceTier: "secondary",
    sourceLabel: "Fitness industry operating reports",
    vintage: "2026",
  },
  {
    key: "retail",
    label: "Retail (bricks and mortar)",
    naics: "449000",
    grossMargin: b(0.3, 0.42, 0.55),
    grossMarginBasis: "materials",
    netMargin: b(0.01, 0.05, 0.1),
    payrollRatio: b(0.12, 0.18, 0.25),
    occupancyRatio: b(0.05, 0.09, 0.14),
    sourceTier: "secondary",
    sourceLabel: "Retail operating benchmarks",
    vintage: "2026",
  },
  {
    key: "cleaning",
    label: "Commercial cleaning",
    naics: "561720",
    grossMargin: b(0.3, 0.42, 0.55),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.04, 0.1, 0.18),
    payrollRatio: b(0.4, 0.5, 0.62),
    sourceTier: "secondary",
    sourceLabel: "Building services benchmarks",
    vintage: "2026",
  },
  {
    key: "childcare",
    label: "Childcare and daycare",
    naics: "624410",
    // Widened downward from a published 55–75%. Classroom staffing is set by
    // mandated child-to-staff ratios, not by choice, and those wages sit above
    // the gross line: a 55% floor against this sector's own 45–65% payroll ratio
    // and 2–15% net margin cannot all three be true. The low end is the one that
    // moved, so an out-of-band finding here still means something.
    grossMargin: b(0.45, 0.56, 0.7),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.02, 0.08, 0.15),
    payrollRatio: b(0.45, 0.55, 0.65),
    occupancyRatio: b(0.1, 0.15, 0.22),
    sourceTier: "secondary",
    sourceLabel: "Early education operating data",
    vintage: "2026",
    notes:
      "Ratio-mandated staffing is the binding constraint; margin follows enrolment and tuition, not cost control.",
  },
  {
    key: "real-estate",
    label: "Real estate brokerage",
    naics: "531210",
    grossMargin: b(0.3, 0.45, 0.6),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.05, 0.13, 0.25),
    payrollRatio: b(0.2, 0.35, 0.5),
    sourceTier: "secondary",
    sourceLabel: "Brokerage operating surveys",
    vintage: "2026",
  },
  {
    key: "manufacturing",
    label: "Light manufacturing",
    naics: "339900",
    grossMargin: b(0.25, 0.35, 0.48),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.03, 0.08, 0.15),
    payrollRatio: b(0.15, 0.24, 0.35),
    sourceTier: "secondary",
    sourceLabel: "Manufacturing financial ratios",
    vintage: "2026",
  },
  {
    key: "nonprofit",
    label: "Nonprofit / social enterprise",
    grossMargin: b(0.5, 0.7, 0.9),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(-0.05, 0.02, 0.08),
    payrollRatio: b(0.4, 0.6, 0.75),
    sourceTier: "secondary",
    sourceLabel: "Nonprofit financial health studies",
    vintage: "2026",
    notes: "Programme-expense ratio matters more to funders than net margin.",
  },
  {
    key: "food-truck",
    label: "Food truck",
    naics: "722330",
    grossMargin: b(0.6, 0.68, 0.75),
    grossMarginBasis: "materials",
    netMargin: b(0.04, 0.1, 0.18),
    payrollRatio: b(0.22, 0.28, 0.35),
    occupancyRatio: b(0.04, 0.07, 0.1),
    sourceTier: "secondary",
    sourceLabel: "Mobile food operator surveys",
    vintage: "2026",
    notes:
      "Carrying commissary and pitch fees instead of a lease is the whole economic argument, which is why the net band sits above the full-service restaurant's. Seasonality is correspondingly harsher.",
  },
  {
    key: "bar",
    label: "Bar and tavern",
    naics: "722410",
    grossMargin: b(0.66, 0.74, 0.82),
    grossMarginBasis: "materials",
    netMargin: b(0.03, 0.09, 0.15),
    payrollRatio: b(0.22, 0.28, 0.35),
    occupancyRatio: b(0.06, 0.09, 0.13),
    sourceTier: "secondary",
    sourceLabel: "Beverage trade operating data",
    vintage: "2026",
    notes:
      "Pour cost runs well below a restaurant's food cost, which is why this band sits higher; a bar with a large food menu drifts toward the restaurant band.",
  },
  {
    key: "laundromat",
    label: "Laundromat",
    naics: "812310",
    grossMargin: b(0.62, 0.74, 0.84),
    grossMarginBasis: "materials",
    netMargin: b(0.06, 0.15, 0.28),
    payrollRatio: b(0.06, 0.12, 0.2),
    occupancyRatio: b(0.14, 0.2, 0.28),
    sourceTier: "secondary",
    sourceLabel: "Coin laundry operator surveys",
    vintage: "2026",
    notes:
      "Water, gas and electricity are the dominant variable cost and belong above the gross line. A plan that models them as overhead reports a margin no operator would recognise.",
  },
  {
    key: "short-term-rental",
    label: "Short-term rental",
    naics: "721199",
    grossMargin: b(0.68, 0.78, 0.88),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.04, 0.14, 0.26),
    payrollRatio: b(0.05, 0.12, 0.22),
    sourceTier: "secondary",
    sourceLabel: "Short-term rental operator data",
    vintage: "2026",
    notes:
      "Platform fees, cleaning and turnover supplies sit above the gross line. Debt service on the property, not margin, is usually what decides the net.",
  },
  {
    key: "landscaping",
    label: "Landscaping and grounds maintenance",
    naics: "561730",
    grossMargin: b(0.34, 0.45, 0.56),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(0.04, 0.09, 0.16),
    payrollRatio: b(0.32, 0.42, 0.52),
    sourceTier: "secondary",
    sourceLabel: "Grounds maintenance trade benchmarks",
    vintage: "2026",
    notes:
      "Seasonality, not margin, is what strains these plans: a year-round crew against a five-month season needs a winter line or a documented layoff.",
  },
  {
    key: "other",
    label: "Other / general",
    grossMargin: b(0.25, 0.5, 0.8),
    grossMarginBasis: "with-direct-labour",
    netMargin: b(-0.1, 0.07, 0.2),
    payrollRatio: b(0.15, 0.35, 0.6),
    sourceTier: "secondary",
    sourceLabel: "Cross-industry composite",
    vintage: "2026",
    notes: "Wide bands: pick a closer industry for a meaningful check.",
  },
];

const BY_KEY = new Map(INDUSTRY_BENCHMARKS.map((x) => [x.key, x]));

export function getBenchmark(key: string): IndustryBenchmark {
  return BY_KEY.get(key) ?? BY_KEY.get("other")!;
}

export function isOutOfBand(value: number, band: Band): "low" | "high" | null {
  if (value < band.low) return "low";
  if (value > band.high) return "high";
  return null;
}
