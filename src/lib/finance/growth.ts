/* ==========================================================================
   Bounded growth.
   --------------------------------------------------------------------------
   The engine used to apply `Math.pow(1 + rate, elapsed)` to volume with
   nothing bounding the result. A user entered 50% — meaning it the way people
   mean it, roughly — and the model returned year-five revenue of $4.3
   trillion, about fifteen per cent of US GDP, on one employee earning
   $11,965. It validated clean, because every cost line is a percentage of
   revenue so the margins stay inside the industry band at any scale.

   The defect is not the arithmetic. A constant growth rate is a claim no
   business can make: 50% a month is ordinary going from one customer to two
   and impossible going from eight million to twelve. Real volume grows against
   something — seats, licensed places, billable hours, a market — and the
   closer it gets, the harder the next unit is to win.

   So a stream declares the *shape* of its growth, and the shape that matters
   is `saturating`: logistic toward a ceiling the author has to name.

       v(t) = K(t) / (1 + A · B^t)     A = (ceiling − v₀) / v₀
       K(t) = ceiling · (1 + terminalAnnualRate)^(t/12)

   The ceiling decides year five; the rate only decides how fast you get there.
   On a shop at 300 covers a month with room for 1,400, a monthly rate of 5%
   gives year-five revenue of $198,922, 15% gives $225,007 and 50% gives
   $225,067. The input that produced $4.3 trillion produces a quarter of a
   million. The safety belongs in the structure, because arguing with an owner
   about whether they are too optimistic is a losing game, and asking what
   their capacity is is a question they can answer.

   **Everything here is written with `Math.pow` and never `Math.exp` or
   `Math.log`.** That is not a style preference. `src/lib/export/xlsx.ts`
   emits the same projection as a live Excel formula and `tests/xlsx.test.ts`
   evaluates it against this module month by month; the evaluator in
   `tests/helpers/xlsx-eval.ts` implements `POWER` and has no `EXP` or `LN`.
   Written in this form the TypeScript and the spreadsheet are the same
   expression, and the workbook stays the model rather than a picture of it.
   `e^(−r·t)` with `r = −ln(B)` is exactly `B^t`, so nothing is lost.

   Pure, no I/O, no dependency on the rest of the engine.
   ========================================================================== */

/**
 * How a stream's volume moves over the horizon.
 *
 * A discriminated union rather than a `ceiling` field bolted onto every stream
 * for two reasons. Hourly services grow by *adding people*, which is linear
 * and cannot be expressed as a rate against a ceiling. And `unbounded` being a
 * named shape means a plan that forecasts limitless growth has *declared* it,
 * so the validator can name it back — "this stream declares unbounded growth"
 * — rather than inferring intent from an absent field.
 */
export type GrowthCurve =
  | { shape: "flat" }
  | { shape: "linear"; perMonth: number; max?: number }
  | { shape: "saturating"; monthlyRate: number; ceiling: number; terminalAnnualRate: number }
  | { shape: "unbounded"; monthlyRate: number };

/** The `B` in `v(t) = K/(1 + A·B^t)`, or null when the curve does not need it. */
function saturatingBase(v0: number, ceiling: number, monthlyRate: number): number | null {
  const a = (ceiling - v0) / v0;
  if (a === 0) return null;

  /* The intrinsic rate is solved for, rather than used as given.

     A logistic curve's *realised* growth is the intrinsic rate scaled by how
     much room is left, so using `monthlyRate` directly means an author who
     types 8% sees 6.2% — already saturated, because the business starts at a
     fifth of its capacity. That is indefensible in a product whose whole claim
     is that the numbers mean what they say. Solving
     v(1)/v(0) = (1 + A) / (1 + A·B) = 1 + g  for B gives this, so the first
     month grows at exactly the stated rate and deceleration takes over after. */
  return ((1 + a) / (1 + monthlyRate) - 1) / a;
}

