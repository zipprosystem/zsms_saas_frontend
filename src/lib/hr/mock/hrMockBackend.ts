import { mockDelay } from "@/lib/onboarding/mockDelay";
import { academicYearsService } from "@/lib/setup/academicStructure/academicYearsApi";
import { normalizePermissions } from "@/lib/hr/permissionCatalog";
import {
  isLeaverStatus,
  LEAVER_CATEGORY_STATUS,
  STAFF_LEAVER_CATEGORIES,
  STAFF_STATUSES,
  type PermissionGroup,
  type Staff,
  type StaffLeaverCategory,
  type StaffStatusEvent,
  type StaffClassTeacherAssignment,
  type StaffPost,
  type StaffStatus,
  type StaffSubjectAssignment,
} from "@/lib/hr/hrTypes";
import type { HttpMethod, Transport, WireResponse } from "@/lib/hr/hrHttp";
import { SEED_PERMISSION_GROUPS, SEED_STAFF, SEED_STAFF_POSTS } from "@/lib/hr/mock/hrMockSeeds";
import { SCHOOL_TWO_FACTOR_ENABLED } from "@/lib/hr/schoolSecurity";

/**
 * MOCK HR backend — a localStorage-backed stand-in that answers the
 * PROPOSED HR endpoints at the HTTP level (ERP envelope, status codes,
 * error bodies), so each service's USE_MOCK flip changes nothing above
 * its transport. One shared in-browser "database" for all HR services,
 * because the rules cross entities (a Staff Post in use can't be deleted;
 * group membership shows on the staff record).
 *
 * Every rule here is BACKEND-OWNED and commented so this file doubles as
 * the spec for Muntajir:
 *
 *   GET    erp/staff?academic_year_id=&staff_type=&status=&department_id=&subject_id=&search=&page=&limit=
 *            -> { items, total, page, limit, has_more }; status comma-separated;
 *            limit max 200 (422 above, same cap as Student Core); sorted by
 *            last_name, first_name. search matches name, email and staff_no
 *            (subject-name search needs the backend's join — the mock only
 *            knows subject ids). academic_year_id picks which year's
 *            assignments come back (and subject_id filters on that year).
 *   GET    erp/staff/:id?academic_year_id=
 *   POST   erp/staff/drafts          body + current_step -> draft (status=draft, no staff_no)
 *   PUT    erp/staff/:id/draft       body + current_step (409 NOT_A_DRAFT otherwise)
 *   POST   erp/staff/:id/submit      body — draft -> active, staff_no + credentials issued
 *   POST   erp/staff                 body — create active directly
 *   PUT    erp/staff/:id             body — edit a non-draft staff
 *   DELETE erp/staff/:id             drafts only (409 NOT_A_DRAFT) — a real staff
 *                                    leaves via Retire/Terminate, never a delete
 *   POST   erp/staff/:id/leaver     { category, effective_date, reason } — see applyLeaver
 *   POST   erp/staff/:id/reinstate  { effective_date, reason }
 *   GET    erp/staff/:id/status-events  oldest-first staff_status_event list
 *   POST   erp/staff/:id/credentials           issue  — see handleCredentials
 *   POST   erp/staff/:id/credentials/reset     reset to the default password
 *   PATCH  erp/staff/:id/credentials/activate  { active }
 *   GET/POST          erp/staff-posts            { name, is_active }
 *   PUT/DELETE        erp/staff-posts/:id        DELETE 409 STAFF_POST_IN_USE while any staff holds it
 *   GET/POST          erp/permission-groups      { name, permissions[], member_staff_ids[] }
 *   PUT/DELETE        erp/permission-groups/:id
 *
 * YEAR-SCOPED ASSIGNMENTS (proposed contract): subject assignments and
 * class-teacher assignments carry academic_year_id — a write sends
 * academic_year_id + both sets and replaces THAT year's sets only; years
 * are independent. CARRY-FORWARD: when a read asks for a year that has no
 * sets for a staff yet, the most recent PRIOR year's sets come back as
 * editable defaults, with assignments_carried_forward_from naming that
 * year; nothing is stored for the new year until a save. (Real backend:
 * copy-forward on new-year creation — the general session-rollover
 * pattern. The mock derives it on read instead, same visible result.)
 * At swap, class-teacher rows also write the class-arm's form-tutor link.
 * UNIQUE KEYS (409, every save incl. drafts): subject assignment =
 * staff + subject + class-arm + year (DUPLICATE_SUBJECT_ASSIGNMENT);
 * class-teacher = staff + class-arm + year
 * (DUPLICATE_CLASS_TEACHER_ASSIGNMENT). A class-arm (section) belongs to
 * one class, so class_id adds nothing to either key.
 *
 * Derived on read (compute-on-read, never stored twice):
 *   - staff.permission_group_ids from group membership (the group owns it;
 *     a staff write carrying permission_group_ids updates the groups)
 *   - staff_post.staff_count from staff.post_id
 *
 * Credentials: no password is ever stored or returned here. On finalize
 * (submit/create) the backend issues username (defaults to email) + the
 * default password 123456; must_change_password is set only when the
 * school has 2FA on (SCHOOL_TWO_FACTOR_ENABLED — a stub, schoolSecurity.ts).
 *
 * Effective access / data-scope roll-up is NOT modelled — the mock only
 * stores assignments, it never enforces anything.
 */

