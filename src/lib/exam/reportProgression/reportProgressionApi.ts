import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import type { AssessmentMode } from "@/lib/setup/assessmentConfiguration/assessmentStructure";

/**
 * REPORT PROGRESSION — Stage 1: the publish surface (Academics › Exam ›
 * Report Progression). Same transport as the rest of Exam (examApi's
 * USE_MOCK flag flips it; the dev-bypass guard applies).
 *
 * A report is per student × term × POINT: "ca" (the CA / Half-Term report;
 * British: the term's A point, Progress) or "exam" (the Exam / End-of-Term
 * report; British: B, Full). Publish / stamp state is kept per point.
 *
 * COMPLETENESS (§7.30) is BACKEND-OWNED and computed on read:
 *   progression_percent = round(filled ÷ required × 100), where one
 *   required slot is:
 *     - each subject the student takes (not NE) — filled when its result
 *       for that point is complete (status "ready");
 *     - General classes: each Psychomotor and Affective trait (rated) and
 *       the class teacher + head teacher remarks (non-empty).
 *   British: subjects only for now — FLAGGED: the student-wise British
 *   items (Stages 2–3) join `required` when those screens land.
 *   `missing` lists what's still unpopulated (the publish warning shows it).
 *   The class card's percent = Σ filled ÷ Σ required over its students.
 *
 * PROPOSED REST contract (names are proposals — reconcile with Muntajir):
 *
 *   GET /api/v1/erp/report-progression/classes?academic_year_id=&term_id=&point=ca|exam
 *     -> { academic_year_id, years, terms, term_id, point, full_scope,
 *          items: [{ class_id, class_name, school_type_name|null,
 *                    assessment_mode, student_count, subject_count,
 *                    filled, required, progression_percent }] }
 *     Classes in the caller's scope, school order.
 *
 *   GET /api/v1/erp/report-progression/classes/:class_id?term_id=&point=&status=all|published|unpublished
 *     -> { class_id, class_name, school_type_name, assessment_mode,
 *          academic_year_id, term_id, term_name, point, years, terms,
 *          classes: [{ id, name }],   (the class filter's options)
 *          items: [ProgressionStudent] }
 *     Every student enrolled in the class for the term, cut to the
 *     caller's effective_scope: admin / HOD / sectional head = all arms;
 *     a class teacher / form tutor = only their assigned arm (a subject
 *     teaching assignment in another arm doesn't add it). Both endpoints
 *     and the actions apply the same scope (403 OUT_OF_SCOPE outside it).
 *     A class is bounded (≈ tens of students), so no paging — FLAGGED.
 *
 *   POST /api/v1/erp/report-progression/publish    body { term_id, point, student_ids[] }
 *   POST /api/v1/erp/report-progression/unpublish  body { term_id, point, student_ids[] }
 *   POST /api/v1/erp/report-progression/stamp      body { term_id, point, student_ids[] }
 *     -> { items: [ProgressionStudent] } (the updated rows)
 *     Publishing is NEVER gated by completeness (the screen warns first).
 *     Publish stamps published_at (the row's Time Stamp) and, once the
 *     DEC-008 PDF job exists, a pdf_file_id / pdf_url. Unpublish clears
 *     both. Stamp sets the stamped flag (the digital stamp renders by the
 *     principal's signature on the report).
 *     403 OUT_OF_SCOPE / FORBIDDEN (missing exam.report_progression.publish
 *     or .stamp), 422 VALIDATION_ERROR (unknown student / point).
 */

export const PROGRESSION_POINTS = ["ca", "exam"] as const;
export type ProgressionPoint = (typeof PROGRESSION_POINTS)[number];

export const PUBLISH_STATUS_FILTERS = ["all", "published", "unpublished"] as const;
export type PublishStatusFilter = (typeof PUBLISH_STATUS_FILTERS)[number];

/** What a report still lacks. subject: label = the subject; psychomotor / affective: count = unrated traits. */
export type MissingItem =
  | { kind: "subject"; label: string }
  | { kind: "psychomotor" | "affective"; count: number }
  | { kind: "class_teacher_remark" | "head_teacher_remark" };

export type ProgressionActor = { staff_id: string | null; name: string | null };

/** Who did what last on this report (entry, traits, publish, stamp). by.name null = a school admin. */
export type ProgressionActivity = {
  kind: "marks" | "traits" | "published" | "unpublished" | "stamped";
  at: string;
  by: ProgressionActor | null;
};

