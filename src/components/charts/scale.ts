/* ==========================================================================
   Shared chart scale helpers.
   --------------------------------------------------------------------------
   Every hand-built chart in this directory rounds its domain the same way, so
   a cash line and a DSCR bar chart sitting side by side agree about what a
   readable tick is. Extracted rather than duplicated because two tick
   algorithms in one workspace is how axes stop matching.
   ========================================================================== */

export type NiceScale = {
  min: number;
  max: number;
  ticks: number[];
};

/** Rounds a domain out to human tick values (1, 2, 2.5, 5 × 10^n). */
export function niceScale(min: number, max: number, targetTicks: number): NiceScale {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10) *
    magnitude;

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) {
    ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);
  }
  return { min: niceMin, max: niceMax, ticks };
}
