/* ==========================================================================
   Bounded growth.
   --------------------------------------------------------------------------
   The engine used to apply `Math.pow(1 + rate, elapsed)` to volume with
   nothing bounding the result. A user entered 50% — meaning it the way people
   mean it, roughly — and the model returned year-five revenue of $4.3
   trillion, about fifteen per cent of US GDP, on one employee. It validated
   clean, because every cost line was a percentage of revenue and the margins
   therefore stayed inside the industry band at any scale.

   The defect is not the arithmetic. It is that a constant growth rate is a
   claim no business can make: 50% a month is ordinary going from one customer
   to two and impossible going from eight million to twelve. Real volume grows
   against something — seats, licensed places, billable hours, a market — and
   the closer it gets, the harder the next unit is to win.

   So growth here is logistic, toward a ceiling the author has to name:

       v(t) = K(t) / (1 + a · e^(−r·t))     a = (ceiling − start) / start
                                            r = ln(1 + monthlyRate)
       K(t) = ceiling · (1 + terminalAnnualRate)^(t/12)

   Early months grow at about `monthlyRate`. Growth decelerates as volume
   approaches the ceiling — not because a rule clamps it, but because
   saturation is in the shape. The ceiling itself drifts at a terminal rate, so
   a mature business still moves with its prices and its market rather than
   flatlining.

   The property that matters: **the ceiling decides year five, and the rate
   only decides how fast you get there.** On a shop at 300 covers a month with
   capacity for 1,400, a monthly rate of 5% gives year-five revenue of
   $177,020; 15% gives $224,547; 50% gives $225,067. The input that produced
   $4.3 trillion now produces a quarter of a million. That is deliberate: the
   safety belongs in the structure, because arguing with an owner about whether
   they are too optimistic is a losing game, and asking them what their
   capacity is is a question they can actually answer.

   Pure, no I/O, no dependency on the rest of the engine.
   ========================================================================== */

export type GrowthCurve = {
  /** Volume in the stream's first active month. */
  start: number;
  /**
   * The most this business could serve, in the same unit as `start`.
   *
   * Required, and that is the whole point — there is no way to express an
   * unbounded business, because there is no such business.
   */
  ceiling: number;
  /** Growth per month before saturation bites. 0.02 is 2%, about 27% a year. */
  monthlyRate: number;
  /**
   * What the ceiling itself does each year once the business is mature —
   * price inflation, a market that is itself growing. Small by construction:
   * anything above a few per cent claims to outgrow the economy forever.
   */
  terminalAnnualRate: number;
};

/**
 * Volume for each month of the horizon, index 0 being the stream's first
 * active month.
 *
 * Degenerate cases, all deliberate rather than guarded after the fact:
 *
 * - `start <= 0` — nothing to grow from, so the series is zero. A business
 *   with no first customer cannot be projected; it has to be asked for.
 * - `ceiling <= 0` — the same, by the same reasoning.
 * - `ceiling === start` — already at capacity: flat, drifting only with the
 *   terminal rate. This is the honest shape for a full restaurant.
 * - `monthlyRate === 0` — flat. The author is saying they expect no growth.
 * - `monthlyRate < 0` — decays toward zero. A declining business is a thing
 *   people have to be able to model, particularly in a downside scenario.
 * - `ceiling < start` — reverts *down* toward the ceiling, which is what
 *   trading above sustainable capacity actually looks like.
 */
