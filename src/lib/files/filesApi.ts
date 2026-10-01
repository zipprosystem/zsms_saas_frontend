import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * Reusable file upload/download utility — finalized contract per Muntajir.
 * Any entity with an attachment (Subject Master, Class Subjects, ...)
 * uploads here first, then stores only the returned file_id on itself.
 *
 *   POST {API_BASE}/erp/files  (multipart/form-data, parts "file" + "purpose")
 *     -> { success: true, data: { file_id, ...metadata } }
 *     `purpose` is REQUIRED — confirmed via real 422 ("purpose must be one
 *     of subject_master, class_subject"). Every caller must say what the
 *     attachment is for; there's no default. `student_photo` and
 *     `past_record_attachment` (Students' passport photo and past-record
 *     attachments) are NOT confirmed values the same way — reconcile with
 *     Muntajir before relying on them; widen further only once a new
 *     entity's purpose is similarly confirmed.
 *     FLAGGED, UNCONFIRMED: the exact metadata key names. readUploadedFile()
 *     accepts file_id or id, and original_name/name, size/size_bytes,
 *     mime_type/type — reconcile to the real shape from DevTools on deploy.
 *   GET {API_BASE}/erp/files/:id/download-url
 *     -> { success: true, data: { url, ... } } — a short-lived signed URL
 *     (TTL 300s). FLAGGED, UNCONFIRMED: the key name — readDownloadUrl()
 *     accepts url / download_url / signed_url / a bare string.
 *     NEVER cached anywhere (not in react-query, not on the entity):
 *     fetched fresh on every click via FileDownloadLink, so an expired
 *     URL can't be handed out.
 *
 * The backend validates type/size too; fileValidation.ts is only the
 * client-side first line.
 */

/** What an entity stores/shows for its attachment. name/size/type are display-only and may be null if the entity's response only carries file_id. */
export type AttachedFile = {
  file_id: string;
  name: string | null;
  size: number | null;
  type: string | null;
};

const BASE_PATH = "erp/files";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "FORBIDDEN" || code === "UNAUTHORIZED" || response.status === 403) {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (response.status === 404) return { ok: false, kind: "conflict", message: message ?? undefined };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure.
  return { ok: false, kind: "server", message: message ?? undefined };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads an entity's attachment off its raw API row — tolerant of either a
 * nested `file: {...}` object or a flat `file_id` (+ optional file_name/
 * file_size/file_type) until the entity responses are confirmed. Returns
 * null when there's no attachment.
 */
export function readAttachedFile(row: Record<string, unknown>): AttachedFile | null {
  const nested = row.file && typeof row.file === "object" ? (row.file as Record<string, unknown>) : null;
  const fileId = asString(nested?.file_id) ?? asString(nested?.id) ?? asString(row.file_id);
  if (!fileId) return null;
  return {
    file_id: fileId,
    name:
      asString(nested?.original_name) ?? asString(nested?.name) ?? asString(nested?.file_name) ?? asString(row.file_name),
    size: asNumber(nested?.size) ?? asNumber(nested?.size_bytes) ?? asNumber(row.file_size),
    type: asString(nested?.mime_type) ?? asString(nested?.type) ?? asString(row.file_type),
  };
}

function readUploadedFile(body: unknown, localFile: File): AttachedFile | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const fileId = asString(record.file_id) ?? asString(record.id);
  if (!fileId) return null;
  // Metadata falls back to the local File itself — it's what was just
  // uploaded, so it's accurate even if the response omits it.
  return {
    file_id: fileId,
    name: asString(record.original_name) ?? asString(record.name) ?? localFile.name,
    size: asNumber(record.size) ?? asNumber(record.size_bytes) ?? localFile.size,
    type: asString(record.mime_type) ?? asString(record.type) ?? localFile.type,
  };
}

function readDownloadUrl(body: unknown): string | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (typeof data === "string") return data || null;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return asString(record.url) ?? asString(record.download_url) ?? asString(record.signed_url);
}

/** Entities that can own an uploaded file — extend when a new one is confirmed with Muntajir. */
export type FileUploadPurpose = "subject_master" | "class_subject" | "student_photo" | "past_record_attachment";

export async function uploadFile(file: File, purpose: FileUploadPurpose): Promise<CrudResult<AttachedFile>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: formData });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const uploaded = readUploadedFile(body, file);
    if (uploaded) return { ok: true, data: uploaded };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

export async function getDownloadUrl(fileId: string): Promise<CrudResult<string>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(fileId)}/download-url`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const url = readDownloadUrl(body);
    if (url) return { ok: true, data: url };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}
