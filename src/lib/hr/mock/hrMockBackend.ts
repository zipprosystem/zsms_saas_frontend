import { mockDelay } from "@/lib/onboarding/mockDelay";
import { normalizePermissions } from "@/lib/hr/permissionCatalog";
import { STAFF_STATUSES, type PermissionGroup, type Staff, type StaffPost, type StaffStatus } from "@/lib/hr/hrTypes";
import type { HttpMethod, Transport, WireResponse } from "@/lib/hr/hrHttp";
import { SEED_PERMISSION_GROUPS, SEED_STAFF, SEED_STAFF_POSTS } from "@/lib/hr/mock/hrMockSeeds";

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
 *   GET    erp/staff?staff_type=&status=&department_id=&subject_id=&search=&page=&limit=
 *            -> { items, total, page, limit, has_more }; status comma-separated;
 *            limit max 200 (422 above, same cap as Student Core); sorted by
 *            last_name, first_name. search matches name, email and staff_no
 *            (subject-name search needs the backend's join — the mock only
 *            knows subject ids).
 *   GET    erp/staff/:id
 *   GET/POST          erp/staff-posts            { name, is_active }
 *   PUT/DELETE        erp/staff-posts/:id        DELETE 409 STAFF_POST_IN_USE while any staff holds it
 *   GET/POST          erp/permission-groups      { name, permissions[], member_staff_ids[] }
 *   PUT/DELETE        erp/permission-groups/:id
 *
 * Derived on read (compute-on-read, never stored twice):
 *   - staff.permission_group_ids from group membership (the group owns it)
 *   - staff_post.staff_count from staff.post_id
 *
 * Effective access / data-scope roll-up is NOT modelled — the mock only
 * stores assignments, it never enforces anything.
 */

const STORAGE_PREFIX = "zsms.mockHr.v1";
const REQUEST_LIMIT_MAX = 200;

type Tables = {
  staff: Staff[];
  staffPosts: StaffPost[];
  permissionGroups: PermissionGroup[];
};

type TableName = keyof Tables;

const SEEDS: Tables = {
  staff: SEED_STAFF,
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

/** Case-insensitive uniqueness, ignoring `exceptId`. */
function nameTaken(rows: Array<{ id: string; name: string }>, name: string, exceptId?: string): boolean {
  const needle = name.toLowerCase();
  return rows.some((row) => row.id !== exceptId && row.name.toLowerCase() === needle);
}

// ---------------------------------------------------------------------------
// Staff (read side — writes arrive with the wizard stage)
// ---------------------------------------------------------------------------

/** The staff record as the API returns it — membership derived from the groups. */
export function staffForRead(staff: Staff): Staff {
  const groups = load("permissionGroups");
  return {
    ...staff,
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

function listStaff(query: URLSearchParams): WireResponse {
  const page = Math.max(1, Number(query.get("page")) || 1);
  const limit = Number(query.get("limit")) || 50;
  if (limit < 1 || limit > REQUEST_LIMIT_MAX) {
    return fail(422, "VALIDATION_ERROR", `limit must be between 1 and ${REQUEST_LIMIT_MAX}`);
  }
  const matching = load("staff")
    .filter((staff) => matchesStaffQuery(staff, query))
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  const items = matching.slice((page - 1) * limit, page * limit).map(staffForRead);
  return listBody(items, page, limit, matching.length);
}

function handleStaff(method: HttpMethod, id: string | null, query: URLSearchParams): WireResponse {
  if (method === "GET" && !id) return listStaff(query);
  const existing = id ? load("staff").find((staff) => staff.id === id) : undefined;
  if (!existing) return fail(404, "STAFF_NOT_FOUND", "Staff not found");
  if (method === "GET") return ok(staffForRead(existing));
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
  handle: (method: HttpMethod, id: string | null, payload: unknown, query: URLSearchParams) => WireResponse;
}> = [
  { base: "erp/staff-posts", handle: (method, id, payload) => handleStaffPosts(method, id, payload) },
  { base: "erp/permission-groups", handle: (method, id, payload) => handlePermissionGroups(method, id, payload) },
  { base: "erp/staff", handle: (method, id, _payload, query) => handleStaff(method, id, query) },
];

export const hrMockTransport: Transport = async (method, fullPath, payload) => {
  await mockDelay(250);
  const [path, queryString = ""] = fullPath.split("?");
  const query = new URLSearchParams(queryString);
  for (const route of ROUTES) {
    if (path === route.base) return route.handle(method, null, payload, query);
    if (path.startsWith(`${route.base}/`)) {
      return route.handle(method, decodeURIComponent(path.slice(route.base.length + 1)), payload, query);
    }
  }
  return fail(404, "NOT_FOUND", `Route not found: ${method} ${path}`);
};