export function projectVolume(curve: GrowthCurve, months: number): number[] {
  const out = new Array<number>(Math.max(0, months)).fill(0);
  const { start, ceiling, monthlyRate, terminalAnnualRate } = curve;

  if (months <= 0) return out;
  if (start <= 0 || ceiling <= 0) return out;

  const a = (ceiling - start) / start; // headroom, as a multiple of today

  // Already exactly at capacity: flat, drifting only with the ceiling. Solving
  // for a rate here would divide by zero, and there is no rate to find.
  if (a === 0) {
    for (let t = 0; t < months; t++) out[t] = ceiling * Math.pow(1 + terminalAnnualRate, t / 12);
    return out;
  }

  /* Already trading above the stated capacity. The author has told us two
     incompatible things — "I am over my ceiling" and "I expect to grow" — and
     the only defensible reading is that the ceiling binds: volume reverts to
     it at the pace they named. Solving for the first month's growth here would
     honour the growth claim instead and diverge away from the ceiling, which
     is how you get a model that is over capacity and accelerating. */
  if (start > ceiling) {
    const decay = Math.log(1 + Math.abs(monthlyRate));
    for (let t = 0; t < months; t++) {
      const k = ceiling * Math.pow(1 + terminalAnnualRate, t / 12);
      out[t] = k / (1 + a * Math.exp(-decay * t));
    }
    return out;
  }

  /* The intrinsic rate is solved for, rather than used as given.

     A logistic curve's *realised* growth is the intrinsic rate scaled by how
     much room is left, so feeding `monthlyRate` in directly means an author who
     types 8% sees 6.2% in month two — already saturated, because the business
     starts at a fifth of its capacity. That is indefensible in a product whose
     whole claim is that the numbers mean what they say.

     So r is chosen to make the *first month* grow at exactly the stated rate,
     and deceleration takes over from there. Solving
     v(1)/v(0) = (1 + a) / (1 + a·e^(−r)) = 1 + g  gives the expression below. */
  const g = Math.max(-0.999999, monthlyRate);
  const bracket = ((1 + a) / (1 + g) - 1) / a;

  // bracket <= 0 means the requested first month would land at or past the
  // ceiling: the author is asking to grow faster than there is room for. The
  // honest answer is that they reach capacity immediately and stay there.
  const saturatesAtOnce = bracket <= 0;
  const r = saturatesAtOnce ? Number.POSITIVE_INFINITY : -Math.log(bracket);

  for (let t = 0; t < months; t++) {
    const k = ceiling * Math.pow(1 + terminalAnnualRate, t / 12);
    if (saturatesAtOnce) {
      out[t] = t === 0 ? start : k;
      continue;
    }
    const denominator = 1 + a * Math.exp(-r * t);
    // With start and ceiling both positive, a > -1 and e^(-rt) > 0, so this
    // cannot reach zero. Guarded anyway: a NaN here would propagate silently
    // into every statement rather than failing loudly.
    out[t] = denominator > 0 ? k / denominator : 0;
  }

  return out;
}

/**
 * The month volume first reaches `share` of the ceiling, 1-based, or null if
 * it never does inside the horizon.
 *
 * Used to say "you reach capacity in month 31" in the plan rather than leaving
 * the reader to infer it from a chart.
 */
export function monthsToShareOfCeiling(
  curve: GrowthCurve,
  months: number,
  share = 0.95,
): number | null {
  const series = projectVolume(curve, months);
  const target = curve.ceiling * share;
  for (let t = 0; t < series.length; t++) {
    if ((series[t] ?? 0) >= target) return t + 1;
  }
  return null;
}

/**
 * Year-on-year growth implied by a curve, for the validator and for prose.
 *
 * Returns one entry per full year of the horizon; the first is null because
 * there is no prior year to compare against. A sound curve produces a strictly
 * decreasing series — that is the thing `growth-never-decays` checks, and the
 * thing the old engine could never satisfy.
 */
export function annualGrowthOf(curve: GrowthCurve, months: number): (number | null)[] {
  const series = projectVolume(curve, months);
  const years = Math.floor(months / 12);
  const totals: number[] = [];
  for (let y = 0; y < years; y++) {
    let sum = 0;
    for (let m = y * 12; m < (y + 1) * 12; m++) sum += series[m] ?? 0;
    totals.push(sum);
  }
  return totals.map((total, i) => {
    const prior = totals[i - 1];
    if (prior === undefined || prior <= 0) return null;
    return (total - prior) / prior;
  });
}
