import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type { HttpMethod, Transport, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";

export { realTransport } from "@/lib/setup/assessmentConfiguration/templateCatalog";
export type { HttpMethod, Transport, WireResponse };

/**
 * Shared plumbing for the HR services (Staff, Staff Posts, Permission
 * Groups). Same model as the template catalogs (templateCatalog.ts): a
 * Transport returns the wire response ({ status, body } in the ERP
 * envelope), and each service runs it through the same fromWire /
 * toHrResult whether it came from the mock (mock/hrMockBackend.ts) or the
 * real API — so each service's USE_MOCK flag is the only thing that
 * changes at swap time.
 *
 * No HR backend exists yet (probed 2026-10-21: only the read-only
 * GET erp/staff lookup — see src/lib/staff/staffApi.ts). Every path and
 * error code below is the PROPOSED contract the mock answers to, for
 * Muntajir to confirm.
 */

/** A service's mock-or-real switch, passed to every request. */
export type HrChannel = { transport: Transport; isMock: boolean };

/**
 * Error codes -> CrudResult. Code names are GUESSED (by analogy to Student
 * Core's confirmed ones) — reconcile when the backend ships. Every
 * non-2xx "server" result keeps its HTTP status, so a 4xx is never
 * retried (throwIfTransient).
 */
const FIELD_ERROR_CODES: Record<string, string> = {
  DUPLICATE_NAME: "name",
  NAME_TAKEN: "name",
  EMAIL_TAKEN: "email",
  DUPLICATE_EMAIL: "email",
  USERNAME_TAKEN: "username",
  POST_NOT_FOUND: "post_id",
};

const CONFLICT_CODES = new Set([
  "STAFF_NOT_FOUND",
  "STAFF_POST_NOT_FOUND",
  "PERMISSION_GROUP_NOT_FOUND",
  "STAFF_POST_IN_USE",
  "PERMISSION_GROUP_IN_USE",
  "NOT_A_DRAFT",
  "INVALID_STATUS_TRANSITION",
]);

/** Body fields a 422 VALIDATION_ERROR can be pinned to; anything else stays a banner. The field name LEADS the message (Student Core's confirmed convention). */
const VALIDATION_FIELDS = new Set([
  "name",
  "email",
  "national_id",
  "username",
  "first_name",
  "last_name",
  "post_id",
  "staff_type",
  "reason",
  "effective_on",
]);

function fieldFromValidationMessage(message: string | null): string | null {
  const match = message?.match(/^\s*["'`]?(?:body\.|data\.)?([a-z][a-z0-9_]*)/i);
  const field = match?.[1]?.toLowerCase() ?? null;
  return field && VALIDATION_FIELDS.has(field) ? field : null;
}

export function toHrResult<T>(status: number, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);
  const text = message ?? undefined;

  if (code && FIELD_ERROR_CODES[code]) {
    return { ok: false, kind: "validation", errors: [{ field: FIELD_ERROR_CODES[code], message: text, code }] };
  }
  if (code && CONFLICT_CODES.has(code)) return { ok: false, kind: "conflict", message: text };
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") return { ok: false, kind: "forbidden", message: text };
  if (code === "VALIDATION_ERROR" || (!code && status === 422)) {
    const field = fieldFromValidationMessage(message);
    if (field) return { ok: false, kind: "validation", errors: [{ field, message: text, code: "VALIDATION_ERROR" }] };
    return { ok: false, kind: "server", message: text, status };
  }

  if (status === 403) return { ok: false, kind: "forbidden" };
  if (status === 404 || status === 409) return { ok: false, kind: "conflict", message: text };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out on failure, same as every other authenticated call.
  return { ok: false, kind: "server", message: text, status };
}

/** One request. The dev-bypass guard applies only to the real transport — the mock never leaves the browser. */
export async function sendHrRequest<T>(
  { transport, isMock }: HrChannel,
  method: HttpMethod,
  path: string,
  payload: unknown,
  onSuccess: (body: unknown) => CrudResult<T>,
): Promise<CrudResult<T>> {
  if (!isMock && DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: WireResponse;
  try {
    response = await transport(method, path, payload);
  } catch {
    return { ok: false, kind: "network" };
  }
  if (response.status >= 200 && response.status < 300) return onSuccess(response.body);
  return toHrResult<T>(response.status, response.body);
}

// ---------------------------------------------------------------------------
// Tolerant wire readers
// ---------------------------------------------------------------------------

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringIds(value: unknown): string[] {
  return asArray(value).filter((id): id is string => typeof id === "string" && !!id);
}

export function readData(body: unknown): unknown {
  return (body as { data?: unknown } | null)?.data;
}

export function readEntity(body: unknown): Record<string, unknown> | null {
  const data = asRecord(readData(body));
  return data && typeof data.id === "string" ? data : null;
}

export function readListItems(body: unknown): unknown[] {
  return asArray(asRecord(readData(body))?.items);
}

/** Page metadata, falling back to arithmetic if a field is ever missing — same tolerance as studentsApi's readListPage. */
export function readPageMeta(
  body: unknown,
  requestedPage: number,
  requestedLimit: number,
  itemCount: number,
): { total: number; page: number; limit: number; hasMore: boolean } {
  const data = asRecord(readData(body));
  const page = typeof data?.page === "number" ? data.page : requestedPage;
  const limit = typeof data?.limit === "number" && data.limit > 0 ? data.limit : requestedLimit;
  const hasMore =
    typeof data?.has_more === "boolean"
      ? data.has_more
      : typeof data?.total === "number"
        ? page * limit < data.total
        : itemCount === limit;
  const total = typeof data?.total === "number" ? data.total : (page - 1) * limit + itemCount + (hasMore ? 1 : 0);
  return { total, page, limit, hasMore };
}
