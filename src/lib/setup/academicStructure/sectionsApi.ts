import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir. { success, data }, Bearer auth via
 * apiFetch, ERP error shape { success:false, error:{code,message} } (see
 * erpError.ts) — same conventions as Classes/Award Bodies/School Types.
 *
 *   GET {API_BASE}/erp/classes/:classId/sections?include_inactive=true
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *     Per-class, not a single flat endpoint — there is no "all sections
 *     for a school" list. The Setup screen's merged multi-class view is
 *     built client-side (see createSectionsService below), not by this
 *     function directly. Soft-deleted excluded.
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
 *     seed from the already-fetched/cached row, same as every other Setup
 *     screen.
 *
 * school_type_id is NOT a Section field at all — it's inherited from the
 * parent Class and resolved client-side (SectionsScreen looks up
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

/** Keyed by class_id — shared across school-type switches (a useRef at the screen level), which is what makes "switching back doesn't refetch" work: it's the same Map instance, not rebuilt per school type. */
export type SectionCache = Map<string, Section[]>;

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

async function fetchSectionsForClass(classId: string): Promise<CrudResult<Section[]>> {
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

/**
 * A factory, not a singleton — `classIds` is whichever school type's
 * active classes are currently being viewed, and `cache` is a shared Map
 * the SCREEN owns (via useRef) across school-type switches. list() only
 * fetches whatever's missing from the cache; every mutation refetches and
 * patches exactly the one class it touched, never the whole merged set —
 * this is deliberately the only place that fetch/cache logic lives, so the
 * planned react-query retrofit can replace it without touching
 * SectionsScreen.tsx.
 */
export function createSectionsService(options: {
  classIds: string[];
  cache: SectionCache;
}): CrudService<Section, SectionInput, SectionInput> {
  const { classIds, cache } = options;

  function findCachedClassId(sectionId: string): string | null {
    // Array.from(...) rather than iterating the Map directly — this
    // project's TS target doesn't support downlevel Map iteration.
    const entry = Array.from(cache.entries()).find(([, sections]) =>
      sections.some((section) => section.id === sectionId),
    );
    return entry ? entry[0] : null;
  }

  // Void, not a CrudResult — a failed refetch here shouldn't fail the
  // mutation that just succeeded server-side. Deleting the cache entry on
  // failure (rather than leaving stale data) forces the next list() to
  // retry that class fresh instead of silently under-reporting it forever.
  async function refetchClassAndCache(classId: string): Promise<void> {
    const result = await fetchSectionsForClass(classId);
    if (result.ok) cache.set(classId, result.data);
    else cache.delete(classId);
  }

  async function list(): Promise<CrudResult<Section[]>> {
    const missing = classIds.filter((id) => !cache.has(id));
    if (missing.length > 0) {
      const results = await Promise.all(missing.map(fetchSectionsForClass));
      // One failed class fails the whole merge — a partial list would
      // misrepresent what's actually under this school type.
      for (const result of results) {
        if (!result.ok) return result;
      }
      missing.forEach((id, index) => {
        const result = results[index];
        if (result.ok) cache.set(id, result.data);
      });
    }
    return { ok: true, data: classIds.flatMap((id) => cache.get(id) ?? []) };
  }

  async function create(data: SectionInput): Promise<CrudResult<Section>> {
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

    await refetchClassAndCache(data.class_id);
    return { ok: true, data: created };
  }

  async function update(id: string, data: SectionInput): Promise<CrudResult<Section>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    // Captured before the PUT — if the edit moved the section to a
    // different class (the form's Class dropdown is editable), the OLD
    // class's cache entry needs invalidating too, not just the new one.
    const previousClassId = findCachedClassId(id);

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

    await refetchClassAndCache(data.class_id);
    if (previousClassId && previousClassId !== data.class_id) {
      await refetchClassAndCache(previousClassId);
    }
    return { ok: true, data: updated };
  }

  async function remove(id: string): Promise<CrudResult<void>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    const classId = findCachedClassId(id);

    let response: Response;
    try {
      response = await apiFetch(`${SECTIONS_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      return { ok: false, kind: "network" };
    }

    if (!response.ok) {
      const body = await parseBody(response);
      return toResult(response, body);
    }
    if (classId) await refetchClassAndCache(classId);
    return { ok: true, data: undefined };
  }

  async function setActive(id: string, is_active: boolean): Promise<CrudResult<Section>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    const classId = findCachedClassId(id);

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

    if (classId) await refetchClassAndCache(classId);
    return { ok: true, data: updated };
  }

  return {
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
