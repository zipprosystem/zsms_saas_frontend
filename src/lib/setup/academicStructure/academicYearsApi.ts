import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Confirmed contract: { success, data }, Bearer auth via apiFetch. A new
 * academic year is always created inactive; only POST .../activate flips
 * is_active (and implicitly flips whichever other year was active to
 * false, server-side — this frontend never tries to reason about that
 * itself, it just refetches the list after any mutation).
 *
 * GET's list shape, confirmed against a deployed tenant 2026-09-24:
 *   { success: true, data: { items: [...], total, page, limit, has_more } }
 * — i.e. paginated, not a bare array (the original, wrong assumption).
 * create/update/activate all confirmed to return { success, data: <entity> }
 * directly (the entity itself, never wrapped in `items`) — no change needed
 * there, only the list parse was wrong.
 *
 * The endpoint DOES support server-side pagination (page/limit/total/
 * has_more) — this screen still paginates the returned items client-side
 * (fine here; a school won't have >50 academic years). Muntajir says
 * Classes/Sections/Subjects share this exact {data:{items,total,page,
 * limit,has_more}} shape, so for a future high-volume screen,
 * CrudService.list() (currently a no-args () => Promise<CrudResult<T[]>>)
 * and useCrudTable would need extending to accept and forward page/limit
 * and read total/has_more back, rather than fetching everything at once.
 */
export type AcademicYear = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

export type AcademicYearInput = {
  name: string;
  start_date: string;
  end_date: string;
};

const BASE_PATH = "erp/academic-years";

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

// Confirmed shape: data.items. Still falls back to [] rather than crashing
// if items is ever missing/malformed (e.g. an unexpected error body) —
// cheap safety net, not a sign this is still guessed.
function extractYearList(body: unknown): AcademicYear[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as AcademicYear[]) : [];
}

async function list(): Promise<CrudResult<AcademicYear[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    return { ok: true, data: extractYearList(body) };
  }
  return toResult(response, body);
}

async function create(data: AcademicYearInput): Promise<CrudResult<AcademicYear>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: AcademicYear } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: AcademicYearInput): Promise<CrudResult<AcademicYear>> {
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
    const updated = (body as { data?: AcademicYear } | null)?.data;
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

async function activate(id: string): Promise<CrudResult<AcademicYear>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}/activate`, { method: "POST" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const activated = (body as { data?: AcademicYear } | null)?.data;
    if (activated) return { ok: true, data: activated };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

export const academicYearsService: CrudService<AcademicYear, AcademicYearInput, AcademicYearInput> = {
  list,
  create,
  update,
  remove,
  customActions: { activate },
};
