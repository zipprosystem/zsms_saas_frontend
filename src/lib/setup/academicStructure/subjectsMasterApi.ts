import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import { readAttachedFile, type AttachedFile } from "@/lib/files/filesApi";
import { departmentsService } from "@/lib/setup/academicStructure/departmentsApi";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir — a school-level subject catalog, NOT
 * the older year-scoped Subjects API. { success, data }, Bearer auth via
 * apiFetch, ERP error shape (see erpError.ts).
 *
 *   GET {API_BASE}/erp/subject-masters?page=&limit=   (note: subject-masters)
 *     -> { success: true, data: { items, total, page, limit, has_more } }
 *     Fetched once at limit=200, searched/paginated client-side.
 *   POST/PUT {API_BASE}/erp/subject-masters[/:id]
 *     { name, short_name, color, department_id, file_id, description_json,
 *       show_on_frontend }
 *     -> { success: true, data: <entity> }
 *   DELETE {API_BASE}/erp/subject-masters/:id
 *
 * AI-READINESS (standing principle): `description_json` — TipTap's
 * ProseMirror JSON — is the CANONICAL value and the only one sent. The
 * backend generates `description_html` itself; it's read back for display
 * but never sent (the client's HTML isn't authoritative). An empty editor
 * is sent as null, not an empty-paragraph doc.
 *
 * file_id comes from the shared upload utility (src/lib/files/filesApi.ts);
 * the response's attachment is read via readAttachedFile(), which tolerates
 * a flat file_id or a nested file object until confirmed.
 *
 * Error codes: DUPLICATE_SUBJECT_NAME -> `name` field.
 * DUPLICATE_SHORT_NAME -> `short_name` field (the short name is prefilled
 * from the name, so this is how the user learns they must change it).
 * DEPARTMENT_NOT_FOUND (GUESSED) -> `department_id` field.
 * SUBJECT_MASTER_NOT_FOUND (GUESSED) -> conflict (stale row). Any
 * other/missing code falls back to plain status-code classification.
 */
export type SubjectMaster = {
  id: string;
  name: string;
  short_name: string;
  color: string;
  department_id: string;
  file: AttachedFile | null;
  description_json: Record<string, unknown> | null;
  description_html: string | null;
  show_on_frontend: boolean;
};

export type SubjectMasterInput = {
  name: string;
  short_name: string;
  color: string;
  department_id: string;
  file_id: string | null;
  description_json: Record<string, unknown> | null;
  show_on_frontend: boolean;
};

const BASE_PATH = "erp/subject-masters";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_SUBJECT_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "DUPLICATE_SHORT_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "short_name", message: message ?? undefined }] };
  }
  if (code === "DEPARTMENT_NOT_FOUND") {
    return { ok: false, kind: "validation", errors: [{ field: "department_id", message: message ?? undefined }] };
  }
  if (code === "SUBJECT_MASTER_NOT_FOUND") {
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

// A doc with no text and nothing but empty paragraphs/hard breaks is
// "empty" — TipTap never reports null itself, it reports an empty doc.
function isEmptyDoc(node: unknown): boolean {
  if (!node || typeof node !== "object") return true;
  const { type, text, content } = node as { type?: unknown; text?: unknown; content?: unknown };
  if (type === "text") return typeof text !== "string" || !text.trim();
  if (type !== "doc" && type !== "paragraph" && type !== "hardBreak") return false;
  return !Array.isArray(content) || content.every(isEmptyDoc);
}

function toPayload(data: SubjectMasterInput) {
  return {
    ...data,
    description_json: data.description_json && !isEmptyDoc(data.description_json) ? data.description_json : null,
  };
}

// Tolerates the JSON column coming back serialized as a string.
function readDescriptionJson(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toSubjectMaster(raw: unknown): SubjectMaster {
  const row = raw as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    short_name: String(row.short_name ?? ""),
    color: String(row.color ?? ""),
    department_id: String(row.department_id ?? ""),
    file: readAttachedFile(row),
    description_json: readDescriptionJson(row.description_json),
    description_html: typeof row.description_html === "string" ? row.description_html : null,
    show_on_frontend: row.show_on_frontend === true,
  };
}

function extractSubjectList(body: unknown): SubjectMaster[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? items.map(toSubjectMaster) : [];
}

function extractSubject(body: unknown): SubjectMaster | null {
  const data = (body as { data?: unknown } | null)?.data;
  return data && typeof data === "object" ? toSubjectMaster(data) : null;
}

async function list(): Promise<CrudResult<SubjectMaster[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    return { ok: true, data: extractSubjectList(body) };
  }
  return toResult(response, body);
}

async function create(data: SubjectMasterInput): Promise<CrudResult<SubjectMaster>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(toPayload(data)) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = extractSubject(body);
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: SubjectMasterInput): Promise<CrudResult<SubjectMaster>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(toPayload(data)),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const updated = extractSubject(body);
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

export const subjectsMasterService: CrudService<SubjectMaster, SubjectMasterInput, SubjectMasterInput> = {
  queryKey: ["setup", "subjectsMaster"],
  // Departments' subject_count is backend-calculated from these rows.
  relatedQueryKeys: [departmentsService.queryKey],
  list,
  create,
  update,
  remove,
};
