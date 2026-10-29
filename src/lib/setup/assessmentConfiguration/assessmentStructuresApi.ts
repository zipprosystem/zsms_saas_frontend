import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import {
  readEntity,
  readListItems,
  realTransport,
  sendCatalogRequest,
  str,
} from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { assessmentStructuresMockTransport } from "@/lib/setup/assessmentConfiguration/mock/assessmentStructuresMock";
import {
  ASSESSMENT_MODES,
  BREAKDOWN_MODES,
  COMPONENT_CATEGORIES,
  normalizeStructureInput,
  type AssessmentComponent,
  type AssessmentStructure,
  type AssessmentStructureInput,
  type AssessmentSubfield,
} from "@/lib/setup/assessmentConfiguration/assessmentStructure";

/**
 * Assessment Types (score structures) — MOCK until the backend ships it.
 * Flip USE_MOCK to swap to the real API; nothing else changes (mock and
 * real share sendCatalogRequest + fromWire, see templateCatalog.ts).
 *
 * PROPOSED REST contract (for Muntajir — names/codes to confirm):
 *
 *   GET    /api/v1/erp/assessment-structures
 *            -> { items: Structure[], total, page, limit, has_more }
 *               sorted default-first, then name. Each item carries its
 *               components (and their subfields) inline, ordered by
 *               display_order.
 *   GET    /api/v1/erp/assessment-structures/:id          -> Structure
 *   POST   /api/v1/erp/assessment-structures              body: StructureInput -> 201 Structure
 *   PUT    /api/v1/erp/assessment-structures/:id          body: StructureInput -> Structure
 *   DELETE /api/v1/erp/assessment-structures/:id          -> 200 (409 STRUCTURE_IS_DEFAULT)
 *   POST   /api/v1/erp/assessment-structures/:id/set-default -> Structure (409 STRUCTURE_INACTIVE,
 *                                                              409 GRADE_BOOK_NOT_DEFAULT)
 *
 *   Structure {
 *     id, name, mode: "component_based" | "grade_based", is_default, is_active,
 *     is_grade_book,   (addition, British) true = a Grade Book structure: its
 *                      components are the Grade Book's fields, totalling
 *                      100; category is ignored (send "ca"). Offered only
 *                      on the Grade Book entry page — never the default
 *                      (422) and never resolved for Manage Exam Result.
 *                      mode must be component_based (422).
 *     components: [{
 *       id, name, category: "ca" | "exam", max, weight | null, display_order,
 *       breakdown: "none" | "sum" | "weighted",
 *       subfields: [{ id, name, max, weight | null, display_order }]
 *     }]
 *   }
 *   StructureInput = Structure without ids; an existing child keeps its id
 *   by sending it. The write REPLACES the nested set (children not sent are
 *   removed). Tables: assessment_structure -> assessment_component ->
 *   assessment_subfield (two levels max — a sub-field never breaks down).
 *
 *   Errors (ERP envelope { success:false, error:{ code, message } }):
 *     409 DUPLICATE_NAME          name unique per school (trimmed, case-insensitive)
 *     409 STRUCTURE_IS_DEFAULT    can't delete the default
 *     409 STRUCTURE_INACTIVE      can't make an inactive structure default
 *     404 STRUCTURE_NOT_FOUND
 *     422 VALIDATION_ERROR        any rule in validateStructure()
 *                                 (assessmentStructure.ts), message led by the
 *                                 field path, e.g. "components.1.subfields: …"
 *
 *   Rules (backend-owned; the mock enforces them the same way):
 *     - component_based: Σ component contribution (weight ?? max) = 100.
 *     - breakdown "sum": Σ subfield.max = component.max.
 *     - breakdown "weighted": Σ subfield.weight = 100 (each subfield has max + weight).
 *     - breakdown != "none" needs ≥ 2 subfields; "none" stores none.
 *     - Component / sub-field names unique within their parent.
 *     - At most one default per school; setting one clears the rest; the
 *       default must be active.
 *     - grade_based: no component rules yet (fields defined in Stage 1b).
 */
const USE_MOCK = true;

const channel = { transport: USE_MOCK ? assessmentStructuresMockTransport : realTransport, isMock: USE_MOCK };

export const assessmentStructuresQueryKey = ["setup", "assessmentStructures"] as const;

const BASE_PATH = "erp/assessment-structures";

function structurePath(id: string, action?: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
}

// ---------------------------------------------------------------------------
// Wire mapping (tolerant reads)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function byDisplayOrder<T extends { display_order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.display_order - b.display_order);
}

function subfieldFromWire(value: unknown): AssessmentSubfield {
  const r = asRecord(value);
  return {
    id: str(r.id),
    name: str(r.name),
    max: numberOr(r.max, 0),
    weight: numberOrNull(r.weight),
    display_order: numberOr(r.display_order, 0),
  };
}

function componentFromWire(value: unknown): AssessmentComponent {
  const r = asRecord(value);
  return {
    id: str(r.id),
    name: str(r.name),
    category: oneOf(COMPONENT_CATEGORIES, r.category, "ca"),
    max: numberOr(r.max, 0),
    weight: numberOrNull(r.weight),
    display_order: numberOr(r.display_order, 0),
    breakdown: oneOf(BREAKDOWN_MODES, r.breakdown, "none"),
    subfields: byDisplayOrder(asList(r.subfields).map(subfieldFromWire)),
  };
}

export function fromWire(value: unknown): AssessmentStructure {
  const r = asRecord(value);
  return {
    id: str(r.id),
    name: str(r.name),
    mode: oneOf(ASSESSMENT_MODES, r.mode, "component_based"),
    is_default: r.is_default === true,
    is_active: r.is_active !== false,
    is_grade_book: r.is_grade_book === true,
    components: byDisplayOrder(asList(r.components).map(componentFromWire)),
  };
}

export function toWire(input: AssessmentStructureInput): AssessmentStructureInput {
  return normalizeStructureInput(input);
}

function entityResult(body: unknown): CrudResult<AssessmentStructure> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Fetched once at limit=200 and handled client-side — a school has a handful of structures. */
async function list(): Promise<CrudResult<AssessmentStructure[]>> {
  return sendCatalogRequest(channel, "GET", `${BASE_PATH}?page=1&limit=200`, undefined, (body) => ({
    ok: true,
    data: readListItems(body).map(fromWire),
  }));
}

async function create(input: AssessmentStructureInput): Promise<CrudResult<AssessmentStructure>> {
  return sendCatalogRequest(channel, "POST", BASE_PATH, toWire(input), entityResult);
}

async function update(id: string, input: AssessmentStructureInput): Promise<CrudResult<AssessmentStructure>> {
  return sendCatalogRequest(channel, "PUT", structurePath(id), toWire(input), entityResult);
}

async function remove(id: string): Promise<CrudResult<void>> {
  return sendCatalogRequest(channel, "DELETE", structurePath(id), undefined, () => ({ ok: true, data: undefined }));
}

async function setDefault(id: string): Promise<CrudResult<AssessmentStructure>> {
  return sendCatalogRequest(channel, "POST", structurePath(id, "set-default"), undefined, entityResult);
}

export const assessmentStructuresService: CrudService<
  AssessmentStructure,
  AssessmentStructureInput,
  AssessmentStructureInput
> = {
  queryKey: assessmentStructuresQueryKey,
  list,
  create,
  update,
  remove,
  customActions: { setDefault },
};
