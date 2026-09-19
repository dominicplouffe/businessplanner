/**
 * Generates the OKLCH color ramps used by src/app/globals.css.
 *
 * Each ramp is anchored to a brand colour at a named step so the palette stays
 * perceptually even without drifting away from the identity:
 *   ink-950     = #0B1220   (the dark surface)
 *   emerald-800 = #0F3D2E   (primary accent)
 *   brass-500   = #A8852C   (editorial accent)
 *
 * Run:  node scripts/generate-tokens.mjs
 */
const lin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = (v) => Math.max(0, Math.min(1, v));

export function oklchToHex(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + rgb.map((v) => Math.round(clamp(lin(clamp(v))) * 255).toString(16).padStart(2, "0")).join("");
}

// step -> lightness, chosen so brand anchors land on their named steps.
const L_BY_STEP = {
  50: 0.975, 100: 0.945, 200: 0.885, 300: 0.805, 400: 0.715,
  500: 0.634, 600: 0.545, 700: 0.430, 800: 0.324, 900: 0.245, 950: 0.183,
};

/** Chroma profile per ramp: [chromaAtPeak, peakLightness, minFactorAtEnds] */
const RAMPS = {
  ink:     { hue: 263.4, chroma: 0.036, peak: 0.55, floor: 0.62 },
  emerald: { hue: 167.0, chroma: 0.112, peak: 0.55, floor: 0.34 },
  brass:   { hue: 86.6,  chroma: 0.118, peak: 0.63, floor: 0.30 },
};

export function buildRamp(name) {
  const { hue, chroma, peak, floor } = RAMPS[name];
  const out = {};
  for (const [step, L] of Object.entries(L_BY_STEP)) {
    const taper = Math.max(floor, 1 - Math.abs(L - peak) / 0.55);
    out[step] = oklchToHex(L, chroma * taper, hue);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const name of Object.keys(RAMPS)) {
    console.log(`  /* ${name} */`);
    for (const [step, hex] of Object.entries(buildRamp(name))) {
      console.log(`  --color-${name}-${step}: ${hex};`);
    }
  }
}
