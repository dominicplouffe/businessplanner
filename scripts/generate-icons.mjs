/**
 * Generates the app icon set from one geometry.
 *
 * The mark is a serif "V" on the ink tile — the wordmark's letter, in the
 * display face's idiom, because at sixteen pixels the brass diamond that
 * precedes the wordmark is two pixels of warm grey and the word itself is
 * unreadable. The letter is drawn rather than traced: two constant-width
 * diagonals (thick left, thin right) closed by slab serifs, with the stroke
 * contrast of a transitional serif. A traced outline would pin the identity
 * to a webfont the build downloads at build time and cannot read back.
 *
 * Every raster here is rendered from the same `icon.svg` this script writes, so
 * the tab icon, the iOS home screen and the Android installer cannot drift
 * apart — the reason `src/lib/export/` has four renderers over one assembly.
 *
 * Run:  node scripts/generate-icons.mjs
 * Needs Chromium: Playwright's own, or CHROMIUM_EXECUTABLE_PATH, as the PDF
 * pipeline does.
 */
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

/* The tile is ink and the letter is paper at every size. An ink tile sits on a
   light tab strip as a shape and on a dark one as the letter alone, which is
   why there is no second, light variant to keep in step. */
const INK = "#0d121c"; /* --color-ink-950 */
const PAPER = "#fbfaf7"; /* --color-paper   */

/** 48-unit viewBox. The letter is tuned for 16px first: the thin stroke is
 *  heavier than the display face's, because a true hairline disappears in a
 *  browser tab and leaves a shape that reads as a check mark. */
const GEOMETRY = {
  capTop: 12,
  apexY: 37,
  leftAxis: 13,
  rightAxis: 36,
  thick: 5.8,
  thin: 2.9,
  serifDepth: 1.9,
  leftSerifHalf: 4.8,
  rightSerifHalf: 3.8,
};

/** Corner radius of the tile, in viewBox units. */
const RADIUS = 10;

/**
 * The outline of the V, as an SVG path.
 *
 * Both stems are parallelograms of constant width, so the apex is where the two
 * *outer* edges meet and the notch is where the two *inner* edges do — the stem
 * axes themselves cross above the apex and are never drawn. The slope is solved
 * for so the outer edges meet exactly at `apexY`; setting it by eye leaves
 * either a blunt tip or a letter taller than its tile.
 */
export function vPath({
  capTop,
  apexY,
  leftAxis,
  rightAxis,
  thick,
  thin,
  serifDepth,
  leftSerifHalf,
  rightSerifHalf,
}) {
  const outerL = leftAxis - thick / 2;
  const outerR = rightAxis + thin / 2;
  const slope = (outerR - outerL) / (2 * (apexY - capTop));

  const edge = (x0, dir) => (y) => x0 + dir * slope * (y - capTop);
  const outerLeft = edge(outerL, 1);
  const innerLeft = edge(outerL + thick, 1);
  const innerRight = edge(outerR - thin, -1);
  const outerRight = edge(outerR, -1);

  const apexX = outerLeft(apexY);
  const notchY = capTop + (innerRight(capTop) - innerLeft(capTop)) / (2 * slope);
  const notchX = innerLeft(notchY);

  const foot = capTop + serifDepth; /* where the serif slabs meet the stems */
  const n = (v) => Number(v.toFixed(3));

  return [
    `M ${n(leftAxis - leftSerifHalf)} ${n(capTop)}`,
    `H ${n(leftAxis + leftSerifHalf)}`,
    `V ${n(foot)}`,
    `H ${n(innerLeft(foot))}`,
    `L ${n(notchX)} ${n(notchY)}`,
    `L ${n(innerRight(foot))} ${n(foot)}`,
    `H ${n(rightAxis - rightSerifHalf)}`,
    `V ${n(capTop)}`,
    `H ${n(rightAxis + rightSerifHalf)}`,
    `V ${n(foot)}`,
    `H ${n(outerRight(foot))}`,
    `L ${n(apexX)} ${n(apexY)}`,
    `L ${n(outerLeft(foot))} ${n(foot)}`,
    `H ${n(leftAxis - leftSerifHalf)}`,
    "Z",
  ].join(" ");
}

/** `radius: 0` is the square tile iOS wants: it applies its own mask, and
 *  masking an already-rounded tile leaves a dark fringe in the corners. */
export function iconSvg({ radius = RADIUS } = {}) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">`,
    `<rect width="48" height="48" rx="${radius}" fill="${INK}"/>`,
    `<path d="${vPath(GEOMETRY)}" fill="${PAPER}"/>`,
    `</svg>`,
  ].join("");
}

/** Rasterises an SVG at an exact pixel size. Chromium is the renderer the
 *  project already ships for PDF, so this adds no dependency. */
async function rasterise(page, svg, size) {
  const data = Buffer.from(svg).toString("base64");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;padding:0;background:transparent}` +
      `img{display:block;width:${size}px;height:${size}px}</style>` +
      `<img src="data:image/svg+xml;base64,${data}">`,
  );
  await page.waitForLoadState("networkidle");
  return page.screenshot({ omitBackground: true });
}

/**
 * Packs PNGs into an .ico.
 *
 * An ICO directory entry stores the side length in a single byte, so 256 is
 * written as 0 — the one trap in an otherwise flat format, and the reason the
 * largest entry here is 48.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); /* reserved */
  header.writeUInt16LE(1, 2); /* 1 = icon  */
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); /* palette size; 0 for truecolour */
    entry.writeUInt8(0, 3); /* reserved */
    entry.writeUInt16LE(1, 4); /* colour planes */
    entry.writeUInt16LE(32, 6); /* bits per pixel */
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE_PATH;

async function main() {
  const rounded = iconSvg();
  const square = iconSvg({ radius: 0 });

  await writeFile("src/app/icon.svg", rounded + "\n");

  const browser = await chromium.launch({
    ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });

    /* The .ico carries the sizes Windows and the older Safaris actually ask
       for; everything modern takes the SVG. */
    const legacy = [];
    for (const size of [16, 32, 48]) {
      legacy.push({ size, png: await rasterise(page, rounded, size) });
    }
    await writeFile("src/app/favicon.ico", ico(legacy));

    await writeFile("src/app/apple-icon.png", await rasterise(page, square, 180));
    await writeFile("public/icon-192.png", await rasterise(page, rounded, 192));
    await writeFile("public/icon-512.png", await rasterise(page, rounded, 512));
  } finally {
    await browser.close();
  }

  console.log(
    [
      "wrote src/app/icon.svg",
      "wrote src/app/favicon.ico      16, 32, 48",
      "wrote src/app/apple-icon.png   180, square (iOS masks it)",
      "wrote public/icon-192.png",
      "wrote public/icon-512.png",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
