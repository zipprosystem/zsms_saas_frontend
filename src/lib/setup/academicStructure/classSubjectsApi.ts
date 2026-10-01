import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import { readAttachedFile, type AttachedFile } from "@/lib/files/filesApi";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir. { success, data }, Bearer auth via
 * apiFetch, ERP error shape (see erpError.ts). One independent record per
 * (class × subject master) pair. Not a plain CrudService (crudTypes.ts) —
 * the screen's create goes through the BULK endpoint and returns counts,
 * not a single entity.
 *
 *   GET {API_BASE}/erp/class-subjects?academic_year_id=&page=&limit=
 *     -> { success: true, data: { items, total, page, limit, has_more } }
 *     FLAGGED, UNCONFIRMED: the year filter's param name. Rows are also
 *     filtered client-side by academic_year_id when present, so a wrong
 *     param name can't leak another year's rows in. Unlike the small
 *     catalogs, this list can realistically exceed one 200-row page
 *     (classes × subjects), so fetchClassSubjectsForYear() follows
 *     has_more until done.
 *   POST {API_BASE}/erp/class-subjects/bulk
 *     { academic_year_id, class_ids[], subject_master_ids[], subject_group,
 *       unit?, room_id?, file_id? }
 *     -> Cartesian product; pairs that already exist are SKIPPED, not
 *     failed: { created_count, existing_count, created[], existing[] }.
 *     academic_year_id is REQUIRED — confirmed via real 422
 *     ("academic_year_id: Required"); the single POST /erp/class-subjects
 *     needs it too, by the same validator. Sent as the screen's selected
 *     year (useAcademicYear().selectedYearId) — a bulk call only ever
 *     targets one year at a time.
 *     Max 100 classes × 100 subjects (backend-enforced; its message is
 *     surfaced as-is). The single POST /erp/class-subjects also exists but
 *     isn't used — a 1×1 bulk call gives the same "created N, M already
 *     existed" feedback through one code path.
 *   PUT {API_BASE}/erp/class-subjects/:id { subject_group, unit, room_id,
 *     file_id } — class/subject master/year aren't reassignable via edit.
 *   DELETE {API_BASE}/erp/class-subjects/:id
 *
 * Field names: class_id / subject_master_id / file_id are INFERRED from
 * the bulk body's class_ids / subject_master_ids / file_id — reconcile
 * against the real row shape on deploy. No hours. academic_year_id is
 * CONFIRMED (see above) and matches the name subject-groups' API already
 * uses (classSubjectGroupingApi.ts), so this isn't a new name to guess.
 * subject_group: sent as "Core" | "Elective" (FLAGGED: casing to confirm);
 * responses are normalized to that casing either way.
 * room_id: rooms are still MOCK (facilitiesApi.ts) — FLAGGED: if the
 * backend FK-checks room_id, picking a mock room will be rejected until
 * the Physical Space module ships; "None" always works.
 *
 * Error codes: CLASS_SUBJECT_NOT_FOUND (GUESSED) -> conflict (stale row).
 * VALIDATION_ERROR -> general banner. Any other/missing code falls back to
 * plain status-code classification.
 */
export type SubjectGroup = "Core" | "Elective";

export type ClassSubject = {
  id: string;
  academic_year_id: string | null;
  class_id: string;
  subject_master_id: string;
  subject_group: SubjectGroup;
  unit: number | null;
  room_id: string | null;
  file: AttachedFile | null;
};

export type ClassSubjectBulkCreateInput = {
  academic_year_id: string;
  class_ids: string[];
  subject_master_ids: string[];
  subject_group: SubjectGroup;
  unit: number | null;
  room_id: string | null;
  file_id: string | null;
};

export type ClassSubjectUpdateInput = {
  subject_group: SubjectGroup;
  unit: number | null;
  room_id: string | null;
  file_id: string | null;
};

export type ClassSubjectBulkCreateResult = { created_count: number; existing_count: number };