// Bumping the prefix re-seeds the mock rather than migrating test data
// (v2: assignments per year).
// v4: Leaver categories (v3: status events + credential timestamps). Re-seeds; test data resets.
const STORAGE_PREFIX = "zsms.mockHr.v4";
const REQUEST_LIMIT_MAX = 200;


type YearAssignments = {
  subject_assignments: StaffSubjectAssignment[];
  class_teacher_assignments: StaffClassTeacherAssignment[];
  saved_at: string;
};

/** How a staff row is stored: assignments keyed by year, membership kept on the groups, status history alongside. */
type StoredStaff = Omit<
  Staff,
  | "subject_assignments"
  | "class_teacher_assignments"
  | "assignments_academic_year_id"
  | "assignments_carried_forward_from"
  | "permission_group_ids"
> & { assignments_by_year: Record<string, YearAssignments>; status_events: StaffStatusEvent[] };

type Tables = {
  staff: StoredStaff[];
  staffPosts: StaffPost[];
  permissionGroups: PermissionGroup[];
};

type TableName = keyof Tables;

/** Seed rows carry no assignments or memberships of their own — strip the read-only projections. */
function toStored(staff: Staff): StoredStaff {
  const rest: Partial<Staff> = { ...staff };
  delete rest.subject_assignments;
  delete rest.class_teacher_assignments;
  delete rest.assignments_academic_year_id;
  delete rest.assignments_carried_forward_from;
  delete rest.permission_group_ids;
  // A seeded leaver gets the one Leaver event that explains its status.
  const category = STAFF_LEAVER_CATEGORIES.find((item) => LEAVER_CATEGORY_STATUS[item] === staff.status) ?? null;
  const status_events: StaffStatusEvent[] = category
    ? [
        {
          type: "leaver",
          category,
          from_status: "active",
          to_status: staff.status,
          reason: staff.status_reason,
          effective_date: staff.status_effective_date,
          created_at: staff.updated_at,
        },
      ]
    : [];
  return { ...(rest as Omit<StoredStaff, "assignments_by_year" | "status_events">), assignments_by_year: {}, status_events };
}

const SEEDS: Tables = {
  staff: SEED_STAFF.map(toStored),
  staffPosts: SEED_STAFF_POSTS,
  permissionGroups: SEED_PERMISSION_GROUPS,
};

const cache: Partial<Tables> = {};

function load<K extends TableName>(name: K): Tables[K] {
  const cached = cache[name];
  if (cached) return cached;
  let rows = structuredClone(SEEDS[name]);
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}.${name}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) rows = parsed as Tables[K];
    } catch {
      // Corrupt JSON / storage disabled — fall back to the seeds.
    }
  }
  cache[name] = rows;
  return rows;
}

