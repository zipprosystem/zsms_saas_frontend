import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { realTransport, type HttpMethod, type Transport, type WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { asArray, asRecord, readData, readEntity, readListItems, readPageMeta, str, stringIds, strOrNull } from "@/lib/hr/hrHttp";
import { fromWire as studentFromWire } from "@/lib/students/studentsApi";
import type { Student, StudentStatus } from "@/lib/students/studentTypes";
import { composePersonName } from "@/lib/parents/parentLinks";
import {
  PARENT_ADDRESS_KEYS,
  type Parent,
  type ParentAddress,
  type ParentChild,
  type ParentListItem,
  type ParentRelationship,
  type ParentStatus,
  type ParentWriteBody,
  type StudentOption,
} from "@/lib/parents/parentTypes";

/**
 * Parents — REAL Parent CRUD (backend main, src/modules/parents; school_admin
 * only on the backend). Envelope { success, data }, errors { error: { code,
 * message } }, lists { items, total, page, limit, has_more } (limit max 200).
 *
 *   GET    erp/parents?page=&limit=&search=&relationship=&status=
 *            search = parent full_name / email / phone / username (ILIKE)
 *            -> items: { id, full_name, relationship, total_kids, email,
 *                        phone, status, email_active }
 *   GET    erp/parents/:id      -> Parent (+ student_ids, total_kids)
 *   POST   erp/parents          body; 409 EMAIL_TAKEN / USERNAME_TAKEN
 *   PUT    erp/parents/:id      body; student_ids REPLACES the link set
 *                               (the page's link / unlink); 404 STUDENT_NOT_FOUND
 *   DELETE erp/parents/:id      soft delete -> { deleted: true }
 *
 * Linked students are resolved through Student Core (GET erp/students/:id,
 * GET erp/students?all_years=true&search=) — the Parent API returns bare
 * student ids, and the student record is also where the primary contact
 * lives (parentLinks.ts).
 *
 * DEV_AUTH_BYPASS (local login only): every call above — the student
 * lookups included — is answered by the in-browser dev mock
 * (mock/parentsDevMock.ts, same wire contract), the Settings precedent, so
 * the page can be exercised locally. It's lazily imported and never runs
 * on a deployed tenant. PARENTS_DEV_MOCK=false turns it off (the page then
 * shows the usual dev-bypass notice).
 */
export const PARENTS_DEV_MOCK = true;

const useMock = DEV_AUTH_BYPASS && PARENTS_DEV_MOCK;

const lazyMockTransport: Transport = async (method, path, payload) => {
  const { parentsDevMockTransport } = await import("@/lib/parents/mock/parentsDevMock");
  return parentsDevMockTransport(method, path, payload);
};

const transport: Transport = useMock ? lazyMockTransport : realTransport;

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Prefix of every Parent query — invalidate after any parent write. */
export const parentsQueryKeyRoot = ["parents"] as const;

export type ParentPageSize = 25 | 50 | 100 | 200;
/** No "All": every row lazily resolves its children, so a page stays bounded (the backend caps a request at 200). */
export const PARENT_PAGE_SIZES: readonly ParentPageSize[] = [25, 50, 100, 200];
export const PARENT_PAGE_SIZE_DEFAULT: ParentPageSize = 25;

export type ParentPageParams = {
  search?: string;
  relationship?: ParentRelationship;
  status?: ParentStatus;
  page: number;
  limit: ParentPageSize;
};

export function parentsPageQueryKey(params: ParentPageParams): readonly unknown[] {
  return [...parentsQueryKeyRoot, "page", params];
}

export function parentRecordQueryKey(id: string): readonly unknown[] {
  return [...parentsQueryKeyRoot, "record", id];
}

export function parentsOfStudentQueryKey(studentId: string): readonly unknown[] {
  return [...parentsQueryKeyRoot, "ofStudent", studentId];
}

/** Student lookups sit OUTSIDE the parents root — a parent write doesn't change a student. */
export function parentChildQueryKey(studentId: string): readonly unknown[] {
  return ["parents-students", "child", studentId];
}

export function studentOptionsQueryKey(search: string): readonly unknown[] {
  return ["parents-students", "search", search];
}

// ---------------------------------------------------------------------------
// Transport + error mapping
// ---------------------------------------------------------------------------

/** Confirmed codes (parents.service.ts) -> the form field they belong to. */
const FIELD_ERROR_CODES: Record<string, string> = {
  EMAIL_TAKEN: "email",
  USERNAME_TAKEN: "username",
};

const CONFLICT_CODES = new Set(["PARENT_NOT_FOUND", "STUDENT_NOT_FOUND"]);

/** Fields a 422 VALIDATION_ERROR can be pinned to — the zod message LEADS with the field name ("full_name is required"). */
const VALIDATION_FIELDS = new Set([
  "relationship",
  "full_name",
  "email",
  "phone",
  "occupation",
  "date_of_birth",
  "wedding_anniversary",
  "username",
  "status",
  "student_ids",
]);

function fieldFromValidationMessage(message: string | null): string | null {
  const match = message?.match(/^\s*["'`]?(?:body\.|data\.)?([a-z][a-z0-9_]*)/i);
  const field = match?.[1]?.toLowerCase() ?? null;
  return field && VALIDATION_FIELDS.has(field) ? field : null;
}

function toResult<T>(status: number, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);
  const text = message ?? undefined;
  if (code && FIELD_ERROR_CODES[code]) {
    return { ok: false, kind: "validation", errors: [{ field: FIELD_ERROR_CODES[code], message: text, code }] };
  }
  if (code && CONFLICT_CODES.has(code)) return { ok: false, kind: "conflict", message: text };
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED" || status === 403) return { ok: false, kind: "forbidden", message: text };
  if (code === "VALIDATION_ERROR" || (!code && status === 422)) {
    const field = fieldFromValidationMessage(message);
    if (field) return { ok: false, kind: "validation", errors: [{ field, message: text, code: "VALIDATION_ERROR" }] };
    return { ok: false, kind: "server", message: text, status };
  }
  if (status === 404 || status === 409) return { ok: false, kind: "conflict", message: text };
  return { ok: false, kind: "server", message: text, status };
}

async function send<T>(method: HttpMethod, path: string, payload: unknown, onSuccess: (body: unknown) => CrudResult<T>): Promise<CrudResult<T>> {
  // The real token must never be replaced by the dev-bypass one on a real endpoint.
  if (!useMock && DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };
  let response: WireResponse;
  try {
    response = await transport(method, path, payload);
  } catch {
    return { ok: false, kind: "network" };
  }
  if (response.status >= 200 && response.status < 300) return onSuccess(response.body);
  return toResult<T>(response.status, response.body);
}

// ---------------------------------------------------------------------------
// Wire -> model (tolerant)
// ---------------------------------------------------------------------------

function relationshipOf(value: unknown): ParentRelationship {
  return value === "guardian" ? "guardian" : "parent";
}

function statusOf(value: unknown): ParentStatus {
  return value === "inactive" ? "inactive" : "active";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function addressFromWire(value: unknown): ParentAddress {
  const r = asRecord(value) ?? {};
  return Object.fromEntries(PARENT_ADDRESS_KEYS.map((key) => [key, strOrNull(r[key])])) as ParentAddress;
}

export function listItemFromWire(value: unknown): ParentListItem {
  const r = asRecord(value) ?? {};
  return {
    id: str(r.id),
    full_name: str(r.full_name),
    relationship: relationshipOf(r.relationship),
    total_kids: count(r.total_kids),
    email: strOrNull(r.email),
    phone: strOrNull(r.phone),
    status: statusOf(r.status),
    email_active: r.email_active === true,
  };
}

export function parentFromWire(value: unknown): Parent {
  const r = asRecord(value) ?? {};
  const studentIds = stringIds(r.student_ids);
  return {
    ...listItemFromWire(r),
    // The detail's own count can lag the ids only if the backend changes — trust the ids.
    total_kids: studentIds.length || count(r.total_kids),
    occupation: strOrNull(r.occupation),
    date_of_birth: strOrNull(r.date_of_birth),
    wedding_anniversary: strOrNull(r.wedding_anniversary),
    present_address: addressFromWire(r.present_address),
    other_address: addressFromWire(r.other_address),
    created_from: r.created_from === "manual" ? "manual" : "student_registration",
    username: str(r.username),
    student_ids: studentIds,
    created_at: str(r.created_at),
    updated_at: str(r.updated_at),
  };
}

function personName(block: Student["father"]): { full_name: string; email: string | null } | undefined {
  if (!block) return undefined;
  const full_name = composePersonName([block.first_name, block.middle_name, block.last_name]);
  const email = block.email?.trim() ? block.email.trim() : null;
  return full_name || email ? { full_name, email } : undefined;
}

export function childFromStudent(student: Student): ParentChild {
  const guardians: ParentChild["guardians"] = {};
  const father = personName(student.father);
  const mother = personName(student.mother);
  const guardian = personName(student.guardian);
  if (father) guardians.father = father;
  if (mother) guardians.mother = mother;
  if (guardian) guardians.guardian = guardian;
  return {
    id: student.id,
    full_name: composePersonName([student.first_name, student.other_names, student.last_name]),
    student_no: student.student_id,
    status: student.status,
    primary_contact: student.primary_contact,
    guardians,
  };
}

// ---------------------------------------------------------------------------
// Parent CRUD
// ---------------------------------------------------------------------------

export type ParentListPage = { items: ParentListItem[]; total: number; page: number; limit: number; hasMore: boolean };

export async function listParentsPage({ search, relationship, status, page, limit }: ParentPageParams): Promise<CrudResult<ParentListPage>> {
  const params = new URLSearchParams();
  const term = search?.trim();
  if (term) params.set("search", term.slice(0, 100));
  if (relationship) params.set("relationship", relationship);
  if (status) params.set("status", status);
  const safePage = Math.max(1, Math.floor(page));
  params.set("page", String(safePage));
  params.set("limit", String(limit));
  return send("GET", `erp/parents?${params.toString()}`, undefined, (body) => {
    const items = readListItems(body).map(listItemFromWire);
    const meta = readPageMeta(body, safePage, limit, items.length);
    return { ok: true, data: { items, ...meta } };
  });
}

function parentResult(body: unknown): CrudResult<Parent> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: parentFromWire(entity) } : { ok: false, kind: "server" };
}

export async function getParent(id: string): Promise<CrudResult<Parent>> {
  return send("GET", `erp/parents/${encodeURIComponent(id)}`, undefined, parentResult);
}

/** Blank strings -> null, address keys trimmed; the body the backend's zod schema accepts (strict: no extra keys). */
function toWire(body: ParentWriteBody, mode: "create" | "update"): Record<string, unknown> {
  const text = (value: string | null) => (value && value.trim() ? value.trim() : null);
  const address = (value: ParentAddress) => Object.fromEntries(PARENT_ADDRESS_KEYS.map((key) => [key, text(value[key])]));
  const wire: Record<string, unknown> = {
    relationship: body.relationship,
    full_name: body.full_name.trim(),
    email: text(body.email),
    phone: text(body.phone),
    occupation: text(body.occupation),
    date_of_birth: text(body.date_of_birth),
    wedding_anniversary: text(body.wedding_anniversary),
    present_address: address(body.present_address),
    other_address: address(body.other_address),
    status: body.status,
    student_ids: Array.from(new Set(body.student_ids)),
  };
  const username = text(body.username);
  // Create: blank = let the backend default it (email or generated handle). Update: always sent (required).
  if (username || mode === "update") wire.username = username;
  return wire;
}

export async function createParent(body: ParentWriteBody): Promise<CrudResult<Parent>> {
  return send("POST", "erp/parents", toWire(body, "create"), parentResult);
}

export async function updateParent(id: string, body: ParentWriteBody): Promise<CrudResult<Parent>> {
  return send("PUT", `erp/parents/${encodeURIComponent(id)}`, toWire(body, "update"), parentResult);
}

/**
 * Link / unlink only: PUT with just student_ids (every other field is
 * optional on update and left untouched). The set REPLACES the parent's
 * links, so callers pass the full intended set.
 */
export async function setParentStudents(id: string, studentIds: string[]): Promise<CrudResult<Parent>> {
  return send("PUT", `erp/parents/${encodeURIComponent(id)}`, { student_ids: Array.from(new Set(studentIds)) }, parentResult);
}

export async function deleteParent(id: string): Promise<CrudResult<void>> {
  return send("DELETE", `erp/parents/${encodeURIComponent(id)}`, undefined, () => ({ ok: true, data: undefined }));
}

/** Write -> body, from a full record (edit form seed, link/unlink keeps everything else). */
export function parentToWriteBody(parent: Parent): ParentWriteBody {
  return {
    relationship: parent.relationship,
    full_name: parent.full_name,
    email: parent.email,
    phone: parent.phone,
    occupation: parent.occupation,
    date_of_birth: parent.date_of_birth,
    wedding_anniversary: parent.wedding_anniversary,
    present_address: { ...parent.present_address },
    other_address: { ...parent.other_address },
    username: parent.username,
    status: parent.status,
    student_ids: [...parent.student_ids],
  };
}

// ---------------------------------------------------------------------------
// Linked students (Student Core)
// ---------------------------------------------------------------------------

/** One linked student, for a child chip / the detail list. */
export async function getParentChild(studentId: string): Promise<CrudResult<ParentChild>> {
  return send("GET", `erp/students/${encodeURIComponent(studentId)}`, undefined, (body) => {
    const data = asRecord(readData(body));
    return data && typeof data.id === "string" ? { ok: true, data: childFromStudent(studentFromWire(data)) } : { ok: false, kind: "server" };
  });
}

/** Every real status — drafts aren't students yet, so they're never offered for linking. */
const LINKABLE_STATUSES: readonly StudentStatus[] = ["active", "graduated", "withdrawn", "suspended", "expelled", "inactive"];
const STUDENT_SEARCH_LIMIT = 20;

/** Server-side student search (every year) for the link picker and the child filter. */
export async function searchStudentOptions(search: string): Promise<CrudResult<StudentOption[]>> {
  const term = search.trim();
  if (!term) return { ok: true, data: [] };
  const params = new URLSearchParams({
    all_years: "true",
    status: LINKABLE_STATUSES.join(","),
    search: term,
    page: "1",
    limit: String(STUDENT_SEARCH_LIMIT),
  });
  return send("GET", `erp/students?${params.toString()}`, undefined, (body) => ({
    ok: true,
    data: asArray(asRecord(readData(body))?.items).map((item) => {
      const student = studentFromWire(item);
      return {
        id: student.id,
        full_name: composePersonName([student.first_name, student.other_names, student.last_name]),
        student_no: student.student_id,
      };
    }),
  }));
}

/**
 * The parents linked to one student — the "filter by child" view.
 *
 * FLAGGED (backend gap): GET erp/parents has no student filter and its
 * search only covers parent fields. Until it does, this finds CANDIDATES
 * by searching for each of the student's own parent/guardian blocks (email
 * when present, else name) and keeps only those whose detail actually
 * lists the student — so every row shown is a real link, but a parent
 * linked ONLY from the Parent page (e.g. a grandparent whose details
 * aren't on the student profile) isn't found. Swap point: replace the
 * body with GET erp/parents?student_id=.
 */
export async function listParentsOfStudent(studentId: string): Promise<CrudResult<Parent[]>> {
  const child = await getParentChild(studentId);
  if (!child.ok) return child;
  const terms = new Set<string>();
  for (const block of Object.values(child.data.guardians)) {
    const term = block?.email ?? block?.full_name;
    if (term) terms.add(term);
  }
  const candidateIds = new Set<string>();
  for (const term of Array.from(terms)) {
    const page = await listParentsPage({ search: term, page: 1, limit: 25 });
    if (!page.ok) return page;
    page.data.items.forEach((item) => candidateIds.add(item.id));
  }
  const linked: Parent[] = [];
  for (const id of Array.from(candidateIds)) {
    const record = await getParent(id);
    if (!record.ok) {
      if (record.kind === "conflict") continue; // deleted meanwhile
      return record;
    }
    if (record.data.student_ids.includes(studentId)) linked.push(record.data);
  }
  return { ok: true, data: linked.sort((a, b) => a.full_name.localeCompare(b.full_name)) };
}
