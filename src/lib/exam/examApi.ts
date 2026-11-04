import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { realTransport, type HttpMethod, type WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { examMockTransport } from "@/lib/exam/mock/examMockBackend";
import type { AssessmentMode } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { SUBJECT_RATING_DOMAIN_KEYS } from "@/lib/exam/examTypes";
import type {
  ComponentScores,
  Exam,
  ExamEntryOptions,
  ExamKind,
  ExamScheduleEntry,
  GradeBasedStructure,
  GradeBookRef,
  GradeMarkRow,
  GradeScale,
  GradeScores,
  MarksSheet,
  RatingScale,
  SaveGradeMarksInput,
  SaveMarksInput,
  ReportVariant,
  ScaleLevel,
  SubjectMarkRow,
} from "@/lib/exam/examTypes";

/**
 * Exam — Stage 1b (Manage Exam Result: raw subject-wise marks entry).
 * MOCK until the backend ships; flip USE_MOCK to swap (the mock answers at
 * the HTTP level, so nothing above the transport changes). With the real
 * transport and the local dev-auth bypass on, every call returns
 * devBypassUnavailable and the screen shows its notice instead.
 *
 * PROPOSED REST contract — aligned to Exam-Backend-Spec §2.4 + §4 (as
 * relayed by Matthew, 2026-10-23); names not in the spec are marked (new):
 *
 *   subject_mark (raw entry, one per exam × student × subject):
 *     exam_id, student_id, subject_id, class_arm_id, academic_year_id,
 *     component_scores jsonb  { <component id | subfield id>: number|null }
 *                             keys = the Stage 1a structure's leaves for
 *                             the exam's kind (CA vs Exam components)
 *     present bool|null       attendance for this exam
 *     entered_by_staff_id, mark_completed bool, subject_remark
 *     (British adds current_attainment — Stage 1b grade_based, not here.)
 *
 *   GET /api/v1/erp/exams/:id/marks?subject_id=&class_arm_id=
 *     -> { exam, subject_id, class_arm_id,
 *          assessment_structure_id (new: the structure in force for that
 *            class/subject, resolved server-side; null = none),
 *          entry_open (new: false once the cutoff has passed),
 *          items: [{ student_id, student_name, admission_no, seat_no,
 *                    component_scores, present, mark_completed,
 *                    subject_remark, entered_by_staff_id, updated_at }] }
 *     items = the subject's enrolled students for that arm (electives:
 *     only students taking it), each with their current mark (or empty).
 *     403 OUT_OF_SCOPE outside the caller's effective_scope.
 *
 *   PUT /api/v1/erp/exams/:id/marks   (batch — save the grid)
 *     body { subject_id, class_arm_id,
 *            rows: [{ student_id, component_scores, present,
 *                     mark_completed, subject_remark }] }
 *     Upserts the given rows; returns the same shape as GET.
 *     422 VALIDATION_ERROR  score > field max / < 0, unknown field key,
 *                           student not enrolled, remark > 500 chars
 *                           (message led by the path, e.g.
 *                           "rows.3.component_scores.<id>: …")
 *     403 ENTRY_CLOSED      past the exam's cutoff
 *     403 OUT_OF_SCOPE      outside effective_scope
 *     409 NO_ASSESSMENT_STRUCTURE  nothing in force for the class
 *
 *   EXAM LIST (Academics › Exam › List). Exams are per CLASS + term; see
 *   the Exam type (examTypes.ts) for every field. PROPOSED shapes:
 *   GET /api/v1/erp/exams?academic_year_id=&term_id=&class_id=&status=
 *     -> { items: [Exam] }   class_id (new) and status=active|draft (new)
 *     are optional filters. The entry screens ask for class_id + status=
 *     active: only ACTIVE exams are scoreable (a draft is listed on the
 *     Exam List but can't be scored). Order: CA before Exam, then the
 *     assessment's component order, then creation.
 *     Auto-create (no input needed): when a term exists, each class gets
 *     its exams with defaults —
 *       component_based: one exam per component of the class's structure
 *         (CA 1, CA 2, Exam… — named after the component, kind/category
 *         = the component's, component_ids = [that component]);
 *       grade_based: 1A (category ca, report_variant progress) and 1B
 *         (category exam, report_variant full).
 *     Auto-created exams are active, flags on, titles/dates null.
 *   GET /api/v1/erp/exams/class-cards?academic_year_id=&term_id=&class_id=
 *       &category=&q=&page=&limit=           (new — the List page's cards)
 *     -> { items: [{ class_id, class_name, assessment_mode,
 *                    school_type_id|null, school_type_name|null,
 *                    counts: { ca: { active, total }, exam: { active, total } },
 *                    exams: [Exam] }], total, page, limit, has_more }
 *     One card per class (q matches class name or term name); term_id /
 *     category narrow the exams on each card. Admin-only.
 *   CREATE / EDIT (the Create Exam wizard; admin-only):
 *   GET  /api/v1/erp/exams/form-options?class_id=&term_id=
 *     -> { class_id, assessment_mode, components: [{ id, name, category,
 *          max }], taken_component_ids, subjects: [{ id, name, elective }] }
 *          the class's assessment components (General) and those already
 *          covered by an exam that term — a component can't be covered
 *          twice; subjects = every subject the class takes (core +
 *          elective, across its arms, from subject enrolment) for the
 *          exam timetable.
 *   POST /api/v1/erp/exams  body ExamInput -> the exam, status "draft"
 *   PUT  /api/v1/erp/exams/:id  body ExamInput -> the exam (status kept)
 *     ExamInput: { category, academic_year_id, term_id, class_id, name,
 *       result_title|null, start_date|null, end_date|null,
 *       duration_minutes|null, report_date|null,
 *       report_variant (grade_based: required; component_based: null),
 *       component_ids (component_based: exactly one id of the class's
 *         structure, of the chosen category; grade_based: null),
 *       show_grade_book, show_va (grade_based; component_based keeps true) }
 *     On PUT the identity fields (academic_year_id, term_id, class_id,
 *     category, component_ids) can't change.
 *   PUT  /api/v1/erp/exams/:id/schedule  body { schedule: [{ subject_id,
 *       date, start_time, end_time }] } -> the exam (status kept).
 *     The EXAM TIMETABLE (Step 2; optional; [] clears it): when each
 *     subject's paper is sat — CLASS-wise (all arms). The wizard lists
 *     every subject of the class (form-options.subjects) and can Auto
 *     Generate (client-side) from the exam's duration_minutes, a date
 *     range and a daily window. Rules: subject_id one of the class's
 *     subjects, once each; date YYYY-MM-DD within start_date..end_date
 *     when set; times HH:MM, end_time > start_time; all three required.
 *     Errors 422 VALIDATION_ERROR "schedule: …".
 *     Every exam read carries schedule (auto exams: []).
 *   POST /api/v1/erp/exams/:id/complete   (Step 2 done; schedule optional)
 *     -> the exam, status "active" (scoreable from now on).
 *   Errors: 422 VALIDATION_ERROR (message led by the field, e.g.
 *     "name: …"; name is unique per class + term, end_date ≥ start_date,
 *     duration_minutes 5–600), 422 COMPONENT_TAKEN (field component_ids),
 *     422 IDENTITY_LOCKED, 404 EXAM_NOT_FOUND, 403 FORBIDDEN.
 *   marks / grade-book on a draft exam -> 409 EXAM_NOT_SCOREABLE; on
 *   another class's exam -> 409 EXAM_CLASS_MISMATCH.
 *   GET /api/v1/erp/exams/entry-options?academic_year_id=
 *     -> { academic_year_id, years, terms, classes[{id,name,arms[]}],
 *          subjects[{class_arm_id, subject_id, subject_name}], full_scope }
 *     The class-arm/subject pairs the CALLER may enter marks for
 *     (effective_scope: admin = all; teacher = their assignments).
 *
 * GRADE-BASED (Stage 1c, British — Academic Report). Same two endpoints;
 * the class's resolved structure decides the shape (assessment_mode):
 *
 *   GET  .../marks  -> { assessment_mode: "grade_based", exam, subject_id,
 *          class_arm_id, assessment_structure_id, entry_open,
 *          auto_fill_attainment,   (addition) the class's "auto-fill
 *            attainment from Grade Book" setting (examSettingsApi.ts)
 *          structure: { id, name,
 *            attainment: { id, name, grade_scale_id },
 *            rating_domains: [{ id, key, name, rating_scale_id }] } | null,
 *          grade_scales: [{ id, name, grades: [{ code, label, weight }] }],  weight = the grade's numeric value (see examSettingsApi)
 *          rating_scales: [{ id, name, levels: [{ code, label, value }] }],
 *            the rating domains' scale = the BRITISH Progress Grades (Setup ›
 *            Progress Grades): code = progress_grade_id, label = its name,
 *            value = its value. A rating domain's component_score is that
 *            progress_grade_id (same as the traits entry); 422 for an id
 *            that isn't a British level.
 *          items: [{ …same row fields…, component_scores: { <leaf id>: code|null },
 *                    mtg,             read-only: the single target grade
 *                    grade_book: { total, grade } | null,
 *                      (changed) THIS point's Grade Book — total /100 from
 *                      the Grade Book entry page and its grade on the
 *                      class's attainment scale (null grade = no score
 *                      range matches). null = not entered, or the point's
 *                      show_grade_book is off. Replaces the old seeded
 *                      grade_book grade reference.
 *                    attainment_auto }] }  (addition) true = the
 *                      attainment in component_scores was auto-filled from
 *                      the Grade Book (auto-fill ON, nothing entered) —
 *                      not a saved entry. Sending null for it keeps it
 *                      auto-filled; sending a code overrides it.
 *     component_scores carry the attainment grade + one rating per domain;
 *     subject_remark is the subject comment — a FULL report point only:
 *     on a "progress" point it is hidden entirely (GET answers "", PUT
 *     ignores it and stores ""). Score sheets answer with
 *     assessment_mode: "component_based" and the shape above.
 *   PUT  .../marks  same body as the score sheet, component_scores values
 *     are codes: 422 when a key isn't a leaf of the resolved structure or a
 *     code isn't on that leaf's scale.
 *   entry-options: each class carries assessment_mode (proposed), so each
 *     screen lists only its own classes.
 *   Rating domains on this subject-wise grid are Engagement + Learning
 *     Behaviour only; student-wise domains (Boarding Commitment, Form Tutor,
 *     House) are Report Progression (Stage 3) — the reader drops any others.
 *   Present / mark_completed: stored as sent. The screens auto-tick them
 *     (Present once CAG is in; completed once the variant's required fields
 *     are in: progress = CAG + Engagement + Learning Behaviour, full = those
 *     + Comment) — UI behaviour, no server derivation.
 *
 * Reconcile with Muntajir (Matthew, 2026-10-23): attainment + ratings in
 * component_scores, comment as subject_remark, MTG + Grade Book as
 * per-student references on the marks GET.
 *
 * Stage 1b/1c are raw entry only: no totals, grades, VA, averages or
 * positions are stored (Stage 2). Totals on screen are live display sums.
 */
const USE_MOCK = true;

const transport = USE_MOCK ? examMockTransport : realTransport;

/** Whether the screen is talking to the mock — it shows the dev-only "acting as" picker only then. */
export const EXAM_USES_MOCK = USE_MOCK;

export const examQueryKeys = {
  all: ["exam"] as const,
  entryOptions: (yearId: string | null) => ["exam", "entryOptions", yearId ?? "current"] as const,
  exams: (yearId: string, termId: string, classId: string) => ["exam", "exams", yearId, termId, classId] as const,
  classCards: (input: ExamClassCardsQuery) => ["exam", "exams", "classCards", input] as const,
  formOptions: (classId: string, termId: string) => ["exam", "exams", "formOptions", classId, termId] as const,
  marks: (examId: string, subjectId: string, armId: string) => ["exam", "marks", examId, subjectId, armId] as const,
};

// ---------------------------------------------------------------------------
// Transport + error mapping
// ---------------------------------------------------------------------------

function toResult<T>(status: number, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);
  const text = message ?? undefined;
  if (status === 403 || code === "FORBIDDEN" || code === "OUT_OF_SCOPE" || code === "ENTRY_CLOSED") {
    return { ok: false, kind: "forbidden", message: text };
  }
  if (status === 404 || status === 409) return { ok: false, kind: "conflict", message: text };
  // 422 stays a "server" result carrying its status (never retried) and the backend's message for the banner.
  return { ok: false, kind: "server", message: text, status };
}

