import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dscrThreshold,
  inForce,
  sbaProgrammeForLoan,
  staleSeries,
  CONFIG_VINTAGE,
  DSCR_THRESHOLDS,
  EQUITY_INJECTION_MINIMUM,
  FICA_WAGE_BASE,
  PAYROLL_LOAD,
  SBA_SMALL_LOAN_CEILING,
} from "@/lib/content/regulatory";
import { AssumptionsSchema, type AssumptionsInput } from "@/lib/finance/types";
import { buildModel } from "@/lib/finance/engine";

/** The smallest plan that parses: one flat revenue stream, no costs. */
const minimalPlan = (): AssumptionsInput => ({
  company: {
    name: "Payroll check",
    startDate: "2026-01-01",
    horizonMonths: 36,
    industryKey: "other",
  },
  revenueStreams: [
    {
      id: "s",
      name: "Sales",
      kind: "unit-sales",
      unitsMonth1: 1000,
      monthlyGrowthRate: 0,
      pricePerUnit: 100,
      costPerUnit: 40,
    },
  ],
});

/* The point of these is not the values — those are secondary-sourced and will
   change. It is that the values are *dated*, so nothing downstream can bake one
   in as a constant. */

describe("dated regulatory config", () => {
  it("returns a different DSCR threshold before and after a known change", () => {
    expect(dscrThreshold("7a-small", new Date("2026-01-01")).value).toBe(1.15);
    expect(dscrThreshold("7a-small", new Date("2026-06-01")).value).toBe(1.1);
  });

  it("names a source and a retrieval date on every entry", () => {
    const entries = [
      ...Object.values(DSCR_THRESHOLDS).flat(),
      ...EQUITY_INJECTION_MINIMUM,
      ...SBA_SMALL_LOAN_CEILING,
    ];
    for (const entry of entries) {
      expect(entry.source.label.length).toBeGreaterThan(0);
      expect(entry.source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["verified", "secondary", "unverified"]).toContain(entry.confidence);
    }
  });

  it("queues every unverified value for confirmation", () => {
    // An unverified figure that nobody is tracking is the failure mode this
    // whole file exists to prevent.
    expect(SBA_SMALL_LOAN_CEILING[0]!.confidence).toBe("unverified");
    expect(CONFIG_VINTAGE.verificationQueue.join(" ")).toMatch(/Small Loan ceiling/);
  });

  it("does not pick an entry that has not yet taken effect", () => {
    const entries = [
      { value: 1, effectiveFrom: "2026-01-01", source: { label: "a", retrieved: "2026-01-01" }, confidence: "secondary" as const },
      { value: 2, effectiveFrom: "2027-01-01", source: { label: "b", retrieved: "2026-01-01" }, confidence: "secondary" as const },
    ];
    expect(inForce(entries, new Date("2026-06-01")).value).toBe(1);
    expect(inForce(entries, new Date("2027-06-01")).value).toBe(2);
  });

  /* The other direction, which had no test and no signal. When nothing is in
     force `inForce` still returns the last entry — throwing would take the
     product down on a date nobody wrote down — but it used to do so silently,
     so the `effectiveTo` window was discarded on the one path where it
     matters. `EB5_MINIMUM_INVESTMENT` expires 2027-01-01 with no successor
     configured. */
  it("says when the value it returns has expired", () => {
    const expired = [
      {
        value: 1_050_000,
        effectiveFrom: "2022-05-14",
        effectiveTo: "2027-01-01",
        source: { label: "a", retrieved: "2026-01-01" },
        confidence: "unverified" as const,
      },
    ];
    const before = inForce(expired, new Date("2026-06-01"));
    expect(before.stale).toBe(false);

    const after = inForce(expired, new Date("2027-06-01"));
    expect(after.value).toBe(1_050_000);
    expect(after.stale).toBe(true);
  });

  it("orders deterministically when two entries share a start date", () => {
    // The old comparator returned -1 for equal keys and never 0, which is not
    // a valid comparator: the winner was whatever the sort happened to do.
    const tied = [
      { value: 1, effectiveFrom: "2026-01-01", source: { label: "a", retrieved: "2026-01-01" }, confidence: "secondary" as const },
      { value: 2, effectiveFrom: "2026-01-01", source: { label: "b", retrieved: "2026-01-01" }, confidence: "secondary" as const },
    ];
    const picks = Array.from({ length: 20 }, () => inForce(tied, new Date("2026-06-01")).value);
    expect(new Set(picks).size).toBe(1);
  });

  /* A US federal effective date compared in UTC fires early for US users.
     2026-03-01 is when the 7(a) Small threshold drops to 1.10. */
  it("turns a threshold over on the US federal date, not the UTC one", () => {
    // 22:00 on 28 February in New York — still February there.
    expect(dscrThreshold("7a-small", new Date("2026-03-01T03:00:00Z")).value).toBe(1.15);
    // 01:00 on 1 March in New York.
    expect(dscrThreshold("7a-small", new Date("2026-03-01T06:00:00Z")).value).toBe(1.1);
  });

  it("has no expired value among the series the product reads today", () => {
    // EB-5 is deliberately excluded: its successor cannot be configured until
    // the adjustment is published, and a test that cannot be made to pass is
    // one people learn to ignore. It is tracked in the verification queue.
    expect(staleSeries(new Date())).toEqual([]);
    expect(CONFIG_VINTAGE.verificationQueue.join(" ")).toMatch(/EB-5/);
  });
});

