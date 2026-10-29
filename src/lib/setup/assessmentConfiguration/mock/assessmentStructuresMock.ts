import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { HttpMethod, Transport, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import {
  ASSESSMENT_MODES,
  BREAKDOWN_MODES,
  COMPONENT_CATEGORIES,
  normalizeStructureInput,
  validateStructure,
  type AssessmentComponentInput,
  type AssessmentStructure,
  type AssessmentStructureInput,
  type AssessmentSubfieldInput,
  type StructureIssue,
} from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { SEED_ASSESSMENT_STRUCTURES } from "@/lib/setup/assessmentConfiguration/mock/assessmentStructuresMockSeeds";

/**
 * MOCK assessment-structures backend — localStorage-backed, answering the
 * PROPOSED endpoints at the HTTP level (ERP envelope, status codes, error
 * bodies), same model as the HR mock (src/lib/hr/mock/hrMockBackend.ts).
 * The contract itself is documented in assessmentStructuresApi.ts.
 *
 * Every rule here is BACKEND-OWNED:
 *   - Validation is the shared validateStructure() (assessmentStructure.ts)
 *     — 422 VALIDATION_ERROR, message leads with the field path.
 *   - Name is unique per school, case-insensitive, trimmed — 409 DUPLICATE_NAME.
 *   - At most one default: saving/setting a default clears the flag on the
 *     others. The default must be active (422) and can't be deleted
 *     (409 STRUCTURE_IS_DEFAULT) — make another one default first.
 *   - Writes REPLACE the nested components/sub-fields. A child sent with an
 *     id that belongs to this structure keeps it; anything else gets a
 *     fresh id; children left out are removed. (Real backend, later: once
 *     scores reference components, removing one with recorded scores
 *     should 409 — STRUCTURE_COMPONENT_IN_USE. Not modelled.)
 *   - Two levels max: sub-fields have no breakdown of their own (any extra
 *     keys are dropped).
 *   - grade_based is stored with no components until Stage 1b defines its
 *     fields.
 */

const STORAGE_KEY = "zsms.mockAssessmentStructures.v1";
/** Set once the seeded Grade Book has been added to a store saved before Grade Books existed. */
const GRADE_BOOK_SEEDED_KEY = "zsms.mockAssessmentStructures.gradeBookSeeded";

let cache: AssessmentStructure[] | null = null;

function load(): AssessmentStructure[] {
  if (cache) return cache;
  let rows = structuredClone(SEED_ASSESSMENT_STRUCTURES);
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        // Saved before is_grade_book existed: read it as false, and add the seeded Grade Book once.
        rows = (parsed as AssessmentStructure[]).map((row) => ({ ...row, is_grade_book: row.is_grade_book === true }));
        if (!window.localStorage.getItem(GRADE_BOOK_SEEDED_KEY)) {
          const seeded = SEED_ASSESSMENT_STRUCTURES.filter((row) => row.is_grade_book && !rows.some((existing) => existing.id === row.id));
          rows = [...rows, ...structuredClone(seeded)];
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
        }
      }
      window.localStorage.setItem(GRADE_BOOK_SEEDED_KEY, "1");
    } catch {
      // Corrupt JSON / storage disabled — fall back to the seeds.
    }
  }
  cache = rows;
  return rows;
}

