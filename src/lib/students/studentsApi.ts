import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type {
  AddressBlock,
  EmergencyContact,
  PastRecord,
  PersonBlock,
  Student,
  StudentStatus,
  StudentStatusAction,
  StudentStatusBodies,
  StudentStatusEvent,
  StudentWriteBody,
} from "@/lib/students/studentTypes";

/**
 * REAL Student Core API — Muntajir's feature/student-core. { success, data },
 * Bearer auth via apiFetch, ERP error shape { success:false, error:{code,
 * message} } (see erpError.ts) — same conventions as Classes/Class Terms.
 * Built against the contract ahead of the backend merge: only testable on
 * staging/deploy (DEV_AUTH_BYPASS short-circuits every call locally, same
 * as every other real ERP service).
 *
 *   GET    erp/students?academic_year_id=&page=&limit=
 *                                      -> { items, total, page, limit, has_more }
 *                                      academic_year_id is REQUIRED (422
 *                                      otherwise) unless all_years=true
 *   GET    erp/students/:id            -> Student
 *   POST   erp/students/drafts         body + current_step (1|2|3)
 *   PUT    erp/students/:id/draft      body + current_step
 *   POST   erp/students/:id/submit     body, NO current_step — draft -> active + account
 *   POST   erp/students                body, NO current_step — create active directly
 *   PUT    erp/students/:id            body, NO current_step — edit active;
 *                                      placement changes -> 409 ENROLMENT_LOCKED
 *   DELETE erp/students/:id            drafts only
 *   POST   erp/students/:id/{withdraw|suspend|expel|reactivate|graduate|restore}
 *   GET    erp/students/:id/status-events
 *
 * Every save sends the COMPLETE accumulated form (StudentWriteBody), never
 * a partial patch. student_id (the display id) is backend-assigned and
 * only ever read back, never generated here.
 *
 * Creating/submitting an active student with all placement ids present
 * also creates their initial Student Term Details record server-side, in
 * the same transaction (drafts don't) — callers invalidate that screen's
 * query after a successful submit/create.
 *
 * Error codes -> CrudResult:
 *   USERNAME_TAKEN / USERNAME_INVALID* -> `username` field
 *   EMAIL_REQUIRED* / EMAIL_INVALID*   -> `email` field
 *   CLASS_NOT_IN_YEAR -> class_id, SECTION_NOT_IN_CLASS -> class_arm_id,
 *   TERM_NOT_IN_CLASS -> class_term_id, SCHOOL_MODE_FORBIDS_STUDENT_MODE
 *   -> mode (the same codes Student Term Details documents; assumed to
 *   surface on create/submit too since those auto-create the term detail)
 *   ENROLMENT_LOCKED / NOT_A_DRAFT / STUDENT_NOT_EDITABLE /
 *   INVALID_STATUS_TRANSITION / STUDENT_NOT_FOUND* -> conflict (backend message)
 *   VALIDATION_ERROR -> server (backend message as a banner)
 * (* = code name GUESSED, not in the contract — a bad username is only
 * documented as "422"; harmless if it never fires.) Anything else falls
 * back to plain status-code classification, same as every other service.
 */
/** Prefix shared by every year's list — pass to invalidateQueries after a mutation to refresh whichever year(s) are cached. */
export const studentsListQueryKeyRoot = ["students", "list"] as const;

/** The list is per academic year (see listStudents), so the cache key is too — switching year never shows another year's students. */
export function studentsQueryKey(academicYearId: string): readonly unknown[] {
  return [...studentsListQueryKeyRoot, academicYearId];
}

const BASE_PATH = "erp/students";
/** Page size for listStudents()' fetch-all loop. FLAGGED: the backend's max limit isn't confirmed — 100 is a conservative guess. */
const LIST_PAGE_SIZE = 100;
/** Hard stop for the fetch-all loop, so a backend that never reports has_more:false can't spin forever (100 × 100 = 10k students). */
const LIST_MAX_PAGES = 100;

const FIELD_ERROR_CODES: Record<string, string> = {
  USERNAME_TAKEN: "username",
  USERNAME_INVALID: "username",
  EMAIL_REQUIRED: "email",
  EMAIL_INVALID: "email",
  CLASS_NOT_IN_YEAR: "class_id",
  SECTION_NOT_IN_CLASS: "class_arm_id",
  TERM_NOT_IN_CLASS: "class_term_id",
  SCHOOL_MODE_FORBIDS_STUDENT_MODE: "mode",
};