function save<K extends TableName>(name: K, rows: Tables[K]): void {
  cache[name] = rows;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}.${name}`, JSON.stringify(rows));
  } catch {
    // Best-effort; the in-memory copy still works for this session.
  }
}

export function mockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

function listBody<T>(items: T[], page: number, limit: number, total: number) {
  return ok({ items, total, page, limit, has_more: page * limit < total });
}

function record(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textOrNull(value: unknown): string | null {
  return text(value) || null;
}

/** Case-insensitive uniqueness, ignoring `exceptId`. */
function nameTaken(rows: Array<{ id: string; name: string }>, name: string, exceptId?: string): boolean {
  const needle = name.toLowerCase();
  return rows.some((row) => row.id !== exceptId && row.name.toLowerCase() === needle);
}

// ---------------------------------------------------------------------------
// Academic-year order — for carry-forward's "most recent PRIOR year"
// ---------------------------------------------------------------------------

/**
 * Year start dates, so "prior" means an earlier start_date (the backend
 * knows this natively). Read from the real Academic Years service; under
 * dev-bypass that's unavailable, so carry-forward falls back to the most
 * recently SAVED other year.
 */
let yearStartsPromise: Promise<Map<string, string>> | null = null;

/** Cached; re-read once when asked about a year it hasn't seen (e.g. one created since). */
async function yearStarts(yearId: string | null): Promise<Map<string, string>> {
  const fetchStarts = () =>
    academicYearsService
      .list()
      .then((result) => new Map(result.ok ? result.data.map((year) => [year.id, year.start_date] as const) : []))
      .catch(() => new Map<string, string>());
  yearStartsPromise ??= fetchStarts();
  const starts = await yearStartsPromise;
  if (!yearId || starts.has(yearId) || starts.size === 0) return starts;
  yearStartsPromise = fetchStarts();
  return yearStartsPromise;
}

function priorYearWithAssignments(
  byYear: Record<string, YearAssignments>,
  targetYearId: string,
  starts: Map<string, string>,
): string | null {
  const otherYears = Object.keys(byYear).filter((yearId) => yearId !== targetYearId);
  if (otherYears.length === 0) return null;
  const targetStart = starts.get(targetYearId);
  if (targetStart) {
    const prior = otherYears
      .filter((yearId) => (starts.get(yearId) ?? "") < targetStart && starts.has(yearId))
      .sort((a, b) => (starts.get(b) ?? "").localeCompare(starts.get(a) ?? ""));
    if (prior.length > 0) return prior[0];
    if (otherYears.every((yearId) => starts.has(yearId))) return null; // only LATER years have sets
  }
  // Order unknown (dev-bypass / unknown year): most recently saved other year.
  return otherYears.sort((a, b) => byYear[b].saved_at.localeCompare(byYear[a].saved_at))[0];
}

// ---------------------------------------------------------------------------
// Staff — read projection
// ---------------------------------------------------------------------------

/** The staff record as the API returns it for `yearId`: that year's sets (or carried forward), membership from the groups. */
function staffForRead(staff: StoredStaff, yearId: string | null, starts: Map<string, string>): Staff {
  const { assignments_by_year: byYear, status_events: _events, ...rest } = staff;
  void _events;
  let sets: Pick<YearAssignments, "subject_assignments" | "class_teacher_assignments"> = {
    subject_assignments: [],
    class_teacher_assignments: [],
  };
  let carriedFrom: string | null = null;
  if (yearId) {
    if (byYear[yearId]) {
      sets = byYear[yearId];
    } else {
      const prior = priorYearWithAssignments(byYear, yearId, starts);
      if (prior) {
        sets = byYear[prior];
        carriedFrom = prior;
      }
    }
  }
  const groups = load("permissionGroups");
  return {
    ...rest,
    subject_assignments: structuredClone(sets.subject_assignments),
    class_teacher_assignments: structuredClone(sets.class_teacher_assignments),
    assignments_academic_year_id: yearId,
    assignments_carried_forward_from: carriedFrom,
    permission_group_ids: groups.filter((group) => group.member_staff_ids.includes(staff.id)).map((group) => group.id),
  };
}

function matchesStaffQuery(staff: Staff, query: URLSearchParams): boolean {
  const staffType = query.get("staff_type");
  if (staffType && staff.staff_type !== staffType) return false;

  const statuses = (query.get("status") ?? "").split(",").filter((status): status is StaffStatus =>
    STAFF_STATUSES.includes(status as StaffStatus),
  );
  if (statuses.length > 0 && !statuses.includes(staff.status)) return false;

  const departmentId = query.get("department_id");
  if (departmentId && !staff.department_ids.includes(departmentId)) return false;

  const subjectId = query.get("subject_id");
  if (subjectId && !staff.subject_assignments.some((assignment) => assignment.subject_id === subjectId)) return false;

  const search = (query.get("search") ?? "").trim().toLowerCase();
  if (search) {
    const haystack = [staff.first_name, staff.other_name, staff.last_name, staff.email, staff.staff_no]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

async function listStaff(query: URLSearchParams): Promise<WireResponse> {
  const page = Math.max(1, Number(query.get("page")) || 1);
  const limit = Number(query.get("limit")) || 50;
  if (limit < 1 || limit > REQUEST_LIMIT_MAX) {
    return fail(422, "VALIDATION_ERROR", `limit must be between 1 and ${REQUEST_LIMIT_MAX}`);
  }
  const yearId = query.get("academic_year_id") || null;
  const starts = await yearStarts(yearId);
  const matching = load("staff")
    .map((staff) => staffForRead(staff, yearId, starts))
    .filter((staff) => matchesStaffQuery(staff, query))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  return listBody(matching.slice((page - 1) * limit, page * limit), page, limit, matching.length);
}

// ---------------------------------------------------------------------------
// Staff — writes
// ---------------------------------------------------------------------------

type StaffFields = Omit<
  StoredStaff,
  | "id"
  | "staff_no"
  | "status"
  | "draft_last_step"
  | "assignments_by_year"
  | "status_events"
  | "created_at"
  | "updated_at"
  | "last_active_at"
  | "must_change_password"
  | "credentials_issued_at"
  | "password_reset_at"
  | "status_reason"
  | "status_effective_date"
>;

type ParsedBody = {
  fields: StaffFields;
  yearId: string | null;
  subjectAssignments: StaffSubjectAssignment[];
  classTeacherAssignments: StaffClassTeacherAssignment[];
  /** null = field absent, leave memberships alone. */
  permissionGroupIds: string[] | null;
};

function arrayOf<T>(value: unknown, map: (row: Record<string, unknown>) => T | null): T[] {
  return Array.isArray(value) ? value.map((item) => map(record(item))).filter((item): item is T => item !== null) : [];
}

function addressOf(value: unknown): Staff["present_address"] {
  const r = record(value);
  if (!Object.keys(r).length) return null;
  return {
    country_code: textOrNull(r.country_code),
    state_code: textOrNull(r.state_code),
    city: textOrNull(r.city),
    postal_code: textOrNull(r.postal_code),
    mobile: textOrNull(r.mobile),
    address_line: textOrNull(r.address_line),
  };
}

function parseBody(payload: unknown): ParsedBody {
  const b = record(payload);
  const sameAsPresent = b.permanent_same_as_present !== false;
  return {
    fields: {
      photo_file_id: textOrNull(b.photo_file_id),
      signature_file_id: textOrNull(b.signature_file_id),
      title: textOrNull(b.title),
      initials: textOrNull(b.initials),
      first_name: text(b.first_name),
      last_name: text(b.last_name),
      other_name: textOrNull(b.other_name),
      email: textOrNull(b.email)?.toLowerCase() ?? null,
      national_id: textOrNull(b.national_id),
      gender: b.gender === "male" || b.gender === "female" ? b.gender : null,
      date_of_birth: textOrNull(b.date_of_birth),
      date_joined: textOrNull(b.date_joined),
      staff_type: b.staff_type === "non_teaching" ? "non_teaching" : "teaching",
      post_id: textOrNull(b.post_id),
      department_ids: Array.from(
        new Set(
          (Array.isArray(b.department_ids) ? b.department_ids : []).filter(
            (id): id is string => typeof id === "string" && !!id,
          ),
        ),
      ),
      present_address: addressOf(b.present_address),
      permanent_same_as_present: sameAsPresent,
      // "Same as present" is the source of truth — no stale copy kept.
      permanent_address: sameAsPresent ? null : addressOf(b.permanent_address),
      qualifications: arrayOf(b.qualifications, (q) => ({
        degree: textOrNull(q.degree),
        stream: textOrNull(q.stream),
        board: textOrNull(q.board),
        institution: textOrNull(q.institution),
        year: textOrNull(q.year),
        result: textOrNull(q.result),
        rank: textOrNull(q.rank),
        duration: textOrNull(q.duration),
        remarks: textOrNull(q.remarks),
      })),
      references: arrayOf(b.references, (r) => ({
        name: textOrNull(r.name),
        organization: textOrNull(r.organization),
        designation: textOrNull(r.designation),
        phone: textOrNull(r.phone),
        email: textOrNull(r.email),
      })),
      experience: arrayOf(b.experience, (e) => ({
        organization: textOrNull(e.organization),
        role: textOrNull(e.role),
        tenure_from: textOrNull(e.tenure_from),
        tenure_to: textOrNull(e.tenure_to),
      })),
      username: textOrNull(b.username)?.toLowerCase() ?? null,
      login_active: b.login_active === true,
    },
    yearId: textOrNull(b.academic_year_id),
    subjectAssignments: arrayOf(b.subject_assignments, (a) =>
      text(a.class_id) && text(a.section_id) && text(a.subject_id)
        ? { class_id: text(a.class_id), section_id: text(a.section_id), subject_id: text(a.subject_id) }
        : null,
    ),
    classTeacherAssignments: arrayOf(b.class_teacher_assignments, (a) =>
      text(a.class_id) && text(a.section_id) ? { class_id: text(a.class_id), section_id: text(a.section_id) } : null,
    ),
    permissionGroupIds: Array.isArray(b.permission_group_ids)
      ? b.permission_group_ids.filter((id): id is string => typeof id === "string")
      : null,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NATIONAL_ID_MAX_LENGTH = 32;

function hasDuplicate(keys: string[]): boolean {
  return new Set(keys).size !== keys.length;
}

/** Checks every save runs (drafts too): format/uniqueness of what IS filled in, and the assignment rules. */
function validateCommon(parsed: ParsedBody, exceptId: string | null): WireResponse | null {
  const { fields } = parsed;
  if (fields.email && !EMAIL_PATTERN.test(fields.email)) return fail(422, "VALIDATION_ERROR", "email must be a valid email");
  // Optional and country-agnostic: trimmed, max 32 — no format rule (national-ID formats vary).
  if (fields.national_id && fields.national_id.length > NATIONAL_ID_MAX_LENGTH) {
    return fail(422, "VALIDATION_ERROR", `national_id must be at most ${NATIONAL_ID_MAX_LENGTH} characters`);
  }
  const others = load("staff").filter((staff) => staff.id !== exceptId);
  if (fields.email && others.some((staff) => staff.email?.toLowerCase() === fields.email)) {
    return fail(409, "DUPLICATE_EMAIL", "Another staff already uses this email");
  }
  if (fields.username && /\s/.test(fields.username)) return fail(422, "VALIDATION_ERROR", "username must not contain spaces");
  if (fields.username && others.some((staff) => staff.username?.toLowerCase() === fields.username)) {
    return fail(409, "USERNAME_TAKEN", "This username is already taken");
  }
  if (fields.post_id && !load("staffPosts").some((post) => post.id === fields.post_id)) {
    return fail(422, "VALIDATION_ERROR", "post_id does not match a staff post");
  }
  // Non-teaching staff hold no subject or class-teacher assignments.
  if (fields.staff_type === "non_teaching" && parsed.subjectAssignments.length > 0) {
    return fail(422, "VALIDATION_ERROR", "subject_assignments are only allowed for teaching staff");
  }
  if (fields.staff_type === "non_teaching" && parsed.classTeacherAssignments.length > 0) {
    return fail(422, "VALIDATION_ERROR", "class_teacher_assignments are only allowed for teaching staff");
  }
  // UNIQUE within a year (the body carries ONE year's complete sets):
  //   subject assignment  = staff + subject + class-arm + year
  //   class-teacher       = staff + class-arm + year
  // A repeat is rejected, never silently collapsed.
  if (hasDuplicate(parsed.subjectAssignments.map((a) => `${a.section_id}|${a.subject_id}`))) {
    return fail(409, "DUPLICATE_SUBJECT_ASSIGNMENT", "The same subject is assigned to the same class-arm more than once");
  }
  if (hasDuplicate(parsed.classTeacherAssignments.map((a) => a.section_id))) {
    return fail(409, "DUPLICATE_CLASS_TEACHER_ASSIGNMENT", "The same class-arm is listed as class-teacher more than once");
  }
  const hasAssignments = parsed.subjectAssignments.length > 0 || parsed.classTeacherAssignments.length > 0;
  if (hasAssignments && !parsed.yearId) {
    return fail(422, "VALIDATION_ERROR", "academic_year_id is required when sending assignments");
  }
  return null;
}

/** Finalize (submit / create / update): only Staff Details core + Staff Post are required — everything else is optional. */
function validateFinal(parsed: ParsedBody): WireResponse | null {
  const { fields } = parsed;
  if (!fields.first_name) return fail(422, "VALIDATION_ERROR", "first_name is required");
  if (!fields.last_name) return fail(422, "VALIDATION_ERROR", "last_name is required");
  if (!fields.email) return fail(422, "VALIDATION_ERROR", "email is required");
  if (!fields.gender) return fail(422, "VALIDATION_ERROR", "gender is required");
  if (!fields.post_id) return fail(422, "VALIDATION_ERROR", "post_id is required");
  return null;
}

/** Writes the request year's sets only — other years are independent and untouched. */
function withYearAssignments(staff: StoredStaff, parsed: ParsedBody, now: string): StoredStaff {
  if (!parsed.yearId) return staff;
  return {
    ...staff,
    assignments_by_year: {
      ...staff.assignments_by_year,
      [parsed.yearId]: {
        subject_assignments: parsed.fields.staff_type === "teaching" ? parsed.subjectAssignments : [],
        class_teacher_assignments: parsed.fields.staff_type === "teaching" ? parsed.classTeacherAssignments : [],
        saved_at: now,
      },
    },
  };
}

/** The group owns membership: a staff write carrying permission_group_ids sets exactly those memberships for this staff. */
function applyMemberships(staffId: string, groupIds: string[] | null): void {
  if (!groupIds) return;
  const wanted = new Set(groupIds);
  save(
    "permissionGroups",
    load("permissionGroups").map((group) => {
      const isMember = group.member_staff_ids.includes(staffId);
      if (wanted.has(group.id) && !isMember) return { ...group, member_staff_ids: [...group.member_staff_ids, staffId] };
      if (!wanted.has(group.id) && isMember) {
        return { ...group, member_staff_ids: group.member_staff_ids.filter((id) => id !== staffId) };
      }
      return group;
    }),
  );
}

function nextStaffNo(): string {
  const highest = load("staff").reduce((max, staff) => {
    const n = Number(staff.staff_no?.replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 1000);
  return `STF/${highest + 1}`;
}

/** Issue credentials on finalize: username defaults to the email; forced change only with 2FA on. Password is the backend's default (123456), never returned. */
function withCredentials(
  fields: StaffFields,
  now: string,
): Pick<StoredStaff, "username" | "login_active" | "must_change_password" | "credentials_issued_at" | "password_reset_at"> {
  return {
    username: fields.username || fields.email,
    login_active: fields.login_active,
    must_change_password: SCHOOL_TWO_FACTOR_ENABLED,
    credentials_issued_at: now,
    password_reset_at: null,
  };
}

function currentStep(payload: unknown): number | null {
  const step = record(payload).current_step;
  return typeof step === "number" && step >= 1 ? Math.floor(step) : null;
}

async function respondWithStaff(staff: StoredStaff, yearId: string | null, status = 200): Promise<WireResponse> {
  return ok(staffForRead(staff, yearId, await yearStarts(yearId)), status);
}

function replaceStaff(next: StoredStaff): void {
  save("staff", load("staff").map((staff) => (staff.id === next.id ? next : staff)));
}

// ---------------------------------------------------------------------------
// Staff — status actions (staff_status_event) and credentials
// ---------------------------------------------------------------------------

/**
 * ONE Leaver flow (parallel to the students' Withdraw) + Reinstate:
 *   POST /staff/:id/leaver     { category, effective_date, reason }
 *     category: retire | terminate | resign | abscond | suspend, setting
 *     retired | terminated | resigned | absconded | suspended.
 *     Allowed from active, or from suspended into any OTHER category (a
 *     suspension can end in a retirement/termination/resignation/...);
 *     any other leaver must be reinstated first (409
 *     INVALID_STATUS_TRANSITION).
 *   POST /staff/:id/reinstate  { effective_date, reason } — any leaver -> active.
 * reason + effective_date (YYYY-MM-DD) required on both. Leaving turns
 * login OFF; reinstating does NOT turn it back on (the admin re-enables
 * login explicitly). The status changes when the action is recorded — a
 * future effective_date is stored as-is, not scheduled (open item).
 * Each action appends a staff_status_event { type, category, from/to, reason, effective_date }.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readReasonAndDate(payload: unknown): { reason: string; effectiveDate: string } | WireResponse {
  const body = record(payload);
  const reason = text(body.reason);
  const effectiveDate = text(body.effective_date);
  if (!reason) return fail(422, "VALIDATION_ERROR", "reason is required");
  if (!DATE_PATTERN.test(effectiveDate)) return fail(422, "VALIDATION_ERROR", "effective_date is required (YYYY-MM-DD)");
  return { reason, effectiveDate };
}

async function applyLeaver(existing: StoredStaff, payload: unknown, now: string): Promise<WireResponse> {
  const category = STAFF_LEAVER_CATEGORIES.find((item) => item === record(payload).category) as StaffLeaverCategory | undefined;
  if (!category) return fail(422, "VALIDATION_ERROR", "category must be one of retire, terminate, resign, abscond, suspend");
  const to = LEAVER_CATEGORY_STATUS[category];
  const allowed = existing.status === "active" || (existing.status === "suspended" && to !== "suspended");
  if (!allowed) {
    return fail(409, "INVALID_STATUS_TRANSITION", `A ${existing.status} staff can't be moved to ${to} — reinstate them first`);
  }
  const input = readReasonAndDate(payload);
  if ("status" in input) return input;
  return recordStatusChange(existing, { type: "leaver", category, to, ...input }, now);
}

