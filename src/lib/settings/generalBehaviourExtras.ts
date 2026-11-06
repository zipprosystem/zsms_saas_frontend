import type { SettingsData, SettingsUpdate } from "./types";

/**
 * Settings › General Behaviour: attendance mapping (1:1 / 1:2).
 *
 * attendance_sessions_per_day — how many attendance sessions a school day
 * counts as: 1 (1:1, one register a day) or 2 (1:2, morning + afternoon).
 * Default 2. The report's attendance box reads it: total sessions = open
 * days × this factor (Report Progression, see studentEntryApi.ts).
 *
 * SWAP FLAG. The backend's school/settings doesn't carry this field yet.
 * Until it does (false), it lives in a per-browser MOCK side-store, merged
 * onto general_behaviour on read; the real PATCH body never includes it.
 * Flip to true once the backend ships it: it then travels in the real
 * PATCH body and is read from its response (missing → the default).
 */
export const SETTINGS_ATTENDANCE_MAPPING_LIVE = false;

export type AttendanceSessionsPerDay = 1 | 2;

export const ATTENDANCE_SESSIONS_OPTIONS: readonly AttendanceSessionsPerDay[] = [1, 2];

/** The setting's default when the school hasn't chosen (not a seed — the contract default). */
export const DEFAULT_ATTENDANCE_SESSIONS_PER_DAY: AttendanceSessionsPerDay = 2;

const EXTRAS_KEY = "zsms.mockSettingsGeneralBehaviourExtras";

export function toSessionsPerDay(value: unknown): AttendanceSessionsPerDay {
  return value === 1 || value === 2 ? value : DEFAULT_ATTENDANCE_SESSIONS_PER_DAY;
}

function loadMock(): AttendanceSessionsPerDay {
  if (typeof window === "undefined") return DEFAULT_ATTENDANCE_SESSIONS_PER_DAY;
  try {
    const raw = window.localStorage.getItem(EXTRAS_KEY);
    if (raw) return toSessionsPerDay((JSON.parse(raw) as Record<string, unknown>).attendance_sessions_per_day);
  } catch {
    // fall through
  }
  return DEFAULT_ATTENDANCE_SESSIONS_PER_DAY;
}

/** general_behaviour with attendance_sessions_per_day filled in: from the response when live, else the side-store. */
export function withGeneralBehaviourExtras(data: SettingsData): SettingsData {
  const section = data.general_behaviour as SettingsData["general_behaviour"] & Record<string, unknown>;
  const sessions = SETTINGS_ATTENDANCE_MAPPING_LIVE ? toSessionsPerDay(section.attendance_sessions_per_day) : loadMock();
  return { ...data, general_behaviour: { ...data.general_behaviour, attendance_sessions_per_day: sessions } };
}

/**
 * Live: the update goes out as-is. Mock: attendance_sessions_per_day is
 * taken out of the PATCH body; `sessions` is what to store once the rest
 * saves (null = unchanged).
 */
export function splitGeneralBehaviourExtras(update: SettingsUpdate): { body: SettingsUpdate; sessions: AttendanceSessionsPerDay | null } {
  if (SETTINGS_ATTENDANCE_MAPPING_LIVE || !update.general_behaviour) return { body: update, sessions: null };
  const general = { ...update.general_behaviour };
  const sessions = general.attendance_sessions_per_day ?? null;
  delete general.attendance_sessions_per_day;
  const body: SettingsUpdate = { ...update };
  if (Object.keys(general).length > 0) body.general_behaviour = general;
  else delete body.general_behaviour;
  return { body, sessions: sessions === null ? null : toSessionsPerDay(sessions) };
}

/** Mock: persist the chosen mapping. */
export function storeGeneralBehaviourExtras(sessions: AttendanceSessionsPerDay): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXTRAS_KEY, JSON.stringify({ attendance_sessions_per_day: sessions }));
  } catch {
    // best-effort
  }
}
