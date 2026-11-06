import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import type { AssessmentMode } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import type { CommentRole, ProgressionSection, ProgressionSectionKey } from "@/lib/exam/reportProgression/studentEntryApi";

/**
 * REPORT PROGRESSION — Stage 1: the publish surface (Academics › Exam ›
 * Report Progression). Same transport as the rest of Exam (examApi's
 * USE_MOCK flag flips it; the dev-bypass guard applies).
 *
 * A report is per student × term × POINT: "ca" (the CA / Half-Term report;
 * British: the term's A point, Progress) or "exam" (the Exam / End-of-Term
 * report; British: B, Full). Publish / stamp state is kept per point.
 *
 * COMPLETENESS (§7.30) is BACKEND-OWNED, computed on read, and
 * TEMPLATE + POINT driven and SECTION-WEIGHTED (Stage 2), so no one kind
 * of item dominates (traits won't swamp the bar once Stage 3 lands):
 *   sections (each filled ÷ required):
 *     scores     — each subject the student takes (not NE) that the row
 *                  covers; filled when its result for the point is
 *                  complete (status "ready").
 *     comments   — each comment entered at this point (report_fields,
 *                  studentEntryApi.ts: the template's own plus, General,
 *                  the heads' comments on both points); filled = non-empty
 *                  term_remark for the point.
 *     attendance — only where the template has attendance; filled =
 *                  present recorded.
 *     traits     — General Exam point only: each Psychomotor and
 *                  Affective trait rated (never at the CA point; British
 *                  student-wise domains join with Stage 3).
 *   progression_percent = round(Σ weight × filled ÷ required ÷ Σ weight)
 *   over the sections that have anything required — weights
 *   PROGRESSION_SECTION_WEIGHTS (scores 60, comments 20, attendance 10,
 *   traits 10; FLAGGED, tune with Matthew). A subject-scoped row is
 *   scores only. filled / required stay the raw slot counts.
 *   `missing` lists what's still unpopulated (the publish warning shows it).
 *   The class card's percent = the mean of its students' percents.
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
 *     The class's students for the term, cut to the caller's standard
 *     effective_scope (the same resolver as Results / marks entry):
 *       admin → all; HOD / sectional head → the roll-up of their classes;
 *       class teacher / form tutor → every student in their arm;
 *       subject teacher → only the students they teach, by SUBJECT SET
 *       where the assignment names one, and only their subject(s) — the
 *       row's filled / required / missing count those subjects only (no
 *       traits / remarks: those are the class teacher's).
 *     A caller can hold different roles per arm (a form tutor of 1 A who
 *     teaches English in 1 B gets all of 1 A + 1 B's English takers).
 *     can_manage (per row, and any-row on the class) = a full-report
 *     role on that arm; Publish / Unpublish / Stamp / Send and the
 *     comments are never available on a subject-only row, regardless of
 *     the exam.report_progression.* credentials (403 FORBIDDEN).
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

/** What a report still lacks. subject: label = the subject; psychomotor / affective: count = unrated traits; remark: role = the comment as the template labels it. */
export type MissingItem =
  | { kind: "subject"; label: string }
  | { kind: "psychomotor" | "affective"; count: number }
  | { kind: "remark"; role: CommentRole }
  | { kind: "attendance" };

export type ProgressionActor = { staff_id: string | null; name: string | null };

/** Who did what last on this report (entry, traits, publish, stamp). by.name null = a school admin. */
export type ProgressionActivity = {
  kind: "marks" | "traits" | "comments" | "published" | "unpublished" | "stamped";
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
  /** The caller holds a full-report role on this student's arm (may publish / stamp it). false = subject-scoped row. */
  can_manage: boolean;
  /** The subjects this row is scoped to; null = the whole report. */
  visible_subject_ids: string[] | null;
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
  /** Any row is manageable (shows the report-management actions). */
  can_manage: boolean;
  /** Any row is limited to the caller's subject(s). */
  subject_scoped: boolean;
  items: ProgressionStudent[];
};

export type ProgressionAction = "publish" | "unpublish" | "stamp";

export const reportProgressionQueryKeys = {
  all: ["exam", "report-progression"] as const,
  classes: (yearId: string, termId: string, point: ProgressionPoint) => ["exam", "report-progression", "classes", yearId, termId, point] as const,
  classView: (classId: string, termId: string, point: ProgressionPoint, status: PublishStatusFilter) =>
    ["exam", "report-progression", "class", classId, termId, point, status] as const,
};

/** Each completeness section's share of the bar (see COMPLETENESS above). FLAGGED: proposed weights. */
export const PROGRESSION_SECTION_WEIGHTS: Record<ProgressionSectionKey, number> = { scores: 60, comments: 20, attendance: 10, traits: 10 };

/** Section-weighted percent, 0–100: sections with nothing required drop out (0 when none apply). */
export function weightedProgressionPercent(sections: ProgressionSection[]): number {
  const applicable = sections.filter((section) => section.required > 0);
  const weight = applicable.reduce((total, section) => total + section.weight, 0);
  if (weight === 0) return 0;
  const score = applicable.reduce((total, section) => total + section.weight * (section.filled / section.required), 0);
  return Math.round((score / weight) * 100);
}

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
