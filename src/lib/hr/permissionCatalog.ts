/**
 * The coarse per-module / per-action permission set a Permission Group
 * toggles — a group's `permissions` is a list of "module.action" keys.
 * Deliberately coarse for v1 (spec open item: start per-module, refine
 * later). FLAGGED: this catalog is frontend-defined for the mock; the
 * backend should own and serve it once role-guard enforcement exists.
 *
 * Capture only — nothing in the app ENFORCES these yet. Effective access
 * (incl. the §6.2 data-scope roll-up from subject / class-teacher /
 * department assignments) is backend-computed later.
 */
export const PERMISSION_MODULES = [
  "students",
  "staff",
  "academics",
  "attendance",
  "assessments",
  "finance",
  "communications",
  "reports",
  "setup",
  "settings",
] as const;

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export function permissionKey(module: PermissionModule, action: PermissionAction): string {
  return `${module}.${action}`;
}

const ALL_KEYS = new Set<string>(
  PERMISSION_MODULES.flatMap((module) => PERMISSION_ACTIONS.map((action) => permissionKey(module, action))),
);

/** Drops anything not in the catalog, deduped and in catalog order — so a stale or unknown key never round-trips. */
export function normalizePermissions(keys: readonly string[]): string[] {
  const wanted = new Set(keys);
  return Array.from(ALL_KEYS).filter((key) => wanted.has(key));
}
