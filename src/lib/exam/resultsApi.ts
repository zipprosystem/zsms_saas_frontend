import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import {
  RESULT_STATUSES,
  RESULTS_VIEWER_ROLES,
  TRAITS_STATUSES,
  type ArmResultSummary,
  type ClassResultRow,
  type ClassResults,
  type ResultStatus,
  type ResultsArms,
  type ResultsView,
  type ResultsViewer,
  type ResultSubjectColumn,
  type SaveStudentTraitsInput,
  type StudentResult,
  type StudentTraits,
  type TraitItem,
  type TraitRatingLevel,
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
 * RESULTS REFRAME additions (2026-10-27, PROPOSED):
 *
 *   GET erp/results also returns
 *     class_average   mean of the students' averages (those with one);
 *                     null for grade-based classes
 *     viewer          { role: admin|sectional_head|class_teacher|subject_teacher,
 *                       report_scope: full|own_subjects,
 *                       visible_subject_ids: string[]|null,
 *                       can_enter_traits }   — the caller's report view
 *     items[].traits_status  none|partial|complete
 *
 *   GET /api/v1/erp/results/arms?academic_year_id=&term_id=   (arm cards)
 *     -> { academic_year_id, years, terms, term_id, full_scope,
 *          items: [{ class_id, class_name, class_arm_id, arm_name,
 *                    assessment_mode, student_count, subject_count,
 *                    class_average|null }] }
 *     (subject_count added in Stage 2b for the Broad Sheet cards.)
 *     Arms in the caller's RESULTS scope (admin all; sectional head their
 *     classes; class teacher their arm; subject teacher arms they teach).
 *
 *   GET /api/v1/erp/results/:student_id/traits?term_id=
 *     -> { student_id, student_name, term_id,
 *          rating_scale: [{ id, value, label, hide_in_report }],
 *            the General Progress Grades scale (Setup › Progress Grades),
 *            best level first
 *          psychomotor: [{ key, label, progress_grade_id|null }],
 *          affective:   [{ key, label, progress_grade_id|null }],
 *          class_teacher_remark, head_teacher_remark, updated_at|null,
 *          editable }
 *   PUT  same path, body { term_id, ratings: { <key>: progress_grade_id|null },
 *          class_teacher_remark, head_teacher_remark } -> same shape.
 *     Ratings reference a Progress Grade BY ID (renaming a level or
 *     changing its value never orphans a rating). 403 FORBIDDEN unless the
 *     caller is the arm's class teacher; 422 for an unknown trait key, an
 *     id that isn't a level of the General scale, or a remark > 500 chars.
 *
 * REPORT RENDER (2026-10-27): the per-student report payload and the
 * class PDF request — contract in report/reportPayload.ts.
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
  arms: (yearId: string, termId: string) => ["exam", "results", "arms", yearId, termId] as const,
  traits: (studentId: string, termId: string) => ["exam", "results", "traits", studentId, termId] as const,
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

/** An unknown scope reads as the narrower view (shared with the broadsheet reader). */
export function viewerFromWire(value: unknown): ResultsViewer {
  const r = rec(value);
  const role = (RESULTS_VIEWER_ROLES as readonly string[]).includes(r.role as string) ? (r.role as ResultsViewer["role"]) : "subject_teacher";
  const ids = Array.isArray(r.visible_subject_ids) ? r.visible_subject_ids.filter((id): id is string => typeof id === "string") : null;
  const full = r.report_scope === "full";
  return { role, report_scope: full ? "full" : "own_subjects", visible_subject_ids: full ? null : (ids ?? []), can_enter_traits: r.can_enter_traits === true };
}