async function applyReinstate(existing: StoredStaff, payload: unknown, now: string): Promise<WireResponse> {
  if (!isLeaverStatus(existing.status)) {
    return fail(409, "INVALID_STATUS_TRANSITION", `A ${existing.status} staff can't be reinstated`);
  }
  const input = readReasonAndDate(payload);
  if ("status" in input) return input;
  return recordStatusChange(existing, { type: "reinstate", category: null, to: "active", ...input }, now);
}

async function recordStatusChange(
  existing: StoredStaff,
  change: { type: StaffStatusEvent["type"]; category: StaffLeaverCategory | null; to: StaffStatus; reason: string; effectiveDate: string },
  now: string,
): Promise<WireResponse> {
  const isLeaving = change.type === "leaver";
  const event: StaffStatusEvent = {
    type: change.type,
    category: change.category,
    from_status: existing.status,
    to_status: change.to,
    reason: change.reason,
    effective_date: change.effectiveDate,
    created_at: now,
  };
  const next: StoredStaff = {
    ...existing,
    status: change.to,
    status_reason: isLeaving ? change.reason : null,
    status_effective_date: isLeaving ? change.effectiveDate : null,
    login_active: isLeaving ? false : existing.login_active,
    status_events: [...(existing.status_events ?? []), event],
    updated_at: now,
  };
  replaceStaff(next);
  return respondWithStaff(next, null);
}