/** Shared with resultsApi.ts (Stage 2a) — same transport, USE_MOCK flag and dev-bypass guard. */
export async function examSend<T>(method: HttpMethod, path: string, payload: unknown, onSuccess: (body: unknown) => T | null): Promise<CrudResult<T>> {
  return send(method, path, payload, onSuccess);
}

async function send<T>(method: HttpMethod, path: string, payload: unknown, onSuccess: (body: unknown) => T | null): Promise<CrudResult<T>> {
  if (!USE_MOCK && DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };
  let response: WireResponse;
  try {
    response = await transport(method, path, payload);
  } catch {
    return { ok: false, kind: "network" };
  }
  if (response.status < 200 || response.status >= 300) return toResult<T>(response.status, response.body);
  const data = onSuccess((response.body as { data?: unknown } | null)?.data);
  return data === null ? { ok: false, kind: "server" } : { ok: true, data };
}

// ---------------------------------------------------------------------------
// Tolerant wire readers
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

function optText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function scheduleEntryFromWire(value: unknown): ExamScheduleEntry {
  const r = rec(value);
  return { subject_id: s(r.subject_id), date: optText(r.date), start_time: optText(r.start_time), end_time: optText(r.end_time) };
}

export function examFromWire(value: unknown): Exam {
  const r = rec(value);
  return {
    id: s(r.id),
    name: s(r.name),
    assessment_mode: r.assessment_mode === "grade_based" ? "grade_based" : "component_based",
    kind: r.kind === "exam" ? "exam" : r.kind === "ca" ? "ca" : null,
    category: r.category === "ca" ? "ca" : "exam",
    report_variant: r.report_variant === "progress" || r.report_variant === "full" ? (r.report_variant as ReportVariant) : null,
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    class_id: s(r.class_id),
    component_ids: Array.isArray(r.component_ids) ? r.component_ids.filter((id): id is string => typeof id === "string") : null,
    result_title: optText(r.result_title),
    start_date: optText(r.start_date),
    end_date: optText(r.end_date),
    duration_minutes: typeof r.duration_minutes === "number" && Number.isFinite(r.duration_minutes) ? r.duration_minutes : null,
    report_date: optText(r.report_date),
    entry_closes_on: optText(r.entry_closes_on),
    status: r.status === "draft" ? "draft" : "active",
    schedule: arr(r.schedule).map(scheduleEntryFromWire),
    is_auto: r.is_auto === true,
    // Default shown; only an explicit false hides the point's Grade Book.
    show_grade_book: r.show_grade_book !== false,
    show_va: r.show_va !== false,
  };
}

