import type { CrudResult } from "@/lib/setup/crudTypes";
import {
  asArray,
  asRecord,
  readEntity,
  readListItems,
  readData,
  readPageMeta,
  hrChannel,
  sendHrRequest,
  str,
  stringIds,
  strOrNull,
  type HrChannel,
} from "@/lib/hr/hrHttp";
import {
  STAFF_LEAVER_CATEGORIES,
  STAFF_STATUSES,
  type Staff,
  type StaffLeaverBody,
  type StaffReinstateBody,
  type StaffStatusEvent,
  type StaffWriteBody,
  type StaffAddress,
  type StaffClassTeacherAssignment,
  type StaffExperience,
  type StaffQualification,
  type StaffReference,
  type StaffStatus,
  type StaffSubjectAssignment,
  type StaffType,
  type AssignmentRemapBody,
  type AssignmentReviewItem,
} from "@/lib/hr/hrTypes";

/**
 * Staff records (HR › Staff) — REAL /api/v1/erp (HR_USE_MOCK in hrHttp.ts
 * switches every HR service back to the mock).
 *
 * IDENTITY (Option B, Muntajir 2026-10-23): rows carry id = staff.id plus
 * an optional user_id (the login account). Everything references staff.id;
 * user_id only resolves status-event actors. src/lib/staff/staffApi.ts is
 * the light name lookup built on this same list (Departments, actor names).
 *
 *   GET    erp/staff?academic_year_id=&staff_type=&status=&department_id=&subject_id=&search=&page=&limit=
 *                         -> { items, total, page, limit, has_more } (limit max 200)
 *   GET    erp/staff/:id?academic_year_id=  -> Staff
 *   POST   erp/staff/drafts       body + current_step
 *   PUT    erp/staff/:id/draft    body + current_step
 *   POST   erp/staff/:id/submit   body — draft -> active
 *   POST   erp/staff              body — create active directly
 *   PUT    erp/staff/:id          body — edit a non-draft staff
 *   DELETE erp/staff/:id          drafts only
 *   POST   erp/staff/:id/leaver                                 { category, effective_date, reason }
 *   POST   erp/staff/:id/reinstate                              { effective_date, reason }
 *   GET    erp/staff/:id/status-events                          oldest-first
 *   POST   erp/staff/:id/credentials                            issue { username? }
 *   POST   erp/staff/:id/credentials/reset                      back to the default password
 *   PATCH  erp/staff/:id/credentials/activate                   { active }
 *
 * academic_year_id scopes the two assignment sets (subject /
 * class-teacher) on reads AND writes; each year is edited independently.
 * Carry-forward: a year with no sets yet reads back the prior year's as
 * editable defaults; rows that can't be matched into the new year are kept
 * by the backend for review (listAssignmentReviews below). Every save sends
 * the COMPLETE record.
 *
 * FLAGGED (proposed, confirm on deploy):
 *   GET  erp/staff/assignment-reviews?academic_year_id=     -> { items }
 *   POST erp/staff/assignment-reviews/:id/remap              { class_id, section_id, subject_id? }
 *   POST erp/staff/assignment-reviews/:id/discard
 *   GET  erp/subject-masters?search=&academic_year_id=&class_id=&page=&limit=  (server-side subject search)
 *   staff.password_setup, status event acted_by_user_id / acted_by_name
 */
const channel: HrChannel = hrChannel;

/** Prefix of every staff list/record cache entry — invalidate after any staff or membership change. */
export const staffListQueryKeyRoot = ["hr", "staff"] as const;

const BASE_PATH = "erp/staff";
/** The backend's per-request cap (same as Student Core) — bigger page sizes are assembled from sequential requests. */
const REQUEST_LIMIT_MAX = 200;
/** Hard stop for fetch-all loops (100 × 200 = 20k staff). */
const MAX_PAGES = 100;

// ---------------------------------------------------------------------------
// Wire -> Staff (tolerant: a draft comes back mostly empty)
// ---------------------------------------------------------------------------

function addressFromWire(value: unknown): StaffAddress | null {
  const r = asRecord(value);
  if (!r) return null;
  return {
    country_code: strOrNull(r.country_code),
    state_code: strOrNull(r.state_code),
    city: strOrNull(r.city),
    postal_code: strOrNull(r.postal_code),
    mobile: strOrNull(r.mobile),
    address_line: strOrNull(r.address_line),
  };
}

