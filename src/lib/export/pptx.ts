import PptxGenJS from "pptxgenjs";
import type { ExportDocument } from "./document";
import { formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";

/* ==========================================================================
   The deck.
   --------------------------------------------------------------------------
   Generated from the plan rather than written beside it, which is the whole
   point: a deck that disagrees with the document behind it is worse than no
   deck. Every figure here is read from the same assembled document the PDF and
   the workbook use.

   Sparse on purpose. A slide carrying one number a reader remembers beats one
   carrying six they skim.
   ========================================================================== */

const INK = "0B1220";
const PAPER = "FBFAF7";
const EMERALD = "0F3D2E";
const MUTED = "4A5266";
const BRASS = "A8852C";

export async function buildDeck(doc: ExportDocument): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "Venturally";
  pptx.company = doc.companyName;
  pptx.title = `${doc.companyName} — investor deck`;
  pptx.layout = "LAYOUT_16x9";

  pptx.defineSlideMaster({
    title: "EDITORIAL",
    background: { color: PAPER },
    objects: [
      { rect: { x: 0, y: 5.28, w: "100%", h: 0.02, fill: { color: BRASS } } },
      {
        text: {
          text: doc.companyName,
          options: { x: 0.5, y: 5.05, w: 6, h: 0.3, fontSize: 9, color: MUTED, fontFace: "Georgia" },
        },
      },
    ],
  });

  const money = (n: number) => formatCurrency(n, doc.currency, { compact: Math.abs(n) >= 1_000_000 });

  /* ---- Cover ------------------------------------------------------------ */
  const cover = pptx.addSlide();
  cover.background = { color: INK };
  cover.addText(doc.companyName, {
    x: 0.7, y: 1.9, w: 8.6, h: 1.1, fontSize: 40, color: PAPER, fontFace: "Georgia",
  });
  cover.addText(doc.industryLabel, {
    x: 0.7, y: 3.0, w: 8.6, h: 0.4, fontSize: 16, color: "B8C0CE", fontFace: "Georgia",
  });
  cover.addText(`${doc.purposeLabel} · ${doc.preparedOn}`, {
    x: 0.7, y: 4.4, w: 8.6, h: 0.3, fontSize: 10, color: "8892A6",
  });

  /* ---- The business ----------------------------------------------------- */
  const summary = doc.sections.find((s) => s.key === "executive-summary");
  if (summary?.written) {
    slideWithBody(pptx, "The business", summary.paragraphs.slice(0, 2));
  }

  /* ---- Market ----------------------------------------------------------- */
  if (doc.market.sizing.complete) {
    const slide = titled(pptx, "The market, counted");
    const steps = doc.market.sizing.steps.filter((s) => ["tam", "sam", "som"].includes(s.key));
    slide.addTable(
      [
        [
          { text: "", options: { bold: true } },
          { text: "Value", options: { bold: true, align: "right" as const } },
          { text: "How it was reached", options: { bold: true } },
        ],
        ...steps.map((step) => [
          { text: step.label },
          { text: money(step.value), options: { align: "right" as const, fontFace: "Consolas" } },
          { text: step.workings ?? "" },
        ]),
      ],
      { x: 0.7, y: 1.6, w: 8.6, fontSize: 13, color: INK, border: { type: "solid", pt: 0.5, color: "D9D9D9" } },
    );
    slide.addText(
      `${Math.round(doc.market.sizing.impliedCustomers).toLocaleString("en-US")} customers at the spend assumed`,
      { x: 0.7, y: 4.3, w: 8.6, h: 0.3, fontSize: 11, color: MUTED },
    );
  }

  /* ---- Competitors ------------------------------------------------------ */
  if (doc.market.competitors.length > 0) {
    const slide = titled(pptx, "Who we are up against");
    slide.addTable(
      [
        [
          { text: "Name", options: { bold: true } },
          { text: "Position", options: { bold: true } },
          { text: "Price", options: { bold: true } },
          { text: "Observed", options: { bold: true } },
        ],
        ...doc.market.competitors.slice(0, 5).map((c) => [
          { text: c.name },
          { text: c.positioning || "—" },
          { text: c.priceLabel || "none found" },
          { text: c.priceDate ?? "undated" },
        ]),
      ],
      { x: 0.7, y: 1.6, w: 8.6, fontSize: 12, color: INK, border: { type: "solid", pt: 0.5, color: "D9D9D9" } },
    );
  }

  /* ---- The numbers ------------------------------------------------------ */
  const numbers = titled(pptx, "The numbers");
  numbers.addTable(
    [
      [
        { text: "", options: { bold: true } },
        ...doc.model.annual.map((y) => ({ text: y.label, options: { bold: true, align: "right" as const } })),
      ],
      ...(
        [
          ["Revenue", doc.model.annual.map((y) => y.revenue)],
          ["Gross profit", doc.model.annual.map((y) => y.grossProfit)],
          ["EBITDA", doc.model.annual.map((y) => y.ebitda)],
          ["Closing cash", doc.model.annual.map((y) => y.closingCash)],
        ] as [string, number[]][]
      ).map(([label, values]) => [
        { text: label },
        ...values.map((v) => ({
          text: money(v),
          options: { align: "right" as const, fontFace: "Consolas" },
        })),
      ]),
    ],
    { x: 0.7, y: 1.6, w: 8.6, fontSize: 12, color: INK, border: { type: "solid", pt: 0.5, color: "D9D9D9" } },
  );
  numbers.addText(
    "Computed by a deterministic model from the drivers in the plan. The workbook alongside carries the same model as live formulas.",
    { x: 0.7, y: 4.4, w: 8.6, h: 0.5, fontSize: 10, color: MUTED },
  );

  /* ---- Coverage, where there is debt ------------------------------------ */
  if (doc.underwriter.dscr) {
    const slide = titled(pptx, "Debt service coverage");
    slide.addTable(
      [
        [
          { text: "Year", options: { bold: true } },
          { text: "Cash available", options: { bold: true, align: "right" as const } },
          { text: "Debt service", options: { bold: true, align: "right" as const } },
          { text: "Coverage", options: { bold: true, align: "right" as const } },
        ],
        ...doc.underwriter.dscr.rows.map((row) => [
          { text: row.year },
          { text: money(row.cashAvailable), options: { align: "right" as const, fontFace: "Consolas" } },
          { text: money(row.debtService), options: { align: "right" as const, fontFace: "Consolas" } },
          {
            text: row.dscr === null ? "—" : `${formatMultiple(row.dscr)}${row.short ? " ▼" : ""}`,
            options: { align: "right" as const, fontFace: "Consolas", bold: true },
          },
        ]),
      ],
      { x: 0.7, y: 1.6, w: 8.6, fontSize: 12, color: INK, border: { type: "solid", pt: 0.5, color: "D9D9D9" } },
    );
    slide.addText(
      `Threshold ${formatMultiple(doc.underwriter.dscr.threshold.value)} for ${doc.underwriter.dscr.programme} — ${doc.underwriter.dscr.threshold.source.label}, in force from ${doc.underwriter.dscr.threshold.effectiveFrom}.`,
      { x: 0.7, y: 4.4, w: 8.6, h: 0.5, fontSize: 10, color: MUTED },
    );
  }

  /* ---- Risk and resilience ---------------------------------------------- */
  const risks = doc.sections.find((s) => s.key === "risks");
  if (risks?.written) slideWithBody(pptx, "What could go wrong", risks.paragraphs.slice(0, 3));

  if (doc.resilience.exposure !== null) {
    const slide = titled(pptx, "AI disruption");
    slide.addText(formatPercent(doc.resilience.exposure), {
      x: 0.7, y: 1.6, w: 3, h: 1, fontSize: 46, color: EMERALD, fontFace: "Georgia",
    });
    slide.addText(`cost-weighted exposure — ${doc.resilience.bandLabel.toLowerCase()}`, {
      x: 0.7, y: 2.6, w: 3.4, h: 0.6, fontSize: 11, color: MUTED,
    });
    slide.addText(doc.resilience.moatStatement || "No structural protection claimed.", {
      x: 4.4, y: 1.7, w: 4.9, h: 2, fontSize: 14, color: INK,
    });
  }

  /* ---- The ask ---------------------------------------------------------- */
  const ask = titled(pptx, "The ask");
  const sources = doc.underwriter.sources;
  ask.addTable(
    [
      [
        { text: "Source", options: { bold: true } },
        { text: "Amount", options: { bold: true, align: "right" as const } },
      ],
      ...sources.map((s) => [
        { text: s.label },
        { text: money(s.amount), options: { align: "right" as const, fontFace: "Consolas" } },
      ]),
      [
        { text: "Total", options: { bold: true } },
        {
          text: money(sources.reduce((sum, s) => sum + s.amount, 0)),
          options: { align: "right" as const, bold: true, fontFace: "Consolas" },
        },
      ],
    ],
    { x: 0.7, y: 1.6, w: 8.6, fontSize: 13, color: INK, border: { type: "solid", pt: 0.5, color: "D9D9D9" } },
  );

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(buffer);
}

/* -------------------------------------------------------------------------- */

function titled(pptx: PptxGenJS, title: string) {
  const slide = pptx.addSlide({ masterName: "EDITORIAL" });
  slide.addText(title, {
    x: 0.7, y: 0.6, w: 8.6, h: 0.6, fontSize: 24, color: INK, fontFace: "Georgia",
  });
  return slide;
}

function slideWithBody(pptx: PptxGenJS, title: string, paragraphs: string[]) {
  const slide = titled(pptx, title);
  slide.addText(
    paragraphs.map((text, i) => ({ text, options: { breakLine: true, paragraphSpaceAfter: i < paragraphs.length - 1 ? 10 : 0 } })),
    { x: 0.7, y: 1.6, w: 8.6, h: 3.2, fontSize: 14, color: INK, valign: "top" },
  );
  return slide;
}
