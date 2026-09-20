import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ExportDocument } from "./document";
import type { StatementTable } from "@/lib/finance/statements";
import { formatAccounting, formatCurrency, formatMultiple, formatPercent } from "@/lib/finance/format";

/* ==========================================================================
   Word.
   --------------------------------------------------------------------------
   Asked for by every lawyer and most lenders, because it is the format they
   can annotate. It is built from the same assembled document as the PDF, so
   the two cannot say different things, and it uses real Word styles rather
   than direct formatting so a reader's own template survives contact with it.
   ========================================================================== */

const INK = "0B1220";
const MUTED = "4A5266";
const HAIRLINE = "D9D9D9";

export async function buildDocx(doc: ExportDocument): Promise<Buffer> {
  const money = (n: number) => formatCurrency(n, doc.currency);

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: "Business plan",
      spacing: { after: 120 },
      children: [new TextRun({ text: "BUSINESS PLAN", color: MUTED, size: 18, characterSpacing: 40 })],
    }),
    new Paragraph({ text: doc.companyName, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [new TextRun({ text: doc.industryLabel, size: 24, color: INK })],
      spacing: { after: 240 },
    }),
    note(doc.purposeLabel),
    note(`Prepared ${doc.preparedOn} · ${doc.horizonYears}-year model`),
    note(
      "Every figure in this document was computed by a deterministic model from the assumptions listed within it.",
    ),
    new Paragraph({ text: "", spacing: { after: 240 } }),

    new Paragraph({ text: "Key figures", heading: HeadingLevel.HEADING_1 }),
    keyValueTable(doc.keyFigures.map((f) => [f.label, f.value])),
  ];

  for (const section of doc.sections.filter((s) => s.written)) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    for (const paragraph of section.paragraphs) {
      children.push(new Paragraph({ text: paragraph, spacing: { after: 160 } }));
    }
  }

  if (doc.market.sizing.complete) {
    children.push(new Paragraph({ text: "Market size", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    children.push(note("Each line is derived from the one above it."));
    children.push(
      keyValueTable(
        doc.market.sizing.steps.map((step) => [
          step.workings ? `${step.label} (${step.workings})` : step.label,
          step.kind === "currency" ? money(step.value) : Math.round(step.value).toLocaleString("en-US"),
        ]),
      ),
    );
  }

  if (doc.market.competitors.length > 0) {
    children.push(new Paragraph({ text: "Competitors", heading: HeadingLevel.HEADING_1 }));
    children.push(
      gridTable(
        ["Name", "Position", "Price as published", "Observed"],
        doc.market.competitors.map((c) => [
          c.name,
          c.positioning || "—",
          c.priceLabel || "none found",
          c.priceDate ?? "undated",
        ]),
      ),
    );
  }

  children.push(
    new Paragraph({ text: "Financial statements", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
  );
  for (const table of doc.statements) {
    children.push(new Paragraph({ text: table.title, heading: HeadingLevel.HEADING_2 }));
    children.push(statementTable(table, doc.currency));
  }

  const u = doc.underwriter;
  if (u.dscr) {
    children.push(new Paragraph({ text: "Underwriter view", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    children.push(
      note(
        `Threshold ${formatMultiple(u.dscr.threshold.value)} for ${u.dscr.programme}, per ${u.dscr.threshold.source.label}, in force from ${u.dscr.threshold.effectiveFrom}.`,
      ),
    );
    children.push(
      gridTable(
        ["Year", "Cash available", "Debt service", "Coverage"],
        u.dscr.rows.map((row) => [
          row.year,
          money(row.cashAvailable),
          money(row.debtService),
          row.dscr === null ? "—" : `${formatMultiple(row.dscr)}${row.short ? " ▼ short" : ""}`,
        ]),
      ),
    );
  }

  for (const schedule of u.schedules) {
    children.push(new Paragraph({ text: schedule.loanName, heading: HeadingLevel.HEADING_2 }));
    children.push(note(schedule.terms));
    children.push(
      gridTable(
        ["Year", "Opening", "Interest", "Principal", "Closing"],
        schedule.rows.map((row) => [
          row.label,
          money(row.openingBalance),
          money(row.interest),
          money(row.principal),
          money(row.closingBalance),
        ]),
      ),
    );
  }

  if (u.ownerCompensation.length > 0) {
    children.push(new Paragraph({ text: "Owner compensation", heading: HeadingLevel.HEADING_2 }));
    children.push(
      note("Shown separately because a lender recomputes coverage without it."),
    );
    children.push(keyValueTable(u.ownerCompensation.map((row) => [row.year, money(row.amount)])));
  }

  if (doc.resilience.exposure !== null) {
    children.push(
      new Paragraph({ text: "AI disruption resilience", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }),
    );
    children.push(
      new Paragraph({
        text: `Assessed task by task and weighted by cost, exposure stands at ${formatPercent(
          doc.resilience.exposure,
        )} across ${formatPercent(doc.resilience.coverage)} of the cost base — ${doc.resilience.bandLabel.toLowerCase()}.`,
        spacing: { after: 160 },
      }),
    );
    if (doc.resilience.moatStatement) {
      children.push(
        new Paragraph({
          text: `What is genuinely hard to automate here: ${doc.resilience.moatStatement}`,
          spacing: { after: 160 },
        }),
      );
    }
  }

  children.push(new Paragraph({ text: "Sources", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  if (doc.citations.length === 0) {
    children.push(note("No outside sources were relied on in this plan."));
  }
  for (const citation of doc.citations) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `[${citation.index}] `, color: MUTED }),
          new TextRun({ text: citation.claim || citation.label }),
        ],
      }),
    );
    children.push(
      note(
        `${citation.label}${citation.publisher ? `, ${citation.publisher}` : ""} · ${citation.sourceDate}${
          citation.url ? ` · ${citation.url}` : ""
        }`,
      ),
    );
  }

  children.push(new Paragraph({ text: "Methodology", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  children.push(
    new Paragraph({
      text:
        "Every figure in the statements was computed by a deterministic model from the assumptions in this document. No figure was written by a language model.",
      spacing: { after: 160 },
    }),
  );
  children.push(
    gridTable(
      ["Value", "Used", "Source", "In force from", "Confidence"],
      doc.methodology.entries.map((e) => [e.label, e.value, e.source, e.effectiveFrom, e.confidence]),
    ),
  );
  children.push(note(`Configuration last reviewed ${doc.methodology.configReviewed}.`));
  children.push(
    new Paragraph({ text: "Still to be confirmed against a primary source", heading: HeadingLevel.HEADING_2 }),
  );
  for (const item of doc.methodology.verificationQueue) {
    children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
  }

  const document = new Document({
    creator: "Venturally",
    title: `${doc.companyName} — business plan`,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 21, color: INK } },
        title: { run: { font: "Georgia", size: 56, color: INK }, paragraph: { spacing: { after: 120 } } },
        heading1: { run: { font: "Georgia", size: 30, color: INK }, paragraph: { spacing: { before: 320, after: 160 } } },
        heading2: { run: { font: "Georgia", size: 24, color: INK }, paragraph: { spacing: { before: 240, after: 120 } } },
      },
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${doc.companyName}  ·  `, color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 16 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

/* -------------------------------------------------------------------------- */

function note(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, color: MUTED, size: 17 })],
    spacing: { after: 100 },
  });
}

function cell(text: string, opts: { bold?: boolean; right?: boolean } = {}): TableCell {
  return new TableCell({
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: HAIRLINE },
      left: { style: BorderStyle.NONE, size: 0, color: HAIRLINE },
      right: { style: BorderStyle.NONE, size: 0, color: HAIRLINE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: HAIRLINE },
    },
    children: [
      new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold ?? false, size: 18 })],
      }),
    ],
  });
}

function keyValueTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({ children: [cell(label), cell(value, { right: true })] })),
  });
}

function gridTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, right: i > 0 })),
      }),
      ...rows.map(
        (row) => new TableRow({ children: row.map((value, i) => cell(value, { right: i > 0 })) }),
      ),
    ],
  });
}

function statementTable(table: StatementTable, currency: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [cell("", { bold: true }), ...table.columns.map((c) => cell(c, { bold: true, right: true }))],
      }),
      ...table.rows.map((row) => {
        const bold = row.kind === "subtotal" || row.kind === "total";
        return new TableRow({
          children: [
            cell(`${row.indent ? "    " : ""}${row.label}`, { bold }),
            ...row.values.map((value) =>
              cell(
                row.kind === "check" && Math.abs(value) < 0.01 ? "0" : formatAccounting(value, currency),
                { bold, right: true },
              ),
            ),
          ],
        });
      }),
    ],
  });
}
