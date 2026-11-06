"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { allLeaves, examMarkColumns, shownTotal } from "@/lib/exam/markColumns";
import type { GradeMarkRow, ScaleLevel, StudentMarksSheet, StudentSubjectGradeInput, StudentSubjectMarkInput, SubjectMarkRow } from "@/lib/exam/examTypes";
import { MarksGrid } from "@/components/exam/MarksGrid";
import { AcademicReportGrid } from "@/components/exam/AcademicReportGrid";
import { isRowDirty, rowErrorCount, scoreAutoTickRule, toDraft, toMarkInput, type Draft, type DraftRow } from "@/components/exam/marksDraft";
import {
  commentApplies,
  gradeAutoTickRule,
  gradeLeafIds,
  isGradeRowDirty,
  toGradeDraft,
  toGradeInput,
  type GradeDraft,
  type GradeDraftRow,
} from "@/components/exam/gradeDraft";
import { patchRowWithAutoTicks } from "@/components/exam/examEntryShared";

/** The pivot: the grids key rows by student_id / show student_name — on the student-wise sheet those carry the subject. */
function asSubjectRow<T extends Pick<SubjectMarkRow, "student_id" | "student_name" | "admission_no" | "seat_no"> & { subject_id: string; subject_name: string }>(row: T): T {
  return { ...row, student_id: row.subject_id, student_name: row.subject_name, admission_no: "", seat_no: "" };
}

export type StudentMarksSummary =
  /** passMark = the passing THRESHOLD on the total (default half of outOf — no pass-mark setting exists yet), not the marks obtained. */
  | { mode: "component_based"; passMark: number; outOf: number; completed: number; subjects: number }
  | { mode: "grade_based"; attained: number; completed: number; subjects: number };

/**
 * The student-wise marks table (Report Progression › View Details): the
 * SAME grid, drafts and auto-ticks as Manage Exam Result (General) /
 * Academic Report (British), with one row per subject. Entering a score
 * auto-ticks Present + Mark as completed exactly as on the subject-wise
 * screens; the save rows go to the same subject_mark rows.
 */