function rows<T>(value: unknown, map: (r: Record<string, unknown>) => T): T[] {
  return asArray(value).map((item) => map(asRecord(item) ?? {}));
}

export function fromWire(value: unknown): Staff {
  const r = asRecord(value) ?? {};
  const status = STAFF_STATUSES.includes(r.status as StaffStatus) ? (r.status as StaffStatus) : "draft";
  const staffType: StaffType = r.staff_type === "non_teaching" ? "non_teaching" : "teaching";
  return {
    id: str(r.id),
    user_id: strOrNull(r.user_id),
    staff_no: strOrNull(r.staff_no),
    status,
    draft_last_step: typeof r.draft_last_step === "number" ? r.draft_last_step : null,
    photo_file_id: strOrNull(r.photo_file_id),
    signature_file_id: strOrNull(r.signature_file_id),
    title: strOrNull(r.title),
    initials: strOrNull(r.initials),
    first_name: str(r.first_name),
    last_name: str(r.last_name),
    other_name: strOrNull(r.other_name),
    email: strOrNull(r.email),
    national_id: strOrNull(r.national_id),
    gender: r.gender === "male" || r.gender === "female" ? r.gender : null,
    date_of_birth: strOrNull(r.date_of_birth),
    date_joined: strOrNull(r.date_joined),
    staff_type: staffType,
    post_id: strOrNull(r.post_id),
    department_ids: stringIds(r.department_ids),
    subject_assignments: rows<StaffSubjectAssignment>(r.subject_assignments, (a) => ({
      class_id: str(a.class_id),
      section_id: str(a.section_id),
      subject_id: str(a.subject_id),
    })),
    class_teacher_assignments: rows<StaffClassTeacherAssignment>(r.class_teacher_assignments, (a) => ({
      class_id: str(a.class_id),
      section_id: str(a.section_id),
    })),
    assignments_academic_year_id: strOrNull(r.assignments_academic_year_id),
    assignments_carried_forward_from: strOrNull(r.assignments_carried_forward_from),
    permission_group_ids: stringIds(r.permission_group_ids),
    present_address: addressFromWire(r.present_address),
    permanent_same_as_present: r.permanent_same_as_present !== false,
    permanent_address: addressFromWire(r.permanent_address),
    qualifications: rows<StaffQualification>(r.qualifications, (q) => ({
      degree: strOrNull(q.degree),
      stream: strOrNull(q.stream),
      board: strOrNull(q.board),
      institution: strOrNull(q.institution),
      year: strOrNull(q.year),
      result: strOrNull(q.result),
      rank: strOrNull(q.rank),
      duration: strOrNull(q.duration),
      remarks: strOrNull(q.remarks),
    })),
    references: rows<StaffReference>(r.references, (ref) => ({
      name: strOrNull(ref.name),
      organization: strOrNull(ref.organization),
      designation: strOrNull(ref.designation),
      phone: strOrNull(ref.phone),
      email: strOrNull(ref.email),
    })),
    experience: rows<StaffExperience>(r.experience, (e) => ({
      organization: strOrNull(e.organization),
      role: strOrNull(e.role),
      tenure_from: strOrNull(e.tenure_from),
      tenure_to: strOrNull(e.tenure_to),
    })),
    username: strOrNull(r.username),
    login_active: r.login_active === true,
    must_change_password: r.must_change_password === true,
    credentials_issued_at: strOrNull(r.credentials_issued_at),
    password_reset_at: strOrNull(r.password_reset_at),
    password_setup: r.password_setup === "email_link" || r.password_setup === "default_password" ? r.password_setup : null,
    last_active_at: strOrNull(r.last_active_at),
    status_reason: strOrNull(r.status_reason),
    status_effective_date: strOrNull(r.status_effective_date),
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

export function staffFullName(staff: Pick<Staff, "first_name" | "other_name" | "last_name">): string {
  return [staff.first_name, staff.other_name, staff.last_name].filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type StaffListFilters = {
  /** Which year's assignments come back (and subject_id filters on). */
  academicYearId?: string;
  staffType?: StaffType;
  departmentId?: string;
  subjectId?: string;
  search?: string;
};

export type StaffListPage = { items: Staff[]; total: number; page: number; limit: number; hasMore: boolean };

function listPath(filters: StaffListFilters, statuses: StaffStatus[], page: number, limit: number): string {
  const params = new URLSearchParams();
  if (filters.academicYearId) params.set("academic_year_id", filters.academicYearId);
  if (filters.staffType) params.set("staff_type", filters.staffType);
  if (statuses.length > 0) params.set("status", statuses.join(","));
  if (filters.departmentId) params.set("department_id", filters.departmentId);
  if (filters.subjectId) params.set("subject_id", filters.subjectId);
  const search = filters.search?.trim();
  if (search) params.set("search", search);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return `${BASE_PATH}?${params.toString()}`;
}

/** ONE server request — limit must be within REQUEST_LIMIT_MAX. */
export async function fetchStaffServerPage(
  filters: StaffListFilters,
  statuses: StaffStatus[],
  page: number,
  limit: number,
): Promise<CrudResult<StaffListPage>> {
  return sendHrRequest(channel, "GET", listPath(filters, statuses, page, limit), undefined, (body) => {
    const items = readListItems(body).map(fromWire);
    return { ok: true, data: { items, ...readPageMeta(body, page, limit, items.length) } };
  });
}

/** Staff list page sizes — same set as Students. 500 and "all" exceed one request's cap, so listStaffPage assembles them from sequential 200-row requests. */
export type StaffPageSize = 50 | 100 | 200 | 500 | "all";
export const STAFF_PAGE_SIZES: readonly StaffPageSize[] = [50, 100, 200, 500, "all"];
export const STAFF_PAGE_SIZE_DEFAULT: StaffPageSize = 50;

export type StaffPageParams = StaffListFilters & {
  /** Sent comma-separated; empty = no status param. */
  statuses: StaffStatus[];
  page: number;
  limit: StaffPageSize;
};

/**
 * Staff list query key — everything that changes the result is in it.
 * Under staffListQueryKeyRoot, so any staff/membership change refreshes it.
 */
export function staffPageQueryKey(params: StaffPageParams): readonly unknown[] {
  return [...staffListQueryKeyRoot, "page", params];
}

/**
 * ONE page of the Staff list — paging, staff_type, status, department,
 * subject and search all server-side (same discipline as
 * studentsApi.listStudentsPage). 50/100/200 are a single request; 500
 * fetches only the 200-row pages overlapping its window and slices it out;
 * "all" loops until has_more is false and returns everything as one page
 * (which Export then uses as-is). Capped at MAX_PAGES requests.
 */
export async function listStaffPage({ statuses, page, limit, ...filters }: StaffPageParams): Promise<CrudResult<StaffListPage>> {
  const safePage = limit === "all" ? 1 : Math.max(1, Math.floor(page));
  if (limit !== "all" && limit <= REQUEST_LIMIT_MAX) {
    return fetchStaffServerPage(filters, statuses, safePage, limit);
  }

  const windowStart = limit === "all" ? 0 : (safePage - 1) * limit;
  const windowEnd = limit === "all" ? Infinity : safePage * limit;
  const firstServerPage = Math.floor(windowStart / REQUEST_LIMIT_MAX) + 1;
  const firstRowOffset = (firstServerPage - 1) * REQUEST_LIMIT_MAX;
  const collected: Staff[] = [];
  let total = 0;
  for (let serverPage = firstServerPage; serverPage < firstServerPage + MAX_PAGES; serverPage += 1) {
    const result = await fetchStaffServerPage(filters, statuses, serverPage, REQUEST_LIMIT_MAX);
    if (!result.ok) return result;
    collected.push(...result.data.items);
    total = result.data.total;
    if (!result.data.hasMore || result.data.items.length === 0) break;
    if (serverPage * REQUEST_LIMIT_MAX >= windowEnd) break;
  }
  const items = collected.slice(windowStart - firstRowOffset, windowEnd - firstRowOffset);

  if (limit === "all") {
    return { ok: true, data: { items, total: items.length, page: 1, limit: Math.max(1, items.length), hasMore: false } };
  }
  return { ok: true, data: { items, total, page: safePage, limit, hasMore: windowEnd < total } };
}

/** Every matching staff, paged through 200 at a time — for pickers (e.g. Permission Group members), not the Staff list. */
export async function listAllStaff(
  filters: StaffListFilters = {},
  statuses: StaffStatus[] = [],
): Promise<CrudResult<Staff[]>> {
  const all: Staff[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await fetchStaffServerPage(filters, statuses, page, REQUEST_LIMIT_MAX);
    if (!result.ok) return result;
    all.push(...result.data.items);
    if (!result.data.hasMore || result.data.items.length === 0) break;
  }
  return { ok: true, data: all };
}

/** Picker list cache key (e.g. Permission Group members) — the caller picks which statuses. */
export const allStaffQueryKey = [...staffListQueryKeyRoot, "all"] as const;

function staffPath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

function staffResult(body: unknown): CrudResult<Staff> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
}

/** One staff record, with `academicYearId`'s assignments (carried forward from a prior year when that year has none). */
export async function getStaff(id: string, academicYearId: string | null): Promise<CrudResult<Staff>> {
  const query = academicYearId ? `?academic_year_id=${encodeURIComponent(academicYearId)}` : "";
  return sendHrRequest(channel, "GET", `${staffPath(id)}${query}`, undefined, staffResult);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** First Save Draft (or auto-save) of a new staff. */
export async function createStaffDraft(body: StaffWriteBody, currentStep: number): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", `${BASE_PATH}/drafts`, { ...body, current_step: currentStep }, staffResult);
}

/** Every later Save Draft of the same draft. */
export async function saveStaffDraft(id: string, body: StaffWriteBody, currentStep: number): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "PUT", `${staffPath(id)}/draft`, { ...body, current_step: currentStep }, staffResult);
}

