import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import {
  TRAIT_MASTER_ENDPOINTS,
  TRAIT_MASTER_KINDS,
  TRAIT_MASTER_NAME_MAX,
  type TraitMasterInput,
  type TraitMasterItem,
  type TraitMasterKind,
} from "@/lib/setup/assessmentConfiguration/traitMastersApi";
import { schoolTypesService } from "@/lib/setup/academicStructure/schoolTypesApi";
import { SEED_AFFECTIVE, SEED_PSYCHOMOTOR } from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Setup › Assessment Config › Psychomotor Skills / Affective Domain
 * (contract in traitMastersApi.ts). localStorage, one store per master.
 *
 * Seeding: the mock can't know a school's School Types up front, so the
 * first read lists them (School Types service — the dev mock under the
 * dev bypass, the real list otherwise) and gives each type not yet seeded
 * the default list (the same skills / traits the traits pop-up rates).
 * A type is seeded once: deleting its items doesn't bring them back.
 * Seeded ids are `<trait key>@<school type id>` so the report can still
 * find a rating the traits pop-up saved under the trait key.
 *
 * sort_order is kept contiguous (1…n) per school type after every write.
 * Writes are admin-only; reads are open. No in-use check yet — nothing
 * rates these items until Report Progression is built.
 */

const STORAGE_KEYS: Record<TraitMasterKind, string> = {
  psychomotor: "zsms.mockExam.psychomotorSkills.v2",
  affective: "zsms.mockExam.affectiveTraits.v2",
};

const DEFAULTS: Record<TraitMasterKind, Array<{ key: string; label: string }>> = {
  psychomotor: SEED_PSYCHOMOTOR,
  affective: SEED_AFFECTIVE,
};

const NOT_FOUND: Record<TraitMasterKind, { code: string; message: string }> = {
  psychomotor: { code: "PSYCHOMOTOR_SKILL_NOT_FOUND", message: "Psychomotor skill not found" },
  affective: { code: "AFFECTIVE_TRAIT_NOT_FOUND", message: "Affective trait not found" },
};

/** seeded = the school types already given the defaults. */
type Store = { items: TraitMasterItem[]; seeded: string[] };

const cache: Partial<Record<TraitMasterKind, Store>> = {};

function load(kind: TraitMasterKind): Store {
  if (!cache[kind]) {
    const stored = readStore<unknown>(STORAGE_KEYS[kind]);
    const items = Array.isArray(stored.items) ? (stored.items as TraitMasterItem[]) : [];
    const seeded = Array.isArray(stored.seeded) ? (stored.seeded as string[]) : [];
    cache[kind] = { items, seeded };
  }
  return cache[kind] as Store;
}

/** By school type (first seen), then sort_order. */
function ordered(items: TraitMasterItem[]): TraitMasterItem[] {
  const typeOrder = Array.from(new Set(items.map((item) => item.school_type_id)));
  return [...items].sort((a, b) => typeOrder.indexOf(a.school_type_id) - typeOrder.indexOf(b.school_type_id) || a.sort_order - b.sort_order);
}

/** Renumbers each school type's items 1…n, keeping their order. */
function renumbered(items: TraitMasterItem[]): TraitMasterItem[] {
  const next: Record<string, number> = {};
  return ordered(items).map((item) => {
    next[item.school_type_id] = (next[item.school_type_id] ?? 0) + 1;
    return { ...item, sort_order: next[item.school_type_id] };
  });
}

function save(kind: TraitMasterKind, store: Store): void {
  const normalised = { ...store, items: renumbered(store.items) };
  cache[kind] = normalised;
  writeStore(STORAGE_KEYS[kind], normalised);
}

