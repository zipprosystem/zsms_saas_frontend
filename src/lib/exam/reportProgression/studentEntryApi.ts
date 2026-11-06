import type { CrudResult } from "@/lib/setup/crudTypes";
import type { AssessmentMode } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { examFromWire, examSend } from "@/lib/exam/examApi";
import type { Exam } from "@/lib/exam/examTypes";
import type { MissingItem, ProgressionPoint, PublishStatusFilter } from "@/lib/exam/reportProgression/reportProgressionApi";
import type { TraitScaleLevel } from "@/lib/exam/reportProgression/studentTraitsApi";

/**
 * REPORT PROGRESSION — Stage 2: student-wise entry (View Details, Figma
 * 2499:354994). One student's report for a term × point: their marks for
 * every subject (the SAME subject_mark rows as Manage Exam Result /
 * Academic Report — see examApi.ts "STUDENT-WISE") plus the report-only
 * fields their template prints. Same transport / USE_MOCK as Exam.
 *
 * PROPOSED REST contract (names are proposals — reconcile with Muntajir):
 *
 *   GET /api/v1/erp/report-progression/students/:student_id?term_id=&point=ca|exam&status=
 *     -> StudentEntry (below). status = the class list's publish filter,
 *        only used for prev / next.
 *     - exams: the point's ACTIVE exams for the student's class (General
 *       CA: CA 1, CA 2…; Exam: the exam; British: the term's A or B
 *       point). The marks sheet is per exam (GET …/marks/students/:id).
 *     - report_fields: TEMPLATE-DRIVEN — the report-only fields the
 *       class's result template declares for this point's variant (CA →
 *       progress, Exam → full), PLUS (PO rule, General only) the heads'
 *       comments — class teacher, head teacher / principal — at BOTH
 *       points whenever the template has them at either (one instance
 *       per point). British stays point-specific (Progress = boarding
 *       house, Full = form tutor). The report still prints per the template.
 *       In print order:
 *         { kind: "comment", key, role, editable }  key = the term_remark
 *           column; role = how the template labels it (class_teacher,
 *           form_tutor — British Full, stored in class_teacher —,
 *           head_teacher, principal — e.g. Nigerian terminal prints the
 *           head teacher's remark as the Principal's —, boarding_house —
 *           British Progress). A British principal_comment column exists
 *           but is never listed unless the template opts in (signature
 *           only by default).
 *         graded (British only): the comment carries a GRADE — the Form
 *           Tutor and Boarding House comments, one British Progress Grade
 *           (the Engagement / Learning Behaviour scale, by id) per comment
 *           per point, stored in the student's trait_assessment under
 *           form_tutor / boarding_house for that point. General: never.
 *         { kind: "attendance", editable }  only where the template has
 *           attendance; the screen puts it in front of the class-teacher
 *           comment.
 *       editable (DEC-009): class-teacher / form-tutor comment and
 *       attendance — the arm's DIRECTLY-assigned class teacher or an
 *       admin; head-teacher / principal comment — the
 *       exam.report_progression.head_comment credential; boarding-house
 *       comment — the boarding staff (FLAGGED, not modelled).
 *       [] for a subject-scoped caller (they see their subject rows only).
 *     - remarks: the term_remark for student × term × point (all
 *       columns); null for a subject-scoped caller.
 *     - attendance: { present, absent, open_days, sessions_per_day,
 *       total_sessions } per student × term — total_sessions = open days
 *       (term dates on Settings › General Behaviour working_days −
 *       holidays − breaks) × Settings ›
 *       General Behaviour attendance_sessions_per_day (attendance mapping
 *       1:1 = 1 / 1:2 = 2, default 2); absent = total − present; both
 *       derived on read, so changing the mapping re-totals every report.
 *       null when the template has none here.
 *     - comment_grades: { scale, values } for a graded comment on this
 *       report — scale = the BRITISH Progress Grade levels (best first;
 *       never hardcoded), values = { form_tutor?, boarding_house? } the
 *       saved progress_grade_id (null = not graded) for THIS point. null
 *       when no comment here is graded (General, subject-scoped caller).
 *     - traits_apply: General Exam point — the Psychomotor Skill /
 *       Affective Domain entry applies (Stage 3).
 *     - progression: this report's completeness (see
 *       reportProgressionApi.ts — section-weighted).
 *     - navigation: prev / next through the caller's SCOPED class list
 *       (Report Progression class view order, status filter applied).
 *     403 OUT_OF_SCOPE (not in the caller's scope), 404 STUDENT_NOT_FOUND
 *     / TERM_NOT_FOUND / NOT_ENROLLED_FOR_TERM, 422 VALIDATION_ERROR.
 *
 *   PUT /api/v1/erp/report-progression/students/:student_id/report-fields
 *     body { term_id, point, remarks?: { <key>: text }, attendance_present?: n|null,
 *            comment_grades?: { form_tutor?: id|null, boarding_house?: id|null } }
 *     -> StudentEntry. Only the sent keys change. 403 FORBIDDEN when a
 *     sent field isn't editable by the caller; 422 when it isn't on the
 *     template for this point, a remark > 500 chars, present isn't a
 *     whole number 0..total_sessions, or a comment grade isn't a graded
 *     comment here / not a British Progress Grade level. A grade is
 *     writable by whoever may write its comment.
 *
 * PHASE 5 (AI — NOT BUILT; the screen shows the hooks disabled):
 *   - "Generate with AI" on each comment: drafts the comment for the
 *     teacher to edit; the saved term_remark carries source = ai_draft
 *     (manual otherwise). Proposed: POST …/students/:id/remarks/draft
 *     body { term_id, point, key } -> { text }.
 *   - "Analyze with AI" on the entry: an AI summary / analysis of the
 *     student's results for the term × point. Proposed: POST
 *     …/students/:id/analysis body { term_id, point } -> { summary }.
 */

