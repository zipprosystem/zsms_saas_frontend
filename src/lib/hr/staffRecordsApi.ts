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
 *   GET    erp/staff?staff_type=&status=&department_id=&subject_id=&search=&page=&limit=
 *                         -> { items, total, page, limit, has_more } (limit max 200)
 *   GET    erp/staff/:id  -> Staff
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
    first_name: str(r.first_name),
    last_name: str(r.last_name),
    other_name: strOrNull(r.other_name),
    email: strOrNull(r.email),
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
    permission_group_ids: stringIds(r.permission_group_ids),
    present_address: addressFromWire(r.present_address),
    permanent_same_as_present: r.permanent_same_as_present !== false,
    permanent_address: addressFromWire(r.permanent_address),
    qualifications: rows<StaffQualification>(r.qualifications, (q) => ({
      degree: strOrNull(q.degree),
      grade: strOrNull(q.grade),
      result: strOrNull(q.result),
      year: strOrNull(q.year),
      institution: strOrNull(q.institution),
      status: strOrNull(q.status),
      session: strOrNull(q.session),
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
  staffType?: StaffType;
  departmentId?: string;
  subjectId?: string;
  search?: string;
};

export type StaffListPage = { items: Staff[]; total: number; page: number; limit: number; hasMore: boolean };

function listPath(filters: StaffListFilters, statuses: StaffStatus[], page: number, limit: number): string {
  const params = new URLSearchParams();
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

/** Picker list: every non-draft staff (members, line managers…). */
export const allStaffQueryKey = [...staffListQueryKeyRoot, "all"] as const;

export async function getStaff(id: string): Promise<CrudResult<Staff>> {
  return sendHrRequest(channel, "GET", `${BASE_PATH}/${encodeURIComponent(id)}`, undefined, (body) => {
    const entity = readEntity(body);
    return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
  });
}