function newId(kind: TraitMasterKind): string {
  return `${kind === "psychomotor" ? "psy" : "aff"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The school's School Type ids, or null when they can't be listed (no seeding / no check then). */
async function schoolTypeIds(): Promise<Set<string> | null> {
  const result = await schoolTypesService.list();
  return result.ok ? new Set(result.data.map((type) => type.id)) : null;
}

/** Gives every School Type not seeded yet the default list. */
async function seedNewTypes(kind: TraitMasterKind): Promise<void> {
  const ids = await schoolTypeIds();
  if (!ids) return;
  const store = load(kind);
  const fresh = Array.from(ids).filter((id) => !store.seeded.includes(id));
  if (fresh.length === 0) return;
  const added = fresh.flatMap((typeId) =>
    DEFAULTS[kind].map((trait, index) => ({ id: `${trait.key}@${typeId}`, name: trait.label, school_type_id: typeId, sort_order: index + 1 })),
  );
  save(kind, { items: [...store.items, ...added], seeded: [...store.seeded, ...fresh] });
}

/** The master's items (all school types, or one), by school type then sort_order. */
export function traitMasterItems(kind: TraitMasterKind, schoolTypeId?: string | null): TraitMasterItem[] {
  return ordered(load(kind).items.filter((item) => !schoolTypeId || item.school_type_id === schoolTypeId));
}

/**
 * The report's list for a school type, in sort_order: each item with the
 * trait key a rating is saved under (seeded items keep the pop-up's key;
 * an item added in Setup has none yet — Report Progression will rate it
 * by id). null when the type has no list (unknown type / not seeded).
 */
export async function reportTraitList(kind: TraitMasterKind, schoolTypeId: string | null): Promise<Array<{ key: string; label: string }> | null> {
  if (!schoolTypeId) return null;
  await seedNewTypes(kind);
  const store = load(kind);
  if (!store.seeded.includes(schoolTypeId)) return null;
  return traitMasterItems(kind, schoolTypeId).map((item) => ({ key: item.id.includes("@") ? item.id.split("@")[0] : item.id, label: item.name }));
}

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

function requireAdmin(kind: TraitMasterKind): WireResponse | null {
  if (getMockActingAs() === MOCK_ADMIN) return null;
  return fail(403, "FORBIDDEN", `Only an administrator can change ${kind === "psychomotor" ? "psychomotor skills" : "affective traits"}.`);
}

async function parse(payload: unknown): Promise<{ input: TraitMasterInput } | { error: WireResponse }> {
  const r = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const invalid = (message: string) => ({ error: fail(422, "VALIDATION_ERROR", message) });
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return invalid("name: is required");
  if (name.length > TRAIT_MASTER_NAME_MAX) return invalid(`name: must be ${TRAIT_MASTER_NAME_MAX} characters or fewer`);
  const schoolTypeId = typeof r.school_type_id === "string" ? r.school_type_id : "";
  if (!schoolTypeId) return invalid("school_type_id: is required");
  let sortOrder: number | undefined;
  if (r.sort_order !== undefined && r.sort_order !== null) {
    if (typeof r.sort_order !== "number" || !Number.isInteger(r.sort_order) || r.sort_order < 1) return invalid("sort_order: must be a whole number from 1");
    sortOrder = r.sort_order;
  }
  const ids = await schoolTypeIds();
  if (ids && !ids.has(schoolTypeId)) return { error: fail(422, "SCHOOL_TYPE_NOT_FOUND", "school_type_id: not a School Type of this school") };
  return { input: { name, school_type_id: schoolTypeId, sort_order: sortOrder } };
}

/** 409 when another item of the same school type already has this name. */
function conflict(kind: TraitMasterKind, input: TraitMasterInput, selfId: string | null): WireResponse | null {
  const clash = load(kind).items.find(
    (item) => item.id !== selfId && item.school_type_id === input.school_type_id && item.name.toLowerCase() === input.name.toLowerCase(),
  );
  return clash ? fail(409, "DUPLICATE_NAME", `"${clash.name}" is already on this school type's list.`) : null;
}

