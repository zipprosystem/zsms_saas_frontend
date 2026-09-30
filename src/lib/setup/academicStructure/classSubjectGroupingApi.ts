import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir ("Subject Groups" backend-side; this
 * screen is Class Subject Grouping). { success, data }, Bearer auth via
 * apiFetch, ERP error shape (see erpError.ts). Year-scoped factory, same
 * pattern as classesApi.ts's createClassesService(yearId).
 *
 *   GET {API_BASE}/erp/subject-groups?academic_year_id=&page=&limit=
 *     -> { success: true, data: { items, ... } }
 *     FLAGGED, UNCONFIRMED: the year filter's param name (rows are also
 *     filtered client-side), and whether/how each row carries its
 *     memberships — readMemberIds() accepts class_subject_ids[] or
 *     class_subjects[] (strings or objects with class_subject_id/id). If
 *     the list carries neither, groups will show 0 subjects — reconcile.
 *   POST/PUT {API_BASE}/erp/subject-groups[/:id] { group_name, academic_year_id }
 *   DELETE {API_BASE}/erp/subject-groups/:id
 *   POST {API_BASE}/erp/subject-groups/:id/class-subjects  (add members)
 *     FLAGGED, UNCONFIRMED body: sent as { class_subject_ids: [...] } in
 *     one call — isolated in addMembers() below.
 *   DELETE {API_BASE}/erp/subject-groups/:id/class-subjects/:classSubjectId
 *     (remove one member)
 *   Duplicate memberships are prevented server-side; same school + same
 *   year is enforced server-side (its message surfaces in the banner).
 *
 * A group has NO class_ids of its own in the API — the screen derives a
 * group's classes from its member class-subjects. Saving = save the group
 * row, then sync memberships: add (new − previous), remove (previous −
 * new). The caller passes the previous ids in (from the row the edit form
 * was seeded from) so the diff needs no extra fetch. If the membership
 * sync fails right after a CREATE, the just-created group is deleted
 * again (best effort) so a retry doesn't hit a duplicate-name error. On
 * EDIT there's nothing safe to roll back to; the error surfaces and the
 * list refetches on the next successful save.
 *
 * Error codes: DUPLICATE_NAME / DUPLICATE_GROUP_NAME (GUESSED) -> `name`
 * field. SUBJECT_GROUP_NOT_FOUND (GUESSED) -> conflict. Any other/missing
 * code falls back to plain status-code classification.
 */
export type ClassSubjectGroup = {
  id: string;
  academic_year_id: string | null;
  name: string;
  class_subject_ids: string[];
};

export type ClassSubjectGroupInput = {
  name: string;
  class_subject_ids: string[];
  /** The membership as last loaded (empty on create) — diffed against class_subject_ids to sync. */
  previous_class_subject_ids: string[];
};

