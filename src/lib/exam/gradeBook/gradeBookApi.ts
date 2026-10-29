import type { CrudResult } from "@/lib/setup/crudTypes";
import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { fromWire as structureFromWire } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import { examSend, examFromWire } from "@/lib/exam/examApi";
import type { ComponentScores, Exam } from "@/lib/exam/examTypes";
import type { GradeBookBand } from "@/lib/exam/gradeBook/gradeBookMath";

export { bandForTotal, gradeBookColumns, gradeBookResult, type GradeBookBand } from "@/lib/exam/gradeBook/gradeBookMath";

/**
 * Academics › Exam › Results › Grade Book (British) — a separate /100 score
 * per subject per point (1A, 1B…), entered on its own page (not Manage Exam
 * Result, not the Academic Report). Its fields come from a Grade Book
 * structure (Setup › Assessment Types, "Is Grade Book" — e.g. Test 1 /10,
 * Test 2 /10, Homework & Classwork /10, Unified Assessment /70). The total
 * is graded on the class's BRITISH ATTAINMENT scale (Setup › Attainment
 * Grades: score range → grade + weight). Rides the Exam module's transport
 * (USE_MOCK flips it). Spec §7.19.
 *
 * PROPOSED REST contract (confirm with Muntajir):
 *
 *   GET /api/v1/erp/exams/:exam_id/grade-book?subject_id=&class_arm_id=&grade_book_id=
 *     -> { exam, subject_id, class_arm_id,
 *          grade_book: <assessment_structure, is_grade_book true>,
 *          bands: [{ grade, label, min, max, weight }],  the class's
 *            attainment score ranges, best first (empty = none set: totals
 *            show, grades don't)
 *          entry_open,
 *          items: [{ student_id, student_name, admission_no, seat_no,
 *                    component_scores: { <leaf id>: number|null },
 *                    total, grade, grade_weight,   server-computed from
 *                      what's saved (null = nothing entered / no range)
 *                    entered_by_staff_id, updated_at }] }
 *   PUT  same path   body { subject_id, class_arm_id, grade_book_id,
 *                           rows: [{ student_id, component_scores }] }
 *     Upserts the rows; returns the same shape as GET. The server derives
 *     total = Σ field contributions (/100) and the grade from the score
 *     ranges — both also shown live on screen (same rules, gradeBookResult).
 *   Errors: 422 VALIDATION_ERROR (score outside 0…field max, unknown field,
 *     student not enrolled), 422 NOT_A_GRADE_BOOK (grade_book_id isn't an
 *     active Grade Book structure), 422 WRONG_ASSESSMENT_MODE (the class or
 *     point isn't British / grade_based), 403 OUT_OF_SCOPE (effective_scope:
 *     a subject teacher enters only their subject/arm; admin / exam-manage
 *     all), 403 ENTRY_CLOSED (past the point's cutoff).
 *
 * One Grade Book per subject per point: other screens (Academic Report GB
 * column, report card, Progression, attainment auto-fill) read THAT
 * point's total. If a school saves the same point under two Grade Book
 * structures, the most recently saved one counts (FLAGGED — confirm).
 * Hidden on those screens when the point's exam.show_grade_book is false.
 */

export type GradeBookRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  seat_no: string;
  component_scores: ComponentScores;
  total: number | null;
  grade: string | null;
  grade_weight: number | null;
  entered_by_staff_id: string | null;
  updated_at: string | null;
};

export type GradeBookSheet = {
  exam: Exam;
  subject_id: string;
  class_arm_id: string;
  grade_book: AssessmentStructure;
  bands: GradeBookBand[];
  entry_open: boolean;
  items: GradeBookRow[];
};

export type GradeBookRowInput = { student_id: string; component_scores: ComponentScores };
export type SaveGradeBookInput = { subject_id: string; class_arm_id: string; grade_book_id: string; rows: GradeBookRowInput[] };

export const gradeBookQueryKeys = {
  all: ["exam", "gradeBook"] as const,
  sheet: (examId: string, subjectId: string, armId: string, gradeBookId: string) => ["exam", "gradeBook", examId, subjectId, armId, gradeBookId] as const,
};

// ---------------------------------------------------------------------------
// Wire
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoresFromWire(value: unknown): ComponentScores {
  return Object.fromEntries(Object.entries(rec(value)).map(([key, score]) => [key, num(score)]));
}

function sheetFromWire(value: unknown): GradeBookSheet | null {
  const r = rec(value);
  if (!r.exam || !r.grade_book) return null;
  return {
    exam: examFromWire(r.exam),
    subject_id: str(r.subject_id),
    class_arm_id: str(r.class_arm_id),
    grade_book: structureFromWire(r.grade_book),
    bands: (Array.isArray(r.bands) ? r.bands : []).map((item) => {
      const x = rec(item);
      return { grade: str(x.grade), label: str(x.label) || str(x.grade), min: num(x.min) ?? 0, max: num(x.max), weight: num(x.weight) };
    }),
    entry_open: r.entry_open !== false,
    items: (Array.isArray(r.items) ? r.items : []).map((item) => {
      const x = rec(item);
      return {
        student_id: str(x.student_id),
        student_name: str(x.student_name),
        admission_no: str(x.admission_no),
        seat_no: str(x.seat_no),
        component_scores: scoresFromWire(x.component_scores),
        total: num(x.total),
        grade: str(x.grade) || null,
        grade_weight: num(x.grade_weight),
        entered_by_staff_id: str(x.entered_by_staff_id) || null,
        updated_at: str(x.updated_at) || null,
      };
    }),
  };
}

function sheetPath(examId: string): string {
  return `erp/exams/${encodeURIComponent(examId)}/grade-book`;
}

export function getGradeBook(examId: string, subjectId: string, armId: string, gradeBookId: string): Promise<CrudResult<GradeBookSheet>> {
  const query = new URLSearchParams({ subject_id: subjectId, class_arm_id: armId, grade_book_id: gradeBookId });
  return examSend("GET", `${sheetPath(examId)}?${query}`, undefined, sheetFromWire);
}

export function saveGradeBook(examId: string, input: SaveGradeBookInput): Promise<CrudResult<GradeBookSheet>> {
  return examSend("PUT", sheetPath(examId), input, sheetFromWire);
}