function save(rows: AssessmentStructure[]): void {
  cache = rows;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Best-effort; the in-memory copy still works for this session.
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `as-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

// ---------------------------------------------------------------------------
// Body parsing — tolerant, so a malformed body fails validation instead of throwing
// ---------------------------------------------------------------------------

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Non-numbers become NaN so validation rejects them rather than silently zeroing. */
function num(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value);
}

function optionalId(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function parseBody(payload: unknown): AssessmentStructureInput | { error: string } {
  const body = record(payload);
  if (!ASSESSMENT_MODES.includes(body.mode as never)) return { error: "mode must be component_based or grade_based" };
  const components: AssessmentComponentInput[] = list(body.components).map((value) => {
    const c = record(value);
    const subfields: AssessmentSubfieldInput[] = list(c.subfields).map((subValue) => {
      const s = record(subValue);
      return { id: optionalId(s.id), name: text(s.name), max: num(s.max), weight: numOrNull(s.weight), display_order: 0 };
    });
    return {
      id: optionalId(c.id),
      name: text(c.name),
      // An unknown category is kept as-is so validation reports it.
      category: (COMPONENT_CATEGORIES.includes(c.category as never) ? c.category : "invalid") as AssessmentComponentInput["category"],
      max: num(c.max),
      weight: numOrNull(c.weight),
      display_order: 0,
      breakdown: oneOf(BREAKDOWN_MODES, c.breakdown, "none"),
      subfields,
    };
  });
  return normalizeStructureInput({
    name: text(body.name),
    mode: body.mode as AssessmentStructureInput["mode"],
    is_default: body.is_default === true,
    is_active: body.is_active !== false,
    is_grade_book: body.is_grade_book === true,
    components,
  });
}

function issueMessage(issue: StructureIssue): string {
  switch (issue.code) {
    case "total_mismatch":
      return `${issue.path}: contributions total ${issue.actual}, must total ${issue.target}`;
    case "subfields_sum_mismatch":
      return `${issue.path}: sub-field maxes total ${issue.actual}, must equal the component max ${issue.target}`;
    case "subfields_weight_mismatch":
      return `${issue.path}: sub-field weights total ${issue.actual}%, must total ${issue.target}%`;
    default:
      return `${issue.path}: ${issue.code}`;
  }
}

function nameTaken(rows: AssessmentStructure[], name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return rows.some((row) => row.id !== exceptId && row.name.trim().toLowerCase() === key);
}

/** Keeps a sent child id only if it already belongs to this structure (never trust a foreign id). */
function materialize(id: string, input: AssessmentStructureInput, previous: AssessmentStructure | null): AssessmentStructure {
  const knownComponentIds = new Set(previous?.components.map((c) => c.id) ?? []);
  const knownSubfieldIds = new Set(previous?.components.flatMap((c) => c.subfields.map((s) => s.id)) ?? []);
  return {
    id,
    name: input.name,
    mode: input.mode,
    is_default: input.is_default,
    is_active: input.is_active,
    is_grade_book: input.is_grade_book,
    components: input.components.map((c) => ({
      id: c.id && knownComponentIds.has(c.id) ? c.id : newId(),
      name: c.name,
      category: c.category,
      max: c.max,
      weight: c.weight,
      display_order: c.display_order,
      breakdown: c.breakdown,
      subfields: c.subfields.map((s) => ({
        id: s.id && knownSubfieldIds.has(s.id) ? s.id : newId(),
        name: s.name,
        max: s.max,
        weight: s.weight,
        display_order: s.display_order,
      })),
    })),
  };
}

/** Single-default rule: making `defaultId` the default clears every other one. */
function withSingleDefault(rows: AssessmentStructure[], defaultId: string): AssessmentStructure[] {
  return rows.map((row) => (row.id === defaultId ? row : row.is_default ? { ...row, is_default: false } : row));
}

function sorted(rows: AssessmentStructure[]): AssessmentStructure[] {
  return [...rows].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name));
}

function validateWrite(payload: unknown): AssessmentStructureInput | WireResponse {
  const parsed = parseBody(payload);
  if ("error" in parsed) return fail(422, "VALIDATION_ERROR", parsed.error);
  const issues = validateStructure(parsed);
  if (issues.length > 0) return fail(422, "VALIDATION_ERROR", issues.map(issueMessage).join("; "));
  return parsed;
}

function handle(method: HttpMethod, rest: string | null, payload: unknown): WireResponse {
  const rows = load();

  if (!rest) {
    if (method === "GET") {
      const items = sorted(rows);
      return ok({ items, total: items.length, page: 1, limit: Math.max(1, items.length), has_more: false });
    }
    if (method === "POST") {
      const input = validateWrite(payload);
      if ("status" in input) return input;
      if (nameTaken(rows, input.name)) return fail(409, "DUPLICATE_NAME", "An assessment structure with this name already exists");
      const created = materialize(newId(), input, null);
      const next = [...rows, created];
      save(created.is_default ? withSingleDefault(next, created.id) : next);
      return ok(created, 201);
    }
    return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  const [id, action] = rest.split("/");
  const existing = rows.find((row) => row.id === id);
  if (!existing) return fail(404, "STRUCTURE_NOT_FOUND", "Assessment structure not found");

  if (action === "set-default") {
    if (method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    if (!existing.is_active) return fail(409, "STRUCTURE_INACTIVE", "Activate this structure before making it the default.");
    if (existing.is_grade_book) return fail(409, "GRADE_BOOK_NOT_DEFAULT", "A Grade Book can't be the default structure.");
    const updated = { ...existing, is_default: true };
    save(withSingleDefault(rows.map((row) => (row.id === id ? updated : row)), id));
    return ok(updated);
  }
  if (action) return fail(404, "NOT_FOUND", `Route not found: ${method} ${rest}`);

  if (method === "GET") return ok(existing);

  if (method === "PUT") {
    const input = validateWrite(payload);
    if ("status" in input) return input;
    if (nameTaken(rows, input.name, id)) return fail(409, "DUPLICATE_NAME", "An assessment structure with this name already exists");
    const updated = materialize(id, input, existing);
    const next = rows.map((row) => (row.id === id ? updated : row));
    save(updated.is_default ? withSingleDefault(next, id) : next);
    return ok(updated);
  }

  if (method === "DELETE") {
    if (existing.is_default) {
      return fail(409, "STRUCTURE_IS_DEFAULT", "This is the default structure — make another structure the default before deleting it.");
    }
    save(rows.filter((row) => row.id !== id));
    return ok(null);
  }

  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}

const BASE = "erp/assessment-structures";

export const assessmentStructuresMockTransport: Transport = async (method, fullPath, payload) => {
  await mockDelay(250);
  const [path] = fullPath.split("?");
  if (path === BASE) return handle(method, null, payload);
  if (path.startsWith(`${BASE}/`)) {
    const rest = path
      .slice(BASE.length + 1)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    return handle(method, rest, payload);
  }
  return fail(404, "NOT_FOUND", `Route not found: ${method} ${path}`);
};