export type ProgressionStudent = {
  student_id: string;
  student_name: string;
  admission_no: string;
  photo_url: string | null;
  class_arm_id: string;
  arm_name: string;
  filled: number;
  required: number;
  progression_percent: number;
  missing: MissingItem[];
  latest_activity: ProgressionActivity | null;
  /** null = not published. at = the publish date (the Time Stamp column). */
  published: { at: string; by: ProgressionActor | null } | null;
  stamped: { at: string; by: ProgressionActor | null } | null;
  /** The published PDF (DEC-008 backend job). null until that exists — View PDF falls back to the on-screen report. */
  pdf_file_id: string | null;
  pdf_url: string | null;
};

type YearOption = { id: string; name: string; is_current: boolean };
type TermOption = { id: string; name: string };

export type ProgressionClassCard = {
  class_id: string;
  class_name: string;
  school_type_name: string | null;
  assessment_mode: AssessmentMode;
  student_count: number;
  subject_count: number;
  filled: number;
  required: number;
  progression_percent: number;
};

export type ProgressionClasses = {
  academic_year_id: string;
  years: YearOption[];
  terms: TermOption[];
  term_id: string;
  point: ProgressionPoint;
  full_scope: boolean;
  items: ProgressionClassCard[];
};

export type ClassProgression = {
  class_id: string;
  class_name: string;
  school_type_name: string | null;
  assessment_mode: AssessmentMode;
  academic_year_id: string;
  years: YearOption[];
  terms: TermOption[];
  term_id: string;
  term_name: string;
  point: ProgressionPoint;
  classes: Array<{ id: string; name: string }>;
  items: ProgressionStudent[];
};

export type ProgressionAction = "publish" | "unpublish" | "stamp";

export const reportProgressionQueryKeys = {
  all: ["exam", "report-progression"] as const,
  classes: (yearId: string, termId: string, point: ProgressionPoint) => ["exam", "report-progression", "classes", yearId, termId, point] as const,
  classView: (classId: string, termId: string, point: ProgressionPoint, status: PublishStatusFilter) =>
    ["exam", "report-progression", "class", classId, termId, point, status] as const,
};

/** Percent of required slots filled, 0–100 (0 when nothing is required). */
export function progressionPercent(filled: number, required: number): number {
  return required > 0 ? Math.round((filled / required) * 100) : 0;
}

export function isProgressionPoint(value: string | null | undefined): value is ProgressionPoint {
  return (PROGRESSION_POINTS as readonly string[]).includes(value ?? "");
}

export function isPublishStatusFilter(value: string | null | undefined): value is PublishStatusFilter {
  return (PUBLISH_STATUS_FILTERS as readonly string[]).includes(value ?? "");
}

/** The report variant a point produces (General CA → progress; Exam → full; British A/B likewise). */
export function variantOfPoint(point: ProgressionPoint): "progress" | "full" {
  return point === "ca" ? "progress" : "full";
}

// ---------------------------------------------------------------------------
// Wire readers (structural only)
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function classesFromWire(value: unknown): ProgressionClasses | null {
  const r = rec(value);
  return Array.isArray(r.items) && typeof r.term_id === "string" ? (r as unknown as ProgressionClasses) : null;
}

function classViewFromWire(value: unknown): ClassProgression | null {
  const r = rec(value);
  return Array.isArray(r.items) && typeof r.class_id === "string" ? (r as unknown as ClassProgression) : null;
}

function rowsFromWire(value: unknown): ProgressionStudent[] | null {
  const r = rec(value);
  return Array.isArray(r.items) ? (r.items as ProgressionStudent[]) : null;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function getProgressionClasses(yearId: string, termId: string, point: ProgressionPoint): Promise<CrudResult<ProgressionClasses>> {
  const query = new URLSearchParams({ point });
  if (yearId) query.set("academic_year_id", yearId);
  if (termId) query.set("term_id", termId);
  return examSend("GET", `erp/report-progression/classes?${query}`, undefined, classesFromWire);
}

export function getClassProgression(classId: string, termId: string, point: ProgressionPoint, status: PublishStatusFilter): Promise<CrudResult<ClassProgression>> {
  const query = new URLSearchParams({ point, status });
  if (termId) query.set("term_id", termId);
  return examSend("GET", `erp/report-progression/classes/${encodeURIComponent(classId)}?${query}`, undefined, classViewFromWire);
}

export function runProgressionAction(
  action: ProgressionAction,
  input: { term_id: string; point: ProgressionPoint; student_ids: string[] },
): Promise<CrudResult<ProgressionStudent[]>> {
  return examSend("POST", `erp/report-progression/${action}`, input, rowsFromWire);
}

/**
 * View PDF: the published PDF when the backend has one (DEC-008 —
 * pdf_url / pdf_file_id), else null = show the on-screen report render
 * as the stand-in. Swapping in the real PDF needs no screen change.
 */
export function publishedPdfUrl(row: ProgressionStudent): string | null {
  return row.published && row.pdf_url ? row.pdf_url : null;
}