function classResultsFromWire(value: unknown): ClassResults | null {
  const r = rec(value);
  if (!Array.isArray(r.items)) return null;
  return {
    ...header(r),
    view: r.view === "grades" || r.view === "gpa" ? r.view : "all",
    subjects: arr(r.subjects).map(columnFromWire).filter((column) => column.subject_id),
    class_average: num(r.class_average),
    viewer: viewerFromWire(r.viewer),
    items: arr(r.items).map((item): ClassResultRow => {
      const x = rec(item);
      return {
        student_id: s(x.student_id),
        student_name: s(x.student_name),
        admission_no: s(x.admission_no),
        subjects: Object.fromEntries(Object.entries(rec(x.subjects)).map(([id, result]) => [id, { ...subjectFromWire(result), subject_id: id }])),
        aggregate: aggregateFromWire(x.aggregate),
        traits_status: (TRAITS_STATUSES as readonly string[]).includes(x.traits_status as string) ? (x.traits_status as ClassResultRow["traits_status"]) : "none",
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

export function getClassResults(armId: string, termId: string, view: ResultsView, page: number, limit = RESULTS_PAGE_SIZE): Promise<CrudResult<ClassResults>> {
  const query = new URLSearchParams({ class_arm_id: armId, term_id: termId, view, page: String(page), limit: String(limit) });
  return examSend("GET", `erp/results?${query}`, undefined, classResultsFromWire);
}

export function getStudentResult(studentId: string, termId: string): Promise<CrudResult<StudentResult>> {
  const query = new URLSearchParams({ term_id: termId });
  return examSend("GET", `erp/results/${encodeURIComponent(studentId)}?${query}`, undefined, studentResultFromWire);
}

function armsFromWire(value: unknown): ResultsArms | null {
  const r = rec(value);
  if (!Array.isArray(r.items)) return null;
  return {
    academic_year_id: s(r.academic_year_id),
    years: arr(r.years).map((item) => {
      const x = rec(item);
      return { id: s(x.id), name: s(x.name), is_current: x.is_current === true };
    }),
    terms: arr(r.terms).map((item) => ({ id: s(rec(item).id), name: s(rec(item).name) })),
    term_id: s(r.term_id),
    full_scope: r.full_scope === true,
    items: arr(r.items).map((item): ArmResultSummary => {
      const x = rec(item);
      return {
        class_id: s(x.class_id),
        class_name: s(x.class_name),
        class_arm_id: s(x.class_arm_id),
        arm_name: s(x.arm_name),
        assessment_mode: x.assessment_mode === "grade_based" ? "grade_based" : "component_based",
        student_count: num(x.student_count) ?? 0,
        subject_count: num(x.subject_count) ?? 0,
        class_average: num(x.class_average),
      };
    }),
  };
}

function traitItemsFromWire(value: unknown): TraitItem[] {
  return arr(value)
    .map((item) => {
      const x = rec(item);
      return { key: s(x.key), label: s(x.label), progress_grade_id: str(x.progress_grade_id) };
    })
    .filter((item) => item.key);
}

function traitsFromWire(value: unknown): StudentTraits | null {
  const r = rec(value);
  if (!s(r.student_id)) return null;
  return {
    student_id: s(r.student_id),
    student_name: s(r.student_name),
    term_id: s(r.term_id),
    rating_scale: arr(r.rating_scale)
      .map((item) => {
        const x = rec(item);
        return { id: s(x.id), value: num(x.value), label: s(x.label), hide_in_report: x.hide_in_report === true };
      })
      .filter((level): level is TraitRatingLevel => !!level.id && level.value !== null),
    psychomotor: traitItemsFromWire(r.psychomotor),
    affective: traitItemsFromWire(r.affective),
    class_teacher_remark: s(r.class_teacher_remark),
    head_teacher_remark: s(r.head_teacher_remark),
    updated_at: str(r.updated_at),
    editable: r.editable === true,
  };
}

/** Largest page the backend serves — the student list loads a whole arm in one go (export needs every row). */
export const RESULTS_MAX_LIMIT = 100;

export function getResultArms(yearId: string, termId: string): Promise<CrudResult<ResultsArms>> {
  const query = new URLSearchParams();
  if (yearId) query.set("academic_year_id", yearId);
  if (termId) query.set("term_id", termId);
  return examSend("GET", `erp/results/arms?${query}`, undefined, armsFromWire);
}

export function getStudentTraits(studentId: string, termId: string): Promise<CrudResult<StudentTraits>> {
  const query = new URLSearchParams({ term_id: termId });
  return examSend("GET", `erp/results/${encodeURIComponent(studentId)}/traits?${query}`, undefined, traitsFromWire);
}

export function saveStudentTraits(studentId: string, input: SaveStudentTraitsInput): Promise<CrudResult<StudentTraits>> {
  return examSend("PUT", `erp/results/${encodeURIComponent(studentId)}/traits`, input, traitsFromWire);
}
