import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir. { success, data }, Bearer auth via
 * apiFetch, ERP error shape { success:false, error:{code,message} } (see
 * erpError.ts) — same conventions as Classes/Award Bodies/School Types.
 *
 *   GET {API_BASE}/erp/classes/:classId/sections?include_inactive=true
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *     Per-class, not a single flat endpoint — there is no "all sections
 *     for a school" list. The Setup screen's merged multi-class view is
 *     built with useQueries in ClassArmsScreen.tsx, one query per class id
 *     (queryKey: sectionsQueryKey(classId)) — react-query's own per-key
 *     cache IS the cache here; there's no separate hand-rolled one. Soft-
 *     deleted excluded.
 *
 *     BACKEND LIMITATION, not a frontend bug: if the parent class is
 *     INACTIVE, this returns an EMPTY items list regardless of what
 *     sections actually exist under it, and any create/update/delete
 *     against that class's sections 409s CLASS_INACTIVE. There is no way
 *     for this frontend to see or manage a section under a deactivated
 *     class until that class is reactivated — the Setup screen therefore
 *     only ever fetches sections for a school type's ACTIVE classes (see
 *     ClassesScreen's own is_active model: reactivating the class is the
 *     only path back to those sections).
 *
 *   POST {API_BASE}/erp/sections { class_id, arm_name, building_id?,
 *     classroom_id?, class_time_start?, class_time_end?, description?,
 *     is_active? }
 *     -> { success: true, data: <entity> }. Request field is `arm_name`;
 *     the response entity (and every other read) returns it as `name`
 *     instead — asymmetric, confirmed by Muntajir, not a typo here.
 *   PUT {API_BASE}/erp/sections/:id — same body shape. Also how
 *     deactivate/reactivate work (a bare { is_active } PUT is valid, same
 *     pattern as Classes — no dedicated activate endpoint).
 *   DELETE {API_BASE}/erp/sections/:id
 *   GET {API_BASE}/erp/sections/:id exists but isn't used — edit forms
 *     seed from the already-fetched row, same as every other Setup screen.
 *
 * school_type_id is NOT a Section field at all — it's inherited from the
 * parent Class and resolved client-side (ClassArmsScreen looks up
 * class_id -> class -> school_type_id), never read from or sent in a
 * Section payload.
 *
 * Error codes: DUPLICATE_NAME -> `arm_name` field (the request's own field
 * name, not the response's `name`). CLASS_NOT_FOUND -> `class_id` field.
 * CLASS_INACTIVE -> conflict (the backend limitation above, surfaced
 * verbatim rather than a generic message). SECTION_NOT_FOUND -> conflict
 * (stale row). VALIDATION_ERROR -> general banner. Any other/missing code
 * falls back to plain status-code classification, same defensive pattern
 * as every other Setup service.
 *
 * Plain functions here, not a CrudService — Class-arms' read side can't be
 * a single service.list() (there's no "all sections" endpoint to back
 * one), so it doesn't go through the generic CrudScreen/useCrudTable
 * pattern at all. ClassArmsScreen.tsx calls these directly and invalidates
 * sectionsQueryKey(classId) itself after a mutation, using whichever
 * class(es) it already has on hand from the row/form being acted on —
 * no service-side cache or class-id lookup needed for that.
 */
export type Section = {
  id: string;
  class_id: string;
  name: string;
  building_id: string | null;
  classroom_id: string | null;
  class_time_start: string | null;
  class_time_end: string | null;
  description: string | null;
  is_active: boolean;
};

export type SectionInput = {
  class_id: string;
  arm_name: string;
  building_id: string | null;
  classroom_id: string | null;
  class_time_start: string | null;
  class_time_end: string | null;
  description: string | null;
  is_active: boolean;
};

/** The one place this key's shape is defined — both the useQueries construction and every post-mutation invalidateQueries call go through this, so they can never drift apart. */
export function sectionsQueryKey(classId: string): readonly unknown[] {
  return ["setup", "sections", "class", classId];
}

const SECTIONS_PATH = "erp/sections";

function classSectionsPath(classId: string): string {
  return `erp/classes/${encodeURIComponent(classId)}/sections`;
}

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "arm_name", message: message ?? undefined }] };
  }
  if (code === "CLASS_NOT_FOUND") {
    return { ok: false, kind: "validation", errors: [{ field: "class_id", message: message ?? undefined }] };
  }
  if (code === "CLASS_INACTIVE" || code === "SECTION_NOT_FOUND") {
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

function extractSectionList(body: unknown): Section[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as Section[]) : [];
}

/** The queryFn for each of useQueries' per-class queries in ClassArmsScreen.tsx. */
export async function fetchSectionsForClass(classId: string): Promise<CrudResult<Section[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${classSectionsPath(classId)}?page=1&limit=200&include_inactive=true`, {
      method: "GET",
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) return { ok: true, data: extractSectionList(body) };
  return toResult(response, body);
}

function requestBody(data: SectionInput): Record<string, unknown> {
  return {
    class_id: data.class_id,
    arm_name: data.arm_name,
    building_id: data.building_id,
    classroom_id: data.classroom_id,
    class_time_start: data.class_time_start,
    class_time_end: data.class_time_end,
    description: data.description,
    is_active: data.is_active,
  };
}

export async function createSection(data: SectionInput): Promise<CrudResult<Section>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(SECTIONS_PATH, { method: "POST", body: JSON.stringify(requestBody(data)) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return toResult(response, body);
  const created = (body as { data?: Section } | null)?.data;
  if (!created) return { ok: false, kind: "server" };
  return { ok: true, data: created };
}

export async function updateSection(id: string, data: SectionInput): Promise<CrudResult<Section>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${SECTIONS_PATH}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(requestBody(data)),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return toResult(response, body);
  const updated = (body as { data?: Section } | null)?.data;
  if (!updated) return { ok: false, kind: "server" };
  return { ok: true, data: updated };
}

export async function removeSection(id: string): Promise<CrudResult<void>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${SECTIONS_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    return { ok: false, kind: "network" };
  }

  if (response.ok) return { ok: true, data: undefined };
  const body = await parseBody(response);
  return toResult(response, body);
}

// Deactivate/reactivate: a smaller PUT body ({ is_active } only) rather
// than routing through updateSection()'s full-form shape — the contract
// confirms this partial body is valid ("reactivate via PUT
// { is_active: true }"), and it's the natural fit for a one-click row
// action that shouldn't need the rest of the form's current values.
async function setActive(id: string, is_active: boolean): Promise<CrudResult<Section>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${SECTIONS_PATH}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ is_active }),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return toResult(response, body);
  const updated = (body as { data?: Section } | null)?.data;
  if (!updated) return { ok: false, kind: "server" };
  return { ok: true, data: updated };
}

export function deactivateSection(id: string): Promise<CrudResult<Section>> {
  return setActive(id, false);
}

export function reactivateSection(id: string): Promise<CrudResult<Section>> {
  return setActive(id, true);
}
