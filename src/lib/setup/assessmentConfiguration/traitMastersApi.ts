import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";

/**
 * Setup › Assessment Config › Psychomotor Skills and Affective Domain — the
 * two trait MASTER lists: the named skills (Handwriting, Sports…) and
 * traits (Punctuality, Leadership…) a school rates, kept PER SCHOOL TYPE
 * (Primary and Secondary can list different ones). Lists only: rating
 * them against the General Progress Grades happens on the Report
 * Progression page (a later piece). Admin-gated. Rides the Exam module's
 * transport, so the exam USE_MOCK flag swaps it.
 *
 * PROPOSED REST contract (confirm with Muntajir) — one shape, two
 * resources:
 *
 *   psychomotor_skill / affective_trait: id, name, school_type_id, sort_order
 *     name: required, ≤ 60 characters, UNIQUE within its school type
 *       (case-insensitive); the same name may appear under another type.
 *     school_type_id: required, an existing School Type.
 *     sort_order: the item's position in its school type's list, 1-based
 *       and kept contiguous (1…n) by the server. Report cards list the
 *       items in this order. OPTIONAL on POST/PUT: omitted on POST → the
 *       end of the list; omitted on PUT → unchanged (or the end of the new
 *       list when school_type_id changes). A value past the end = the end;
 *       the other items shift to make room.
 *     Listed by school type, then sort_order.
 *
 *   GET    /api/v1/erp/psychomotor-skills?school_type_id=   (filter optional)
 *                                         -> { items: psychomotor_skill[] }
 *   POST   /api/v1/erp/psychomotor-skills       body { name, school_type_id }
 *   PUT    /api/v1/erp/psychomotor-skills/:id   same body (may move it to
 *                                               another school type)
 *   DELETE /api/v1/erp/psychomotor-skills/:id   (the rest of the list closes up)
 *   POST   /api/v1/erp/psychomotor-skills/:id/move  body { direction: "up"|"down" }
 *                                         -> the moved item; swaps it with
 *                                         its neighbour in the same school
 *                                         type (no-op at either end)
 *   …and the same on /api/v1/erp/affective-traits.
 *   Errors: 422 VALIDATION_ERROR (field-led), 422 SCHOOL_TYPE_NOT_FOUND,
 *     409 DUPLICATE_NAME, 403 FORBIDDEN (not an admin), 404
 *     PSYCHOMOTOR_SKILL_NOT_FOUND / AFFECTIVE_TRAIT_NOT_FOUND.
 *   Once Report Progression saves ratings against these, DELETE should
 *   answer 409 *_IN_USE for a rated item (not needed yet).
 */

export const TRAIT_MASTER_KINDS = ["psychomotor", "affective"] as const;
export type TraitMasterKind = (typeof TRAIT_MASTER_KINDS)[number];

export const TRAIT_MASTER_ENDPOINTS: Record<TraitMasterKind, string> = {
  psychomotor: "erp/psychomotor-skills",
  affective: "erp/affective-traits",
};

export const TRAIT_MASTER_NAME_MAX = 60;

export type TraitMasterItem = {
  id: string;
  name: string;
  school_type_id: string;
  /** Position in its school type's list (1 = first). */
  sort_order: number;
};

/** sort_order omitted = the end of the list (POST) / unchanged (PUT). */
export type TraitMasterInput = { name: string; school_type_id: string; sort_order?: number };
export type TraitMasterMoveDirection = "up" | "down";

export const traitMastersQueryKey = ["setup", "traitMasters"] as const;
export const traitMastersQueryKeyFor = (kind: TraitMasterKind) => [...traitMastersQueryKey, kind] as const;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function traitMasterFromWire(wire: unknown): TraitMasterItem | null {
  const r = rec(wire);
  if (typeof r.id !== "string" || !r.id || typeof r.school_type_id !== "string" || !r.school_type_id) return null;
  const order = typeof r.sort_order === "number" && Number.isFinite(r.sort_order) ? r.sort_order : 0;
  return { id: r.id, name: typeof r.name === "string" ? r.name : "", school_type_id: r.school_type_id, sort_order: order };
}

function listFromWire(value: unknown): TraitMasterItem[] | null {
  const items = rec(value).items;
  if (!Array.isArray(items)) return null;
  return items.map(traitMasterFromWire).filter((item): item is TraitMasterItem => item !== null);
}

export function listTraitMasters(kind: TraitMasterKind, schoolTypeId?: string): Promise<CrudResult<TraitMasterItem[]>> {
  const query = schoolTypeId ? `?${new URLSearchParams({ school_type_id: schoolTypeId })}` : "";
  return examSend("GET", `${TRAIT_MASTER_ENDPOINTS[kind]}${query}`, undefined, listFromWire);
}

export function moveTraitMaster(kind: TraitMasterKind, id: string, direction: TraitMasterMoveDirection): Promise<CrudResult<TraitMasterItem>> {
  return examSend("POST", `${TRAIT_MASTER_ENDPOINTS[kind]}/${encodeURIComponent(id)}/move`, { direction }, traitMasterFromWire);
}

/** One CRUD service per master (the screen lists every school type's items, filterable). */
export function traitMastersServiceFor(kind: TraitMasterKind): CrudService<TraitMasterItem, TraitMasterInput, TraitMasterInput> {
  const base = TRAIT_MASTER_ENDPOINTS[kind];
  return {
    queryKey: traitMastersQueryKeyFor(kind),
    list: () => listTraitMasters(kind),
    create: (data) => examSend("POST", base, data, traitMasterFromWire),
    update: (id, data) => examSend("PUT", `${base}/${encodeURIComponent(id)}`, data, traitMasterFromWire),
    remove: (id) => examSend("DELETE", `${base}/${encodeURIComponent(id)}`, undefined, () => undefined as unknown as void),
    customActions: {
      moveUp: (id) => moveTraitMaster(kind, id, "up"),
      moveDown: (id) => moveTraitMaster(kind, id, "down"),
    },
  };
}
