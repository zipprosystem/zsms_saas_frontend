import type { SettingsData, SettingsUpdate } from "./types";

/**
 * Settings › School Identity: motto + mission statement.
 *
 * SWAP FLAG. The backend's school/settings doesn't carry these two
 * identity fields yet. Until it does (false), they live in a per-browser
 * MOCK side-store, merged onto identity on read; the real PATCH body never
 * includes them. Flip to true once the backend ships them: they then
 * travel in the real PATCH body and are read from its response.
 */
export const SETTINGS_IDENTITY_EXTRAS_LIVE = false;

export type IdentityExtras = { motto: string | null; mission_statement: string | null };

const EXTRAS_KEY = "zsms.mockSettingsIdentityExtras";

/** Dev-bypass starting values, so the report shows the fallback before anyone edits Settings. */
const DEV_SEED: IdentityExtras = {
  motto: "Learning for life",
  mission_statement: "We provide an excellent education that inspires every learner to lead, to serve and to excel in a global world.",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function loadMockExtras(seed: boolean): IdentityExtras {
  if (typeof window === "undefined") return { motto: null, mission_statement: null };
  try {
    const raw = window.localStorage.getItem(EXTRAS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return { motto: text(parsed.motto), mission_statement: text(parsed.mission_statement) };
    }
  } catch {
    // fall through
  }
  return seed ? { ...DEV_SEED } : { motto: null, mission_statement: null };
}

function saveMockExtras(extras: IdentityExtras): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras));
  } catch {
    // best-effort
  }
}

/**
 * The identity with its motto / mission statement filled in: from the
 * response itself when live (missing → null), else from the side-store.
 * `devSeed`: start the side-store from sample values (dev bypass only).
 */
export function withIdentityExtras(data: SettingsData, devSeed = false): SettingsData {
  const identity = data.identity as SettingsData["identity"] & Record<string, unknown>;
  const extras = SETTINGS_IDENTITY_EXTRAS_LIVE
    ? { motto: text(identity.motto), mission_statement: text(identity.mission_statement) }
    : loadMockExtras(devSeed);
  return { ...data, identity: { ...data.identity, ...extras } };
}

/**
 * Live: the update goes out as-is. Mock: motto / mission_statement are
 * taken out of the PATCH body; `extras` is what to store once the rest
 * saves (null = neither changed).
 */
export function splitIdentityExtras(update: SettingsUpdate): { body: SettingsUpdate; extras: Partial<IdentityExtras> | null } {
  if (SETTINGS_IDENTITY_EXTRAS_LIVE || !update.identity) return { body: update, extras: null };
  const { motto, mission_statement, ...identity } = update.identity;
  const extras: Partial<IdentityExtras> = {};
  if (motto !== undefined) extras.motto = motto;
  if (mission_statement !== undefined) extras.mission_statement = mission_statement;
  const body: SettingsUpdate = { ...update };
  if (Object.keys(identity).length > 0) body.identity = identity;
  else delete body.identity;
  return { body, extras: Object.keys(extras).length > 0 ? extras : null };
}

/** Mock: persist the changed extras over what's stored. */
export function storeIdentityExtras(extras: Partial<IdentityExtras>, devSeed = false): void {
  const current = loadMockExtras(devSeed);
  saveMockExtras({
    motto: extras.motto !== undefined ? text(extras.motto) : current.motto,
    mission_statement: extras.mission_statement !== undefined ? text(extras.mission_statement) : current.mission_statement,
  });
}
