import { describe, expect, it } from "vitest";
import {
  dscrThreshold,
  inForce,
  sbaProgrammeForLoan,
  CONFIG_VINTAGE,
  DSCR_THRESHOLDS,
  EQUITY_INJECTION_MINIMUM,
  SBA_SMALL_LOAN_CEILING,
} from "@/lib/content/regulatory";

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