/** Finish a draft: draft -> active, staff_no + credentials issued. */
export async function submitStaffDraft(id: string, body: StaffWriteBody): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", `${staffPath(id)}/submit`, body, staffResult);
}

/** Create an active staff directly, no draft involved. */
export async function createStaff(body: StaffWriteBody): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", BASE_PATH, body, staffResult);
}

/** Edit a non-draft staff. Writes body.academic_year_id's assignments only. */
export async function updateStaff(id: string, body: StaffWriteBody): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "PUT", staffPath(id), body, staffResult);
}

/** Hard delete — drafts only (409 NOT_A_DRAFT otherwise). */
export async function deleteStaffDraft(id: string): Promise<CrudResult<void>> {
  return sendHrRequest(channel, "DELETE", staffPath(id), undefined, () => ({ ok: true, data: undefined }));
}

/** The profile's cache entry — under staffListQueryKeyRoot, so every staff mutation refreshes it too. */
export function staffRecordQueryKey(id: string, academicYearId: string | null): readonly unknown[] {
  return [...staffListQueryKeyRoot, "record", id, academicYearId];
}

export function staffStatusEventsQueryKey(id: string): readonly unknown[] {
  return [...staffListQueryKeyRoot, "statusEvents", id];
}

// ---------------------------------------------------------------------------
// Status actions + credentials
// ---------------------------------------------------------------------------

