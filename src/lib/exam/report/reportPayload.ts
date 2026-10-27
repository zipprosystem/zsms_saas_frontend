import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";

/**
 * REPORT PAYLOAD — the one JSON shape every result template reads.
 *
 * How a report renders (keep this shape — it's what scales):
 *   the template is a SHARED STATIC file (public/template-previews/*,
 *   served as a cached asset, no per-tenant copies); each student's data
 *   is this small record, fetched at view time and poured into the
 *   template in the viewer's browser (window.__ZSMS_REPORT__). No server
 *   render for the on-screen view. The class PDF (batch) is the backend's
 *   async job — see generateClassReportPdf below.
 *
 * Every number comes from the results engine (resultsEngine.ts); nothing
 * is hardcoded and the templates do no arithmetic.
 *
 *   GET /api/v1/erp/results/:student_id/report?term_id=&variant=progress|full
 *     variant is optional — omitted, the backend picks it from what's been
 *     entered (Full once the term's second point has marks, else Progress).
 *     -> {
 *       meta: { template_id, variant: "progress"|"full",
 *               academic_year: { id, name },
 *               term: { id, name, number, start_date, end_date },
 *               points: [{ label, kind, max }],  kind: ca|exam (General) or
 *                                            progress|full (British, the
 *                                            year's points up to this one);
                                            max (addition): the point's
                                            share of the 100, null British
 *               pages: 1|2, generated_at,
 *               scope: "full"|"own_subjects",              (addition)
 *               assessment_mode: component_based|grade_based },  (addition)
 *       school:  { name, logo_url, address, motto },
 *       student: { full_name, admission_no, class, arm, gender, dob,
 *                  photo_url, resumption_date },
 *       attendance: { present, absent, total_days, time_school_opened },
 *       subjects: [{ name, teacher_name,
 *                    components: [{ label, score, max, kind }],
 *                      General: the score leaves (kind ca|exam).
 *                      British: the rating domains at the reporting point
 *                      (kind rating; score = the level, 1 = best;
 *                      max = levels on the scale).
 *                    ca, exam, total,        General aggregates (/100 total)
 *                    grade, grade_weight, gpa, remark, position,
 *                    cag, mtg, va,           British
 *                    comment,                subject comment (Full only)
 *                    redacted }],            (addition) true = not the
 *                                            caller's subject: every score
 *                                            field above is null
 *       aggregate: { grand_total, average, overall_grade, class_position,
 *                    gpa, cumulative_average,
 *                    out_of,                 students ranked (position "of")
 *                    subjects_counted, marks_obtainable, class_average },
 *                                            (last three: additions)
 *       traits: { psychomotor: [{ skill, rating, descriptor? }],
 *                 affective:   [{ skill, rating, descriptor? }],
 *                 engagement: { rating, descriptor? } | null,
 *                 learning_behaviour: { rating, descriptor? } | null,
 *                 boarding: { rating, comment? } | null,
 *                 form_tutor_comment,
                 rating_key: [{ rating, descriptor }] },  (addition: the
                                            school's trait rating scale, for
                                            the template's legend)
 *       remarks: { class_teacher, head_teacher },
 *       grade_key: [{ grade, min, max, remark, show_on_report,
                     gpa }]                   (gpa: addition, the band's GPA
                                            for a GPA-scale legend; null =
                                            not used / British)
 *     }
 *     Progress (mid-term) variant: CA only — the engine runs over the CA
 *     part of the structure, so total = CA scaled to 100 and grade,
 *     position and the aggregate follow from it; cumulative is null.
 *     British Progress reads the term's first (A) point only.
 *
 *   ROLE SCOPE (privacy, enforced by the backend, not just greyed out): a
 *   subject teacher gets their own subjects in full; every other subject
 *   comes back redacted (score fields null), and the aggregate is null
 *   (it's computed from the other subjects). Class teacher, sectional head
 *   and admin get the full payload.
 *   Errors: 422 VALIDATION_ERROR, 404 STUDENT_NOT_FOUND / TERM_NOT_FOUND /
 *   NOT_ENROLLED_FOR_TERM, 403 OUT_OF_SCOPE.
 *
 *   POST /api/v1/erp/report-cards/generate   body { class_arm_id, term_id, variant? }
 *     -> 202 { job_id|null, status: queued|processing|ready|failed|unavailable,
 *              download_url|null, message|null }
 *     The class PDF is rendered on the server, asynchronously and cached
 *     (backend piece, out of scope here). 403 FORBIDDEN for a subject
 *     teacher (their payload is partial).
 *
 * PROPOSED (Matthew / Muntajir). The "(addition)" fields go beyond the
 * agreed shape — each is something a template shows that the shape
 * didn't carry; confirm or drop.
 */

export const REPORT_VARIANTS = ["progress", "full"] as const;
export type ReportVariant = (typeof REPORT_VARIANTS)[number];