const CONFLICT_CODES = new Set([
  "ENROLMENT_LOCKED",
  "NOT_A_DRAFT",
  "STUDENT_NOT_EDITABLE",
  "INVALID_STATUS_TRANSITION",
  "STUDENT_NOT_FOUND",
]);

function studentPath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code && FIELD_ERROR_CODES[code]) {
    return { ok: false, kind: "validation", errors: [{ field: FIELD_ERROR_CODES[code], message: message ?? undefined }] };
  }
  if (code && CONFLICT_CODES.has(code)) {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR") {
    return { ok: false, kind: "server", message: message ?? undefined };
  }

  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 404 || response.status === 409) {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (response.status === 422) return { ok: false, kind: "server", message: message ?? undefined };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure, same as every
  // other authenticated call in this app.
  return { ok: false, kind: "server", message: message ?? undefined };
}

// ---------------------------------------------------------------------------
// Response -> Student. Tolerant by design: a draft can come back with most
// fields null, and the UI-only fields (see studentTypes.ts) may be absent.
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function localId(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

function personFromWire(value: unknown): PersonBlock | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    first_name: str(record.first_name),
    middle_name: strOrNull(record.middle_name),
    last_name: str(record.last_name),
    phone: str(record.phone),
    email: strOrNull(record.email),
    occupation: strOrNull(record.occupation),
  };
}

function addressFromWire(value: unknown): AddressBlock | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    street: str(record.street),
    country_code: strOrNull(record.country_code),
    state_code: strOrNull(record.state_code),
    city: strOrNull(record.city),
    postal_code: strOrNull(record.postal_code),
    lga_or_area: strOrNull(record.lga_or_area),
  };
}

const EMPTY_ADDRESS: AddressBlock = {
  street: "",
  country_code: null,
  state_code: null,
  city: null,
  postal_code: null,
  lga_or_area: null,
};

const STUDENT_STATUSES: readonly StudentStatus[] = [
  "active",
  "graduated",
  "withdrawn",
  "suspended",
  "expelled",
  "draft",
  "inactive",
];

