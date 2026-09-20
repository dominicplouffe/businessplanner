import { describe, expect, it } from "vitest";
import { diffPlan, diffSection, diffSentences, parseSnapshot, toSentences } from "@/lib/versions";

/* The diff is what turns a list of timestamps into an undo. If it moves
   unchanged text into the changed column, nobody trusts it — and a diff people
   do not trust is worse than no diff at all. */

describe("splitting prose into comparable units", () => {
  it("splits on sentences and keeps their terminators", () => {
    expect(toSentences("One thing. Then another! And a third?")).toEqual([
      "One thing.",
      "Then another!",
      "And a third?",
    ]);
  });

  it("crosses paragraph breaks and drops the blanks", () => {
    expect(toSentences("First.\n\n\nSecond.\n\n")).toEqual(["First.", "Second."]);
  });

  it("returns nothing for empty prose", () => {
    expect(toSentences("")).toEqual([]);
    expect(toSentences("   \n\n  ")).toEqual([]);
  });
});

describe("the diff itself", () => {
  it("reports nothing when nothing changed", () => {
    const parts = diffSentences(["A.", "B."], ["A.", "B."]);
    expect(parts.every((p) => p.op === "same")).toBe(true);
  });

  it("keeps surrounding sentences unchanged when one is inserted", () => {
    // The property that matters: an insertion must not mark its neighbours as
    // rewritten, which is what a naive positional comparison does.
    const parts = diffSentences(["A.", "C."], ["A.", "B.", "C."]);
    expect(parts.map((p) => `${p.op}:${p.text}`)).toEqual(["same:A.", "added:B.", "same:C."]);
  });

  it("keeps surrounding sentences unchanged when one is removed", () => {
    const parts = diffSentences(["A.", "B.", "C."], ["A.", "C."]);
    expect(parts.map((p) => `${p.op}:${p.text}`)).toEqual(["same:A.", "removed:B.", "same:C."]);
  });

  it("handles a replacement as one removal and one addition", () => {
    const parts = diffSentences(["A.", "B.", "C."], ["A.", "X.", "C."]);
    expect(parts.filter((p) => p.op === "removed").map((p) => p.text)).toEqual(["B."]);
    expect(parts.filter((p) => p.op === "added").map((p) => p.text)).toEqual(["X."]);
    expect(parts.filter((p) => p.op === "same").map((p) => p.text)).toEqual(["A.", "C."]);
  });

  it("finds the common subsequence rather than giving up on a reorder", () => {
    const parts = diffSentences(["A.", "B.", "C.", "D."], ["A.", "C.", "B.", "D."]);
    // A and D are common at minimum; the point is that it does not report all
    // four as replaced.
    expect(parts.filter((p) => p.op === "same").length).toBeGreaterThanOrEqual(3);
  });

  it("is a total function on empty input either side", () => {
    expect(diffSentences([], ["A."])).toEqual([{ op: "added", text: "A." }]);
    expect(diffSentences(["A."], [])).toEqual([{ op: "removed", text: "A." }]);
    expect(diffSentences([], [])).toEqual([]);
  });
});

describe("section and plan diffs", () => {
  it("flags a section written since the snapshot as added entirely", () => {
    const d = diffSection({ key: "team", title: "Team", before: "", after: "Two people." });
    expect(d.addedEntirely).toBe(true);
    expect(d.removedEntirely).toBe(false);
    expect(d.unchanged).toBe(false);
  });

  it("flags a section emptied since the snapshot as removed entirely", () => {
    const d = diffSection({ key: "team", title: "Team", before: "Two people.", after: "" });
    expect(d.removedEntirely).toBe(true);
  });

  it("counts only the sections that actually changed", () => {
    const plan = diffPlan([
      { key: "a", title: "A", before: "Same.", after: "Same." },
      { key: "b", title: "B", before: "Old.", after: "New." },
      { key: "c", title: "C", before: "", after: "" },
    ]);
    expect(plan.changedCount).toBe(1);
    expect(plan.totalAdded).toBe(1);
    expect(plan.totalRemoved).toBe(1);
    expect(plan.sections).toHaveLength(3);
  });
});

describe("reading a snapshot back", () => {
  it("survives malformed json rather than throwing into a page render", () => {
    expect(parseSnapshot("not json")).toEqual({});
    expect(parseSnapshot("null")).toEqual({});
    expect(parseSnapshot('{"sections":[]}')).toEqual({ sections: [] });
  });
});