export type ReportPointKind = "ca" | "exam" | "progress" | "full";
export type ReportComponentKind = "ca" | "exam" | "rating";

export type ReportComponent = { label: string; score: number | null; max: number; kind: ReportComponentKind };

export type ReportSubject = {
  name: string;
  teacher_name: string | null;
  components: ReportComponent[];
  ca: number | null;
  exam: number | null;
  total: number | null;
  grade: string | null;
  grade_weight: number | null;
  gpa: number | null;
  remark: string | null;
  position: number | null;
  cag: string | null;
  mtg: string | null;
  va: number | null;
  comment: string | null;
  redacted: boolean;
};

export type ReportRating = { rating: number | null; descriptor?: string | null };
export type ReportTrait = { skill: string; rating: number | null; descriptor?: string | null };

export type ReportPayload = {
  meta: {
    template_id: string | null;
    variant: ReportVariant;
    academic_year: { id: string; name: string };
    term: { id: string; name: string; number: number; start_date: string | null; end_date: string | null };
    /** max: what the point's part of the score is out of (General CA 30 / Exam 70); null for British. */
    points: Array<{ label: string; kind: ReportPointKind; max: number | null }>;
    pages: 1 | 2;
    generated_at: string;
    scope: "full" | "own_subjects";
    assessment_mode: "component_based" | "grade_based";
  };
  school: { name: string; logo_url: string | null; address: string | null; motto: string | null };
  student: {
    full_name: string;
    admission_no: string;
    class: string;
    arm: string;
    gender: string | null;
    dob: string | null;
    photo_url: string | null;
    resumption_date: string | null;
  };
  attendance: { present: number | null; absent: number | null; total_days: number | null; time_school_opened: number | null };
  subjects: ReportSubject[];
  aggregate: {
    grand_total: number | null;
    average: number | null;
    overall_grade: string | null;
    class_position: number | null;
    gpa: number | null;
    cumulative_average: number | null;
    out_of: number | null;
    subjects_counted: number | null;
    marks_obtainable: number | null;
    class_average: number | null;
  };
  traits: {
    psychomotor: ReportTrait[];
    affective: ReportTrait[];
    engagement: ReportRating | null;
    learning_behaviour: ReportRating | null;
    boarding: { rating: number | null; comment?: string | null } | null;
    form_tutor_comment: string | null;
    rating_key: Array<{ rating: number; descriptor: string }>;
  };
  remarks: { class_teacher: string | null; head_teacher: string | null };
  grade_key: Array<{ grade: string; min: number | null; max: number | null; remark: string; show_on_report: boolean; gpa: number | null }>;
};

export const CLASS_PDF_STATUSES = ["queued", "processing", "ready", "failed", "unavailable"] as const;
export type ClassPdfStatus = (typeof CLASS_PDF_STATUSES)[number];
export type ClassPdfJob = { job_id: string | null; status: ClassPdfStatus; download_url: string | null; message: string | null };

export const reportQueryKeys = {
  payload: (studentId: string, termId: string, variant: ReportVariant | null) => ["exam", "results", "report", studentId, termId, variant] as const,
};

// ---------------------------------------------------------------------------
// Wire reader — structural check only. The payload goes into the template
// as data; the template tolerates missing fields (shows "—").
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function reportFromWire(value: unknown): ReportPayload | null {
  const r = rec(value);
  const meta = rec(r.meta);
  if (!Array.isArray(r.subjects) || !r.student || (meta.variant !== "progress" && meta.variant !== "full")) return null;
  return r as unknown as ReportPayload;
}

function classPdfFromWire(value: unknown): ClassPdfJob | null {
  const r = rec(value);
  const status = (CLASS_PDF_STATUSES as readonly string[]).includes(r.status as string) ? (r.status as ClassPdfStatus) : null;
  if (!status) return null;
  return {
    job_id: typeof r.job_id === "string" ? r.job_id : null,
    status,
    download_url: typeof r.download_url === "string" ? r.download_url : null,
    message: typeof r.message === "string" ? r.message : null,
  };
}

// ---------------------------------------------------------------------------
// Calls (examApi's transport: one USE_MOCK flag flips them)
// ---------------------------------------------------------------------------

export function getReportPayload(studentId: string, termId: string, variant: ReportVariant | null): Promise<CrudResult<ReportPayload>> {
  const query = new URLSearchParams({ term_id: termId });
  if (variant) query.set("variant", variant);
  return examSend("GET", `erp/results/${encodeURIComponent(studentId)}/report?${query}`, undefined, reportFromWire);
}

export function generateClassReportPdf(armId: string, termId: string): Promise<CrudResult<ClassPdfJob>> {
  return examSend("POST", "erp/report-cards/generate", { class_arm_id: armId, term_id: termId }, classPdfFromWire);
}
