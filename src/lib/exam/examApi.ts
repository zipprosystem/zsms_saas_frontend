import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { realTransport, type HttpMethod, type WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { examMockTransport } from "@/lib/exam/mock/examMockBackend";
import type {
  ComponentScores,
  Exam,
  ExamEntryOptions,
  SaveMarksInput,
  SubjectMarkRow,
  SubjectMarksSheet,
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
 *   GET /api/v1/erp/exams?academic_year_id=&term_id=
 *     -> { items: [{ id, name, kind: "ca"|"exam", academic_year_id,
 *                    term_id, entry_closes_on }] }   (Exam List, later)
 *   GET /api/v1/erp/exams/entry-options?academic_year_id=
 *     -> { academic_year_id, years, terms, classes[{id,name,arms[]}],
 *          subjects[{class_arm_id, subject_id, subject_name}], full_scope }
 *     The class-arm/subject pairs the CALLER may enter marks for
 *     (effective_scope: admin = all; teacher = their assignments).
 *
 * Stage 1b is raw entry only: no totals, grades or positions are stored
 * (Stage 2). Totals on screen are live display sums.
 */
const USE_MOCK = true;

const transport = USE_MOCK ? examMockTransport : realTransport;

/** Whether the screen is talking to the mock — it shows the dev-only "acting as" picker only then. */
export const EXAM_USES_MOCK = USE_MOCK;

export const examQueryKeys = {
  all: ["exam"] as const,
  entryOptions: (yearId: string | null) => ["exam", "entryOptions", yearId ?? "current"] as const,
  exams: (yearId: string, termId: string) => ["exam", "exams", yearId, termId] as const,
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

function examFromWire(value: unknown): Exam {
  const r = rec(value);
  return {
    id: s(r.id),
    name: s(r.name),
    kind: r.kind === "exam" ? "exam" : "ca",
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    entry_closes_on: typeof r.entry_closes_on === "string" && r.entry_closes_on ? r.entry_closes_on : null,
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

function sheetFromWire(value: unknown): SubjectMarksSheet | null {
  const r = rec(value);
  if (!r.exam) return null;
  return {
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
    classes: arr(r.classes).map((item) => ({ ...idName(item), arms: arr(rec(item).arms).map(idName) })),
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

export function listExams(yearId: string, termId: string): Promise<CrudResult<Exam[]>> {
  const query = new URLSearchParams({ academic_year_id: yearId, term_id: termId });
  return send("GET", `erp/exams?${query}`, undefined, (data) => arr(rec(data).items).map(examFromWire));
}

export function getMarks(examId: string, subjectId: string, armId: string): Promise<CrudResult<SubjectMarksSheet>> {
  const query = new URLSearchParams({ subject_id: subjectId, class_arm_id: armId });
  return send("GET", `erp/exams/${encodeURIComponent(examId)}/marks?${query}`, undefined, sheetFromWire);
}

export function saveMarks(examId: string, input: SaveMarksInput): Promise<CrudResult<SubjectMarksSheet>> {
  return send("PUT", `erp/exams/${encodeURIComponent(examId)}/marks`, input, sheetFromWire);
}