/** The one Leaver flow: applies a category (retire / terminate / resign / abscond / suspend); login is turned off. */
export async function applyStaffLeaver(id: string, body: StaffLeaverBody): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", `${staffPath(id)}/leaver`, body, staffResult);
}

/** Any leaver back to active. Login stays off until an admin re-enables it. */
export async function reinstateStaff(id: string, body: StaffReinstateBody): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", `${staffPath(id)}/reinstate`, body, staffResult);
}

function statusEventFromWire(value: unknown): StaffStatusEvent {
  const r = asRecord(value) ?? {};
  const status = (field: unknown) => (STAFF_STATUSES.includes(field as StaffStatus) ? (field as StaffStatus) : null);
  return {
    type: r.type === "reinstate" ? "reinstate" : "leaver",
    category: STAFF_LEAVER_CATEGORIES.find((category) => category === r.category) ?? null,
    from_status: status(r.from_status),
    to_status: status(r.to_status),
    reason: strOrNull(r.reason),
    effective_date: strOrNull(r.effective_date),
    created_at: strOrNull(r.created_at),
    acted_by_user_id: strOrNull(r.acted_by_user_id),
    acted_by_name: strOrNull(r.acted_by_name),
  };
}

/** Oldest-first status history. */
export async function listStaffStatusEvents(id: string): Promise<CrudResult<StaffStatusEvent[]>> {
  return sendHrRequest(channel, "GET", `${staffPath(id)}/status-events`, undefined, (body) => ({
    ok: true,
    data: asArray(readData(body)).map(statusEventFromWire),
  }));
}

