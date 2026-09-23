import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldHandleDelivery } from "@/lib/billing/delivery";

/* ==========================================================================
   The webhook's retry decision.
   --------------------------------------------------------------------------
   The webhook is the only code that grants an entitlement, so the question
   "should this delivery run?" is worth testing on its own, away from Stripe
   and a database.
   ========================================================================== */

describe("shouldHandleDelivery", () => {
  it("handles a first delivery", () => {
    expect(shouldHandleDelivery({ firstDelivery: true, outcome: "pending" })).toBe(true);
  });

  /* The regression. A transient database error inside `grantUnlock` used to
     be terminal: the row was written before the work, the handler threw, the
     route answered 500 to make Stripe retry, and the retry matched the row
     its own failure had written and returned 200 without running. The
     customer was charged and the plan stayed locked, for good. */
  it("re-handles a delivery whose handler failed, so a paid plan is not lost", () => {
    expect(shouldHandleDelivery({ firstDelivery: false, outcome: "failed" })).toBe(true);
  });

  it("re-handles a delivery that never finished", () => {
    // `pending` means the process died between recording the row and writing
    // the outcome. Nothing was completed, so Stripe is right to be retrying.
    expect(shouldHandleDelivery({ firstDelivery: false, outcome: "pending" })).toBe(true);
  });

  it("skips a delivery that was processed", () => {
    expect(shouldHandleDelivery({ firstDelivery: false, outcome: "processed" })).toBe(false);
  });

  it("skips a delivery that was deliberately ignored", () => {
    // A cross-workspace grant or an event type we will never handle. Recorded
    // with its reason and answered 200; re-running it would change nothing.
    expect(shouldHandleDelivery({ firstDelivery: false, outcome: "ignored" })).toBe(false);
  });

  it("re-handles an outcome it does not recognise", () => {
    // Deliberate. Re-handling costs a duplicate audit note because every
    // handler is idempotent; skipping costs a paid entitlement.
    expect(shouldHandleDelivery({ firstDelivery: false, outcome: "who-knows" })).toBe(true);
    expect(shouldHandleDelivery({ firstDelivery: false, outcome: "" })).toBe(true);
  });
});

describe("the webhook route", () => {
  const route = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");

  it("does not short-circuit on first delivery alone", () => {
    // The shape of the original bug, kept out mechanically.
    expect(route).not.toMatch(/if\s*\(\s*!\s*seen\.firstDelivery\s*\)/);
    expect(route).toContain("shouldHandleDelivery(seen)");
  });

  it("marks a failed delivery so the retry can be let back in", () => {
    expect(route).toContain('outcome: "failed"');
  });

  it("never downgrades a processed row", () => {
    // Two deliveries of one event can both reach the handler now. The loser
    // records "already recorded"; overwriting the winner's `processed` would
    // make the audit trail deny an entitlement that was granted.
    expect(route).toMatch(/outcome:\s*\{\s*not:\s*"processed"\s*\}/);
  });

  it("is still the only place that grants an entitlement", () => {
    /* CLAUDE.md: "grantUnlock() is called from /api/stripe/webhook and nowhere
       else." That was guarded by nothing but the prose. A page or a server
       action that called it would let a browser reaching the success URL
       unlock a plan without paying. */
    const callers = sourceFiles("src")
      .filter((file) => /\bgrantUnlock\s*\(/.test(readFileSync(file, "utf8")))
      .filter((file) => !file.endsWith("src/lib/billing/index.ts")); // its definition
    expect(callers).toEqual(["src/app/api/stripe/webhook/route.ts"]);
  });
});

/** Every .ts/.tsx file under a directory, as repo-relative paths. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
