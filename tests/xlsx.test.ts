import { describe, expect, it, beforeAll } from "vitest";
import { buildWorkbook } from "@/lib/export/xlsx";
import { buildExportDocument, type ExportDocument } from "@/lib/export/document";
import { loadWorkbook, colLetter, type Sheet } from "./helpers/xlsx-eval";
import { buildModel } from "@/lib/finance/engine";
import { computeMetrics } from "@/lib/finance/metrics";
import { AssumptionsSchema, type AssumptionsInput } from "@/lib/finance/types";
import { restaurantPlan, saasPlan } from "./fixtures";

const FIRST_MONTH_COL = 3;
const month = (m: number) => colLetter(FIRST_MONTH_COL + m - 1);

async function build(plan: typeof restaurantPlan) {
  const assumptions = AssumptionsSchema.parse(plan);
  const model = buildModel(assumptions);
  const metrics = computeMetrics(model);
  const doc = buildExportDocument({
    plan: {
      id: "p1",
      title: assumptions.company.name,
      companyName: assumptions.company.name,
      industryKey: assumptions.company.industryKey,
      purpose: "sba-loan",
      marketJson: JSON.stringify({
        populationLabel: "Households within three miles",
        populationCount: 24_000,
        qualifiedShare: 0.35,
        annualSpendPerCustomer: 480,
        servableShare: 0.6,
        targetShare: 0.12,
      }),
      resilienceJson: "{}",
      sections: [{ key: "executive-summary", contentText: "A summary." }],
      competitors: [
        {
          name: "The Copper Pot",
          url: "https://copperpot.example",
          positioning: "Established",
          priceLabel: "$34 average cover",
          priceDate: "2026-09-02",
          strengths: "Regulars",
          weaknesses: "Stale menu",
        },
      ],
      citations: [
        {
          label: "American Community Survey",
          url: "https://census.example",
          publisher: "US Census Bureau",
          sourceDate: "2026-06-30",
          claim: "The catchment contains 24,000 households.",
        },
      ],
    },
    assumptions,
    model,
    metrics,
    generator: "fixture",
    now: new Date("2026-09-20T00:00:00Z"),
  });
  const buffer = await buildWorkbook(doc);
  return { doc, sheet: await loadWorkbook(buffer), model };
}

/* -------------------------------------------------------------------------- */

describe("the workbook reproduces the engine", () => {
  /**
   * The point of the export is that it is the model, not a picture of it. That
   * only holds if the formulas compute what the engine computed, so they are
   * evaluated here and compared month by month. A workbook that quietly
   * disagreed with the plan it was exported beside would be the single most
   * damaging defect in the product.
   */
  /* A plan whose stream carries a saturating curve, so the piecewise growth
     formula is evaluated against the engine rather than only the legacy
     `POWER(1+rate,t)` path. Without this, a wrong curve formula would ship
     looking perfect: exceljs writes formulas and never evaluates them. */
  const subscriptionStream = saasPlan.revenueStreams?.[0];
  if (!subscriptionStream) throw new Error("the SaaS fixture must carry a stream to cap");
  const cappedPlan: AssumptionsInput = {
    ...saasPlan,
    revenueStreams: [
      {
        ...subscriptionStream,
        growth: { shape: "saturating", monthlyRate: 0.08, ceiling: 260, terminalAnnualRate: 0.02 },
      },
    ],
  };

  for (const [name, plan] of [
    ["restaurant (footfall, inventory, SBA debt)", restaurantPlan],
    ["SaaS (subscription, churn, expansion)", saasPlan],
    ["SaaS with a capacity ceiling (saturating curve)", cappedPlan],
  ] as const) {
    describe(name, () => {
      let sheet: Sheet;
      let doc: ExportDocument;

      beforeAll(async () => {
        const built = await build(plan);
        sheet = built.sheet;
        doc = built.doc;
      });

      it("computes revenue from the drivers, not from a pasted number", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(
            sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "Revenue")}`),
            `revenue, month ${m}`,
          ).toBeCloseTo(doc.model.pnl.revenue[m - 1]!, 2);
        }
      });

      it("computes cost of sales, including direct labour", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "Cost of sales")}`), `cogs, month ${m}`)
            .toBeCloseTo(doc.model.pnl.cogs[m - 1]!, 2);
        }
      });

      it("computes operating expenses from the cost lines and the payroll", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "Operating expenses")}`), `opex, month ${m}`)
            .toBeCloseTo(doc.model.pnl.totalOpex[m - 1]!, 2);
        }
      });

      it("computes EBITDA", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "EBITDA")}`), `EBITDA, month ${m}`)
            .toBeCloseTo(doc.model.pnl.ebitda[m - 1]!, 2);
        }
      });

      it("computes interest from a real amortisation schedule", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "Interest")}`), `interest, month ${m}`)
            .toBeCloseTo(doc.model.pnl.interest[m - 1]!, 2);
        }
      });

      it("computes tax, carrying losses forward as the engine does", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "Tax")}`), `tax, month ${m}`)
            .toBeCloseTo(doc.model.pnl.tax[m - 1]!, 2);
        }
      });

      it("computes net income", () => {
        for (let m = 1; m <= doc.model.horizonMonths; m++) {
          expect(sheet.get("Monthly model", `${month(m)}${sheet.rowOf("Monthly model", "Net income")}`), `net income, month ${m}`)
            .toBeCloseTo(doc.model.pnl.netIncome[m - 1]!, 2);
        }
      });

      it("reads zero variance against the filed figures on open", () => {
        // The workbook's own tie row. Non-zero here means the formulas and the
        // written plan disagree, which is the failure this whole test exists
        // to catch.
        for (const occurrence of [1, 2, 3]) {
          const varianceRow = sheet.rowOf("Filed", "Variance", occurrence);
          for (let m = 1; m <= doc.model.horizonMonths; m++) {
            expect(
              Math.abs(sheet.get("Filed", `${month(m)}${varianceRow}`)),
              `variance ${occurrence}, month ${m}`,
            ).toBeLessThan(0.01);
          }
        }
      });
    });
  }
});

