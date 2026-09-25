import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir. { success, data }, Bearer auth via
 * apiFetch, ERP error shape { success:false, error:{code,message} } (see
 * erpError.ts) — same conventions as Award Bodies/School Types.
 *
 *   GET {API_BASE}/erp/academic-years/:yearId/classes?page=&limit=
 *     -> { success: true, data: { items, total, page, limit, has_more } }
 *     Confirmed: returns ACTIVE classes only "by default" — the wording
 *     implies an opt-in for inactive ones, needed here since the product
 *     owner wants this MANAGEMENT screen to show all classes with a
 *     status badge (unlike a consuming dropdown elsewhere in the app,
 *     which should stay active-only). FLAGGED, UNCONFIRMED: guessing the
 *     param is `include_inactive=true` — Muntajir is confirming the real
 *     name. Isolated to this one query string; a one-line change once
 *     confirmed.
 *   POST {API_BASE}/erp/classes { academic_year_id, school_type_id, name,
 *     duration, minimum_age_years, level?, short_name?, description?,
 *     fee_id?, is_active? }
 *     academic_year_id is injected by createClassesService() below, never
 *     a form field — required on CREATE only per the contract (not resent
 *     on update, since a class doesn't move between years via edit).
 *   PUT {API_BASE}/erp/classes/:id — full edit-form shape (no
 *     academic_year_id). Also how deactivate/reactivate work: the contract
 *     confirms a PUT with just { is_active } is valid (no dedicated
 *     activate endpoint like Academic Years has) — deactivate/reactivate
 *     below send that smaller body directly rather than resending the
 *     whole form shape.
 *   DELETE {API_BASE}/erp/classes/:id
 *   GET {API_BASE}/erp/classes/:id exists (404 CLASS_NOT_FOUND if
 *     inactive) but isn't used here — same as every other Setup screen,
 *     edit forms seed from the already-fetched list row.
 *
 * No brochure field (removed per product owner). Responses use primitive
 * ids (school_type_id, fee_id) — no nested objects, unlike School Types'
 * award_bodies[]. Screens resolve names client-side from the already-
 * fetched School Types list.
 *
 * Error codes: DUPLICATE_NAME -> `name` field. SCHOOL_TYPE_NOT_FOUND ->
 * `school_type_id` field. CLASS_HAS_SECTIONS (409, delete) -> conflict,
 * item NOT removed locally, backend message surfaced as-is.
 * CLASS_NOT_FOUND -> conflict (stale row). VALIDATION_ERROR -> general
 * banner. Any other/missing code falls back to plain status-code
 * classification, same defensive pattern as Award Bodies/School Types.
 */
export type SchoolClass = {
  id: string;
  academic_year_id: string;
  school_type_id: string;
  name: string;
  duration: string;
  minimum_age_years: number;
  level: number | null;
  short_name: string | null;
  description: string | null;
  fee_id: string | null;
  is_active: boolean;
};

export type ClassCreateInput = {
  school_type_id: string;
  name: string;
  duration: string;
  minimum_age_years: number;
  level: number | null;
  short_name: string | null;
  description: string | null;
  fee_id: string | null;
  is_active: boolean;
};

export type ClassUpdateInput = ClassCreateInput;

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "SCHOOL_TYPE_NOT_FOUND") {
    return {
      ok: false,
      kind: "validation",
      errors: [{ field: "school_type_id", message: message ?? undefined }],
    };
  }
  if (code === "CLASS_HAS_SECTIONS" || code === "CLASS_NOT_FOUND") {
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

function extractClassList(body: unknown): SchoolClass[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as SchoolClass[]) : [];
}

/**
 * A factory, not a singleton — list() must close over the currently
 * selected academic year, and create() must inject it. ClassesScreen
 * rebuilds this (via useMemo keyed on the selected year id) whenever the
 * session picker's year changes; see useCrudTable.ts's refetch-on-
 * service-change effect for how that triggers a fresh fetch.
 */
export function createClassesService(
  yearId: string,
): CrudService<SchoolClass, ClassCreateInput, ClassUpdateInput> {
  const LIST_PATH = `erp/academic-years/${encodeURIComponent(yearId)}/classes`;
  const BASE_PATH = "erp/classes";

  async function list(): Promise<CrudResult<SchoolClass[]>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    let response: Response;
    try {
      // include_inactive=true: see the FLAGGED param-name note above.
      response = await apiFetch(`${LIST_PATH}?page=1&limit=200&include_inactive=true`, {
        method: "GET",
      });
    } catch {
      return { ok: false, kind: "network" };
    }

    const body = await parseBody(response);
    if (response.ok) {
      return { ok: true, data: extractClassList(body) };
    }
    return toResult(response, body);
  }

  async function create(data: ClassCreateInput): Promise<CrudResult<SchoolClass>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    let response: Response;
    try {
      response = await apiFetch(BASE_PATH, {
        method: "POST",
        body: JSON.stringify({ ...data, academic_year_id: yearId }),
      });
    } catch {
      return { ok: false, kind: "network" };
    }

    const body = await parseBody(response);
    if (response.ok) {
      const created = (body as { data?: SchoolClass } | null)?.data;
      if (created) return { ok: true, data: created };
      return { ok: false, kind: "server" };
    }
    return toResult(response, body);
  }

  async function update(id: string, data: ClassUpdateInput): Promise<CrudResult<SchoolClass>> {
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
      const updated = (body as { data?: SchoolClass } | null)?.data;
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

  // Deactivate/reactivate: a smaller PUT body ({ is_active } only) rather
  // than routing through update()'s full-form shape — the contract
  // confirms this partial body is valid ("reactivate via PUT
  // { is_active: true }"), and it's the natural fit for a one-click row
  // action that shouldn't need the rest of the form's current values.
  async function setActive(id: string, is_active: boolean): Promise<CrudResult<SchoolClass>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    let response: Response;
    try {
      response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ is_active }),
      });
    } catch {
      return { ok: false, kind: "network" };
    }

    const body = await parseBody(response);
    if (response.ok) {
      const updated = (body as { data?: SchoolClass } | null)?.data;
      if (updated) return { ok: true, data: updated };
      return { ok: false, kind: "server" };
    }
    return toResult(response, body);
  }

  return {
    queryKey: ["setup", "classes", yearId],
    list,
    create,
    update,
    remove,
    customActions: {
      deactivate: (id) => setActive(id, false),
      reactivate: (id) => setActive(id, true),
    },
  };
}
