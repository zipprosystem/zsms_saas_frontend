import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Real, deployed contract per Muntajir (mirrors academicYearsApi.ts's
 * confirmed shape): { success, data }, Bearer auth via apiFetch.
 *
 *   GET  {API_BASE}/erp/school-types
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *        Paginated, same shape as Academic Years — this screen still
 *        fetches and paginates client-side (fine for the expected volume
 *        of school types per school), same reasoning as academicYearsApi.
 *   POST/PUT {API_BASE}/erp/school-types[/:id]
 *     -> { success: true, data: <entity> } directly, never wrapped in items.
 *   DELETE {API_BASE}/erp/school-types/:id
 *   GET {API_BASE}/erp/school-types/:id exists too but isn't used here —
 *     same as Academic Years, edit forms seed from the already-fetched
 *     list row, never a separate single-item fetch.
 *
 * award_body_id is optional — not every school type has an examining body
 * (Creche/Nursery/Primary typically don't; JSS/SSS/etc. do). Confirmed by
 * Matthew, matching onboarding's own School Types step where Award Body
 * was optional too.
 */
export type SchoolType = {
  id: string;
  name: string;
  award_body_id: string | null;
  description: string | null;
};

export type SchoolTypeInput = {
  name: string;
  award_body_id: string | null;
  description: string | null;
};

const BASE_PATH = "erp/school-types";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 409) return { ok: false, kind: "conflict" };
  if (response.status === 422) {
    const rawErrors = (body as { data?: { errors?: unknown }; errors?: unknown } | null)?.data?.errors
      ?? (body as { errors?: unknown } | null)?.errors;
    return { ok: false, kind: "validation", errors: Array.isArray(rawErrors) ? rawErrors : [] };
  }
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure, same as every
  // other authenticated call in this app.
  return { ok: false, kind: "server" };
}

function extractSchoolTypeList(body: unknown): SchoolType[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as SchoolType[]) : [];
}

async function list(): Promise<CrudResult<SchoolType[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    return { ok: true, data: extractSchoolTypeList(body) };
  }
  return toResult(response, body);
}

async function create(data: SchoolTypeInput): Promise<CrudResult<SchoolType>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: SchoolType } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: SchoolTypeInput): Promise<CrudResult<SchoolType>> {
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
    const updated = (body as { data?: SchoolType } | null)?.data;
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

export const schoolTypesService: CrudService<SchoolType, SchoolTypeInput, SchoolTypeInput> = {
  list,
  create,
  update,
  remove,
};
