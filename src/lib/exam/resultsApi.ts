import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import {
  RESULT_STATUSES,
  type ClassResultRow,
  type ClassResults,
  type ResultStatus,
  type ResultsView,
  type ResultSubjectColumn,
  type StudentResult,
  type StudentTermResult,
  type SubjectResult,
} from "@/lib/exam/results/resultsTypes";

/**
 * Exam Stage 2a — computed results (read side). Shares examApi's transport,
 * so the same USE_MOCK flag flips it to the real backend; with the real
 * transport under the local dev-auth bypass every call returns
 * devBypassUnavailable and the screen shows the "deployed tenant" notice.
 *
 * PROPOSED REST contract (the backend computes; the frontend only displays):
 *
 *   GET /api/v1/erp/results?class_arm_id=&term_id=&view=all|grades|gpa&page=&limit=
 *     -> { assessment_mode, view, academic_year_id, term_id, term_name,
 *          class_arm_id, class_name, arm_name, grade_scale_name,
 *          subjects: [{ subject_id, subject_name, unit|null }],   (columns)
 *          ranked_count,
 *          items: [{ student_id, student_name, admission_no,
 *                    subjects: { <subject_id>: subject_result (lean) },
 *                    aggregate: student_term_result (lean) }],
 *          total, page, limit (default 25, max 100), has_more }
 *     Lean per view — General: all = status,total,grade; grades = status,grade;
 *     gpa = status,grade,gpa. British: all = status,cag,va,cumulative_grade;
 *     grades = status,cag. Aggregate: all = grand_total,average,
 *     overall_grade,class_position; grades = overall_grade; gpa = gpa
 *     (+ status, subjects_counted always). Positions are computed over the
 *     whole arm before paging.
 *
 *   GET /api/v1/erp/results/:student_id?term_id=
 *     -> { assessment_mode, academic_year_id, term_id, term_name,
 *          class_arm_id, class_name, arm_name, grade_scale_name, student,
 *          subjects: [subject_result + subject_name + unit] (full),
 *          aggregate: student_term_result (full), ranked_count }
 *
 *   subject_result: subject_id, status (rng|incomplete|ready|ne), total,
 *     grade, grade_weight, gpa, remark, subject_position, cag, mtg, va,
 *     cumulative_average, cumulative_grade, cumulative_terms
 *   student_term_result: status, grand_total, average, class_position,
 *     overall_grade, gpa, cumulative_average, subjects_counted
 *   Errors: 422 VALIDATION_ERROR, 404 CLASS_ARM_NOT_FOUND / TERM_NOT_FOUND /
 *     STUDENT_NOT_FOUND / NOT_ENROLLED_FOR_TERM, 403 OUT_OF_SCOPE.
 *
 * Rules: resultsEngine.ts (the reference implementation).
 *
 * FLAGGED for confirmation (Matthew / Muntajir):
 *   - Results scope: a teacher sees whole-class results for any arm they
 *     teach a subject in (positions need the whole class).
 *   - Average divides by subjects WITH a result (RNG / NE excluded); RNG
 *     and NE are never ranked.
 *   - A term's status counts every field at both of its points (CA + Exam,
 *     or A + B).
 *   - Student cumulative_average = mean of their subjects' cumulative averages.
 *   - British: CAG = the term's latest point with an attainment grade;
 *     cumulative attainment = mean grade step over the terms that have a
 *     CAG (grades have no zero, so the enrolled-terms divisor can't apply),
 *     rounded to the nearest grade. No totals, GPA or positions.
 */

export const resultsQueryKeys = {
  all: ["exam", "results"] as const,
  classResults: (armId: string, termId: string, view: ResultsView, page: number) => ["exam", "results", "class", armId, termId, view, page] as const,
  studentResult: (studentId: string, termId: string) => ["exam", "results", "student", studentId, termId] as const,
};