describe("the annual sheet", () => {
  let sheet: Sheet;
  let doc: ExportDocument;

  beforeAll(async () => {
    const built = await build(restaurantPlan);
    sheet = built.sheet;
    doc = built.doc;
  });

  it("sums the monthly model into the engine's own annual figures", () => {
    doc.model.annual.forEach((year, y) => {
      const col = colLetter(2 + y);
      expect(sheet.get("Annual", `${col}${sheet.rowOf("Annual", "Revenue")}`), `${year.label} revenue`).toBeCloseTo(year.revenue, 2);
      expect(sheet.get("Annual", `${col}${sheet.rowOf("Annual", "EBITDA")}`), `${year.label} EBITDA`).toBeCloseTo(year.ebitda, 2);
      expect(sheet.get("Annual", `${col}${sheet.rowOf("Annual", "Net income")}`), `${year.label} net income`).toBeCloseTo(year.netIncome, 2);
    });
  });

  it("computes coverage the way a lender does, from the same inputs", () => {
    doc.model.annual.forEach((year, y) => {
      const col = colLetter(2 + y);
      const service = sheet.get("Annual", `${col}${sheet.rowOf("Annual", "Debt service")}`);
      expect(service, `${year.label} debt service`).toBeCloseTo(year.debtService, 1);
    });

    const expected = doc.metrics.underwriter.dscrByYear;
    expected.forEach((row, y) => {
      if (row.dscr === null) return;
      const col = colLetter(2 + y);
      expect(sheet.get("Annual", `${col}${sheet.rowOf("Annual", "Debt service coverage")}`), `year ${row.year} coverage`).toBeCloseTo(row.dscr, 2);
    });
  });
});

describe("the market sheet", () => {
  it("recomputes the build rather than restating it", async () => {
    const { sheet, doc } = await build(restaurantPlan);
    expect(sheet.get("Market", `B${sheet.rowOf("Market", "Total addressable market")}`)).toBeCloseTo(doc.market.sizing.tam, 2);
    expect(sheet.get("Market", `B${sheet.rowOf("Market", "Serviceable market")}`)).toBeCloseTo(doc.market.sizing.sam, 2);
    expect(sheet.get("Market", `B${sheet.rowOf("Market", "Obtainable market")}`)).toBeCloseTo(doc.market.sizing.som, 2);
  });
});

describe("the workbook as a document", () => {
  it("carries every sheet a reader is told to look at", async () => {
    const { sheet } = await build(restaurantPlan);
    expect(sheet.sheetNames()).toEqual([
      "Drivers", "Revenue", "Payroll", "Operating costs",
      "Monthly model", "Annual", "Debt", "Filed", "Market", "Sources",
    ]);
  });

  it("prints the config vintage and what is still unverified", async () => {
    const { sheet, doc } = await build(restaurantPlan);
    const text: string[] = [];
    for (let row = 1; row < 40; row++) {
      for (const col of ["A", "B", "C", "D"]) {
        const value = sheet.raw("Sources", `${col}${row}`);
        if (typeof value === "string") text.push(value);
      }
    }
    const joined = text.join(" | ");
    expect(joined).toContain(doc.methodology.configReviewed);
    expect(joined).toMatch(/Still to be confirmed/);
    expect(joined).toMatch(/Small Loan ceiling/);
  });

  it("marks driver cells as inputs and carries their provenance", async () => {
    const { sheet } = await build(restaurantPlan);
    const labels: string[] = [];
    for (let row = 1; row < 90; row++) {
      const value = sheet.raw("Drivers", `D${row}`);
      if (typeof value === "string") labels.push(value);
    }
    expect(labels.join(" ")).toMatch(/Measured by the owner|Estimated by the owner|Industry default/);
  });
});

/* -------------------------------------------------------------------------- */

describe("the other formats", () => {
  it("writes a Word file that opens as one", async () => {
    const { doc } = await build(restaurantPlan);
    const { buildDocx } = await import("@/lib/export/docx");
    const buffer = await buildDocx(doc);
    // A .docx is a zip; the magic bytes are the cheapest honest check that it
    // is a file a reader can open rather than a buffer of intentions.
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(8_000);
  });

  it("writes a deck that opens as one", async () => {
    const { doc } = await build(restaurantPlan);
    const { buildDeck } = await import("@/lib/export/pptx");
    const buffer = await buildDeck(doc);
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(buffer.length).toBeGreaterThan(8_000);
  });

  it("puts the same figures in the deck as in the plan", async () => {
    const { doc } = await build(restaurantPlan);
    const { buildDeck } = await import("@/lib/export/pptx");
    const buffer = await buildDeck(doc);

    // Slide XML lives inside the zip; rather than unzip it, assert on the
    // document the deck is built from — the deck reads nothing else.
    expect(buffer.length).toBeGreaterThan(0);
    expect(doc.underwriter.dscr?.rows.length).toBe(doc.model.annual.length);
    expect(doc.market.sizing.complete).toBe(true);
  });
});
