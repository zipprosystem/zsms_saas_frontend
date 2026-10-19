import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import {
  SCHOOL_TYPE_ASSIGNMENTS_LIVE,
  assignmentsFromWire,
  deleteMockAssignments,
  loadMockAssignments,
  saveMockAssignments,
  type SchoolTypeAssignments,
} from "@/lib/setup/academicStructure/schoolTypeAssignments";
import { devCreate, devList, devRemove, devUpdate } from "@/lib/setup/academicStructure/schoolTypesDevMock";

/**
 * Finalized contract per Muntajir: { success, data }, Bearer auth via
 * apiFetch. No is_active — same confirmed correction as Award Bodies.
 *
 *   GET {API_BASE}/erp/school-types?page=&limit=
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *        Paginated (default limit 50, max 200) — fetched once with
 *        limit=200 and searched/paginated client-side, same reasoning and
 *        accepted limitation as Award Bodies/Academic Years.
 *        The contract also accepts an optional `academic_year_id` filter —
 *        deliberately NOT passed here. School Types are a structural,
 *        year-independent categorisation of the school (Creche/JSS/SSS…),
 *        not data scoped to a particular session the way Classes likely
 *        are (hence "active classes only" on this entity's own `classes`
 *        field below) — confirmed with Matthew.
 *   POST/PUT {API_BASE}/erp/school-types[/:id] { name, award_body_ids, description? }
 *     -> { success: true, data: <entity> } directly, never wrapped in items.
 *     award_body_ids is MANY-TO-MANY (a school type can have multiple
 *     award bodies) — the earlier single required award_body_id is
 *     deprecated, never sent/read here. Requiring at least one selection is
 *     an ASSUMPTION carried over from the earlier single-required contract
 *     (Muntajir hasn't explicitly said whether m2m still requires ≥1) —
 *     reconcile if he says it's actually optional.
 *   DELETE {API_BASE}/erp/school-types/:id
 *
 * Response entity includes `award_bodies` (the nested Award Body objects,
 * plural) and `classes` (this school type's classes) alongside
 * `award_body_ids` itself — the card reads award_bodies[].name directly
 * rather than looking them up client-side. The deprecated singular
 * `award_body_id`/`award_body` fields, if the backend still sends them,
 * are ignored entirely. `classes`' exact shape is an ASSUMPTION (only "the
 * active ones show as chips" was specified, not confirmed field-by-field)
 * — reconcile once a real payload is seen.
 *
 * Error body shape (all non-2xx responses): { success:false, error:{ code,
 * message } } — see erpError.ts. Known codes handled below (unchanged from
 * the single-award-body contract, just retargeted to the `award_body_ids`
 * field instead of `award_body_id`):
 *   DUPLICATE_NAME         -> validation error on the `name` field
 *   AWARD_BODY_REQUIRED    -> validation error on the `award_body_ids` field
 *   AWARD_BODY_NOT_FOUND   -> validation error on the `award_body_ids` field
 *                             (a stale/deleted award body was selected)
 *   SCHOOL_TYPE_HAS_CLASSES -> 409 delete conflict, item NOT removed
 *                              locally, backend message surfaced as-is
 *   SCHOOL_TYPE_NOT_FOUND  -> conflict (stale row)
 * Any other/missing code falls back to the plain status-code classification
 * (403/409/422/else), same defensive pattern as Award Bodies/Academic Years.
 *
 * TEMPLATE ASSIGNMENTS (result_template_id, student_id_card_template_id,
 * staff_id_card_template_id, report_logo_file_id) — not in the backend
 * yet. While SCHOOL_TYPE_ASSIGNMENTS_LIVE is false they're kept in a
 * MOCK side-store and merged on read; the real POST/PUT body above is
 * unchanged. See schoolTypeAssignments.ts.
 *
 * DEV_AUTH_BYPASS: list/create/update/remove fall back to a throwaway
 * localStorage mock (schoolTypesDevMock.ts) instead of returning
 * devBypassUnavailable — local-only scaffolding for the assignment flow,
 * removed when the flag flips.
 */
export type SchoolTypeClass = {
  id: string;
  name: string;
  is_active: boolean;
};

type SchoolTypeBase = {
  id: string;
  name: string;
  award_body_ids: string[];
  award_bodies: Array<{ id: string; name: string; description: string | null }>;
  description: string | null;
  classes: SchoolTypeClass[];
};

export type SchoolType = SchoolTypeBase & SchoolTypeAssignments;

/** What the real POST/PUT body carries today. */
type SchoolTypeBaseInput = {
  name: string;
  award_body_ids: string[];
  description: string | null;
};

