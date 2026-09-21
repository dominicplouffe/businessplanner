import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAN_SECTIONS } from "@/lib/content/sections";

/* ==========================================================================
   Two invariants that are about *shape* rather than arithmetic, so they are
   checked against the source in the idiom `tests/deploy.test.ts` already uses.
   Both describe bugs that were silent: nothing failed, nothing was logged, and
   the UI reported success.
   ========================================================================== */

const SECTION_ACTIONS = readFileSync("src/lib/actions/section-actions.ts", "utf8");
const GENERATE_ROUTE = readFileSync("src/app/api/ai/generate/route.ts", "utf8");

describe("writing a section", () => {
  /* `updateMany` matching zero rows is not an error. Section rows were only
     ever created by `createPlan`, so a fourteenth entry in PLAN_SECTIONS
     would give every older plan a page that renders, accepts text, says
     "Saved", and keeps nothing. */
  it("never writes content through an unguarded updateMany", () => {
    for (const [name, source] of [
      ["section-actions.ts", SECTION_ACTIONS],
      ["api/ai/generate/route.ts", GENERATE_ROUTE],
    ] as const) {
      const calls = [...source.matchAll(/planSection\.updateMany\(\{([\s\S]*?)\}\);/g)];
      for (const [, body = ""] of calls) {
        // The only legitimate updateMany left is the guarded status reset,
        // which is a conditional update and cannot no-op harmfully.
        expect(body, `${name}: ${body.slice(0, 120)}`).toContain('status: "generating"');
      }
    }
  });

  it("creates the row when the plan predates the section", () => {
    expect(readFileSync("src/lib/plans.ts", "utf8")).toContain("planSection.upsert");
  });

  it("keeps section keys unique, so the upsert cannot write the wrong row", () => {
    const keys = PLAN_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the generation stream", () => {
  /* The error branch closed the controller and returned; the return ran the
     `finally`, which closed it again. A second close on a closed controller
     throws `Invalid state` out of `start()` — so the error event the reader
     was supposed to see was replaced by a stream error. */
  it("closes the controller in exactly one place", () => {
    const closes = GENERATE_ROUTE.match(/controller\.close\(\)/g) ?? [];
    expect(closes).toHaveLength(1);
  });

  it("clears the generating status on every path that can fail", () => {
    // Only the `error` chunk and success used to reset it, so a generator
    // that threw left the section "generating" — and read-only — for good.
    expect(GENERATE_ROUTE).toContain("clearGenerating");
    const catchBlock = /catch \(error\) \{([\s\S]*?)\n      \} finally/.exec(GENERATE_ROUTE)?.[1];
    expect(catchBlock).toBeDefined();
    expect(catchBlock).toContain("clearGenerating");
  });

  it("guards the reset so a late failure cannot clobber a retry", () => {
    expect(GENERATE_ROUTE).toMatch(/status:\s*"generating"\s*\}\s*,\s*\n\s*data:/);
  });
});