export const REMARK_KEYS = ["class_teacher", "head_teacher", "principal", "boarding_house"] as const;
/** A term_remark column. */
export type RemarkKey = (typeof REMARK_KEYS)[number];
/** How the template labels a comment. */
export type CommentRole = "class_teacher" | "form_tutor" | "head_teacher" | "principal" | "boarding_house";

export type Remarks = Record<RemarkKey, string>;

/** The comments that carry a British grade (Part A, §7.26 Grade table). */
export const COMMENT_GRADE_ROLES = ["form_tutor", "boarding_house"] as const;
export type CommentGradeRole = (typeof COMMENT_GRADE_ROLES)[number];

export function isCommentGradeRole(role: string): role is CommentGradeRole {
  return (COMMENT_GRADE_ROLES as readonly string[]).includes(role);
}

export type ReportField =
  | { kind: "comment"; key: RemarkKey; role: CommentRole; editable: boolean; /** British: a grade selector goes with it. */ graded: boolean }
  | { kind: "attendance"; editable: boolean };

export type CommentGrades = { scale: TraitScaleLevel[]; values: Partial<Record<CommentGradeRole, string | null>> };

export type Attendance = {
  present: number | null;
  absent: number | null;
  open_days: number;
  /** Settings › General Behaviour attendance mapping: 1 (1:1) or 2 (1:2). */
  sessions_per_day: 1 | 2;
  total_sessions: number;
};

export type ProgressionSectionKey = "scores" | "comments" | "attendance" | "traits";
export type ProgressionSection = { key: ProgressionSectionKey; weight: number; filled: number; required: number };

export type StudentRef = { id: string; name: string };

export type StudentEntry = {
  student: { id: string; name: string; admission_no: string; photo_url: string | null };
  class_id: string;
  class_name: string;
  class_arm_id: string;
  arm_name: string;
  assessment_mode: AssessmentMode;
  academic_year_id: string;
  terms: Array<{ id: string; name: string }>;
  term_id: string;
  term_name: string;
  point: ProgressionPoint;
  exams: Exam[];
  /** A full-report role on the arm (sees report-only fields + traits). false = subject-scoped. */
  can_manage: boolean;
  /** The subjects this caller sees; null = all. */
  visible_subject_ids: string[] | null;
  report_fields: ReportField[];
  remarks: Remarks | null;
  attendance: Attendance | null;
  comment_grades: CommentGrades | null;
  traits_apply: boolean;
  progression: { percent: number; filled: number; required: number; sections: ProgressionSection[]; missing: MissingItem[] };
  navigation: { index: number; count: number; previous: StudentRef | null; next: StudentRef | null };
};

export type SaveReportFieldsInput = {
  term_id: string;
  point: ProgressionPoint;
  remarks?: Partial<Remarks>;
  attendance_present?: number | null;
  comment_grades?: Partial<Record<CommentGradeRole, string | null>>;
};

export const studentEntryQueryKey = (studentId: string, termId: string, point: ProgressionPoint, status: PublishStatusFilter) =>
  ["exam", "report-progression", "student", studentId, termId, point, status] as const;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function entryFromWire(value: unknown): StudentEntry | null {
  const r = rec(value);
  if (!rec(r.student).id || !Array.isArray(r.report_fields)) return null;
  const entry = r as unknown as StudentEntry;
  return {
    ...entry,
    exams: Array.isArray(r.exams) ? r.exams.map(examFromWire) : [],
    report_fields: entry.report_fields.map((field) => (field.kind === "comment" ? { ...field, graded: field.graded === true } : field)),
    comment_grades: r.comment_grades && typeof r.comment_grades === "object" ? entry.comment_grades : null,
  };
}

export function getStudentEntry(studentId: string, termId: string, point: ProgressionPoint, status: PublishStatusFilter): Promise<CrudResult<StudentEntry>> {
  const query = new URLSearchParams({ point, status });
  if (termId) query.set("term_id", termId);
  return examSend("GET", `erp/report-progression/students/${encodeURIComponent(studentId)}?${query}`, undefined, entryFromWire);
}

export function saveReportFields(studentId: string, input: SaveReportFieldsInput): Promise<CrudResult<StudentEntry>> {
  return examSend("PUT", `erp/report-progression/students/${encodeURIComponent(studentId)}/report-fields`, input, entryFromWire);
}