/**
 * Puts `item` into its school type's list at `position` (1-based; past the
 * end or omitted = the end) and returns the whole store's items.
 */
function placed(items: TraitMasterItem[], item: TraitMasterItem, position: number | undefined): TraitMasterItem[] {
  const others = items.filter((existing) => existing.id !== item.id);
  const list = ordered(others.filter((existing) => existing.school_type_id === item.school_type_id));
  const at = position === undefined ? list.length : Math.min(Math.max(position - 1, 0), list.length);
  list.splice(at, 0, item);
  const positions = new Map(list.map((entry, index) => [entry.id, index + 1]));
  // Keep the stored array's order (it decides which school type lists first); a new item goes last.
  const all = items.some((existing) => existing.id === item.id) ? items.map((existing) => (existing.id === item.id ? item : existing)) : [...items, item];
  return all.map((entry) => (positions.has(entry.id) ? { ...entry, sort_order: positions.get(entry.id) as number } : entry));
}

export async function handleTraitMasters(method: string, path: string, query: URLSearchParams, payload: unknown): Promise<WireResponse | null> {
  for (const kind of TRAIT_MASTER_KINDS) {
    const base = TRAIT_MASTER_ENDPOINTS[kind];
    if (path === base) {
      if (method === "GET") {
        await seedNewTypes(kind);
        return ok({ items: traitMasterItems(kind, query.get("school_type_id")) });
      }
      if (method === "POST") {
        const denied = requireAdmin(kind);
        if (denied) return denied;
        const parsed = await parse(payload);
        if ("error" in parsed) return parsed.error;
        const clash = conflict(kind, parsed.input, null);
        if (clash) return clash;
        const id = newId(kind);
        const { sort_order: position, ...fields } = parsed.input;
        const store = load(kind);
        save(kind, { ...store, items: placed(store.items, { id, ...fields, sort_order: 0 }, position) });
        return ok(load(kind).items.find((item) => item.id === id), 201);
      }
      return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    }
    if (!path.startsWith(`${base}/`)) continue;
    const rest = path.slice(base.length + 1);
    const move = rest.endsWith("/move");
    const id = decodeURIComponent(move ? rest.slice(0, -"/move".length) : rest);
    if (!id || id.includes("/")) return null;
    const store = load(kind);
    const current = store.items.find((item) => item.id === id);
    if (!current) return fail(404, NOT_FOUND[kind].code, NOT_FOUND[kind].message);
    if (move) {
      if (method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
      const denied = requireAdmin(kind);
      if (denied) return denied;
      const direction = payload && typeof payload === "object" ? (payload as Record<string, unknown>).direction : undefined;
      if (direction !== "up" && direction !== "down") return fail(422, "VALIDATION_ERROR", 'direction: must be "up" or "down"');
      // Swap with the neighbour in the same school type (a no-op at either end).
      save(kind, { ...store, items: placed(store.items, current, current.sort_order + (direction === "up" ? -1 : 1)) });
      return ok(load(kind).items.find((item) => item.id === id));
    }
    if (method === "PUT") {
      const denied = requireAdmin(kind);
      if (denied) return denied;
      const parsed = await parse(payload);
      if ("error" in parsed) return parsed.error;
      const clash = conflict(kind, parsed.input, id);
      if (clash) return clash;
      const { sort_order: requested, ...fields } = parsed.input;
      const sameType = fields.school_type_id === current.school_type_id;
      // Omitted: keep its place, or go to the end of a new school type's list.
      const position = requested ?? (sameType ? current.sort_order : undefined);
      save(kind, { ...store, items: placed(store.items, { ...current, ...fields }, position) });
      return ok(load(kind).items.find((item) => item.id === id));
    }
    if (method === "DELETE") {
      const denied = requireAdmin(kind);
      if (denied) return denied;
      save(kind, { ...store, items: store.items.filter((item) => item.id !== id) });
      return ok(null);
    }
    return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  return null;
}
