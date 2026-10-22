import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { mockDelay } from "@/lib/onboarding/mockDelay";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * Shared plumbing for the template catalogs (Result Templates, ID Card
 * Templates) — both are MOCK until the backend ships them, built so the
 * swap is one flag per service (USE_MOCK in resultTemplatesApi.ts /
 * idCardTemplatesApi.ts).
 *
 * Mock and real go through the SAME code path: a Transport returns the
 * wire response ({ status, body } in the ERP envelope), and the service
 * runs it through the same fromWire / toCatalogResult either way. The
 * mock (createMockCatalog) imitates the backend at the HTTP level —
 * envelope, status codes, ERP error bodies — so swapping to the real
 * transport changes nothing above it.
 */

export type TemplateStatus = "draft" | "available" | "archived";

const TEMPLATE_STATUSES: readonly TemplateStatus[] = ["draft", "available", "archived"];

export function templateStatusFromWire(value: unknown): TemplateStatus {
  return TEMPLATE_STATUSES.includes(value as TemplateStatus) ? (value as TemplateStatus) : "draft";
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type WireResponse = { status: number; body: unknown };
/** `path` may carry a query string. Throws only on a network failure (same as apiFetch). */
export type Transport = (method: HttpMethod, path: string, payload?: unknown) => Promise<WireResponse>;

export const realTransport: Transport = async (method, path, payload) => {
  const response = await apiFetch(path, {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

/**
 * Error codes -> CrudResult. Code names are GUESSED (no contract yet) —
 * by analogy to the other ERP catalogs; reconcile when the backend ships.
 * Every non-2xx keeps its HTTP status on a "server" result, so a 4xx is
 * never retried (throwIfTransient).
 */
const CONFLICT_CODES = new Set(["TEMPLATE_NOT_FOUND", "TEMPLATE_NOT_AVAILABLE", "TEMPLATE_IS_DEFAULT", "TEMPLATE_IN_USE"]);

export function toCatalogResult<T>(status: number, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined, code }] };
  }
  if (code && CONFLICT_CODES.has(code)) return { ok: false, kind: "conflict", message: message ?? undefined };
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR") return { ok: false, kind: "server", message: message ?? undefined, status };

  if (status === 403) return { ok: false, kind: "forbidden" };
  if (status === 404 || status === 409) return { ok: false, kind: "conflict", message: message ?? undefined };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out on failure, same as every other authenticated call.
  return { ok: false, kind: "server", message: message ?? undefined, status };
}

/** One request through `transport`. The dev-bypass guard only applies to the real transport — the mock never leaves the browser. */
export async function sendCatalogRequest<T>(
  { transport, isMock }: { transport: Transport; isMock: boolean },
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
  return toCatalogResult<T>(response.status, response.body);
}

export function readListItems(body: unknown): unknown[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? items : [];
}