export const RESULTS_PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Tolerant wire readers (a lean view omits fields -> null)
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function s(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function statusFromWire(value: unknown): ResultStatus {
  return (RESULT_STATUSES as readonly string[]).includes(value as string) ? (value as ResultStatus) : "rng";
}

function subjectFromWire(value: unknown): SubjectResult {
  const r = rec(value);
  return {
    subject_id: s(r.subject_id),
    status: statusFromWire(r.status),
    total: num(r.total),
    grade: str(r.grade),
    grade_weight: num(r.grade_weight),
    gpa: num(r.gpa),
    remark: str(r.remark),
    subject_position: num(r.subject_position),
    cag: str(r.cag),
    mtg: str(r.mtg),
    va: num(r.va),
    cumulative_average: num(r.cumulative_average),
    cumulative_grade: str(r.cumulative_grade),
    cumulative_terms: num(r.cumulative_terms),
  };
}

function aggregateFromWire(value: unknown): StudentTermResult {
  const r = rec(value);
  return {
    status: statusFromWire(r.status),
    grand_total: num(r.grand_total),
    average: num(r.average),
    class_position: num(r.class_position),
    overall_grade: str(r.overall_grade),
    gpa: num(r.gpa),
    cumulative_average: num(r.cumulative_average),
    subjects_counted: num(r.subjects_counted) ?? 0,
  };
}

function columnFromWire(value: unknown): ResultSubjectColumn {
  const r = rec(value);
  return { subject_id: s(r.subject_id), subject_name: s(r.subject_name), unit: num(r.unit) };
}

function header(r: Record<string, unknown>) {
  return {
    assessment_mode: r.assessment_mode === "grade_based" ? ("grade_based" as const) : ("component_based" as const),
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    term_name: s(r.term_name),
    class_arm_id: s(r.class_arm_id),
    class_name: s(r.class_name),
    arm_name: s(r.arm_name),
    grade_scale_name: str(r.grade_scale_name),
    ranked_count: num(r.ranked_count) ?? 0,
  };
}

function classResultsFromWire(value: unknown): ClassResults | null {
  const r = rec(value);
  if (!Array.isArray(r.items)) return null;
  return {
    ...header(r),
    view: r.view === "grades" || r.view === "gpa" ? r.view : "all",
    subjects: arr(r.subjects).map(columnFromWire).filter((column) => column.subject_id),
    items: arr(r.items).map((item): ClassResultRow => {
      const x = rec(item);
      return {
        student_id: s(x.student_id),
        student_name: s(x.student_name),
        admission_no: s(x.admission_no),
        subjects: Object.fromEntries(Object.entries(rec(x.subjects)).map(([id, result]) => [id, { ...subjectFromWire(result), subject_id: id }])),
        aggregate: aggregateFromWire(x.aggregate),
      };
    }),
    total: num(r.total) ?? 0,
    page: num(r.page) ?? 1,
    limit: num(r.limit) ?? RESULTS_PAGE_SIZE,
    has_more: r.has_more === true,
  };
}

function studentResultFromWire(value: unknown): StudentResult | null {
  const r = rec(value);
  const student = rec(r.student);
  if (!s(student.id)) return null;
  return {
    ...header(r),
    student: { id: s(student.id), name: s(student.name), admission_no: s(student.admission_no) },
    subjects: arr(r.subjects).map((item) => ({ ...columnFromWire(item), ...subjectFromWire(item) })),
    aggregate: aggregateFromWire(r.aggregate),
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function getClassResults(armId: string, termId: string, view: ResultsView, page: number): Promise<CrudResult<ClassResults>> {
  const query = new URLSearchParams({ class_arm_id: armId, term_id: termId, view, page: String(page), limit: String(RESULTS_PAGE_SIZE) });
  return examSend("GET", `erp/results?${query}`, undefined, classResultsFromWire);
}

export function getStudentResult(studentId: string, termId: string): Promise<CrudResult<StudentResult>> {
  const query = new URLSearchParams({ term_id: termId });
  return examSend("GET", `erp/results/${encodeURIComponent(studentId)}?${query}`, undefined, studentResultFromWire);
}
