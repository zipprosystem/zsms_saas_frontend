import type { AuthUser } from "@/lib/auth/AuthProvider";

/**
 * SUBMENU-LEVEL nav gating (the new default): every nav entry that needs
 * one names its OWN permission key, not just its top-level menu's.
 *
 * The backend submenu keys are being added by Muntajir, so each entry
 * also names a `fallback` (normally its parent menu's key) used until its
 * own key is live. The rule, in order:
 *
 *   1. No `permission` on the entry            -> shown.
 *   2. The user carries no permission list yet -> shown. Nothing in the
 *      app enforces permissions today, and the login / auth-me payload
 *      doesn't carry them yet — hiding everything would lock people out.
 *   3. The entry's key is in LIVE_PERMISSION_KEYS -> shown iff the user
 *      has that key.
 *   4. Not live yet -> shown iff the user has the `fallback` key (or
 *      shown when there's no fallback).
 *
 * FLAGGED (Matthew / Muntajir): the key names below are PROPOSED, and
 * the user's permissions are read tolerantly from `user.permissions`
 * (array of "module.action" strings) — reconcile both on the deployed
 * tenant. Add a key to LIVE_PERMISSION_KEYS once the backend ships it.
 */
export type NavPermission = { key: string; fallback?: string };

/** Submenu keys the backend has confirmed. Empty until Muntajir's keys ship. */
export const LIVE_PERMISSION_KEYS: ReadonlySet<string> = new Set<string>([]);

/** PROPOSED keys for the entries this increment gates. */
export const NAV_PERMISSIONS = {
  examViewResults: { key: "exam.view_results", fallback: "exam.view" },
  setupGrades: { key: "assessment_config.grades", fallback: "assessment_config.view" },
  hrAssignmentReview: { key: "hr.assignment_review", fallback: "hr.view" },
} satisfies Record<string, NavPermission>;

/** The user's permission keys, or null when the payload carries none. */
export function readUserPermissions(user: AuthUser | null): ReadonlySet<string> | null {
  const raw = user?.permissions;
  if (!Array.isArray(raw)) return null;
  return new Set(raw.filter((value): value is string => typeof value === "string"));
}

export function canSeeNavEntry(permission: NavPermission | undefined, granted: ReadonlySet<string> | null): boolean {
  if (!permission || !granted) return true;
  if (LIVE_PERMISSION_KEYS.has(permission.key)) return granted.has(permission.key);
  return permission.fallback ? granted.has(permission.fallback) : true;
}