/** Issue credentials (never issued before). Username defaults to the email server-side; the password is the backend's default and is never returned. */
export async function issueStaffCredentials(id: string, username: string | null): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", `${staffPath(id)}/credentials`, username ? { username } : {}, staffResult);
}

/** Reset the password back to the default. */
export async function resetStaffCredentials(id: string): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "POST", `${staffPath(id)}/credentials/reset`, {}, staffResult);
}

/** Turn login on/off. On needs an active staff with credentials. */
export async function setStaffLoginActive(id: string, active: boolean): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "PATCH", `${staffPath(id)}/credentials/activate`, { active }, staffResult);
}

// ---------------------------------------------------------------------------
// Carry-forward assignment review (FLAGGED: proposed paths — see header)
// ---------------------------------------------------------------------------

export function assignmentReviewsQueryKey(academicYearId: string | null): readonly unknown[] {
  return [...staffListQueryKeyRoot, "assignmentReviews", academicYearId];
}

function reviewFromWire(value: unknown): AssignmentReviewItem {
  const r = asRecord(value) ?? {};
  return {
    id: str(r.id),
    staff_id: str(r.staff_id),
    staff_name: str(r.staff_name),
    kind: r.kind === "class_teacher" ? "class_teacher" : "subject",
    from_academic_year_id: strOrNull(r.from_academic_year_id),
    academic_year_id: str(r.academic_year_id),
    class_id: strOrNull(r.class_id),
    class_name: strOrNull(r.class_name),
    section_id: strOrNull(r.section_id),
    section_name: strOrNull(r.section_name),
    subject_id: strOrNull(r.subject_id),
    subject_name: strOrNull(r.subject_name),
    reason: strOrNull(r.reason),
  };
}

/** Carried-forward assignments the backend couldn't match into `academicYearId`, pending an admin decision. */
export async function listAssignmentReviews(academicYearId: string): Promise<CrudResult<AssignmentReviewItem[]>> {
  const query = new URLSearchParams({ academic_year_id: academicYearId, page: "1", limit: String(REQUEST_LIMIT_MAX) });
  return sendHrRequest(channel, "GET", `${BASE_PATH}/assignment-reviews?${query}`, undefined, (body) => ({
    ok: true,
    data: readListItems(body).map(reviewFromWire),
  }));
}

/** Remap into the review's target year (subject_id for subject assignments only). 409 DUPLICATE_* if the staff already holds it. */
export async function remapAssignmentReview(id: string, body: AssignmentRemapBody): Promise<CrudResult<void>> {
  return sendHrRequest(channel, "POST", `${BASE_PATH}/assignment-reviews/${encodeURIComponent(id)}/remap`, body, () => ({
    ok: true,
    data: undefined,
  }));
}

/** Drop the unmatched assignment — nothing is written to the new year. */
export async function discardAssignmentReview(id: string): Promise<CrudResult<void>> {
  return sendHrRequest(channel, "POST", `${BASE_PATH}/assignment-reviews/${encodeURIComponent(id)}/discard`, {}, () => ({
    ok: true,
    data: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Server-side subject search (assignment picker)
// ---------------------------------------------------------------------------

export type SubjectSearchResult = { id: string; name: string };

export function subjectSearchQueryKey(params: { search: string; academicYearId: string; classId: string }): readonly unknown[] {
  return ["hr", "subjectSearch", params];
}

/**
 * The backend's subject search, scoped to a year (and the row's class, so
 * only subjects offered to it come back). FLAGGED: param names proposed —
 * search / academic_year_id / class_id on GET erp/subject-masters.
 */
export async function searchSubjects(params: {
  search: string;
  academicYearId: string;
  classId: string;
}): Promise<CrudResult<SubjectSearchResult[]>> {
  const query = new URLSearchParams({ academic_year_id: params.academicYearId, page: "1", limit: "50" });
  if (params.classId) query.set("class_id", params.classId);
  const search = params.search.trim();
  if (search) query.set("search", search);
  return sendHrRequest(channel, "GET", `erp/subject-masters?${query}`, undefined, (body) => ({
    ok: true,
    data: readListItems(body)
      .map((item) => {
        const r = asRecord(item) ?? {};
        return { id: str(r.id), name: str(r.name) };
      })
      .filter((subject) => subject.id),
  }));
}
