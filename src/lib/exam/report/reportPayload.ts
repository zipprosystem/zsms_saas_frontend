import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import type { AttainmentDisplay } from "@/lib/exam/settings/examSettingsApi";
import type { ProgressDomain } from "@/lib/setup/assessmentConfiguration/progressGradesApi";

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
 *                                            progress|full (British);
                                            max (addition): the point's
                                            share of the 100, null British.
                                            British: the report's columns —
                                            every point of each term up to
                                            this one (Term 1 → 1A,1B; Term 3
                                            → 1A…3B), oldest first. A point
                                            after the report point (the
                                            term's B on a Progress report)
                                            is listed but blank in history.
 *               current_point_index,    (addition) British: index in
 *                                            points of the point this
 *                                            report is for; null General
 *               pages, generated_at,     pages: the template's page count
 *                                            for this variant (British:
 *                                            Full 4, Progress 2 — no cover
 *                                            or subject comments)

 *               scope: "full"|"own_subjects",              (addition)
 *               assessment_mode: component_based|grade_based,    (addition)
 *               attainment_display: "weight"|"label" },          (addition)
 *                 the school's exam setting (GET erp/exam-settings):
 *                 British templates show each attainment grade (the
 *                 points, MTG, CAG) as its weight or its label — look the
 *                 weight up in grade_key[].weight. Same setting the
 *                 Progression broadsheet and Academic Report read.
 *       school:  { name, logo_url, address, phone, email, website,
 *                  motto, mission_statement },
 *                  Per-mode header (spec §7.27): General templates print
 *                  name / logo / motto / address / phone / email /
 *                  website in their header, each line hidden when null;
 *                  British prints its cover instead.
 *                  Every field resolves: the class's School Type
 *                  override (Setup › School Types) → the Settings value
 *                  → null (the template hides that line / slot).
 *                  name: School Type report_display_name (addition — the
 *                  school name printed on that type's reports, so two
 *                  School Types in one school print different names) →
 *                  Settings identity.school_name. NEVER the School Type's
 *                  own name ("Junior Secondary", "IGCSE").
 *                  logo_url: School Type report logo → Settings school
 *                  logo (branding.school_logo_url, else identity.logo_url).
 *                  motto (= slogan; one field) / mission_statement
 *                  (additions): School Type → Settings identity.motto /
 *                  identity.mission_statement (additions).
 *                  address / phone / email / website (phone, email,
 *                  website are additions): Settings only
 *                  (regional.address, identity.phone / email / website).
 *       student: { full_name, admission_no, class, arm, gender, dob,
 *                  photo_url, resumption_date },
 *                  from the student record: gender "male"|"female",
 *                  dob = date_of_birth (YYYY-MM-DD), photo_url = the
 *                  served URL of photo_file_id (null = no photo).
 *       attendance: { present, absent, total_days, time_school_opened },
 *       subjects: [{ name, teacher_name,
 *                    components: [{ label, score, max, kind }],
 *                      General: the score leaves (kind ca|exam).
 *                      British: the rating domains at the reporting point
 *                      (kind rating; score = the British Progress
 *                      Grade's value — alphanumeric text, e.g. "1";
 *                      max = levels on the scale).
 *                    ca, exam, total,        General aggregates (/100 total)
 *                    grade, grade_weight, gpa, remark, position,
 *                    cag, mtg, va,           British
 *                    comment,                subject comment (Full only)
 *                    redacted,               (addition) true = not the
 *                                            caller's subject: every score
 *                                            field is null
 *                    units,                  (addition) Class Subjects' unit
 *                                            (null = not set)
 *                    class_highest, class_lowest, class_average,
 *                                            (addition) General: the subject
 *                                            in this arm for this report —
 *                                            highest / lowest over students
 *                                            with a total; average = Σ
 *                                            totals ÷ students enrolled in
 *                                            the subject (blank = 0, NE
 *                                            excluded). Same rule as the
 *                                            Broad Sheet foot.
 *                    cumulative_average,     (addition) General, Full only:
 *                                            the subject's cumulative
 *                                            average (results engine)
 *                    earlier_terms: [{ number, name, total }],
 *                                            (addition) General: this
 *                                            subject's full-term total in
 *                                            each earlier term of the year
 *                                            (null = no total / not then
 *                                            enrolled)
 *                    history: [{ label, attainment, ratings, grade_book }] }],
 *                                            (addition) British: one entry
 *                                            per meta.points item — the
 *                                            attainment code and the rating
 *                                            domain levels (components'
 *                                            order) entered at that point;
 *                                            grade_book = that point's Grade
 *                                            Book /100 (null = not entered
 *                                            or the point's show_grade_book
 *                                            is off)
 *       aggregate: { grand_total, average, overall_grade, class_position,
 *                    gpa, cumulative_average,
 *                    out_of,                 students ranked (position "of")
 *                    subjects_counted, marks_obtainable, class_average,
 *                    earlier_terms: [{ number, name, grand_total,
 *                                      average, subjects_counted }],
 *                    va_average },           (addition) British: mean of
 *                                            the shown subjects' va (CAG −
 *                                            MTG in grade weights, from the
 *                                            results engine), 2 dp; null =
 *                                            no subject has a VA, General,
 *                                            or own_subjects scope
 *                                            (last four: additions;
 *                                            earlier_terms = the student's
 *                                            full-term figures in each
 *                                            earlier term of the year)
 *       traits: { psychomotor: [{ skill, rating, descriptor? }],
 *                 affective:   [{ skill, rating, descriptor? }],
 *                   the class's School Type list (Setup › Psychomotor
 *                   Skills / Affective Domain) in its sort_order — the
 *                   template prints them in array order.
 *                   rating = the General Progress Grade's value
 *                   (alphanumeric text, e.g. "A"); descriptor = its
 *                   name (General levels have no descriptors). Both
 *                   null when not rated OR the level is hidden in
 *                   reports (hide_in_report).
 *                 engagement: { rating, descriptor? } | null,
 *                 learning_behaviour: { rating, descriptor? } | null,
 *                 boarding: { rating, comment? } | null,
 *                 form_tutor_comment,
 *                 rating_key: [{ rating, descriptor, descriptors }] },
 *                   (addition) the Progress Grades level key for the
 *                   template's legend — General classes: the General
 *                   scale; British: the British scale. Visible levels
 *                   only, best first (ascending value: 1 / A = best).
 *                   rating = value (text), descriptor = name,
 *                   descriptors = { <domain>: text } — British only
 *                   (engagement, learning_behaviour, boarding; missing
 *                   = none); General levels send {}.
 *                 Templates rank a rating by its position in rating_key
 *                 (first = best), never by its value as a number.
 *                 British subjects[].components (rating) and history
 *                 ratings: a level hidden in reports comes back null.
 *       remarks: { class_teacher, head_teacher,
 *                  form_tutor: { name, comment } | null,       (addition)
 *                  boarding_house: { name, comment } | null }, (addition)
 *                  role-keyed term remarks. form_tutor = the arm's
 *                  class teacher (British form tutor): their name and
 *                  their term remark (same text as class_teacher).
 *                  boarding_house = the boarding house's term comment
 *                  (name = the house; Report Progression's student-wise
 *                  entry, not built — null until then). The British
 *                  results page shows form_tutor on Full, boarding_house
 *                  on Progress.
 *       grade_key: [{ grade, min, max, remark, show_on_report,
                     gpa, weight }]           (gpa: addition, the band's GPA
                                            for a GPA-scale legend; null =
                                            not used / British.
                                            weight: addition, British — the
                                            level's weight (ScaleLevel
                                            .weight, else position from the
                                            bottom); null for General.
                                            British min / max /
                                            show_on_report come from the
                                            class's attainment bands)
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