/**
 *   POST  erp/staff/:id/credentials           { username? } issue — 409 CREDENTIALS_ALREADY_ISSUED;
 *                                             username defaults to the email; login ON
 *   POST  erp/staff/:id/credentials/reset     back to the default password (123456) — 409 CREDENTIALS_NOT_ISSUED
 *   PATCH erp/staff/:id/credentials/activate  { active } — turning ON needs an active staff (409 STAFF_NOT_ACTIVE)
 * Issue/reset set must_change_password only when the school has 2FA on.
 * No route ever returns a password.
 */
function handleCredentials(
  method: HttpMethod,
  existing: StoredStaff,
  sub: string | null,
  payload: unknown,
  now: string,
): Promise<WireResponse> | WireResponse {
  const issued = !!existing.credentials_issued_at;
  if (existing.status === "draft") return fail(409, "NOT_A_DRAFT", "Add the staff before issuing credentials");

  if (method === "POST" && !sub) {
    if (issued) return fail(409, "CREDENTIALS_ALREADY_ISSUED", "Credentials were already issued — reset them instead");
    if (existing.status !== "active") return fail(409, "STAFF_NOT_ACTIVE", "Only an active staff can be issued credentials");
    const username = (text(record(payload).username) || existing.email || "").toLowerCase();
    if (!username) return fail(422, "VALIDATION_ERROR", "username is required");
    if (/\s/.test(username)) return fail(422, "VALIDATION_ERROR", "username must not contain spaces");
    if (load("staff").some((staff) => staff.id !== existing.id && staff.username?.toLowerCase() === username)) {
      return fail(409, "USERNAME_TAKEN", "This username is already taken");
    }
    const next: StoredStaff = {
      ...existing,
      username,
      login_active: true,
      must_change_password: SCHOOL_TWO_FACTOR_ENABLED,
      credentials_issued_at: now,
      password_reset_at: null,
      updated_at: now,
    };
    replaceStaff(next);
    return respondWithStaff(next, null);
  }

  if (!issued) return fail(409, "CREDENTIALS_NOT_ISSUED", "Issue credentials first");

  if (method === "POST" && sub === "reset") {
    const next: StoredStaff = { ...existing, must_change_password: SCHOOL_TWO_FACTOR_ENABLED, password_reset_at: now, updated_at: now };
    replaceStaff(next);
    return respondWithStaff(next, null);
  }

  if (method === "PATCH" && sub === "activate") {
    const active = record(payload).active === true;
    if (active && existing.status !== "active") return fail(409, "STAFF_NOT_ACTIVE", "Only an active staff can have login turned on");
    const next: StoredStaff = { ...existing, login_active: active, updated_at: now };
    replaceStaff(next);
    return respondWithStaff(next, null);
  }

  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

async function handleStaff(
  method: HttpMethod,
  rest: string | null,
  payload: unknown,
  query: URLSearchParams,
): Promise<WireResponse> {
  const now = new Date().toISOString();
  if (method === "GET" && !rest) return listStaff(query);

  if (method === "POST" && (rest === null || rest === "drafts")) {
    const isDraft = rest === "drafts";
    const parsed = parseBody(payload);
    if (isDraft && currentStep(payload) === null) return fail(422, "VALIDATION_ERROR", "current_step is required");
    const invalid = validateCommon(parsed, null) ?? (isDraft ? null : validateFinal(parsed));
    if (invalid) return invalid;
    let created: StoredStaff = {
      ...parsed.fields,
      id: mockId(),
      staff_no: isDraft ? null : nextStaffNo(),
      status: isDraft ? "draft" : "active",
      draft_last_step: isDraft ? currentStep(payload) : null,
      // A draft keeps the intended username/login toggle, but nothing is issued until finalize.
      ...(isDraft
        ? { must_change_password: false, credentials_issued_at: null, password_reset_at: null }
        : withCredentials(parsed.fields, now)),
      last_active_at: null,
      status_reason: null,
      status_effective_date: null,
      assignments_by_year: {},
      status_events: [],
      created_at: now,
      updated_at: now,
    };
    created = withYearAssignments(created, parsed, now);
    save("staff", [...load("staff"), created]);
    applyMemberships(created.id, parsed.permissionGroupIds);
    return respondWithStaff(created, parsed.yearId, 201);
  }

  const [id, action = null] = (rest ?? "").split("/");
  const existing = load("staff").find((staff) => staff.id === id);
  if (!existing) return fail(404, "STAFF_NOT_FOUND", "Staff not found");

  if (method === "GET" && !action) return respondWithStaff(existing, query.get("academic_year_id") || null);

  if (method === "PUT" && action === "draft") {
    if (existing.status !== "draft") return fail(409, "NOT_A_DRAFT", "Only a draft can be saved as a draft");
    const parsed = parseBody(payload);
    if (currentStep(payload) === null) return fail(422, "VALIDATION_ERROR", "current_step is required");
    const invalid = validateCommon(parsed, existing.id);
    if (invalid) return invalid;
    const next = withYearAssignments({ ...existing, ...parsed.fields, draft_last_step: currentStep(payload), updated_at: now }, parsed, now);
    replaceStaff(next);
    applyMemberships(next.id, parsed.permissionGroupIds);
    return respondWithStaff(next, parsed.yearId);
  }

  if (method === "POST" && action === "submit") {
    if (existing.status !== "draft") return fail(409, "NOT_A_DRAFT", "Only a draft can be submitted");
    const parsed = parseBody(payload);
    const invalid = validateCommon(parsed, existing.id) ?? validateFinal(parsed);
    if (invalid) return invalid;
    const next = withYearAssignments(
      {
        ...existing,
        ...parsed.fields,
        ...withCredentials(parsed.fields, now),
        staff_no: existing.staff_no ?? nextStaffNo(),
        status: "active",
        draft_last_step: null,
        updated_at: now,
      },
      parsed,
      now,
    );
    replaceStaff(next);
    applyMemberships(next.id, parsed.permissionGroupIds);
    return respondWithStaff(next, parsed.yearId);
  }

  if (method === "PUT" && !action) {
    if (existing.status === "draft") return fail(409, "NOT_A_DRAFT", "Submit the draft instead of updating it");
    const parsed = parseBody(payload);
    const invalid = validateCommon(parsed, existing.id) ?? validateFinal(parsed);
    if (invalid) return invalid;
    // Edit never issues or re-issues credentials (that's POST
    // /credentials). With credentials, username is an admin override; login
    // can only be ON for an active staff (leaving the roster turns it off).
    const issued = !!existing.credentials_issued_at;
    const next = withYearAssignments(
      {
        ...existing,
        ...parsed.fields,
        username: issued ? parsed.fields.username || existing.username : null,
        login_active: issued && existing.status === "active" ? parsed.fields.login_active : false,
        updated_at: now,
      },
      parsed,
      now,
    );
    replaceStaff(next);
    applyMemberships(next.id, parsed.permissionGroupIds);
    return respondWithStaff(next, parsed.yearId);
  }

  if (method === "GET" && action === "status-events") return ok(existing.status_events ?? []);

  if (method === "POST" && action === "leaver") return applyLeaver(existing, payload, now);
  if (method === "POST" && action === "reinstate") return applyReinstate(existing, payload, now);

  if (action === "credentials") return handleCredentials(method, existing, (rest ?? "").split("/")[2] ?? null, payload, now);

  if (method === "DELETE" && !action) {
    if (existing.status !== "draft") return fail(409, "NOT_A_DRAFT", "Only a draft can be deleted");
    save("staff", load("staff").filter((staff) => staff.id !== existing.id));
    applyMemberships(existing.id, []);
    return ok(null);
  }

  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

// ---------------------------------------------------------------------------
// Staff Posts — label-only designations master
// ---------------------------------------------------------------------------

function postForRead(post: StaffPost): StaffPost {
  return { ...post, staff_count: load("staff").filter((staff) => staff.post_id === post.id).length };
}

function handleStaffPosts(method: HttpMethod, id: string | null, payload: unknown): WireResponse {
  const posts = load("staffPosts");

  if (method === "GET" && !id) {
    const items = [...posts].sort((a, b) => a.name.localeCompare(b.name)).map(postForRead);
    return listBody(items, 1, Math.max(1, items.length), items.length);
  }

  if (method === "POST" && !id) {
    const body = record(payload);
    const name = text(body.name);
    if (!name) return fail(422, "VALIDATION_ERROR", "name is required");
    if (nameTaken(posts, name)) return fail(409, "DUPLICATE_NAME", "A staff post with this name already exists");
    const created: StaffPost = { id: mockId(), name, is_active: body.is_active !== false, staff_count: null };
    save("staffPosts", [...posts, created]);
    return ok(postForRead(created), 201);
  }

  const existing = id ? posts.find((post) => post.id === id) : undefined;
  if (!existing) return fail(404, "STAFF_POST_NOT_FOUND", "Staff post not found");

  if (method === "PUT") {
    const body = record(payload);
    const name = text(body.name);
    if (!name) return fail(422, "VALIDATION_ERROR", "name is required");
    if (nameTaken(posts, name, existing.id)) return fail(409, "DUPLICATE_NAME", "A staff post with this name already exists");
    // Deactivating a post that's held is allowed: it only drops out of the
    // staff form's Post choices; current holders keep it.
    const next: StaffPost = { ...existing, name, is_active: body.is_active !== false };
    save("staffPosts", posts.map((post) => (post.id === existing.id ? next : post)));
    return ok(postForRead(next));
  }

  if (method === "DELETE") {
    const holders = load("staff").filter((staff) => staff.post_id === existing.id).length;
    if (holders > 0) {
      return fail(409, "STAFF_POST_IN_USE", `${holders} staff hold this post — reassign them before deleting it.`);
    }
    save("staffPosts", posts.filter((post) => post.id !== existing.id));
    return ok(null);
  }

  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

// ---------------------------------------------------------------------------
// Permission Groups — name + coarse permissions + members (no role entity)
// ---------------------------------------------------------------------------

/** Unknown staff ids are dropped (the backend would 422 — the mock is lenient); one-member groups are fine; duplicates collapse. */
function cleanMembers(value: unknown): string[] {
  const known = new Set(load("staff").map((staff) => staff.id));
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  return Array.from(new Set(ids)).filter((id) => known.has(id));
}

function cleanPermissions(value: unknown): string[] {
  return normalizePermissions(Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : []);
}

function handlePermissionGroups(method: HttpMethod, id: string | null, payload: unknown): WireResponse {
  const groups = load("permissionGroups");

  if (method === "GET" && !id) {
    const items = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    return listBody(items, 1, Math.max(1, items.length), items.length);
  }

  if (method === "POST" && !id) {
    const body = record(payload);
    const name = text(body.name);
    if (!name) return fail(422, "VALIDATION_ERROR", "name is required");
    if (nameTaken(groups, name)) return fail(409, "DUPLICATE_NAME", "A permission group with this name already exists");
    const created: PermissionGroup = {
      id: mockId(),
      name,
      permissions: cleanPermissions(body.permissions),
      member_staff_ids: cleanMembers(body.member_staff_ids),
    };
    save("permissionGroups", [...groups, created]);
    return ok(created, 201);
  }

  const existing = id ? groups.find((group) => group.id === id) : undefined;
  if (!existing) return fail(404, "PERMISSION_GROUP_NOT_FOUND", "Permission group not found");

  if (method === "PUT") {
    const body = record(payload);
    const name = text(body.name);
    if (!name) return fail(422, "VALIDATION_ERROR", "name is required");
    if (nameTaken(groups, name, existing.id)) {
      return fail(409, "DUPLICATE_NAME", "A permission group with this name already exists");
    }
    const next: PermissionGroup = {
      ...existing,
      name,
      permissions: cleanPermissions(body.permissions),
      member_staff_ids: cleanMembers(body.member_staff_ids),
    };
    save("permissionGroups", groups.map((group) => (group.id === existing.id ? next : group)));
    return ok(next);
  }

  if (method === "DELETE") {
    // Deleting a group just ends its memberships — nothing else references it.
    save("permissionGroups", groups.filter((group) => group.id !== existing.id));
    return ok(null);
  }

  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ROUTES: Array<{
  base: string;
  /** `rest` = everything after "<base>/" (e.g. "<id>" or "<id>/submit"), null for the base path itself. */
  handle: (method: HttpMethod, rest: string | null, payload: unknown, query: URLSearchParams) => WireResponse | Promise<WireResponse>;
}> = [
  { base: "erp/staff-posts", handle: (method, id, payload) => handleStaffPosts(method, id, payload) },
  { base: "erp/permission-groups", handle: (method, id, payload) => handlePermissionGroups(method, id, payload) },
  { base: "erp/staff", handle: handleStaff },
];

export const hrMockTransport: Transport = async (method, fullPath, payload) => {
  await mockDelay(250);
  const [path, queryString = ""] = fullPath.split("?");
  const query = new URLSearchParams(queryString);
  for (const route of ROUTES) {
    if (path === route.base) return route.handle(method, null, payload, query);
    if (path.startsWith(`${route.base}/`)) {
      const rest = path
        .slice(route.base.length + 1)
        .split("/")
        .map(decodeURIComponent)
        .join("/");
      return route.handle(method, rest, payload, query);
    }
  }
  return fail(404, "NOT_FOUND", `Route not found: ${method} ${path}`);
};
