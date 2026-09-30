import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir: { success, data }, Bearer auth via
 * apiFetch, ERP error shape (see erpError.ts) — same conventions as Award
 * Bodies/School Types.
 *
 *   GET {API_BASE}/erp/departments?page=&limit=
 *     -> { success: true, data: { items, total, page, limit, has_more } }
 *     Fetched once at limit=200 and searched/paginated client-side, same
 *     reasoning as Award Bodies.
 *   POST/PUT {API_BASE}/erp/departments[/:id]
 *     { name, hod_staff_id, senior_manager_staff_id? }
 *     hod_staff_id is required; senior_manager_staff_id is optional/null.
 *     Both are users.id values from GET /erp/staff (see staffApi.ts). The
 *     same person may be both HOD and Senior Manager, and may head
 *     several departments — no client-side uniqueness rule.
 *     -> { success: true, data: <entity> }
 *   DELETE {API_BASE}/erp/departments/:id
 *     -> 409 if the department still has subjects; backend message
 *     surfaced as-is (DepartmentsScreen also pre-disables the action off
 *     subject_count, but the backend is the authority).
 *   GET {API_BASE}/erp/departments/:id exists but isn't used — edit forms
 *     seed from the already-fetched list row, same as every Setup screen.
 *
 * subject_count / staff_count are backend-calculated. staff_count is null
 * until staff-to-department membership exists — shown as "—", never 0.
 *
 * Error codes: DUPLICATE_NAME -> `name` field. STAFF_NOT_FOUND (GUESSED by
 * analogy to SCHOOL_TYPE_NOT_FOUND — unconfirmed) -> `hod_staff_id`
 * field. DEPARTMENT_HAS_SUBJECTS / DEPARTMENT_NOT_FOUND (GUESSED names) ->
 * conflict; a plain 409 with any other code is still a conflict via the
 * status fallback below, so the delete-guard message reaches the user
 * either way.
 */
export type Department = {
  id: string;
  name: string;
  hod_staff_id: string;
  senior_manager_staff_id: string | null;
  subject_count: number | null;
  staff_count: number | null;
};

export type DepartmentInput = {
  name: string;
  hod_staff_id: string;
  senior_manager_staff_id: string | null;
};

const BASE_PATH = "erp/departments";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "STAFF_NOT_FOUND") {
    return { ok: false, kind: "validation", errors: [{ field: "hod_staff_id", message: message ?? undefined }] };
  }
  if (code === "DEPARTMENT_HAS_SUBJECTS" || code === "DEPARTMENT_NOT_FOUND") {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR") {
    return { ok: false, kind: "server", message: message ?? undefined };
  }

  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 409) return { ok: false, kind: "conflict", message: message ?? undefined };
  if (response.status === 422) return { ok: false, kind: "validation", errors: [] };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure.
  return { ok: false, kind: "server", message: message ?? undefined };
}

function toDepartment(raw: unknown): Department {
  const row = raw as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    hod_staff_id: String(row.hod_staff_id ?? ""),
    senior_manager_staff_id: typeof row.senior_manager_staff_id === "string" ? row.senior_manager_staff_id : null,
    subject_count: typeof row.subject_count === "number" ? row.subject_count : null,
    staff_count: typeof row.staff_count === "number" ? row.staff_count : null,
  };
}

function extractDepartmentList(body: unknown): Department[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? items.map(toDepartment) : [];
}

function extractDepartment(body: unknown): Department | null {
  const data = (body as { data?: unknown } | null)?.data;
  return data && typeof data === "object" ? toDepartment(data) : null;
}

async function list(): Promise<CrudResult<Department[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    return { ok: true, data: extractDepartmentList(body) };
  }
  return toResult(response, body);
}

async function create(data: DepartmentInput): Promise<CrudResult<Department>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = extractDepartment(body);
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: DepartmentInput): Promise<CrudResult<Department>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const updated = extractDepartment(body);
    if (updated) return { ok: true, data: updated };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function remove(id: string): Promise<CrudResult<void>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    return { ok: false, kind: "network" };
  }

  if (response.ok) return { ok: true, data: undefined };
  const body = await parseBody(response);
  return toResult(response, body);
}

export const departmentsService: CrudService<Department, DepartmentInput, DepartmentInput> = {
  queryKey: ["setup", "departments"],
  list,
  create,
  update,
  remove,
};