/**
 * Volume in the month `elapsed` months after the stream's first active one.
 *
 * `v0` is passed in rather than held on the curve because it is the stream's
 * own level driver — `unitsMonth1`, `gmvMonth1`, traffic × conversion × days —
 * and it needs to stay where the intake and the workbook's driver sheet
 * already put it.
 *
 * Every degenerate case is a branch rather than a guard bolted on afterwards:
 *
 * - `v0 <= 0` — nothing to grow from. A business with no first customer cannot
 *   be projected; it has to be asked for.
 * - `monthlyRate <= 0` — plain geometric decline. A shrinking series never
 *   meets a ceiling, and someone who says "I expect to lose 2% a month" means
 *   a steady decline, not one that accelerates into a floor.
 * - `ceiling === v0` — already at capacity: flat, drifting with the ceiling.
 *   The honest shape for a restaurant that is already full.
 * - `ceiling < v0` — trading above sustainable capacity, which reverts *to*
 *   the ceiling. Honouring a growth claim here would diverge away from it, and
 *   a model that is over capacity and accelerating is not a model.
 * - the requested first month would overshoot the ceiling — capacity arrives
 *   at once and stays, rather than the business inventing room it lacks.
 */
export function projectCurve(curve: GrowthCurve, v0: number, elapsed: number): number {
  if (elapsed < 0) return 0;

  switch (curve.shape) {
    case "flat":
      return v0;

    case "linear": {
      const raw = v0 + curve.perMonth * elapsed;
      return curve.max === undefined ? raw : Math.min(raw, curve.max);
    }

    case "unbounded":
      // Deliberately byte-identical to the arithmetic this module replaced, so
      // that introducing the curve moves no existing number. The validator is
      // what makes this shape unusable in a finished plan, not the engine.
      return v0 * Math.pow(1 + curve.monthlyRate, elapsed);

    case "saturating": {
      const { ceiling, monthlyRate, terminalAnnualRate } = curve;
      if (v0 <= 0 || ceiling <= 0) return 0;
      if (monthlyRate <= 0) return v0 * Math.pow(1 + monthlyRate, elapsed);

      const drifted = ceiling * Math.pow(1 + terminalAnnualRate, elapsed / 12);
      if (ceiling === v0) return drifted;

      const a = (ceiling - v0) / v0;
      const base = saturatingBase(v0, ceiling, monthlyRate);
      if (base === null) return drifted;

      // Over capacity: revert toward the ceiling at the pace named, rather
      // than away from it.
      if (ceiling < v0) {
        const decay = Math.pow(1 + Math.abs(monthlyRate), -elapsed);
        return drifted / (1 + a * decay);
      }

      // The requested first month lands at or past the ceiling.
      if (base <= 0) return elapsed === 0 ? v0 : drifted;

      const denominator = 1 + a * Math.pow(base, elapsed);
      // A cannot be ≤ −1 and B^t is positive, so this cannot reach zero.
      // Guarded anyway: a NaN here propagates silently into every statement.
      return denominator > 0 ? drifted / denominator : 0;
    }
  }
}

/** The whole horizon, index 0 being the stream's first active month. */
export function projectSeries(curve: GrowthCurve, v0: number, months: number): number[] {
  const out = new Array<number>(Math.max(0, months)).fill(0);
  for (let t = 0; t < out.length; t++) out[t] = projectCurve(curve, v0, t);
  return out;
}

/**
 * The capacity in force in a given month, or null where the shape declares
 * none. Rendered beside volume so a reader can see how much room is left —
 * which is the number an operator can actually argue with.
 */
export function ceilingAt(curve: GrowthCurve, elapsed: number): number | null {
  switch (curve.shape) {
    case "saturating":
      return curve.ceiling * Math.pow(1 + curve.terminalAnnualRate, elapsed / 12);
    case "linear":
      return curve.max ?? null;
    case "flat":
    case "unbounded":
      return null;
  }
}

/** Volume as a share of the capacity in force, or null when there is none. */
export function saturationAt(curve: GrowthCurve, v0: number, elapsed: number): number | null {
  const ceiling = ceilingAt(curve, elapsed);
  if (ceiling === null || ceiling <= 0) return null;
  return projectCurve(curve, v0, elapsed) / ceiling;
}

/**
 * Year-on-year growth implied by a curve.
 *
 * One entry per full year; the first is null because there is no prior year.
 * A sound curve produces a decreasing series — which is what
 * `growth-never-decays` checks, and what the old engine could never satisfy.
 */
export function annualGrowthOf(curve: GrowthCurve, v0: number, months: number): (number | null)[] {
  const series = projectSeries(curve, v0, months);
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