const BASE_PATH = "erp/class-subjects";
const PAGE_LIMIT = 200;
// Runaway guard only — 50 × 200 rows is far beyond any real school.
const MAX_PAGES = 50;

export function classSubjectsQueryKey(yearId: string): readonly unknown[] {
  return ["setup", "classSubjects", yearId];
}

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "CLASS_SUBJECT_NOT_FOUND") {
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
  // No per-field mapping here (this screen's form isn't CrudScreen-driven),
  // so a 422 surfaces the backend's message in the general banner instead.
  if (response.status === 422) return { ok: false, kind: "server", message: message ?? undefined };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure.
  return { ok: false, kind: "server", message: message ?? undefined };
}

function toSubjectGroup(value: unknown): SubjectGroup {
  return typeof value === "string" && value.toLowerCase() === "elective" ? "Elective" : "Core";
}

function toClassSubject(raw: unknown): ClassSubject {
  const row = raw as Record<string, unknown>;
  return {
    id: String(row.id),
    academic_year_id: typeof row.academic_year_id === "string" ? row.academic_year_id : null,
    class_id: String(row.class_id ?? ""),
    subject_master_id: String(row.subject_master_id ?? ""),
    subject_group: toSubjectGroup(row.subject_group),
    unit: typeof row.unit === "number" ? row.unit : null,
    room_id: typeof row.room_id === "string" ? row.room_id : null,
    file: readAttachedFile(row),
  };
}

export async function fetchClassSubjectsForYear(yearId: string): Promise<CrudResult<ClassSubject[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  const rows: ClassSubject[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let response: Response;
    try {
      response = await apiFetch(
        `${BASE_PATH}?academic_year_id=${encodeURIComponent(yearId)}&page=${page}&limit=${PAGE_LIMIT}`,
        { method: "GET" },
      );
    } catch {
      return { ok: false, kind: "network" };
    }

    const body = await parseBody(response);
    if (!response.ok) return toResult(response, body);

    const data = (body as { data?: { items?: unknown; has_more?: unknown } } | null)?.data;
    const items = Array.isArray(data?.items) ? data.items : [];
    rows.push(...items.map(toClassSubject));
    if (data?.has_more !== true || items.length === 0) break;
  }

  return { ok: true, data: rows.filter((row) => row.academic_year_id === null || row.academic_year_id === yearId) };
}

export async function bulkCreateClassSubjects(
  input: ClassSubjectBulkCreateInput,
): Promise<CrudResult<ClassSubjectBulkCreateResult>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  // unit/room_id/file_id are optional in the bulk contract — omitted
  // rather than sent as null when empty.
  const payload: Record<string, unknown> = {
    academic_year_id: input.academic_year_id,
    class_ids: input.class_ids,
    subject_master_ids: input.subject_master_ids,
    subject_group: input.subject_group,
  };
  if (input.unit !== null) payload.unit = input.unit;
  if (input.room_id) payload.room_id = input.room_id;
  if (input.file_id) payload.file_id = input.file_id;

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/bulk`, { method: "POST", body: JSON.stringify(payload) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const data = (body as { data?: Record<string, unknown> } | null)?.data;
    if (!data) return { ok: false, kind: "server" };
    // Prefer the explicit counts; fall back to the arrays' lengths.
    const count = (value: unknown, list: unknown) =>
      typeof value === "number" ? value : Array.isArray(list) ? list.length : 0;
    return {
      ok: true,
      data: {
        created_count: count(data.created_count, data.created),
        existing_count: count(data.existing_count, data.existing),
      },
    };
  }
  return toResult(response, body);
}

export async function updateClassSubject(
  id: string,
  data: ClassSubjectUpdateInput,
): Promise<CrudResult<ClassSubject>> {
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
    const updated = (body as { data?: unknown } | null)?.data;
    if (updated && typeof updated === "object") return { ok: true, data: toClassSubject(updated) };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

export async function removeClassSubject(id: string): Promise<CrudResult<void>> {
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