const BASE_PATH = "erp/subject-groups";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME" || code === "DUPLICATE_GROUP_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "SUBJECT_GROUP_NOT_FOUND") {
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

function readMemberIds(row: Record<string, unknown>): string[] {
  const source = Array.isArray(row.class_subject_ids) ? row.class_subject_ids : row.class_subjects;
  if (!Array.isArray(source)) return [];
  return source
    .map((entry) => {
      if (typeof entry === "string") return entry;
      const record = entry as Record<string, unknown> | null;
      const id = record?.class_subject_id ?? record?.id;
      return typeof id === "string" ? id : null;
    })
    .filter((id): id is string => !!id);
}

function toGroup(raw: unknown): ClassSubjectGroup {
  const row = raw as Record<string, unknown>;
  return {
    id: String(row.id),
    academic_year_id: typeof row.academic_year_id === "string" ? row.academic_year_id : null,
    name: String(row.group_name ?? ""),
    class_subject_ids: readMemberIds(row),
  };
}

export function createClassSubjectGroupService(
  yearId: string,
): CrudService<ClassSubjectGroup, ClassSubjectGroupInput, ClassSubjectGroupInput> {
  const groupPath = (id: string) => `${BASE_PATH}/${encodeURIComponent(id)}`;

  // A thrown fetch becomes a synthetic "network" result so callers can
  // treat every step uniformly.
  async function send(path: string, init: RequestInit): Promise<{ response: Response | null; body: unknown }> {
    try {
      const response = await apiFetch(path, init);
      return { response, body: await parseBody(response) };
    } catch {
      return { response: null, body: null };
    }
  }

  async function addMembers(groupId: string, ids: string[]): Promise<CrudResult<void>> {
    if (ids.length === 0) return { ok: true, data: undefined };
    const { response, body } = await send(`${groupPath(groupId)}/class-subjects`, {
      method: "POST",
      body: JSON.stringify({ class_subject_ids: ids }),
    });
    if (!response) return { ok: false, kind: "network" };
    return response.ok ? { ok: true, data: undefined } : toResult(response, body);
  }

  async function removeMember(groupId: string, classSubjectId: string): Promise<CrudResult<void>> {
    const { response, body } = await send(
      `${groupPath(groupId)}/class-subjects/${encodeURIComponent(classSubjectId)}`,
      { method: "DELETE" },
    );
    if (!response) return { ok: false, kind: "network" };
    return response.ok ? { ok: true, data: undefined } : toResult(response, body);
  }

  async function syncMembers(groupId: string, data: ClassSubjectGroupInput): Promise<CrudResult<void>> {
    const previous = new Set(data.previous_class_subject_ids);
    const next = new Set(data.class_subject_ids);
    const toAdd = data.class_subject_ids.filter((id) => !previous.has(id));
    const toRemove = data.previous_class_subject_ids.filter((id) => !next.has(id));

    const results = await Promise.all([
      addMembers(groupId, toAdd),
      ...toRemove.map((id) => removeMember(groupId, id)),
    ]);
    return results.find((result) => !result.ok) ?? { ok: true, data: undefined };
  }

  async function list(): Promise<CrudResult<ClassSubjectGroup[]>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    const { response, body } = await send(
      `${BASE_PATH}?academic_year_id=${encodeURIComponent(yearId)}&page=1&limit=200`,
      { method: "GET" },
    );
    if (!response) return { ok: false, kind: "network" };
    if (!response.ok) return toResult(response, body);

    const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
    const groups = Array.isArray(items) ? items.map(toGroup) : [];
    return {
      ok: true,
      data: groups.filter((group) => group.academic_year_id === null || group.academic_year_id === yearId),
    };
  }

  async function create(data: ClassSubjectGroupInput): Promise<CrudResult<ClassSubjectGroup>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    const { response, body } = await send(BASE_PATH, {
      method: "POST",
      body: JSON.stringify({ group_name: data.name, academic_year_id: yearId }),
    });
    if (!response) return { ok: false, kind: "network" };
    if (!response.ok) return toResult(response, body);

    const created = (body as { data?: unknown } | null)?.data;
    if (!created || typeof created !== "object") return { ok: false, kind: "server" };
    const group = toGroup(created);

    const synced = await syncMembers(group.id, { ...data, previous_class_subject_ids: [] });
    if (!synced.ok) {
      // Best-effort rollback — see header comment.
      await send(groupPath(group.id), { method: "DELETE" });
      return synced;
    }
    return { ok: true, data: { ...group, class_subject_ids: data.class_subject_ids } };
  }

  async function update(id: string, data: ClassSubjectGroupInput): Promise<CrudResult<ClassSubjectGroup>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    const { response, body } = await send(groupPath(id), {
      method: "PUT",
      body: JSON.stringify({ group_name: data.name, academic_year_id: yearId }),
    });
    if (!response) return { ok: false, kind: "network" };
    if (!response.ok) return toResult(response, body);

    const updated = (body as { data?: unknown } | null)?.data;
    if (!updated || typeof updated !== "object") return { ok: false, kind: "server" };

    const synced = await syncMembers(id, data);
    if (!synced.ok) return synced;
    return { ok: true, data: { ...toGroup(updated), class_subject_ids: data.class_subject_ids } };
  }

  async function remove(id: string): Promise<CrudResult<void>> {
    if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

    const { response, body } = await send(groupPath(id), { method: "DELETE" });
    if (!response) return { ok: false, kind: "network" };
    return response.ok ? { ok: true, data: undefined } : toResult(response, body);
  }

  return {
    queryKey: ["setup", "classSubjectGroups", yearId],
    list,
    create,
    update,
    remove,
  };
}