export function readEntity(body: unknown): Record<string, unknown> | null {
  const data = (body as { data?: unknown } | null)?.data;
  return data && typeof data === "object" && !Array.isArray(data) && typeof (data as { id?: unknown }).id === "string"
    ? (data as Record<string, unknown>)
    : null;
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// ---------------------------------------------------------------------------
// MOCK backend
// ---------------------------------------------------------------------------

export type MockTemplateRow = {
  id: string;
  name: string;
  status: TemplateStatus;
  is_default: boolean;
} & Record<string, unknown>;

type MockCatalogOptions<Row extends MockTemplateRow> = {
  /** e.g. "erp/result-templates" — the real path the mock answers for. */
  basePath: string;
  storageKey: string;
  seeds: Row[];
  /**
   * Rows sharing a scope share one default (BACKEND-OWNED rule): Result
   * Templates have a single default; ID cards one per kind.
   */
  defaultScope: (row: Row) => string;
  /** GET list query filter, e.g. ?kind=student. */
  matchesQuery?: (row: Row, query: URLSearchParams) => boolean;
  /** Fields a POST/PUT may write (server-owned ones like id/preview_path are kept). */
  writableFields: readonly string[];
};

function errorBody(code: string, message: string) {
  return { success: false, error: { code, message } };
}

function mockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

/**
 * A localStorage-backed stand-in for the catalog endpoints. Every rule
 * here is BACKEND-OWNED — commented so this doubles as the spec:
 *   - Only an `available` template may be the default (409 TEMPLATE_NOT_AVAILABLE).
 *   - Setting a default clears every other default in its scope.
 *   - DELETE archives (status -> archived), never hard-deletes; the
 *     current default can't be archived (409 TEMPLATE_IS_DEFAULT) — set
 *     another default first. Archiving an archived template is a no-op.
 *   - New templates start as `draft`, never default.
 *   - `name` is required (422 VALIDATION_ERROR, field-led message).
 */
export function createMockCatalog<Row extends MockTemplateRow>(options: MockCatalogOptions<Row>): Transport {
  let rows: Row[] | null = null;

  const load = (): Row[] => {
    if (rows) return rows;
    rows = options.seeds.map((seed) => ({ ...seed }));
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(options.storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) rows = parsed as Row[];
      } catch {
        // Corrupt JSON / storage disabled — fall back to the seeds.
      }
    }
    return rows;
  };

  const save = (next: Row[]) => {
    rows = next;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(options.storageKey, JSON.stringify(next));
    } catch {
      // Best-effort; the in-memory copy still works for this session.
    }
  };

  const pick = (payload: unknown): Partial<Row> => {
    const source = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const field of options.writableFields) if (field in source) picked[field] = source[field];
    return picked as Partial<Row>;
  };

  return async (method, fullPath, payload) => {
    await mockDelay(300);
    const [path, queryString = ""] = fullPath.split("?");
    const current = load();
    const id = path.startsWith(`${options.basePath}/`) ? decodeURIComponent(path.slice(options.basePath.length + 1)) : null;

    if (method === "GET" && !id) {
      const query = new URLSearchParams(queryString);
      const items = current.filter((row) => options.matchesQuery?.(row, query) ?? true);
      return { status: 200, body: { success: true, data: { items, total: items.length, page: 1, limit: items.length, has_more: false } } };
    }

    if (method === "POST" && !id) {
      const fields = pick(payload);
      if (!str(fields.name).trim()) return { status: 422, body: errorBody("VALIDATION_ERROR", "name is required") };
      const created = { ...fields, id: mockId(), status: "draft", is_default: false } as Row;
      save([...current, created]);
      return { status: 201, body: { success: true, data: created } };
    }

    const existing = id ? current.find((row) => row.id === id) : undefined;
    if (!existing) return { status: 404, body: errorBody("TEMPLATE_NOT_FOUND", "Template not found") };

    if (method === "PUT") {
      const next = { ...existing, ...pick(payload) } as Row;
      if (!str(next.name).trim()) return { status: 422, body: errorBody("VALIDATION_ERROR", "name is required") };
      if (next.is_default && next.status !== "available") {
        return {
          status: 409,
          body: errorBody("TEMPLATE_NOT_AVAILABLE", "Only an available template can be the default."),
        };
      }
      const scope = options.defaultScope(next);
      save(
        current.map((row) => {
          if (row.id === next.id) return next;
          // Setting a default clears every other default in the same scope.
          return next.is_default && row.is_default && options.defaultScope(row) === scope ? { ...row, is_default: false } : row;
        }),
      );
      return { status: 200, body: { success: true, data: next } };
    }

    if (method === "DELETE") {
      if (existing.is_default) {
        return {
          status: 409,
          body: errorBody("TEMPLATE_IS_DEFAULT", "This is the default template. Set another template as default before archiving it."),
        };
      }
      save(current.map((row) => (row.id === existing.id ? { ...row, status: "archived" } : row)));
      return { status: 200, body: { success: true, data: null } };
    }

    return { status: 405, body: errorBody("METHOD_NOT_ALLOWED", "Method not allowed") };
  };
}