export function fromWire(value: unknown): Student {
  const r = asRecord(value) ?? {};
  const status = STUDENT_STATUSES.includes(r.status as StudentStatus) ? (r.status as StudentStatus) : "draft";
  const relationshipType = r.relationship_type === "guardian" ? "guardian" : "parent";
  const primaryContact =
    r.primary_contact === "father" || r.primary_contact === "mother" || r.primary_contact === "guardian"
      ? r.primary_contact
      : null;

  return {
    id: str(r.id),
    student_id: strOrNull(r.student_id),
    status,
    draft_last_step: typeof r.draft_last_step === "number" ? r.draft_last_step : null,
    academic_year_id: strOrNull(r.academic_year_id),

    school_type_id: str(r.school_type_id),
    class_id: str(r.class_id),
    class_arm_id: str(r.class_arm_id),
    class_term_id: strOrNull(r.class_term_id),
    academic_house_id: strOrNull(r.academic_house_id),
    boarding_house_id: strOrNull(r.boarding_house_id),
    mode: r.mode === "boarding" ? "boarding" : "day",
    extra_curricular_ids: asArray(r.extra_curricular_ids).filter((id): id is string => typeof id === "string"),
    fee_display: strOrNull(r.fee_display),

    photo_file_id: strOrNull(r.photo_file_id),
    first_name: str(r.first_name),
    other_names: strOrNull(r.other_names),
    last_name: str(r.last_name),
    admission_number: strOrNull(r.admission_number),
    email: strOrNull(r.email),
    gender: r.gender === "female" ? "female" : "male",
    religion: strOrNull(r.religion),
    religion_is_other: bool(r.religion_is_other, false),
    nationality: str(r.nationality),
    date_of_birth: str(r.date_of_birth),
    height: strOrNull(r.height),
    weight: strOrNull(r.weight),
    blood_group: strOrNull(r.blood_group),
    genotype: strOrNull(r.genotype),
    allergies: strOrNull(r.allergies),
    medical_conditions: strOrNull(r.medical_conditions),
    medications: strOrNull(r.medications),
    special_needs_notes: strOrNull(r.special_needs_notes),

    relationship_type: relationshipType,
    father: personFromWire(r.father),
    mother: personFromWire(r.mother),
    guardian: personFromWire(r.guardian),
    primary_contact: primaryContact,

    home_address: addressFromWire(r.home_address) ?? { ...EMPTY_ADDRESS },
    other_address_same_as_home: bool(r.other_address_same_as_home, true),
    other_address: addressFromWire(r.other_address),
    emergency_contacts: asArray(r.emergency_contacts).map((item): EmergencyContact => {
      const contact = asRecord(item) ?? {};
      return { name: strOrNull(contact.name), phone: strOrNull(contact.phone) };
    }),

    agent_id: strOrNull(r.agent_id),
    has_agent_commission: bool(r.has_agent_commission, false),

    sibling_student_ids: asArray(r.sibling_student_ids).filter((id): id is string => typeof id === "string"),

    past_records: asArray(r.past_records).map((item): PastRecord => {
      const record = asRecord(item) ?? {};
      return {
        id: strOrNull(record.id) ?? localId("past-record"),
        school: strOrNull(record.school),
        class: strOrNull(record.class),
        grade: strOrNull(record.grade),
        rank: strOrNull(record.rank),
        year: strOrNull(record.year),
        attachment_file_id: strOrNull(record.attachment_file_id),
      };
    }),

    username: str(r.username),
    two_factor_enabled: bool(r.two_factor_enabled, false),
    login_activated: bool(r.login_activated, true),

    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

function readStudent(body: unknown): Student | null {
  const data = asRecord((body as { data?: unknown } | null)?.data);
  return data && typeof data.id === "string" ? fromWire(data) : null;
}

type StudentPage = { items: Student[]; hasMore: boolean };

function readStudentPage(body: unknown, page: number): StudentPage {
  const data = asRecord((body as { data?: unknown } | null)?.data);
  const items = asArray(data?.items).map(fromWire);
  // has_more is the contract's signal; fall back to total/limit arithmetic
  // if it's ever missing, and to "a full page means maybe more" last.
  let hasMore: boolean;
  if (typeof data?.has_more === "boolean") hasMore = data.has_more;
  else if (typeof data?.total === "number" && typeof data?.limit === "number") hasMore = page * data.limit < data.total;
  else hasMore = items.length === LIST_PAGE_SIZE;
  return { items, hasMore };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function send<T>(
  path: string,
  init: RequestInit,
  onSuccess: (body: unknown) => CrudResult<T>,
): Promise<CrudResult<T>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return withStatus(toResult<T>(response, body), response.status);
  return onSuccess(body);
}

/** Stamps the HTTP status onto a "server" result so throwIfTransient() never retries a 4xx (e.g. a 422 VALIDATION_ERROR). */
function withStatus<T>(result: CrudResult<T>, status: number): CrudResult<T> {
  return !result.ok && result.kind === "server" ? { ...result, status } : result;
}

function studentResult(body: unknown): CrudResult<Student> {
  const student = readStudent(body);
  return student ? { ok: true, data: student } : { ok: false, kind: "server" };
}

/**
 * Every student in ONE academic year, every status (drafts included —
 * FLAGGED: assumed the list returns drafts by default with no filter
 * param; reconcile on staging). The Students module is per-academic-year,
 * so this always sends academic_year_id (the backend 422s without it) and
 * deliberately never uses all_years=true. Callers must gate their query on
 * having a year (`enabled: !!yearId`) — an empty id short-circuits to an
 * empty list here rather than firing the request that 422s.
 *
 * Pages through the server endpoint until has_more is false, so every
 * caller (Students screen, Siblings, Student Term Details, Subject
 * Enrolment) gets the year's whole list.
 *
 * REQUIRED FOLLOW-UP (Matthew, 2026-10-15 — not optional): move the
 * Students screen to server-side pagination/search/filter. Fetch-all is a
 * stopgap for this increment only; it doesn't scale for large schools or
 * low-bandwidth connections.
 */
export async function listStudents(academicYearId: string): Promise<CrudResult<Student[]>> {
  if (!academicYearId) return { ok: true, data: [] };
  const all: Student[] = [];
  for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
    const result = await send<StudentPage>(
      `${BASE_PATH}?academic_year_id=${encodeURIComponent(academicYearId)}&page=${page}&limit=${LIST_PAGE_SIZE}`,
      { method: "GET" },
      (body) => ({ ok: true, data: readStudentPage(body, page) }),
    );
    if (!result.ok) return result;
    all.push(...result.data.items);
    if (!result.data.hasMore || result.data.items.length === 0) break;
  }
  return { ok: true, data: all };
}

export async function getStudent(id: string): Promise<CrudResult<Student>> {
  return send(studentPath(id), { method: "GET" }, studentResult);
}

/** First Save Draft of a new student. */
export async function createStudentDraft(body: StudentWriteBody, currentStep: number): Promise<CrudResult<Student>> {
  return send(
    `${BASE_PATH}/drafts`,
    { method: "POST", body: JSON.stringify({ ...body, current_step: currentStep }) },
    studentResult,
  );
}

/** Every later Save Draft of the same draft. */
export async function saveStudentDraft(
  id: string,
  body: StudentWriteBody,
  currentStep: number,
): Promise<CrudResult<Student>> {
  return send(
    `${studentPath(id)}/draft`,
    { method: "PUT", body: JSON.stringify({ ...body, current_step: currentStep }) },
    studentResult,
  );
}

/** Finish a draft: draft -> active, creates the login account (and the initial term detail when placement is complete). */
export async function submitStudentDraft(id: string, body: StudentWriteBody): Promise<CrudResult<Student>> {
  return send(`${studentPath(id)}/submit`, { method: "POST", body: JSON.stringify(body) }, studentResult);
}

/** Create an active student directly, no draft involved. */
export async function createStudent(body: StudentWriteBody): Promise<CrudResult<Student>> {
  return send(BASE_PATH, { method: "POST", body: JSON.stringify(body) }, studentResult);
}

/** Edit an already-active student. Placement must be unchanged — the backend 409s ENROLMENT_LOCKED otherwise (placement moves go through Student Term Details). */
export async function updateStudent(id: string, body: StudentWriteBody): Promise<CrudResult<Student>> {
  return send(studentPath(id), { method: "PUT", body: JSON.stringify(body) }, studentResult);
}

/** Hard delete — drafts only (the backend 409s NOT_A_DRAFT for anything else). A real student is never removed, only moved between statuses. */
export async function deleteDraftStudent(id: string): Promise<CrudResult<void>> {
  return send(studentPath(id), { method: "DELETE" }, () => ({ ok: true, data: undefined }));
}

export async function changeStudentStatus<A extends StudentStatusAction>(
  id: string,
  action: A,
  body: StudentStatusBodies[A],
): Promise<CrudResult<Student | null>> {
  // A status route's response shape isn't confirmed — if it's not a
  // recognizable Student, still succeed with null (the caller refetches
  // the list either way), same "2xx is success" rule as
  // classTermsApi.createClassTerms.
  return send(`${studentPath(id)}/${action}`, { method: "POST", body: JSON.stringify(body) }, (responseBody) => ({
    ok: true,
    data: readStudent(responseBody),
  }));
}

export function studentStatusEventsQueryKey(id: string): readonly unknown[] {
  return ["students", "statusEvents", id];
}

function fromStatusEventWire(value: unknown, index: number): StudentStatusEvent {
  const r = asRecord(value) ?? {};
  const actor = asRecord(r.actor) ?? asRecord(r.performed_by);
  return {
    id: strOrNull(r.id) ?? `status-event-${index}`,
    action: strOrNull(r.action) ?? strOrNull(r.event_type),
    from_status: strOrNull(r.from_status),
    to_status: strOrNull(r.to_status),
    reason: strOrNull(r.reason),
    effective_on: strOrNull(r.effective_on),
    created_at: strOrNull(r.created_at),
    actor_name: strOrNull(actor?.name) ?? strOrNull(r.actor_name) ?? strOrNull(r.performed_by_name),
  };
}

/** FLAGGED: response shape unconfirmed — accepts a bare array or { items }. */
export async function listStudentStatusEvents(id: string): Promise<CrudResult<StudentStatusEvent[]>> {
  return send(`${studentPath(id)}/status-events`, { method: "GET" }, (body) => {
    const data = (body as { data?: unknown } | null)?.data;
    const items = Array.isArray(data) ? data : asArray(asRecord(data)?.items);
    return { ok: true, data: items.map(fromStatusEventWire) };
  });
}
