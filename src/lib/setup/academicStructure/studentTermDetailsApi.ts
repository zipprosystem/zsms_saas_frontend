import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * REAL Student Term Details API — Muntajir's Student Core contract.
 * { success, data }, Bearer auth via apiFetch, ERP error shape (see
 * erpError.ts) — same conventions as Classes/Class Terms. Only testable
 * on deploy (DEV_AUTH_BYPASS short-circuits every call locally).
 *
 *   GET    erp/academic-years/:yearId/student-term-details -> data: [...] (bare array)
 *   POST   erp/student-term-details        (201)
 *   PUT    erp/student-term-details/:id    (200)
 *   DELETE erp/student-term-details/:id    -> { deleted: true }
 *   There is NO get-by-id — edit forms are seeded from the list row.
 *
 * Body (create AND update): academic_year_id, class_id, class_term_id,
 * section_id, student_id — ALL required — plus optional seat_number
 * (max 32), roll_no (max 32), remark (max 500). Unknown fields are a 422
 * VALIDATION_ERROR, so nothing else (e.g. house_id — Academic House is out
 * of scope backend-side) may ever be sent.
 *
 * Mostly AUTO-POPULATED: creating/submitting an active student with full
 * placement creates their initial record server-side in the same
 * transaction (drafts don't). This screen's manual add/edit/delete is for
 * corrections. The backend does NOT auto-roll students into later terms,
 * and neither does this frontend any more — that would create records the
 * backend owns.
 *
 * Error codes -> CrudResult:
 *   TERM_DETAIL_TAKEN (student already placed in that class-term) -> student_id
 *   CLASS_NOT_IN_YEAR -> class_id · TERM_NOT_IN_CLASS -> class_term_id ·
 *   SECTION_NOT_IN_CLASS -> section_id
 *   TERM_DETAIL_IN_USE (deleting the student's CURRENT placement),
 *   NOT_A_DRAFT, STUDENT_NOT_EDITABLE, SCHOOL_MODE_FORBIDS_STUDENT_MODE,
 *   TERM_DETAIL_NOT_FOUND -> conflict, backend message shown as-is
 *   VALIDATION_ERROR -> server (banner)
 */
export type StudentTermDetail = {
  id: string;
  student_id: string;
  academic_year_id: string;
  class_id: string;
  /** The class-arm (Sections API). */
  section_id: string;
  class_term_id: string;
  seat_number: string | null;
  roll_no: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentTermDetailInput = {
  academic_year_id: string;
  class_id: string;
  class_term_id: string;
  section_id: string;
  student_id: string;
  seat_number: string | null;
  roll_no: string | null;
  remark: string | null;
};

export const TERM_DETAIL_CODE_MAX_LENGTH = 32;
export const TERM_DETAIL_REMARK_MAX_LENGTH = 500;

export function studentTermDetailsQueryKey(yearId: string): readonly unknown[] {
  return ["setup", "studentTermDetails", yearId];
}

const BASE_PATH = "erp/student-term-details";

const FIELD_ERROR_CODES: Record<string, keyof StudentTermDetailInput> = {
  TERM_DETAIL_TAKEN: "student_id",
  CLASS_NOT_IN_YEAR: "class_id",
  TERM_NOT_IN_CLASS: "class_term_id",
  SECTION_NOT_IN_CLASS: "section_id",
};

const CONFLICT_CODES = new Set([
  "TERM_DETAIL_IN_USE",
  "NOT_A_DRAFT",
  "STUDENT_NOT_EDITABLE",
  "SCHOOL_MODE_FORBIDS_STUDENT_MODE",
  "TERM_DETAIL_NOT_FOUND",
]);

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code && FIELD_ERROR_CODES[code]) {
    return { ok: false, kind: "validation", errors: [{ field: FIELD_ERROR_CODES[code], message: message ?? undefined }] };
  }
  if (code && CONFLICT_CODES.has(code)) {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR") {
    return { ok: false, kind: "server", message: message ?? undefined };
  }

  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 404 || response.status === 409) {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (response.status === 422) return { ok: false, kind: "server", message: message ?? undefined };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure.
  return { ok: false, kind: "server", message: message ?? undefined };
}

function asRow(value: unknown): StudentTermDetail | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StudentTermDetail;
  return typeof row.id === "string" ? row : null;
}

async function send<T>(
  path: string,
  init: RequestInit,
  onSuccess: (body: unknown) => CrudResult<T>,
): Promise<CrudResult<T>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(path, init);
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return withStatus(toResult<T>(response, body), response.status);
  return onSuccess(body);
}

/** Stamps the HTTP status onto a "server" result so throwIfTransient() never retries a 4xx (e.g. a 422 VALIDATION_ERROR). */
function withStatus<T>(result: CrudResult<T>, status: number): CrudResult<T> {
  return !result.ok && result.kind === "server" ? { ...result, status } : result;
}

function rowResult(body: unknown): CrudResult<StudentTermDetail> {
  const row = asRow((body as { data?: unknown } | null)?.data);
  return row ? { ok: true, data: row } : { ok: false, kind: "server" };
}

export async function listStudentTermDetails(yearId: string): Promise<CrudResult<StudentTermDetail[]>> {
  return send(`erp/academic-years/${encodeURIComponent(yearId)}/student-term-details`, { method: "GET" }, (body) => {
    const data = (body as { data?: unknown } | null)?.data;
    const items = Array.isArray(data) ? data : [];
    return { ok: true, data: items.map(asRow).filter((row): row is StudentTermDetail => row !== null) };
  });
}

export async function createStudentTermDetail(input: StudentTermDetailInput): Promise<CrudResult<StudentTermDetail>> {
  return send(BASE_PATH, { method: "POST", body: JSON.stringify(input) }, rowResult);
}

export async function updateStudentTermDetail(
  id: string,
  input: StudentTermDetailInput,
): Promise<CrudResult<StudentTermDetail>> {
  return send(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }, rowResult);
}

/** Refused with 409 TERM_DETAIL_IN_USE when this is the student's current placement — surfaced as a conflict message; the row stays (CrudScreen only refetches on success). */
export async function removeStudentTermDetail(id: string): Promise<CrudResult<void>> {
  return send(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" }, () => ({ ok: true, data: undefined }));
}

export function createStudentTermDetailService(
  yearId: string,
): CrudService<StudentTermDetail, StudentTermDetailInput, StudentTermDetailInput> {
  return {
    queryKey: studentTermDetailsQueryKey(yearId),
    list: () => listStudentTermDetails(yearId),
    create: (data) => createStudentTermDetail(data),
    update: (id, data) => updateStudentTermDetail(id, data),
    remove: (id) => removeStudentTermDetail(id),
  };
}