/** score: a number for ca / exam; for kind "rating" the Progress Grade's value (text). */
export type ReportComponent = { label: string; score: number | string | null; max: number; kind: ReportComponentKind };

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
  units: number | null;
  class_highest: number | null;
  class_lowest: number | null;
  class_average: number | null;
  cumulative_average: number | null;
  earlier_terms: Array<{ number: number; name: string; total: number | null }>;
  history: Array<{ label: string; attainment: string | null; ratings: Array<string | null>; grade_book: number | null }>;
};

export type ReportRating = { rating: string | null; descriptor?: string | null };
export type ReportTrait = { skill: string; rating: string | null; descriptor?: string | null };

export type ReportPayload = {
  meta: {
    template_id: string | null;
    variant: ReportVariant;
    academic_year: { id: string; name: string };
    term: { id: string; name: string; number: number; start_date: string | null; end_date: string | null };
    /** max: what the point's part of the score is out of (General CA 30 / Exam 70); null for British. British: every point of the terms reached. */
    points: Array<{ label: string; kind: ReportPointKind; max: number | null }>;
    /** British: index in points of the point this report is for (later points are blank); null for General. */
    current_point_index: number | null;
    pages: number;
    generated_at: string;
    scope: "full" | "own_subjects";
    assessment_mode: "component_based" | "grade_based";
    attainment_display: AttainmentDisplay;
  };
  school: {
    name: string;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    motto: string | null;
    mission_statement: string | null;
  };
  student: {
    full_name: string;
    admission_no: string;
    class: string;
    arm: string;
    gender: "male" | "female" | null;
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
    earlier_terms: Array<{ number: number; name: string; grand_total: number | null; average: number | null; subjects_counted: number | null }>;
    /** British: mean of the shown subjects' VA (CAG − MTG, grade weights); null = none / General / own-subjects scope. */
    va_average: number | null;
  };
  traits: {
    psychomotor: ReportTrait[];
    affective: ReportTrait[];
    engagement: ReportRating | null;
    learning_behaviour: ReportRating | null;
    boarding: { rating: string | null; comment?: string | null } | null;
    form_tutor_comment: string | null;
    rating_key: Array<{ rating: string; descriptor: string; descriptors: Partial<Record<ProgressDomain, string>> }>;
  };
  remarks: {
    class_teacher: string | null;
    head_teacher: string | null;
    /** The arm's class teacher as British form tutor: name + their term remark. */
    form_tutor: { name: string | null; comment: string | null } | null;
    /** The boarding house's term comment (name = the house); null = not entered. */
    boarding_house: { name: string | null; comment: string | null } | null;
  };
  grade_key: Array<{ grade: string; min: number | null; max: number | null; remark: string; show_on_report: boolean; gpa: number | null; weight: number | null }>;
};

export const CLASS_PDF_STATUSES = ["queued", "processing", "ready", "failed", "unavailable"] as const;
export type ClassPdfStatus = (typeof CLASS_PDF_STATUSES)[number];
export type ClassPdfJob = { job_id: string | null; status: ClassPdfStatus; download_url: string | null; message: string | null };

export const reportQueryKeys = {
  /** Every report payload — invalidated when a school setting the payload carries (attainment_display) changes. */
  all: ["exam", "results", "report"] as const,
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
