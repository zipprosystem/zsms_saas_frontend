import type { GradeBasedStructure, GradeMarkInput, GradeMarkRow, GradeScores, ReportVariant } from "@/lib/exam/examTypes";
import type { AutoTickRule } from "@/components/exam/examEntryShared";

/**
 * Editable copy of one student's Academic Report row. Selects hold codes
 * ("" = not entered). No parsing or computation — codes only.
 */
export type GradeDraftRow = {
  scores: Record<string, string>;
  present: boolean | null;
  mark_completed: boolean;
  subject_remark: string;
};

export type GradeDraft = Record<string, GradeDraftRow>;

/** Every leaf the structure defines: Current Attainment first, then each rating domain in order. */
export function gradeLeafIds(structure: GradeBasedStructure): string[] {
  return [structure.attainment.id, ...structure.rating_domains.map((domain) => domain.id)];
}

export function toGradeDraft(rows: GradeMarkRow[], leafIds: string[]): GradeDraft {
  return Object.fromEntries(
    rows.map((row) => [
      row.student_id,
      {
        scores: Object.fromEntries(leafIds.map((id) => [id, row.component_scores[id] ?? ""])),
        present: row.present,
        mark_completed: row.mark_completed,
        subject_remark: row.subject_remark,
      },
    ]),
  );
}

export function isGradeRowDirty(row: GradeDraftRow, baseline: GradeDraftRow, leafIds: string[]): boolean {
  return (
    row.present !== baseline.present ||
    row.mark_completed !== baseline.mark_completed ||
    row.subject_remark.trim() !== baseline.subject_remark.trim() ||
    leafIds.some((id) => (row.scores[id] ?? "") !== (baseline.scores[id] ?? ""))
  );
}

export function toGradeInput(studentId: string, row: GradeDraftRow, leafIds: string[]): GradeMarkInput {
  const scores: GradeScores = Object.fromEntries(leafIds.map((id) => [id, row.scores[id] || null]));
  return {
    student_id: studentId,
    component_scores: scores,
    present: row.present,
    mark_completed: row.mark_completed,
    subject_remark: row.subject_remark.trim(),
  };
}

/** Whether the point's report variant makes the Comment required for completion (full; also when the variant is unknown). */
export function commentRequired(variant: ReportVariant | null): boolean {
  return variant !== "progress";
}

/**
 * Academic Report auto-ticks: Present once Current Attainment (CAG) is in;
 * Mark as completed once the variant's required fields are in —
 * progress = CAG + Engagement + Learning Behaviour (every leaf of the
 * subject-wise structure); full = those + Comment.
 */
export function gradeAutoTickRule(structure: GradeBasedStructure, variant: ReportVariant | null): AutoTickRule<GradeDraftRow> {
  const leafIds = gradeLeafIds(structure);
  const needsComment = commentRequired(variant);
  return {
    attended: (row) => !!row.scores[structure.attainment.id],
    complete: (row) => leafIds.every((id) => !!row.scores[id]) && (!needsComment || row.subject_remark.trim() !== ""),
  };
}
