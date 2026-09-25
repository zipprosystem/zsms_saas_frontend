import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * Finalized contract per Muntajir. { success, data }, Bearer auth via
 * apiFetch, ERP error shape { success:false, error:{code,message} } (see
 * erpError.ts) — same conventions as Classes/Class-arms.
 *
 * A term is defined ONCE but APPLIED to multiple classes — each class gets
 * its OWN independent ClassTerm row (own id), editable/deletable
 * separately. There's no "the term" entity distinct from its per-class
 * rows; grouping several classes' rows by term_type is purely a
 * client-side presentation choice (see ClassTermsScreen.tsx), not
 * something the backend models.
 *
 *   POST {API_BASE}/erp/class-terms { academic_year_id, class_ids: [...],
 *     term_name, start_date, end_date, next_term_start_date,
 *     next_term_fee?, term_type }
 *     -> Transactional (all-or-nothing) — creates one independent
 *     ClassTerm per class_id. FLAGGED, UNCONFIRMED response shape:
 *     assumed { success: true, data: <ClassTerm[]> } (one full row per
 *     class, each already carrying its own id + class_id) — reconcile
 *     once tested against the real API.
 *   PUT {API_BASE}/erp/class-terms/:id { term_name, start_date, end_date,
 *     next_term_start_date, next_term_fee?, term_type }
 *     -> Edits ONE class's term only. No class_ids/academic_year_id in
 *     this body — a term's class and year aren't reassignable through
 *     this flow (ClassTermsScreen's edit panel shows them as read-only
 *     context instead of form fields).
 *   DELETE {API_BASE}/erp/class-terms/:id
 *   GET {API_BASE}/erp/classes/:classId/terms?page=&limit=&include_inactive=
 *     Per-class, same shape family as Sections (no "all terms for a
 *     school" endpoint) — the Setup screen's merged multi-class view is
 *     built client-side via useQueries, one query per class, exactly like
 *     Class-arms. include_inactive=true is PATTERN-MATCHED from Sections'
 *     own query string, not confirmed for this specific endpoint —
 *     flagged. Fetched for ALL of the year's classes (active AND
 *     inactive), not just active ones — unlike Sections, there's no
 *     CONFIRMED backend limitation here that an inactive class's terms
 *     become invisible, so an existing term on a since-deactivated class
 *     should stay visible/manageable. The CREATE form's "Apply to"
 *     checklist is still scoped to active classes only, per the product
 *     spec (a NEW term shouldn't be applied to an inactive class).
 *
 * Error codes: DUPLICATE_NAME (flagged as uncertain whether this even
 * applies to term_name — included defensively, harmless if it never
 * fires) -> `term_name` field. CLASS_NOT_FOUND / CLASS_INACTIVE (on
 * create, against the class_ids array) -> general banner, not a specific
 * field — with class_ids being an array, the response doesn't tell us
 * which selected class was the problem. TERM_NOT_FOUND (GUESSED, by
 * analogy to Sections' SECTION_NOT_FOUND — unconfirmed) -> conflict
 * (stale row). VALIDATION_ERROR -> general banner. Any other/missing code
 * falls back to plain status-code classification, same defensive pattern
 * as every other Setup service.
 */
export type TermType = "First" | "Second" | "Third";

export type ClassTerm = {
  id: string;
  class_id: string;
  academic_year_id: string;
  term_name: string;
  start_date: string;
  end_date: string;
  next_term_start_date: string;
  next_term_fee: number | null;
  term_type: TermType;
};

export type ClassTermCreateInput = {
  academic_year_id: string;
  class_ids: string[];
  term_name: string;
  start_date: string;
  end_date: string;
  next_term_start_date: string;
  next_term_fee: number | null;
  term_type: TermType;
};

export type ClassTermUpdateInput = {
  term_name: string;
  start_date: string;
  end_date: string;
  next_term_start_date: string;
  next_term_fee: number | null;
  term_type: TermType;
};

/** Shared by the useQueries construction in ClassTermsScreen.tsx and every post-mutation invalidateQueries call, so they can never drift apart. */
export function classTermsQueryKey(classId: string): readonly unknown[] {
  return ["setup", "classTerms", "class", classId];
}

const CLASS_TERMS_PATH = "erp/class-terms";

function classTermsForClassPath(classId: string): string {
  return `erp/classes/${encodeURIComponent(classId)}/terms`;
}

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "term_name", message: message ?? undefined }] };
  }
  if (code === "CLASS_NOT_FOUND" || code === "CLASS_INACTIVE" || code === "TERM_NOT_FOUND") {
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

function extractTermList(body: unknown): ClassTerm[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as ClassTerm[]) : [];
}

/** The queryFn for each of useQueries' per-class queries in ClassTermsScreen.tsx. */
export async function fetchTermsForClass(classId: string): Promise<CrudResult<ClassTerm[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${classTermsForClassPath(classId)}?page=1&limit=200&include_inactive=true`, {
      method: "GET",
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) return { ok: true, data: extractTermList(body) };
  return toResult(response, body);
}

export async function createClassTerms(data: ClassTermCreateInput): Promise<CrudResult<ClassTerm[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(CLASS_TERMS_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return toResult(response, body);
  const created = (body as { data?: unknown } | null)?.data;
  if (Array.isArray(created) && created.length > 0) {
    return { ok: true, data: created as ClassTerm[] };
  }
  return { ok: false, kind: "server" };
}

export async function updateClassTerm(id: string, data: ClassTermUpdateInput): Promise<CrudResult<ClassTerm>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${CLASS_TERMS_PATH}/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (!response.ok) return toResult(response, body);
  const updated = (body as { data?: ClassTerm } | null)?.data;
  if (!updated) return { ok: false, kind: "server" };
  return { ok: true, data: updated };
}

export async function removeClassTerm(id: string): Promise<CrudResult<void>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${CLASS_TERMS_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    return { ok: false, kind: "network" };
  }

  if (response.ok) return { ok: true, data: undefined };
  const body = await parseBody(response);
  return toResult(response, body);
}
