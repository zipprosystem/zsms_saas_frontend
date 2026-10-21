import type { CrudResult } from "@/lib/setup/crudTypes";
import {
  asArray,
  asRecord,
  readEntity,
  readListItems,
  readPageMeta,
  realTransport,
  sendHrRequest,
  str,
  stringIds,
  strOrNull,
  type HrChannel,
} from "@/lib/hr/hrHttp";
import { hrMockTransport } from "@/lib/hr/mock/hrMockBackend";
import {
  STAFF_STATUSES,
  type Staff,
  type StaffWriteBody,
  type StaffAddress,
  type StaffClassTeacherAssignment,
  type StaffExperience,
  type StaffQualification,
  type StaffReference,
  type StaffStatus,
  type StaffSubjectAssignment,
  type StaffType,
} from "@/lib/hr/hrTypes";

/**
 * Staff records (HR › Staffs) — MOCK until the backend ships it; flip
 * USE_MOCK to swap (nothing else changes, see hrHttp.ts).
 *
 * NOT the same thing as src/lib/staff/staffApi.ts: that's the REAL,
 * read-only GET erp/staff lookup ({ id = users.id, full_name, role })
 * behind Departments' Head / Senior line manager selects and Student
 * status history — it stays on the real API regardless of this flag. When
 * the backend ships the full staff list on the same route, the two
 * reconcile (open item for Muntajir: is staff.id === users.id?).
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
 *
 * academic_year_id scopes the two assignment sets (subject /
 * class-teacher) on reads AND writes — see hrMockBackend.ts for the
 * carry-forward rule. Every save sends the COMPLETE record.
 */
const USE_MOCK = true;

const channel: HrChannel = { transport: USE_MOCK ? hrMockTransport : realTransport, isMock: USE_MOCK };

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
    last_active_at: strOrNull(r.last_active_at),
    status_reason: strOrNull(r.status_reason),
    status_effective_on: strOrNull(r.status_effective_on),
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

/** Staffs list page sizes — same set as Students. 500 and "all" exceed one request's cap, so listStaffPage assembles them from sequential 200-row requests. */
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
 * Staffs list query key — everything that changes the result is in it.
 * Under staffListQueryKeyRoot, so any staff/membership change refreshes it.
 */
export function staffPageQueryKey(params: StaffPageParams): readonly unknown[] {
  return [...staffListQueryKeyRoot, "page", params];
}

/**
 * ONE page of the Staffs list — paging, staff_type, status, department,
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

/** Every matching staff, paged through 200 at a time — for pickers (e.g. Permission Group members), not the Staffs list. */
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
