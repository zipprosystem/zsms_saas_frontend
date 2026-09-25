import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir: { success, data }, Bearer auth via
 * apiFetch. No is_active — confirmed against the Figma/backend-owner
 * correction for this entity.
 *
 *   GET {API_BASE}/erp/award-bodies?page=&limit=
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *        Paginated (default limit 50, max 200), and there is NO search
 *        query param — this screen fetches once with limit=200 (the max)
 *        and searches/paginates client-side, same reasoning as Academic
 *        Years. A school with >200 award bodies would silently lose the
 *        tail; accepted as unrealistic for this entity.
 *        Soft-deleted rows are excluded server-side.
 *   POST/PUT {API_BASE}/erp/award-bodies[/:id] { name, description? }
 *     -> { success: true, data: <entity> } directly, never wrapped in items.
 *   DELETE {API_BASE}/erp/award-bodies/:id
 *
 * Error body shape (all non-2xx responses): { success:false, error:{ code,
 * message } } — see erpError.ts. Known codes handled below:
 *   DUPLICATE_NAME              -> validation error on the `name` field
 *   AWARD_BODY_HAS_SCHOOL_TYPES -> 409 delete conflict, item NOT removed
 *                                  locally, backend message surfaced as-is
 *   AWARD_BODY_NOT_FOUND        -> conflict (stale row)
 *   VALIDATION_ERROR            -> general error banner, backend message
 *   FORBIDDEN / UNAUTHORIZED    -> forbidden
 * Any other/missing code falls back to the plain status-code classification
 * (403/409/422/else), same defensive pattern as academicYearsApi.
 */
export type AwardBody = {
  id: string;
  name: string;
  description: string | null;
};

export type AwardBodyInput = {
  name: string;
  description: string | null;
};

const BASE_PATH = "erp/award-bodies";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "AWARD_BODY_HAS_SCHOOL_TYPES" || code === "AWARD_BODY_NOT_FOUND") {
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

function extractAwardBodyList(body: unknown): AwardBody[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as AwardBody[]) : [];
}

async function list(): Promise<CrudResult<AwardBody[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    return { ok: true, data: extractAwardBodyList(body) };
  }
  return toResult(response, body);
}

async function create(data: AwardBodyInput): Promise<CrudResult<AwardBody>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: AwardBody } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: AwardBodyInput): Promise<CrudResult<AwardBody>> {
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
    const updated = (body as { data?: AwardBody } | null)?.data;
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

export const awardBodiesService: CrudService<AwardBody, AwardBodyInput, AwardBodyInput> = {
  list,
  create,
  update,
  remove,
};