export function useStudentMarksEntry(sheet: StudentMarksSheet | null, structures: AssessmentStructure[] | null) {
  const scoreSheet = sheet?.assessment_mode === "component_based" ? sheet : null;
  const gradeSheet = sheet?.assessment_mode === "grade_based" ? sheet : null;

  // --- General (scores) -------------------------------------------------------
  const structure = scoreSheet?.assessment_structure_id ? (structures?.find((item) => item.id === scoreSheet.assessment_structure_id) ?? null) : null;
  const groups = useMemo(() => (structure && scoreSheet ? examMarkColumns(structure, scoreSheet.exam) : []), [structure, scoreSheet]);
  const leaves = useMemo(() => allLeaves(groups), [groups]);
  const scoreRows = useMemo(() => (scoreSheet?.items ?? []).map(asSubjectRow), [scoreSheet]);
  const scoreBaseline = useMemo(() => toDraft(scoreRows, leaves), [scoreRows, leaves]);
  const [scoreDraft, setScoreDraft] = useState<Draft>({});
  useEffect(() => setScoreDraft(scoreBaseline), [scoreBaseline]);
  const scoreRule = useMemo(() => scoreAutoTickRule(leaves), [leaves]);

  // --- British (grades) -------------------------------------------------------
  const gradeStructure = gradeSheet?.structure ?? null;
  const leafIds = useMemo(() => (gradeStructure ? gradeLeafIds(gradeStructure) : []), [gradeStructure]);
  const variant = gradeSheet?.exam.report_variant ?? null;
  const levelsByLeaf = useMemo(() => {
    const map: Record<string, ScaleLevel[]> = {};
    if (!gradeStructure || !gradeSheet) return map;
    map[gradeStructure.attainment.id] = gradeSheet.grade_scales.find((scale) => scale.id === gradeStructure.attainment.grade_scale_id)?.grades ?? [];
    for (const domain of gradeStructure.rating_domains) {
      map[domain.id] = gradeSheet.rating_scales.find((scale) => scale.id === domain.rating_scale_id)?.levels ?? [];
    }
    return map;
  }, [gradeStructure, gradeSheet]);
  const gradeRows = useMemo(() => (gradeSheet?.items ?? []).map(asSubjectRow), [gradeSheet]);
  const gradeBaseline = useMemo(() => toGradeDraft(gradeRows, leafIds), [gradeRows, leafIds]);
  const [gradeDraft, setGradeDraft] = useState<GradeDraft>({});
  useEffect(() => setGradeDraft(gradeBaseline), [gradeBaseline]);
  const gradeRule = useMemo(() => (gradeStructure ? gradeAutoTickRule(gradeStructure, variant) : null), [gradeStructure, variant]);

  // --- Derived ------------------------------------------------------------------
  const scoreDirty = scoreRows.filter((row) => scoreDraft[row.student_id] && isRowDirty(scoreDraft[row.student_id], scoreBaseline[row.student_id], leaves)).map((row) => row.student_id);
  const gradeDirty = gradeRows.filter((row) => gradeDraft[row.student_id] && isGradeRowDirty(gradeDraft[row.student_id], gradeBaseline[row.student_id], leafIds)).map((row) => row.student_id);
  const dirtyIds = scoreSheet ? scoreDirty : gradeDirty;
  const invalidCount = scoreRows.reduce((count, row) => count + (scoreDraft[row.student_id] ? rowErrorCount(scoreDraft[row.student_id], leaves) : 0), 0);

  /** Problems that stop the table rendering (shown instead of it). */
  const blocker: "noStructure" | "noColumns" | "noSubjects" | null = !sheet
    ? null
    : scoreSheet
      ? !structure
        ? "noStructure"
        : groups.length === 0
          ? "noColumns"
          : scoreRows.length === 0
            ? "noSubjects"
            : null
      : !gradeStructure
        ? "noStructure"
        : gradeRows.length === 0
          ? "noSubjects"
          : null;
  const readOnly = !sheet || !sheet.entry_open || blocker !== null;

  const summary: StudentMarksSummary | null = scoreSheet
    ? (() => {
        const outOf = shownTotal(groups, {}).outOf * scoreRows.length;
        return {
          mode: "component_based",
          passMark: Math.round((outOf / 2) * 100) / 100,
          outOf,
          completed: scoreRows.filter((row) => scoreDraft[row.student_id]?.mark_completed).length,
          subjects: scoreRows.length,
        };
      })()
    : gradeSheet && gradeStructure
      ? {
          mode: "grade_based",
          attained: gradeRows.filter((row) => !!gradeDraft[row.student_id]?.scores[gradeStructure.attainment.id]).length,
          completed: gradeRows.filter((row) => gradeDraft[row.student_id]?.mark_completed).length,
          subjects: gradeRows.length,
        }
      : null;

  const saveRows = (): Array<StudentSubjectMarkInput | StudentSubjectGradeInput> => {
    if (scoreSheet) {
      return scoreDirty.map((subjectId) => {
        const input = toMarkInput(subjectId, scoreDraft[subjectId], leaves);
        return { subject_id: subjectId, component_scores: input.component_scores, present: input.present, mark_completed: input.mark_completed, subject_remark: input.subject_remark };
      });
    }
    if (!gradeStructure) return [];
    return gradeDirty.map((subjectId) => {
      const row = gradeRows.find((item) => item.student_id === subjectId);
      const autoCode = row?.attainment_auto ? row.component_scores[gradeStructure.attainment.id] : null;
      const auto = autoCode ? { leafId: gradeStructure.attainment.id, code: autoCode } : null;
      const input = toGradeInput(subjectId, gradeDraft[subjectId], leafIds, commentApplies(variant), auto);
      return { subject_id: subjectId, component_scores: input.component_scores, present: input.present, mark_completed: input.mark_completed, subject_remark: input.subject_remark };
    });
  };

  const discard = () => {
    setScoreDraft(scoreBaseline);
    setGradeDraft(gradeBaseline);
  };

  let grid: ReactNode = null;
  if (scoreSheet && blocker === null) {
    const updateRow = (id: string, patch: Partial<DraftRow>) =>
      setScoreDraft((current) => ({ ...current, [id]: patchRowWithAutoTicks(current[id], patch, scoreRule) }));
    grid = (
      <MarksGrid
        rowKind="subject"
        // The subject teacher's remark is an Exam-point field: hidden at the CA point.
        showRemarks={scoreSheet.exam.category === "exam"}
        groups={groups}
        leaves={leaves}
        rows={scoreRows.map((row, index) => ({ row, serial: index + 1 }))}
        draft={scoreDraft}
        baseline={scoreBaseline}
        readOnly={readOnly}
        onChangeRow={updateRow}
        onRevertRow={(id) => setScoreDraft((current) => ({ ...current, [id]: scoreBaseline[id] }))}
        onClearScores={(id) => updateRow(id, { scores: Object.fromEntries(leaves.map((leaf) => [leaf.id, ""])) })}
      />
    );
  } else if (gradeSheet && gradeStructure && blocker === null) {
    const updateRow = (id: string, patch: Partial<GradeDraftRow>) =>
      setGradeDraft((current) => ({ ...current, [id]: gradeRule ? patchRowWithAutoTicks(current[id], patch, gradeRule) : { ...current[id], ...patch } }));
    grid = (
      <AcademicReportGrid
        rowKind="subject"
        structure={gradeStructure}
        levelsByLeaf={levelsByLeaf}
        leafIds={leafIds}
        rows={gradeRows.map((row: GradeMarkRow, index) => ({ row, serial: index + 1 }))}
        draft={gradeDraft}
        baseline={gradeBaseline}
        readOnly={readOnly}
        onChangeRow={updateRow}
        onRevertRow={(id) => setGradeDraft((current) => ({ ...current, [id]: gradeBaseline[id] }))}
        onClearEntries={(id) => updateRow(id, { scores: Object.fromEntries(leafIds.map((leafId) => [leafId, ""])) })}
        showComment={commentApplies(variant)}
        showGradeBook={gradeSheet.exam.show_grade_book}
      />
    );
  }

  return { grid, blocker, readOnly, dirtyCount: dirtyIds.length, invalidCount, summary, saveRows, discard };
}