function scoresFromWire(value: unknown): ComponentScores {
  const scores: ComponentScores = {};
  for (const [key, score] of Object.entries(rec(value))) {
    scores[key] = typeof score === "number" && Number.isFinite(score) ? score : null;
  }
  return scores;
}

function markRowFromWire(value: unknown): SubjectMarkRow {
  const r = rec(value);
  return {
    student_id: s(r.student_id),
    student_name: s(r.student_name),
    admission_no: s(r.admission_no),
    seat_no: s(r.seat_no),
    component_scores: scoresFromWire(r.component_scores),
    present: typeof r.present === "boolean" ? r.present : null,
    mark_completed: r.mark_completed === true,
    subject_remark: s(r.subject_remark),
    entered_by_staff_id: typeof r.entered_by_staff_id === "string" ? r.entered_by_staff_id : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

function levelsFromWire(value: unknown): ScaleLevel[] {
  return arr(value)
    .map((item) => {
      const x = rec(item);
      const level: ScaleLevel = { code: typeof x.code === "string" ? x.code : String(x.code ?? ""), label: s(x.label) };
      if (typeof x.weight === "number" && Number.isFinite(x.weight)) level.weight = x.weight;
      // A rating level's value is alphanumeric text (A, 1…); a number is read as its digits.
      if (typeof x.value === "string" && x.value.trim()) level.value = x.value.trim();
      else if (typeof x.value === "number" && Number.isFinite(x.value)) level.value = String(x.value);
      return level;
    })
    .filter((level) => level.code);
}

function gradeScoresFromWire(value: unknown): GradeScores {
  const scores: GradeScores = {};
  for (const [key, code] of Object.entries(rec(value))) {
    scores[key] = typeof code === "string" && code ? code : typeof code === "number" ? String(code) : null;
  }
  return scores;
}

function gradeStructureFromWire(value: unknown): GradeBasedStructure | null {
  const r = rec(value);
  const attainment = rec(r.attainment);
  if (!s(r.id) || !s(attainment.id)) return null;
  return {
    id: s(r.id),
    name: s(r.name),
    attainment: { id: s(attainment.id), name: s(attainment.name), grade_scale_id: s(attainment.grade_scale_id) },
    rating_domains: arr(r.rating_domains)
      .map((item) => {
        const x = rec(item);
        return { id: s(x.id), key: s(x.key), name: s(x.name), rating_scale_id: s(x.rating_scale_id) };
      })
      // Subject-wise domains only — anything student-wise belongs to Report Progression.
      .filter((domain) => domain.id && (SUBJECT_RATING_DOMAIN_KEYS as readonly string[]).includes(domain.key)),
  };
}

function gradeBookRefFromWire(value: unknown): GradeBookRef | null {
  const r = rec(value);
  if (typeof r.total !== "number" || !Number.isFinite(r.total)) return null;
  return { total: r.total, grade: typeof r.grade === "string" && r.grade ? r.grade : null };
}

function gradeRowFromWire(value: unknown): GradeMarkRow {
  const r = rec(value);
  const code = (field: unknown) => (typeof field === "string" && field ? field : null);
  return {
    ...markRowFromWire(value),
    component_scores: gradeScoresFromWire(r.component_scores),
    mtg: code(r.mtg),
    grade_book: gradeBookRefFromWire(r.grade_book),
    attainment_auto: r.attainment_auto === true,
  };
}

function sheetFromWire(value: unknown): MarksSheet | null {
  const r = rec(value);
  if (!r.exam) return null;
  const common = {
    exam: examFromWire(r.exam),
    subject_id: s(r.subject_id),
    class_arm_id: s(r.class_arm_id),
    assessment_structure_id: typeof r.assessment_structure_id === "string" && r.assessment_structure_id ? r.assessment_structure_id : null,
    entry_open: r.entry_open !== false,
  };
  if (r.assessment_mode === "grade_based") {
    return {
      ...common,
      assessment_mode: "grade_based",
      auto_fill_attainment: r.auto_fill_attainment === true,
      structure: gradeStructureFromWire(r.structure),
      grade_scales: arr(r.grade_scales).map((item): GradeScale => ({ id: s(rec(item).id), name: s(rec(item).name), grades: levelsFromWire(rec(item).grades) })),
      rating_scales: arr(r.rating_scales).map((item): RatingScale => ({ id: s(rec(item).id), name: s(rec(item).name), levels: levelsFromWire(rec(item).levels) })),
      items: arr(r.items).map(gradeRowFromWire),
    };
  }
  // Absent mode = the Stage 1b score sheet (backwards compatible).
  return {
    assessment_mode: "component_based",
    exam: examFromWire(r.exam),
    subject_id: s(r.subject_id),
    class_arm_id: s(r.class_arm_id),
    assessment_structure_id: typeof r.assessment_structure_id === "string" && r.assessment_structure_id ? r.assessment_structure_id : null,
    entry_open: r.entry_open !== false,
    items: arr(r.items).map(markRowFromWire),
  };
}

function optionsFromWire(value: unknown): ExamEntryOptions | null {
  const r = rec(value);
  if (!Array.isArray(r.years)) return null;
  const idName = (item: unknown) => {
    const x = rec(item);
    return { id: s(x.id), name: s(x.name) };
  };
  return {
    academic_year_id: s(r.academic_year_id),
    years: arr(r.years).map((item) => ({ ...idName(item), is_current: rec(item).is_current === true })),
    terms: arr(r.terms).map(idName),
    classes: arr(r.classes).map((item) => {
      const mode = rec(item).assessment_mode;
      return {
        ...idName(item),
        arms: arr(rec(item).arms).map(idName),
        assessment_mode: mode === "component_based" || mode === "grade_based" ? mode : null,
      };
    }),
    subjects: arr(r.subjects).map((item) => {
      const x = rec(item);
      return { class_arm_id: s(x.class_arm_id), subject_id: s(x.subject_id), subject_name: s(x.subject_name) };
    }),
    full_scope: r.full_scope === true,
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function getEntryOptions(yearId: string | null): Promise<CrudResult<ExamEntryOptions>> {
  const query = yearId ? `?academic_year_id=${encodeURIComponent(yearId)}` : "";
  return send("GET", `erp/exams/entry-options${query}`, undefined, optionsFromWire);
}

/** The class's ACTIVE exams for a term — what the entry screens may score. */
export function listExams(yearId: string, termId: string, classId: string): Promise<CrudResult<Exam[]>> {
  const query = new URLSearchParams({ academic_year_id: yearId, term_id: termId, class_id: classId, status: "active" });
  return send("GET", `erp/exams?${query}`, undefined, (data) => arr(rec(data).items).map(examFromWire));
}

export type ExamCategoryCount = { active: number; total: number };

/** One class card on the Exam List page. */
export type ExamClassCard = {
  class_id: string;
  class_name: string;
  assessment_mode: AssessmentMode;
  school_type_id: string | null;
  school_type_name: string | null;
  counts: Record<ExamKind, ExamCategoryCount>;
  exams: Exam[];
};

export type ExamClassCardsQuery = { yearId: string; termId: string; classId: string; category: ExamKind | ""; q: string; page: number; limit: number };

export type ExamClassCardsPage = { items: ExamClassCard[]; total: number; page: number; limit: number; has_more: boolean };

function countFromWire(value: unknown): ExamCategoryCount {
  const r = rec(value);
  return { active: typeof r.active === "number" ? r.active : 0, total: typeof r.total === "number" ? r.total : 0 };
}

function classCardFromWire(value: unknown): ExamClassCard | null {
  const r = rec(value);
  if (!s(r.class_id)) return null;
  const counts = rec(r.counts);
  return {
    class_id: s(r.class_id),
    class_name: s(r.class_name),
    assessment_mode: r.assessment_mode === "grade_based" ? "grade_based" : "component_based",
    school_type_id: optText(r.school_type_id),
    school_type_name: optText(r.school_type_name),
    counts: { ca: countFromWire(counts.ca), exam: countFromWire(counts.exam) },
    exams: arr(r.exams).map(examFromWire),
  };
}

export type ExamInput = Pick<
  Exam,
  | "category"
  | "academic_year_id"
  | "term_id"
  | "class_id"
  | "name"
  | "result_title"
  | "start_date"
  | "end_date"
  | "duration_minutes"
  | "report_date"
  | "report_variant"
  | "component_ids"
  | "show_grade_book"
  | "show_va"
>;

export type ExamFormComponent = { id: string; name: string; category: ExamKind; max: number };

export type ExamFormOptions = {
  class_id: string;
  assessment_mode: AssessmentMode;
  components: ExamFormComponent[];
  taken_component_ids: string[];
  /** Every subject the class takes (core + elective, all arms) — the exam timetable's rows. */
  subjects: ExamFormSubject[];
};

export type ExamFormSubject = { id: string; name: string; elective: boolean };

export function getExamFormOptions(classId: string, termId: string): Promise<CrudResult<ExamFormOptions>> {
  const query = new URLSearchParams({ class_id: classId, term_id: termId });
  return send("GET", `erp/exams/form-options?${query}`, undefined, (data) => {
    const r = rec(data);
    return {
      class_id: s(r.class_id),
      assessment_mode: r.assessment_mode === "grade_based" ? "grade_based" : "component_based",
      components: arr(r.components).map((item) => {
        const c = rec(item);
        return { id: s(c.id), name: s(c.name), category: c.category === "ca" ? "ca" : "exam", max: typeof c.max === "number" ? c.max : 0 };
      }),
      taken_component_ids: arr(r.taken_component_ids).filter((id): id is string => typeof id === "string"),
      subjects: arr(r.subjects).map((item) => {
        const c = rec(item);
        return { id: s(c.id), name: s(c.name), elective: c.elective === true };
      }),
    };
  });
}

export function createExam(input: ExamInput): Promise<CrudResult<Exam>> {
  return send("POST", "erp/exams", input, examFromWire);
}

export function updateExam(examId: string, input: ExamInput): Promise<CrudResult<Exam>> {
  return send("PUT", `erp/exams/${encodeURIComponent(examId)}`, input, examFromWire);
}

/** Step 2: replace the exam's schedule (status kept). */
export function saveExamSchedule(examId: string, schedule: ExamScheduleEntry[]): Promise<CrudResult<Exam>> {
  return send("PUT", `erp/exams/${encodeURIComponent(examId)}/schedule`, { schedule }, examFromWire);
}

/** Step 2 done — the exam becomes active (scoreable). */
export function completeExam(examId: string): Promise<CrudResult<Exam>> {
  return send("POST", `erp/exams/${encodeURIComponent(examId)}/complete`, {}, examFromWire);
}

/** The Exam List page: one card per class with its exams. */
export function listExamClassCards(input: ExamClassCardsQuery): Promise<CrudResult<ExamClassCardsPage>> {
  const query = new URLSearchParams({ academic_year_id: input.yearId, page: String(input.page), limit: String(input.limit) });
  if (input.termId) query.set("term_id", input.termId);
  if (input.classId) query.set("class_id", input.classId);
  if (input.category) query.set("category", input.category);
  if (input.q.trim()) query.set("q", input.q.trim());
  return send("GET", `erp/exams/class-cards?${query}`, undefined, (data) => {
    const r = rec(data);
    return {
      items: arr(r.items).map(classCardFromWire).filter((card): card is ExamClassCard => card !== null),
      total: typeof r.total === "number" ? r.total : 0,
      page: typeof r.page === "number" ? r.page : input.page,
      limit: typeof r.limit === "number" ? r.limit : input.limit,
      has_more: r.has_more === true,
    };
  });
}

export function getMarks(examId: string, subjectId: string, armId: string): Promise<CrudResult<MarksSheet>> {
  const query = new URLSearchParams({ subject_id: subjectId, class_arm_id: armId });
  return send("GET", `erp/exams/${encodeURIComponent(examId)}/marks?${query}`, undefined, sheetFromWire);
}

export function saveMarks(examId: string, input: SaveMarksInput | SaveGradeMarksInput): Promise<CrudResult<MarksSheet>> {
  return send("PUT", `erp/exams/${encodeURIComponent(examId)}/marks`, input, sheetFromWire);
}
