import type { CrudResult } from "@/lib/setup/crudTypes";
import { asArray, asRecord, hrChannel, readData, sendHrRequest } from "@/lib/hr/hrHttp";
import type { PermissionCatalog, PermissionCatalogEntry, PermissionCatalogModule } from "@/lib/hr/hrTypes";

/**
 * The permission catalog — SERVED BY THE BACKEND (GET erp/permission-catalog),
 * the single source of truth for what a Permission Group can toggle. The
 * frontend keeps no hardcoded list (the old PERMISSION_MODULES × ACTIONS
 * grid is gone). Keys are "module.action"; actions vary per module (e.g.
 * staff has view + manage — staff.create/edit/delete became staff.manage).
 *
 * FLAGGED: the response shape isn't confirmed, so readCatalog() accepts
 *   - a flat list of keys:            ["staff.view", "staff.manage", …]
 *   - a flat list of entries:          [{ key, label?, module? }, …]
 *   - either of those under { items }
 *   - grouped:                         { modules: [{ key, label?, permissions: [...] }] }
 * Reconcile on the deployed tenant and simplify then.
 *
 * Capture only — nothing in the app ENFORCES these yet.
 */

export const permissionCatalogQueryKey = ["hr", "permissionCatalog"] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function splitKey(key: string): { module: string; action: string } {
  const dot = key.indexOf(".");
  return dot > 0 ? { module: key.slice(0, dot), action: key.slice(dot + 1) } : { module: key, action: key };
}

function readEntry(value: unknown, moduleHint: string | null): { module: string; entry: PermissionCatalogEntry } | null {
  if (typeof value === "string") {
    const key = moduleHint && !value.includes(".") ? `${moduleHint}.${value}` : value;
    const { module, action } = splitKey(key);
    return { module, entry: { key, action, label: null } };
  }
  const r = asRecord(value);
  if (!r) return null;
  const rawKey = text(r.key) ?? text(r.permission) ?? text(r.code) ?? text(r.name);
  if (!rawKey) return null;
  const key = moduleHint && !rawKey.includes(".") ? `${moduleHint}.${rawKey}` : rawKey;
  const split = splitKey(key);
  return {
    module: text(r.module) ?? split.module,
    entry: { key, action: text(r.action) ?? split.action, label: text(r.label) ?? text(r.description) },
  };
}

export function readCatalog(data: unknown): PermissionCatalog {
  const order: string[] = [];
  const modules = new Map<string, PermissionCatalogModule>();
  const add = (moduleKey: string, label: string | null, entry: PermissionCatalogEntry | null) => {
    let group = modules.get(moduleKey);
    if (!group) {
      group = { key: moduleKey, label, permissions: [] };
      modules.set(moduleKey, group);
      order.push(moduleKey);
    } else if (!group.label && label) {
      group.label = label;
    }
    if (entry && !group.permissions.some((item) => item.key === entry.key)) group.permissions.push(entry);
  };

  const record = asRecord(data);
  const grouped = record ? asArray(record.modules) : [];
  if (grouped.length > 0) {
    for (const value of grouped) {
      const m = asRecord(value);
      const moduleKey = m ? (text(m.key) ?? text(m.module) ?? text(m.name)) : null;
      if (!m || !moduleKey) continue;
      const moduleLabel = text(m.label);
      add(moduleKey, moduleLabel, null);
      for (const item of asArray(m.permissions ?? m.actions)) {
        const read = readEntry(item, moduleKey);
        if (read) add(moduleKey, moduleLabel, read.entry);
      }
    }
  } else {
    const flat = Array.isArray(data) ? data : asArray(record?.items ?? record?.permissions);
    for (const item of flat) {
      const read = readEntry(item, null);
      if (read) add(read.module, null, read.entry);
    }
  }
  return { modules: order.map((key) => modules.get(key)!).filter((module) => module.permissions.length > 0) };
}

export async function fetchPermissionCatalog(): Promise<CrudResult<PermissionCatalog>> {
  return sendHrRequest(hrChannel, "GET", "erp/permission-catalog", undefined, (body) => ({
    ok: true,
    data: readCatalog(readData(body)),
  }));
}

export function catalogKeys(catalog: PermissionCatalog): Set<string> {
  return new Set(catalog.modules.flatMap((module) => module.permissions.map((entry) => entry.key)));
}

/** Legacy fine-grained actions that the catalog folds into one "manage" permission (staff.create/edit/delete -> staff.manage). */
const MANAGE_ALIASES = new Set(["create", "edit", "delete"]);

/**
 * Maps a group's stored keys onto the catalog: legacy module.create /
 * .edit / .delete become module.manage when the catalog has that and not
 * the original; anything else not in the catalog is dropped (the catalog
 * is the source of truth). Deduped, in catalog order. Only call with a
 * LOADED catalog — never strip keys against an empty/failed one.
 */
export function canonicalizePermissions(keys: readonly string[], catalog: PermissionCatalog): string[] {
  const known = catalogKeys(catalog);
  const wanted = new Set<string>();
  for (const key of keys) {
    if (known.has(key)) {
      wanted.add(key);
      continue;
    }
    const { module, action } = splitKey(key);
    if (MANAGE_ALIASES.has(action) && known.has(`${module}.manage`)) wanted.add(`${module}.manage`);
  }
  return Array.from(known).filter((key) => wanted.has(key));
}
