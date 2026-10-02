import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Physical Space — Buildings. Muntajir shipped this (replaces the old
 * facilitiesApi.ts mock). Same conventions as every other simple catalog
 * entity (Award Bodies/School Types): { success, data }, Bearer auth via
 * apiFetch, ERP error shape (erpError.ts).
 *
 *   GET {API_BASE}/erp/buildings?page=&limit=
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *        Paginated — fetched once with limit=200 (max) and used client-side
 *        from there, same reasoning as Award Bodies/Academic Years.
 *   POST/PUT {API_BASE}/erp/buildings[/:id] { name } -> { success: true, data: <entity> }
 *   GET {API_BASE}/erp/buildings/:id exists but isn't used — no edit form
 *     needs it yet (nothing here beyond list() has a consumer so far; this
 *     is frontend-ahead, same as Room Types below).
 *   DELETE {API_BASE}/erp/buildings/:id
 *
 * FIELDS UNCONFIRMED beyond `name` — reconcile on deploy. Error codes
 * GUESSED by analogy to Award Bodies/School Types (DUPLICATE_NAME,
 * BUILDING_NOT_FOUND, BUILDING_HAS_ROOMS on delete) — harmless if they
 * never fire, falls back to plain status-code classification either way.
 */
export type Building = {
  id: string;
  name: string;
};

export type BuildingInput = {
  name: string;
};

const BASE_PATH = "erp/buildings";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "BUILDING_HAS_ROOMS" || code === "BUILDING_NOT_FOUND") {
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
  // and force-logs-out + redirects to /login on failure, same as every
  // other authenticated call in this app.
  return { ok: false, kind: "server", message: message ?? undefined };
}

function extractBuildingList(body: unknown): Building[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as Building[]) : [];
}

async function list(): Promise<CrudResult<Building[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) return { ok: true, data: extractBuildingList(body) };
  return toResult(response, body);
}

async function create(data: BuildingInput): Promise<CrudResult<Building>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: Building } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: BuildingInput): Promise<CrudResult<Building>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const updated = (body as { data?: Building } | null)?.data;
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

export const buildingsService: CrudService<Building, BuildingInput, BuildingInput> = {
  queryKey: ["setup", "buildings"],
  list,
  create,
  update,
  remove,
};
