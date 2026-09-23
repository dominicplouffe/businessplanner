/* ==========================================================================
   Version diffs.
   --------------------------------------------------------------------------
   The incumbent's own users report that regenerating a section quietly
   overwrites edits they had already made, with no undo. Snapshots are taken
   before every regeneration; this module is what makes them legible, because a
   list of timestamps is not an undo — being able to see what changed is.

   Pure, no I/O, so the diff is testable without a database. The unit is the
   sentence rather than the word: prose regenerates wholesale, and a word-level
   diff of two independently written paragraphs is confetti.
   ========================================================================== */

export type DiffOp = "same" | "added" | "removed";

export type DiffPart = {
  op: DiffOp;
  text: string;
};

export type SectionDiff = {
  key: string;
  title: string;
  /** Nothing changed in this section. */
  unchanged: boolean;
  /** Present only in the snapshot, i.e. the section was emptied since. */
  removedEntirely: boolean;
  /** Present only now, i.e. written after the snapshot. */
  addedEntirely: boolean;
  parts: DiffPart[];
  addedCount: number;
  removedCount: number;
};

export type PlanDiff = {
  sections: SectionDiff[];
  changedCount: number;
  totalAdded: number;
  totalRemoved: number;
};

/**
 * Splits prose into comparable units.
 *
 * Sentences, keeping their terminator, and blank lines dropped. A paragraph
 * that gained one sentence should read as one addition, not as a rewritten
 * paragraph, which is what a paragraph-level split would show.
 */
export function toSentences(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.match(/[^.!?]+[.!?]*/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Longest-common-subsequence diff over sentences.
 *
 * Quadratic in the number of sentences, which is fine: a plan section is tens
 * of sentences, not thousands, and the alternative — a linear heuristic — moves
 * unchanged text into the changed column often enough to make the diff
 * untrustworthy. A diff people do not trust is worse than no diff.
 */
export function diffSentences(before: string[], after: string[]): DiffPart[] {
  const n = before.length;
  const m = after.length;

  // lcs[i][j] = length of the longest common subsequence of before[i..] and
  // after[j..]. Built from the end so the walk forward reads naturally.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j]! =
        before[i] === after[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      parts.push({ op: "same", text: before[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      parts.push({ op: "removed", text: before[i]! });
      i++;
    } else {
      parts.push({ op: "added", text: after[j]! });
      j++;
    }
  }
  while (i < n) parts.push({ op: "removed", text: before[i++]! });
  while (j < m) parts.push({ op: "added", text: after[j++]! });

  return parts;
}

export function diffSection(input: {
  key: string;
  title: string;
  before: string;
  after: string;
}): SectionDiff {
  const before = toSentences(input.before);
  const after = toSentences(input.after);
  const parts = diffSentences(before, after);
  const addedCount = parts.filter((p) => p.op === "added").length;
  const removedCount = parts.filter((p) => p.op === "removed").length;

  return {
    key: input.key,
    title: input.title,
    unchanged: addedCount === 0 && removedCount === 0,
    removedEntirely: before.length > 0 && after.length === 0,
    addedEntirely: before.length === 0 && after.length > 0,
    parts,
    addedCount,
    removedCount,
  };
}

/** Every section, so a section that is identical can still be listed as such. */
export function diffPlan(
  sections: { key: string; title: string; before: string; after: string }[],
): PlanDiff {
  const diffs = sections.map(diffSection);
  return {
    sections: diffs,
    changedCount: diffs.filter((d) => !d.unchanged).length,
    totalAdded: diffs.reduce((sum, d) => sum + d.addedCount, 0),
    totalRemoved: diffs.reduce((sum, d) => sum + d.removedCount, 0),
  };
}

/** The shape `snapshotPlan` writes, read back defensively. */
export type PlanSnapshot = {
  assumptions?: string;
  registry?: string;
  context?: string;
  sections?: { key: string; status: string; contentJson: string; contentText: string }[];
};

export function parseSnapshot(json: string): PlanSnapshot {
  try {
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as PlanSnapshot) : {};
  } catch {
    return {};
  }
}

const REASON_LABELS: Record<string, string> = {
  regeneration: "Before a regeneration",
  intake: "Intake completed",
  manual: "Manual snapshot",
  restore: "Before a restore",
  import: "Imported",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? "Snapshot";
}

/** The reason `restoreVersionAction` stamps on its own safety snapshot. It is
 *  named so undo can tell the user's history from its own bookkeeping. */
export const RESTORE_REASON = "restore";

/**
 * What a restore writes back.
 *
 * `snapshotPlan` stores four things — assumptions, registry, context and
 * sections — and the restore used to write back only the sections. Restoring
 * the automatic "Intake completed" snapshot therefore rolled the prose back
 * and left the changed assumptions in place, so the document and the model
 * disagreed. That is the one failure mode the product exists to prevent, and
 * it was reachable from a button labelled "Restore this".
 *
 * A field absent from the snapshot means the snapshot predates the field, not
 * that it was empty — so it is omitted rather than written as a blank, which
 * would erase a plan's assumptions on restoring an old version.
 */
export function restorePayload(
  snapshot: PlanSnapshot,
  liveSectionKeys: string[],
): {
  plan: { assumptionsJson?: string; registryJson?: string; contextJson?: string };
  sections: { key: string; status: string; contentJson: string; contentText: string }[];
} {
  const plan: { assumptionsJson?: string; registryJson?: string; contextJson?: string } = {};
  if (snapshot.assumptions !== undefined) plan.assumptionsJson = snapshot.assumptions;
  if (snapshot.registry !== undefined) plan.registryJson = snapshot.registry;
  if (snapshot.context !== undefined) plan.contextJson = snapshot.context;

  // A section dropped from PLAN_SECTIONS since the snapshot must not come back.
  const live = new Set(liveSectionKeys);
  const sections = (snapshot.sections ?? []).filter((s) => live.has(s.key));

  return { plan, sections };
}

/**
 * Which snapshot "Undo last change" should restore.
 *
 * Undo used to take the most recent snapshot and hand it to the restore, which
 * takes a fresh snapshot of its own before writing. That snapshot then *was*
 * the most recent, so a second click restored the state the first click had
 * just undone — a ping-pong, not an undo stack.
 *
 * So the restore's own bookkeeping is skipped, and a history whose newest
 * entry is one is reported as already undone. That keeps "restoring is itself
 * reversible" — the safety snapshot is still in the list and still restorable
 * from the history page — while stopping undo from grabbing it.
 */
export function pickRevertTarget(
  versions: { id: string; reason: string }[],
): { kind: "restore"; versionId: string } | { kind: "none"; reason: string } {
  const [newest] = versions;
  if (!newest) return { kind: "none", reason: "No snapshot to restore." };
  if (newest.reason === RESTORE_REASON) {
    return {
      kind: "none",
      reason:
        "The last change has already been undone. Pick a point from the version history to go further back.",
    };
  }
  return { kind: "restore", versionId: newest.id };
}