/* ==========================================================================
   The payroll load, which is a regulatory value like any other.
   --------------------------------------------------------------------------
   `0.0765` and `0.12` were hardcoded in the assumptions schema while
   PAYROLL_LOAD held exactly those two numbers with a source and a date, and
   was read by nothing. FICA_WAGE_BASE was never applied at all, so a $300k
   salary was charged 6.2% OASDI on the whole amount.
   ========================================================================== */

describe("the payroll load comes from the dated config", () => {
  it("defaults the rates to whatever the config says, not to a literal", () => {
    // Asserted against the config rather than against 0.0765 — comparing to
    // the number would just re-hardcode it one level up.
    const load = inForce(PAYROLL_LOAD).value;
    const a = AssumptionsSchema.parse(minimalPlan());
    expect(a.payroll.payrollTaxRate).toBe(load.payrollTaxRate);
    expect(a.payroll.benefitsRate).toBe(load.benefitsRate);
    expect(a.payroll.cappedTaxRate).toBe(load.oasdiRate);
    expect(a.payroll.taxableWageBase).toBe(inForce(FICA_WAGE_BASE).value);
  });

  it("lets an explicit value win over the config", () => {
    const a = AssumptionsSchema.parse({
      ...minimalPlan(),
      payroll: { payrollTaxRate: 0.02, benefitsRate: 0.03 },
    });
    expect(a.payroll.payrollTaxRate).toBe(0.02);
    expect(a.payroll.benefitsRate).toBe(0.03);
  });

  it("leaves no payroll rate hardcoded in the engine", () => {
    // The mechanical guard, in the idiom of the brand-spelling scan. Comments
    // are stripped first: the point is that no *code* carries the literal,
    // and the note explaining why is allowed to name it.
    const code = (file: string) =>
      readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

    for (const file of ["src/lib/finance/types.ts", "src/lib/finance/engine.ts"]) {
      expect(code(file), file).not.toMatch(/\b0\.0765\b/);
      expect(code(file), file).not.toMatch(/\b184[_,]?500\b/);
    }
  });
});

describe("the FICA wage base", () => {
  const base = inForce(FICA_WAGE_BASE).value;
  const load = inForce(PAYROLL_LOAD).value;

  const withSalary = (annualSalary: number) =>
    buildModel({
      ...minimalPlan(),
      roles: [{ id: "o", title: "Owner", annualSalary, isOwner: true, startMonth: 1 }],
    });

  it("charges the full load on a salary below the base", () => {
    const salary = 120_000;
    const y1 = withSalary(salary).annual[0]!;
    expect(y1.ownerCompensation).toBeCloseTo(
      salary * (1 + load.payrollTaxRate + load.benefitsRate),
      2,
    );
  });

  it("stops the OASDI half once a head passes the base", () => {
    const salary = 300_000;
    const y1 = withSalary(salary).annual[0]!;
    // Medicare and benefits on everything; OASDI on the base only.
    const expected =
      salary * (1 + (load.payrollTaxRate - load.oasdiRate) + load.benefitsRate) +
      base * load.oasdiRate;
    expect(y1.ownerCompensation).toBeCloseTo(expected, 2);
  });

  it("costs a high earner less than the flat rate used to make them", () => {
    const salary = 300_000;
    const flat = salary * (1 + load.payrollTaxRate + load.benefitsRate);
    const y1 = withSalary(salary).annual[0]!;
    expect(y1.ownerCompensation).toBeLessThan(flat);
    // Roughly the OASDI rate on everything above the base.
    expect(flat - y1.ownerCompensation).toBeCloseTo((salary - base) * load.oasdiRate, 2);
  });

  it("resets the base every calendar year", () => {
    const salary = 300_000;
    const model = withSalary(salary);
    const [y1, y2] = model.annual;
    // The plan starts in January, so each model year is a calendar year and
    // each one gets its own base. Equal, not cumulative.
    expect(y2!.ownerCompensation).toBeCloseTo(y1!.ownerCompensation, 2);
  });

  it("resets on the calendar, not on the model's own first month", () => {
    // Starting in October means model year one straddles two calendar years,
    // so the base applies twice inside it — which is what an employer
    // actually pays, and what a flat annual cap would get wrong.
    const salary = 300_000;
    const octoberStart = buildModel({
      ...minimalPlan(),
      company: { ...minimalPlan().company, startDate: "2026-10-01" },
      roles: [{ id: "o", title: "Owner", annualSalary: salary, isOwner: true, startMonth: 1 }],
    });
    const januaryStart = withSalary(salary);
    expect(octoberStart.annual[0]!.ownerCompensation).toBeGreaterThan(
      januaryStart.annual[0]!.ownerCompensation,
    );
  });
});

describe("sbaProgrammeForLoan", () => {
  it("reads the ceiling from config rather than a constant", () => {
    const ceiling = inForce(SBA_SMALL_LOAN_CEILING).value;
    expect(sbaProgrammeForLoan(ceiling - 1).programme).toBe("7a-small");
    expect(sbaProgrammeForLoan(ceiling).programme).toBe("7a-small");
    expect(sbaProgrammeForLoan(ceiling + 1).programme).toBe("7a-standard");
  });

  it("hands back the dated ceiling it used, so the UI can print it", () => {
    const { ceiling } = sbaProgrammeForLoan(250_000);
    expect(ceiling.source.label.length).toBeGreaterThan(0);
    expect(ceiling.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