export type SchoolTypeInput = SchoolTypeBaseInput & SchoolTypeAssignments;

const BASE_PATH = "erp/school-types";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "AWARD_BODY_REQUIRED" || code === "AWARD_BODY_NOT_FOUND") {
    return {
      ok: false,
      kind: "validation",
      errors: [{ field: "award_body_ids", message: message ?? undefined }],
    };
  }
  if (code === "SCHOOL_TYPE_HAS_CLASSES" || code === "SCHOOL_TYPE_NOT_FOUND") {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR") {
    return { ok: false, kind: "server", message: message ?? undefined, status: response.status };
  }

  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 409) return { ok: false, kind: "conflict", message: message ?? undefined };
  if (response.status === 422) return { ok: false, kind: "validation", errors: [] };
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure, same as every
  // other authenticated call in this app.
  return { ok: false, kind: "server", message: message ?? undefined, status: response.status };
}

function extractSchoolTypeList(body: unknown): SchoolTypeBase[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as SchoolTypeBase[]) : [];
}

async function realList(): Promise<CrudResult<SchoolTypeBase[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    return { ok: true, data: extractSchoolTypeList(body) };
  }
  return toResult(response, body);
}

async function realCreate(data: SchoolTypeBaseInput | SchoolTypeInput): Promise<CrudResult<SchoolTypeBase>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: SchoolTypeBase } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function realUpdate(id: string, data: SchoolTypeBaseInput | SchoolTypeInput): Promise<CrudResult<SchoolTypeBase>> {
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
    const updated = (body as { data?: SchoolTypeBase } | null)?.data;
    if (updated) return { ok: true, data: updated };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function realRemove(id: string): Promise<CrudResult<void>> {
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

// ---------------------------------------------------------------------------
// Public surface: real (or dev-bypass mock) School Type + assignments.
// ---------------------------------------------------------------------------

function baseInput(data: SchoolTypeInput): SchoolTypeBaseInput {
  return { name: data.name, award_body_ids: data.award_body_ids, description: data.description };
}

function assignmentsOf(data: SchoolTypeInput): SchoolTypeAssignments {
  return {
    result_template_id: data.result_template_id,
    student_id_card_template_id: data.student_id_card_template_id,
    staff_id_card_template_id: data.staff_id_card_template_id,
    report_logo_file_id: data.report_logo_file_id,
  };
}

/** Live: the four fields come back on the entity itself. Mock: merged from the side-store. */
function withAssignments(row: SchoolTypeBase): SchoolType {
  const assignments = SCHOOL_TYPE_ASSIGNMENTS_LIVE
    ? assignmentsFromWire(row as unknown as Record<string, unknown>)
    : loadMockAssignments(row.id);
  return { ...row, ...assignments };
}

/** Mock: the base save succeeded, so persist its assignments alongside. */
function afterSave(result: CrudResult<SchoolTypeBase>, data: SchoolTypeInput): CrudResult<SchoolType> {
  if (!result.ok) return result;
  if (!SCHOOL_TYPE_ASSIGNMENTS_LIVE) saveMockAssignments(result.data.id, assignmentsOf(data));
  return { ok: true, data: withAssignments(result.data) };
}

async function list(): Promise<CrudResult<SchoolType[]>> {
  const result = DEV_AUTH_BYPASS ? await devList() : await realList();
  return result.ok ? { ok: true, data: result.data.map(withAssignments) } : result;
}

async function create(data: SchoolTypeInput): Promise<CrudResult<SchoolType>> {
  const body = SCHOOL_TYPE_ASSIGNMENTS_LIVE ? data : baseInput(data);
  return afterSave(DEV_AUTH_BYPASS ? await devCreate(data) : await realCreate(body), data);
}

async function update(id: string, data: SchoolTypeInput): Promise<CrudResult<SchoolType>> {
  const body = SCHOOL_TYPE_ASSIGNMENTS_LIVE ? data : baseInput(data);
  return afterSave(DEV_AUTH_BYPASS ? await devUpdate(id, data) : await realUpdate(id, body), data);
}

async function remove(id: string): Promise<CrudResult<void>> {
  const result = DEV_AUTH_BYPASS ? await devRemove(id) : await realRemove(id);
  if (result.ok && !SCHOOL_TYPE_ASSIGNMENTS_LIVE) deleteMockAssignments(id);
  return result;
}

export const schoolTypesService: CrudService<SchoolType, SchoolTypeInput, SchoolTypeInput> = {
  queryKey: ["setup", "schoolTypes"],
  list,
  create,
  update,
  remove,
};
