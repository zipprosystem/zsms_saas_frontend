import { isScoreValid, type MarkLeaf } from "@/lib/exam/markColumns";
import type { ComponentScores, SubjectMarkInput, SubjectMarkRow } from "@/lib/exam/examTypes";
import type { AutoTickRule } from "@/components/exam/examEntryShared";

/**
 * Editable copy of one student's mark. Scores stay strings while typing
 * ("", "1.", "abc" are all legal mid-edit) and are parsed only for
 * validation, totals and the PUT body.
 */
export type DraftRow = {
  scores: Record<string, string>;
  present: boolean | null;
  mark_completed: boolean;
  subject_remark: string;
};

export type Draft = Record<string, DraftRow>;

export function toDraftRow(row: SubjectMarkRow, leaves: MarkLeaf[]): DraftRow {
  const scores: Record<string, string> = {};
  for (const leaf of leaves) {
    const value = row.component_scores[leaf.id];
    scores[leaf.id] = typeof value === "number" ? String(value) : "";
  }
  return { scores, present: row.present, mark_completed: row.mark_completed, subject_remark: row.subject_remark };
}

export function toDraft(rows: SubjectMarkRow[], leaves: MarkLeaf[]): Draft {
  return Object.fromEntries(rows.map((row) => [row.student_id, toDraftRow(row, leaves)]));
}

/** "" -> null (not entered); anything else -> a number (NaN when unparseable, which validation rejects). */
export function parseScore(text: string): number | null {
  const trimmed = text.trim();
  return trimmed ? Number(trimmed) : null;
}

export function parsedScores(row: DraftRow, leaves: MarkLeaf[]): ComponentScores {
  return Object.fromEntries(leaves.map((leaf) => [leaf.id, parseScore(row.scores[leaf.id] ?? "")]));
}

export function isScoreTextValid(text: string, max: number): boolean {
  return isScoreValid(parseScore(text), max);
}

export function rowErrorCount(row: DraftRow, leaves: MarkLeaf[]): number {
  return leaves.filter((leaf) => !isScoreTextValid(row.scores[leaf.id] ?? "", leaf.max)).length;
}

/** Compared on parsed values, so "12" vs "12.0" isn't a change. */
export function isRowDirty(row: DraftRow, baseline: DraftRow, leaves: MarkLeaf[]): boolean {
  if (row.present !== baseline.present || row.mark_completed !== baseline.mark_completed) return true;
  if (row.subject_remark.trim() !== baseline.subject_remark.trim()) return true;
  return leaves.some((leaf) => {
    const a = parseScore(row.scores[leaf.id] ?? "");
    const b = parseScore(baseline.scores[leaf.id] ?? "");
    return Number.isNaN(a) || Number.isNaN(b) ? (row.scores[leaf.id] ?? "") !== (baseline.scores[leaf.id] ?? "") : a !== b;
  });
}

export function toMarkInput(studentId: string, row: DraftRow, leaves: MarkLeaf[]): SubjectMarkInput {
  return {
    student_id: studentId,
    component_scores: parsedScores(row, leaves),
    present: row.present,
    mark_completed: row.mark_completed,
    subject_remark: row.subject_remark.trim(),
  };
}

/**
 * Manage Exam Result auto-ticks: Present once any score is in; Mark as
 * completed once every score column holds a valid score.
 */
export function scoreAutoTickRule(leaves: MarkLeaf[]): AutoTickRule<DraftRow> {
  const filled = (row: DraftRow, leaf: MarkLeaf) => (row.scores[leaf.id] ?? "").trim() !== "";
  return {
    attended: (row) => leaves.some((leaf) => filled(row, leaf)),
    complete: (row) =>
      leaves.length > 0 && leaves.every((leaf) => filled(row, leaf) && isScoreTextValid(row.scores[leaf.id] ?? "", leaf.max)),
  };
}
