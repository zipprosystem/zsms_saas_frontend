import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type {
  AddressBlock,
  StudentMode,
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
 *   GET    erp/students?academic_year_id=&page=&limit=&status=&class_id=
 *                  &section_id=&mode=&search=
 *                                      -> { items, total, page, limit, has_more }
 *                                      academic_year_id is REQUIRED (422
 *                                      otherwise) unless all_years=true;
 *                                      status is comma-separated; limit max 200
 *   GET    erp/students/summary?academic_year_id=&class_id=&section_id=&mode=&search=
 *                                      -> { total, by_status, by_gender, by_mode,
 *                                           newly_enrolled_30d }
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
 * Error codes -> CrudResult (confirmed contract):
 *   409 USERNAME_TAKEN -> `username` field · 409 EMAIL_TAKEN -> `email` field
 *   CLASS_NOT_IN_YEAR -> class_id, SECTION_NOT_IN_CLASS -> class_arm_id,
 *   TERM_NOT_IN_CLASS -> class_term_id, SCHOOL_MODE_FORBIDS_STUDENT_MODE
 *   -> mode (the same codes Student Term Details documents; assumed to
 *   surface on create/submit too since those auto-create the term detail)
 *   422 VALIDATION_ERROR -> a missing/invalid field is NOT its own code:
 *   the message names the field (e.g. "email must be a valid email",
 *   same pattern as "academic_year_id is required unless all_years is
 *   true"). fieldFromValidationMessage() reads that name; when it's one
 *   the wizard can point at (VALIDATION_FIELDS) it becomes a field error,
 *   otherwise the backend message is shown as a banner (server).
 *   ENROLMENT_LOCKED / NOT_A_DRAFT / STUDENT_NOT_EDITABLE /
 *   INVALID_STATUS_TRANSITION / STUDENT_NOT_FOUND* -> conflict (backend message)
 * (* = code name GUESSED, not in the contract; harmless if it never
 * fires.) Anything else falls back to plain status-code classification,
 * same as every other service. Every field error carries its `code`
 * (the backend's, or VALIDATION_ERROR) so the wizard can tell "taken"
 * from "invalid".
 */
/** Prefix shared by every year's list — pass to invalidateQueries after a mutation to refresh whichever year(s) are cached. */
export const studentsListQueryKeyRoot = ["students", "list"] as const;

/** The list is per academic year (see listStudents), so the cache key is too — switching year never shows another year's students. */
export function studentsQueryKey(academicYearId: string): readonly unknown[] {
  return [...studentsListQueryKeyRoot, academicYearId];
}

/**
 * Students screen's server-paged list (listStudentsPage). Nested under
 * studentsQueryKey(yearId), so every existing invalidation of a year also
 * refreshes its pages; never collides with the fetch-all entry, which sits
 * at exactly studentsQueryKey(yearId).
 */
export function studentsPageQueryKey(scope: StudentListScope, params: StudentPageParams): readonly unknown[] {
  const base = scope.kind === "year" ? studentsQueryKey(scope.academicYearId) : studentsAllYearsQueryKeyRoot;
  return [...base, "page", params];
}

/** Prefix of every all_years=true list (the Drafts tab) — invalidate after a draft is saved, submitted or deleted, since drafts aren't scoped to the year key. */
export const studentsAllYearsQueryKeyRoot = [...studentsListQueryKeyRoot, "allYears"] as const;

/** Nested under the year key for the same reason as studentsPageQueryKey — any change to the year refreshes its tiles too. */
export function studentsSummaryQueryKey(academicYearId: string, filters: StudentListFilters): readonly unknown[] {
  return [...studentsQueryKey(academicYearId), "summary", filters];
}

const BASE_PATH = "erp/students";
/** Students screen page sizes. 500 and "all" exceed the backend's per-request cap, so listStudentsPage assembles them from sequential 200-row requests. */
export type StudentPageSize = 50 | 100 | 200 | 500 | "all";
export const STUDENT_PAGE_SIZES: readonly StudentPageSize[] = [50, 100, 200, 500, "all"];
export const STUDENTS_PAGE_SIZE_DEFAULT: StudentPageSize = 50;
/** The backend's confirmed max limit for ONE request — a larger limit 422s. */
const STUDENTS_REQUEST_LIMIT_MAX = 200;
/** Page size for listStudents()' fetch-all loop. FLAGGED: the backend's max limit isn't confirmed — 100 is a conservative guess. */
const LIST_PAGE_SIZE = 100;
/** Hard stop for the fetch-all loop, so a backend that never reports has_more:false can't spin forever (100 × 100 = 10k students). */
const LIST_MAX_PAGES = 100;

const FIELD_ERROR_CODES: Record<string, string> = {
  USERNAME_TAKEN: "username",
  EMAIL_TAKEN: "email",
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

/** Body fields a 422 VALIDATION_ERROR can be pinned to — the ones the wizard shows a field error for. Anything else stays a banner. */
const VALIDATION_FIELDS = new Set(["email", "username", "class_id", "class_arm_id", "class_term_id", "mode"]);

/**
 * The field a VALIDATION_ERROR message names, if it's one we can show.
 * The field name LEADS the message; tolerates Joi-style quoting
 * ("\"email\" must be…") and a body./data. path prefix, since only the
 * plain form has been seen live.
 */
function fieldFromValidationMessage(message: string | null): string | null {
  const match = message?.match(/^\s*["'`]?(?:body\.|data\.)?([a-z][a-z0-9_]*)/i);
  const field = match?.[1]?.toLowerCase() ?? null;
  return field && VALIDATION_FIELDS.has(field) ? field : null;
}

function studentPath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code && FIELD_ERROR_CODES[code]) {
    return {
      ok: false,
      kind: "validation",
      errors: [{ field: FIELD_ERROR_CODES[code], message: message ?? undefined, code }],
    };
  }
  if (code && CONFLICT_CODES.has(code)) {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR" || (!code && response.status === 422)) {
    const field = fieldFromValidationMessage(message);
    if (field) return { ok: false, kind: "validation", errors: [{ field, message: message ?? undefined, code: "VALIDATION_ERROR" }] };
    return { ok: false, kind: "server", message: message ?? undefined };
  }

  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 404 || response.status === 409) {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
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

/**
 * Past records keyed off attachment_file_id (the POST /files id, purpose
 * past_record_attachment) — the stable reference. The backend's row id
 * can change on a later save, so it's ignored. A record with an
 * attachment keeps the same key across saves/refetches; a repeat of an
 * already-seen attachment_file_id is the same record and is dropped. A
 * record with no attachment has nothing stable to key on, so it gets a
 * generated key and is never deduped.
 */
function pastRecordsFromWire(value: unknown): PastRecord[] {
  const seenFileIds = new Set<string>();
  const records: PastRecord[] = [];
  for (const item of asArray(value)) {
    const record = asRecord(item) ?? {};
    const attachmentFileId = strOrNull(record.attachment_file_id);
    if (attachmentFileId) {
      if (seenFileIds.has(attachmentFileId)) continue;
      seenFileIds.add(attachmentFileId);
    }
    records.push({
      id: attachmentFileId ? `past-record-file-${attachmentFileId}` : localId("past-record"),
      school: strOrNull(record.school),
      class: strOrNull(record.class),
      grade: strOrNull(record.grade),
      rank: strOrNull(record.rank),
      year: strOrNull(record.year),
      attachment_file_id: attachmentFileId,
    });
  }
  return records;
}

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

    past_records: pastRecordsFromWire(r.past_records),

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
 * caller (Siblings, Student Term Details, Subject Enrolment) gets the
 * year's whole list. The Students screen itself no longer uses this — it
 * pages server-side via listStudentsPage/getStudentsSummary. Kept for
 * these remaining screens until they move off fetch-all too.
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

/** Year-scoped (the module's normal mode), or every year (the Drafts tab — drafts may not have a year yet). */
export type StudentListScope = { kind: "year"; academicYearId: string } | { kind: "allYears" };

/** Server-side filters shared by the paged list and the summary. Empty/undefined = not sent. */
export type StudentListFilters = {
  classId?: string;
  sectionId?: string;
  mode?: StudentMode;
  search?: string;
};

export type StudentPageParams = StudentListFilters & {
  /** Sent comma-separated; empty = no status param. */
  statuses: StudentStatus[];
  page: number;
  limit: StudentPageSize;
};

export type StudentListPage = {
  items: Student[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

function filterParams(filters: StudentListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.classId) params.set("class_id", filters.classId);
  if (filters.sectionId) params.set("section_id", filters.sectionId);
  if (filters.mode) params.set("mode", filters.mode);
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  return params;
}

function readListPage(body: unknown, requestedPage: number, requestedLimit: number): StudentListPage {
  const data = asRecord((body as { data?: unknown } | null)?.data);
  const items = asArray(data?.items).map(fromWire);
  const page = typeof data?.page === "number" ? data.page : requestedPage;
  const limit = typeof data?.limit === "number" && data.limit > 0 ? data.limit : requestedLimit;
  const hasMore =
    typeof data?.has_more === "boolean"
      ? data.has_more
      : typeof data?.total === "number"
        ? page * limit < data.total
        : items.length === limit;
  // total missing would be off-contract — fall back to "what we've seen so
  // far", plus one more page's worth when has_more says there is one.
  const total = typeof data?.total === "number" ? data.total : (page - 1) * limit + items.length + (hasMore ? 1 : 0);
  return { items, total, page, limit, hasMore };
}

/** One real request — limit must be within STUDENTS_REQUEST_LIMIT_MAX. */
async function fetchServerPage(
  scope: StudentListScope,
  statuses: StudentStatus[],
  filters: StudentListFilters,
  page: number,
  limit: number,
): Promise<CrudResult<StudentListPage>> {
  const params = filterParams(filters);
  if (scope.kind === "year") params.set("academic_year_id", scope.academicYearId);
  else params.set("all_years", "true");
  if (statuses.length > 0) params.set("status", statuses.join(","));
  params.set("page", String(page));
  params.set("limit", String(limit));
  return send(`${BASE_PATH}?${params.toString()}`, { method: "GET" }, (body) => ({
    ok: true,
    data: readListPage(body, page, limit),
  }));
}

/**
 * ONE page of the Students screen's list — pagination, status, class,
 * section, mode and search all happen server-side. A year scope with an
 * empty id short-circuits to an empty page (the backend 422s without
 * academic_year_id), same rule as listStudents.
 *
 * 50/100/200 are a single request. 500 and "all" are bigger than one
 * request may ask for, so they're assembled from sequential 200-row
 * requests: 500 fetches just the 200-row pages overlapping the requested
 * 500-row window and slices it out; "all" loops until has_more is false
 * and comes back as one page holding everything (which Export then uses
 * as-is). Capped at LIST_MAX_PAGES requests, same guard as listStudents.
 */
export async function listStudentsPage(
  scope: StudentListScope,
  { statuses, page, limit, ...filters }: StudentPageParams,
): Promise<CrudResult<StudentListPage>> {
  const safePage = limit === "all" ? 1 : Math.max(1, Math.floor(page));
  if (scope.kind === "year" && !scope.academicYearId) {
    return { ok: true, data: { items: [], total: 0, page: safePage, limit: limit === "all" ? 1 : limit, hasMore: false } };
  }
  if (limit !== "all" && limit <= STUDENTS_REQUEST_LIMIT_MAX) {
    return fetchServerPage(scope, statuses, filters, safePage, limit);
  }

  const windowStart = limit === "all" ? 0 : (safePage - 1) * limit;
  const windowEnd = limit === "all" ? Infinity : safePage * limit;
  const firstServerPage = Math.floor(windowStart / STUDENTS_REQUEST_LIMIT_MAX) + 1;
  const firstRowOffset = (firstServerPage - 1) * STUDENTS_REQUEST_LIMIT_MAX;
  const collected: Student[] = [];
  let total = 0;
  for (let serverPage = firstServerPage; serverPage < firstServerPage + LIST_MAX_PAGES; serverPage += 1) {
    const result = await fetchServerPage(scope, statuses, filters, serverPage, STUDENTS_REQUEST_LIMIT_MAX);
    if (!result.ok) return result;
    collected.push(...result.data.items);
    total = result.data.total;
    if (!result.data.hasMore || result.data.items.length === 0) break;
    if (serverPage * STUDENTS_REQUEST_LIMIT_MAX >= windowEnd) break;
  }
  const items = collected.slice(windowStart - firstRowOffset, windowEnd - firstRowOffset);

  if (limit === "all") {
    return { ok: true, data: { items, total: items.length, page: 1, limit: Math.max(1, items.length), hasMore: false } };
  }
  return { ok: true, data: { items, total, page: safePage, limit, hasMore: windowEnd < total } };
}

export type StudentsSummary = {
  total: number;
  byStatus: Partial<Record<StudentStatus, number>>;
  byGender: { male: number; female: number };
  byMode: { day: number; boarding: number };
  newlyEnrolled30d: number;
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * by_* as a { key: count } map (assumed). Also tolerates an array of
 * { <key>|key, count } rows in case the backend returns grouped rows —
 * FLAGGED: exact shape unconfirmed, reconcile on staging.
 */
function countMap(value: unknown, keyField: string): Record<string, number> {
  if (Array.isArray(value)) {
    const map: Record<string, number> = {};
    for (const item of value) {
      const row = asRecord(item);
      const key = row ? (strOrNull(row[keyField]) ?? strOrNull(row.key)) : null;
      if (key) map[key] = count(row?.count);
    }
    return map;
  }
  const record = asRecord(value) ?? {};
  return Object.fromEntries(Object.entries(record).map(([key, n]) => [key, count(n)]));
}

/** The Student List tiles — counted server-side over the year + the same filters as the list (no status: tiles split by status themselves). */
export async function getStudentsSummary(
  academicYearId: string,
  filters: StudentListFilters,
): Promise<CrudResult<StudentsSummary>> {
  if (!academicYearId) {
    return {
      ok: true,
      data: { total: 0, byStatus: {}, byGender: { male: 0, female: 0 }, byMode: { day: 0, boarding: 0 }, newlyEnrolled30d: 0 },
    };
  }
  const params = filterParams(filters);
  params.set("academic_year_id", academicYearId);
  return send(`${BASE_PATH}/summary?${params.toString()}`, { method: "GET" }, (body) => {
    const data = asRecord((body as { data?: unknown } | null)?.data) ?? {};
    const byStatus = countMap(data.by_status, "status");
    const byGender = countMap(data.by_gender, "gender");
    const byMode = countMap(data.by_mode, "mode");
    return {
      ok: true,
      data: {
        total: count(data.total),
        byStatus: Object.fromEntries(
          Object.entries(byStatus).filter(([key]) => STUDENT_STATUSES.includes(key as StudentStatus)),
        ) as Partial<Record<StudentStatus, number>>,
        byGender: { male: byGender.male ?? 0, female: byGender.female ?? 0 },
        byMode: { day: byMode.day ?? 0, boarding: byMode.boarding ?? 0 },
        newlyEnrolled30d: count(data.newly_enrolled_30d),
      },
    };
  });
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

function fromStatusEventWire(value: unknown): StudentStatusEvent {
  const r = asRecord(value) ?? {};
  return {
    from_status: strOrNull(r.from_status),
    to_status: strOrNull(r.to_status),
    reason: strOrNull(r.reason),
    effective_on: strOrNull(r.effective_on),
    acted_by_user_id: strOrNull(r.acted_by_user_id),
    created_at: strOrNull(r.created_at),
  };
}

/** Confirmed: data is a bare, OLDEST-FIRST array of events (returned in that order). */
export async function listStudentStatusEvents(id: string): Promise<CrudResult<StudentStatusEvent[]>> {
  return send(`${studentPath(id)}/status-events`, { method: "GET" }, (body) => {
    const data = (body as { data?: unknown } | null)?.data;
    return { ok: true, data: asArray(data).map(fromStatusEventWire) };
  });
}
