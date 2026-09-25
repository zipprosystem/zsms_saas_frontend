import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir: { success, data }, Bearer auth via
 * apiFetch. No is_active — same confirmed correction as Award Bodies.
 *
 *   GET {API_BASE}/erp/school-types?page=&limit=
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *        Paginated (default limit 50, max 200) — fetched once with
 *        limit=200 and searched/paginated client-side, same reasoning and
 *        accepted limitation as Award Bodies/Academic Years.
 *        The contract also accepts an optional `academic_year_id` filter —
 *        deliberately NOT passed here. School Types are a structural,
 *        year-independent categorisation of the school (Creche/JSS/SSS…),
 *        not data scoped to a particular session the way Classes likely
 *        are (hence "active classes only" on this entity's own `classes`
 *        field below) — confirmed with Matthew.
 *   POST/PUT {API_BASE}/erp/school-types[/:id] { name, award_body_ids, description? }
 *     -> { success: true, data: <entity> } directly, never wrapped in items.
 *     award_body_ids is MANY-TO-MANY (a school type can have multiple
 *     award bodies) — the earlier single required award_body_id is
 *     deprecated, never sent/read here. Requiring at least one selection is
 *     an ASSUMPTION carried over from the earlier single-required contract
 *     (Muntajir hasn't explicitly said whether m2m still requires ≥1) —
 *     reconcile if he says it's actually optional.
 *   DELETE {API_BASE}/erp/school-types/:id
 *
 * Response entity includes `award_bodies` (the nested Award Body objects,
 * plural) and `classes` (this school type's classes) alongside
 * `award_body_ids` itself — the card reads award_bodies[].name directly
 * rather than looking them up client-side. The deprecated singular
 * `award_body_id`/`award_body` fields, if the backend still sends them,
 * are ignored entirely. `classes`' exact shape is an ASSUMPTION (only "the
 * active ones show as chips" was specified, not confirmed field-by-field)
 * — reconcile once a real payload is seen.
 *
 * Error body shape (all non-2xx responses): { success:false, error:{ code,
 * message } } — see erpError.ts. Known codes handled below (unchanged from
 * the single-award-body contract, just retargeted to the `award_body_ids`
 * field instead of `award_body_id`):
 *   DUPLICATE_NAME         -> validation error on the `name` field
 *   AWARD_BODY_REQUIRED    -> validation error on the `award_body_ids` field
 *   AWARD_BODY_NOT_FOUND   -> validation error on the `award_body_ids` field
 *                             (a stale/deleted award body was selected)
 *   SCHOOL_TYPE_HAS_CLASSES -> 409 delete conflict, item NOT removed
 *                              locally, backend message surfaced as-is
 *   SCHOOL_TYPE_NOT_FOUND  -> conflict (stale row)
 * Any other/missing code falls back to the plain status-code classification
 * (403/409/422/else), same defensive pattern as Award Bodies/Academic Years.
 */
export type SchoolTypeClass = {
  id: string;
  name: string;
  is_active: boolean;
};

export type SchoolType = {
  id: string;
  name: string;
  award_body_ids: string[];
  award_bodies: Array<{ id: string; name: string; description: string | null }>;
  description: string | null;
  classes: SchoolTypeClass[];
};

export type SchoolTypeInput = {
  name: string;
  award_body_ids: string[];
  description: string | null;
};

const BASE_PATH = "erp/school-types";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "AWARD_BODY_REQUIRED" || code === "AWARD_BODY_NOT_FOUND") {
    return {
      ok: false,
      kind: "validation",
      errors: [{ field: "award_body_ids", message: message ?? undefined }],
    };
  }
  if (code === "SCHOOL_TYPE_HAS_CLASSES" || code === "SCHOOL_TYPE_NOT_FOUND") {
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

function extractSchoolTypeList(body: unknown): SchoolType[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as SchoolType[]) : [];
}

async function list(): Promise<CrudResult<SchoolType[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
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
