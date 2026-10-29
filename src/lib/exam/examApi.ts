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
 *   Filter support (new — confirm or replace with existing endpoints):
 *   GET /api/v1/erp/exams?academic_year_id=&term_id=&assessment_mode=
 *     -> { items: [{ id, name, assessment_mode, kind: "ca"|"exam"|null,
 *                    report_variant: "progress"|"full"|null,
 *                    academic_year_id, term_id, entry_closes_on,
 *                    show_grade_book }] }   (addition, grade_based: show
 *                    this point's Grade Book; default true — the Exam
 *                    List toggle is a later piece)
 *     Each term auto-creates exactly two points per mode (names
 *     school-editable): component_based = CA + Exam (kind); grade_based
 *     (British) = A/B, e.g. 1A / 1B, no CA/Exam framing, each carrying
 *     report_variant (exam.report_variant, Exam-Backend-Spec v1.5 §2.3,
 *     §7.13–7.16). assessment_mode filter is (new).
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
  exams: (yearId: string, termId: string, mode: AssessmentMode) => ["exam", "exams", yearId, termId, mode] as const,
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

export function examFromWire(value: unknown): Exam {
  const r = rec(value);
  return {
    id: s(r.id),
    name: s(r.name),
    assessment_mode: r.assessment_mode === "grade_based" ? "grade_based" : "component_based",
    kind: r.kind === "exam" ? "exam" : r.kind === "ca" ? "ca" : null,
    report_variant: r.report_variant === "progress" || r.report_variant === "full" ? (r.report_variant as ReportVariant) : null,
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    entry_closes_on: typeof r.entry_closes_on === "string" && r.entry_closes_on ? r.entry_closes_on : null,
    // Default shown; only an explicit false hides the point's Grade Book.
    show_grade_book: r.show_grade_book !== false,
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

export function listExams(yearId: string, termId: string, mode: AssessmentMode): Promise<CrudResult<Exam[]>> {
  const query = new URLSearchParams({ academic_year_id: yearId, term_id: termId, assessment_mode: mode });
  return send("GET", `erp/exams?${query}`, undefined, (data) => arr(rec(data).items).map(examFromWire));
}

export function getMarks(examId: string, subjectId: string, armId: string): Promise<CrudResult<MarksSheet>> {
  const query = new URLSearchParams({ subject_id: subjectId, class_arm_id: armId });
  return send("GET", `erp/exams/${encodeURIComponent(examId)}/marks?${query}`, undefined, sheetFromWire);
}

export function saveMarks(examId: string, input: SaveMarksInput | SaveGradeMarksInput): Promise<CrudResult<MarksSheet>> {
  return send("PUT", `erp/exams/${encodeURIComponent(examId)}/marks`, input, sheetFromWire);
}
