import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import {
  PROGRESS_DESCRIPTOR_MAX,
  PROGRESS_DOMAINS,
  PROGRESS_NAME_MAX,
  type ProgressGrade,
  type ProgressGradeInput,
  type ProgressGradeMode,
} from "@/lib/setup/assessmentConfiguration/progressGradesApi";
import { SEED_RATING_SCALES, SEED_TRAIT_SCALE } from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Setup › Assessment Config › Progress Grades (contract in
 * progressGradesApi.ts). localStorage; the first read seeds:
 *   - general: the trait rating key (5 Excellent … 1 Poor), no descriptors.
 *   - british: the 1–4 rating (1 Excellent … 4 Cause for concern) with the
 *     Engagement / Learning Behaviour / Boarding descriptors the British
 *     result template printed as sample text.
 * Seeded ids are stable (pg-general-5, pg-british-1 …) so the traits mock
 * can map ratings saved before this change (stored as the level's value).
 *
 * Writes are admin-only; reads are open. DELETE refuses a level a saved
 * rating references — a trait (General) or an Academic Report Engagement /
 * Learning Behaviour entry (British); the caller passes that check in.
 */

const STORAGE_KEY = "zsms.mockExam.progressGrades.v1";

type Store = Record<string, ProgressGrade>;

const BRITISH_DESCRIPTORS: Record<string, ProgressGrade["descriptors"]> = {
  "1": {
    engagement: "Innovative, curious and self-regulating; seeks challenge and argues from evidence.",
    learning_behaviour: "Plans and refines independently; thinks abstractly; resilient and focused.",
    boarding: "A role model; community-minded and resilient; valuable contributor to house life.",
  },
  "2": {
    engagement: "High-standard work; open-minded; uses ICT productively and meets targets.",
    learning_behaviour: "Collaborative; self-corrects; punctual and well equipped.",
    boarding: "Positive, punctual contributor; empathetic and community-minded.",
  },
  "3": {
    engagement: "Substandard or incomplete work; limited curiosity.",
    learning_behaviour: "Lesson time not used well; loses focus and distracts peers.",
    boarding: "Untidy; punctuality and organisation need improvement.",
  },
  "4": {
    engagement: "Work not completed; disengaged; does not respond to feedback.",
    learning_behaviour: "Misses objectives; closed mindset; disrupts lessons.",
    boarding: "Below house expectations; poor organisation; unhelpful.",
  },
};

/** The seeded id of a scale's level with this value (also how legacy trait ratings map). */
export function seededProgressGradeId(mode: ProgressGradeMode, value: number): string {
  return `pg-${mode}-${value}`;
}

function seed(): Store {
  const store: Store = {};
  for (const level of SEED_TRAIT_SCALE) {
    const id = seededProgressGradeId("general", level.value);
    store[id] = { id, mode: "general", name: level.label, value: level.value, hide_in_report: false, descriptors: {} };
  }
  for (const level of SEED_RATING_SCALES.find((scale) => scale.id === "rating-1-4")?.levels ?? []) {
    const value = Number(level.code);
    const id = seededProgressGradeId("british", value);
    store[id] = { id, mode: "british", name: level.label, value, hide_in_report: false, descriptors: BRITISH_DESCRIPTORS[level.code] ?? {} };
  }
  return store;
}

let cache: Store | null = null;

function load(): Store {
  if (!cache) {
    // Stored as { levels } so a school that deletes every level isn't re-seeded on reload.
    const stored = readStore<Store>(STORAGE_KEY).levels;
    cache = stored && typeof stored === "object" ? stored : seed();
  }
  return cache;
}

function save(store: Store): void {
  cache = store;
  writeStore(STORAGE_KEY, { levels: store });
}

/** Best level first: general high value → low; british low value → high (1 = best). */
function sorted(levels: ProgressGrade[]): ProgressGrade[] {
  return [...levels].sort((a, b) => (a.mode === "british" ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
}

/** The scale's levels, best first. */
export function progressGrades(mode: ProgressGradeMode): ProgressGrade[] {
  return sorted(Object.values(load()).filter((level) => level.mode === mode));
}

export function progressGradeById(id: string | null | undefined): ProgressGrade | null {
  return id ? (load()[id] ?? null) : null;
}

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

function parse(payload: unknown): { input: ProgressGradeInput } | { error: WireResponse } {
  const r = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const invalid = (message: string) => ({ error: fail(422, "VALIDATION_ERROR", message) });
  if (r.mode !== "general" && r.mode !== "british") return invalid('mode: must be "general" or "british"');
  const mode: ProgressGradeMode = r.mode;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return invalid("name: is required");
  if (name.length > PROGRESS_NAME_MAX) return invalid(`name: must be ${PROGRESS_NAME_MAX} characters or fewer`);
  if (typeof r.value !== "number" || !Number.isInteger(r.value) || r.value < 0 || r.value > 99) return invalid("value: must be a whole number from 0 to 99");
  if (r.hide_in_report !== undefined && typeof r.hide_in_report !== "boolean") return invalid("hide_in_report: must be true or false");
  const sent = r.descriptors && typeof r.descriptors === "object" && !Array.isArray(r.descriptors) ? (r.descriptors as Record<string, unknown>) : {};
  const allowed: readonly string[] = PROGRESS_DOMAINS[mode];
  const descriptors: ProgressGradeInput["descriptors"] = {};
  for (const [domain, text] of Object.entries(sent)) {
    if (!allowed.includes(domain)) return invalid(`descriptors.${domain}: not a ${mode} domain`);
    if (text === null || text === undefined) continue;
    if (typeof text !== "string") return invalid(`descriptors.${domain}: must be text`);
    const trimmed = text.trim();
    if (trimmed.length > PROGRESS_DESCRIPTOR_MAX) return invalid(`descriptors.${domain}: must be ${PROGRESS_DESCRIPTOR_MAX} characters or fewer`);
    if (trimmed) descriptors[domain as keyof ProgressGradeInput["descriptors"]] = trimmed;
  }
  return { input: { mode, name, value: r.value, hide_in_report: r.hide_in_report === true, descriptors } };
}

/** 409 when the name or value is already used by another level of the same scale. */
function conflict(input: ProgressGradeInput, selfId: string | null): WireResponse | null {
  for (const other of Object.values(load())) {
    if (other.id === selfId || other.mode !== input.mode) continue;
    if (other.name.toLowerCase() === input.name.toLowerCase()) return fail(409, "DUPLICATE_LEVEL_NAME", `There's already a level named "${other.name}".`);
    if (other.value === input.value) return fail(409, "DUPLICATE_LEVEL_VALUE", `Level "${other.name}" already has the value ${other.value}.`);
  }
  return null;
}

function requireAdmin(): WireResponse | null {
  return getMockActingAs() === MOCK_ADMIN ? null : fail(403, "FORBIDDEN", "Only an administrator can change progress grades.");
}

export function handleProgressGrades(
  method: string,
  path: string,
  query: URLSearchParams,
  payload: unknown,
  isInUse: (id: string) => boolean,
): WireResponse | null {
  if (path === "erp/progress-grades") {
    if (method === "GET") {
      const mode = query.get("mode");
      if (mode && mode !== "general" && mode !== "british") return fail(422, "VALIDATION_ERROR", 'mode: must be "general" or "british"');
      const items = mode ? progressGrades(mode as ProgressGradeMode) : [...progressGrades("general"), ...progressGrades("british")];
      return ok({ items });
    }
    if (method === "POST") {
      const denied = requireAdmin();
      if (denied) return denied;
      const parsed = parse(payload);
      if ("error" in parsed) return parsed.error;
      const clash = conflict(parsed.input, null);
      if (clash) return clash;
      const level: ProgressGrade = { ...parsed.input, id: `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
      save({ ...load(), [level.id]: level });
      return ok(level, 201);
    }
    return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  const match = path.match(/^erp\/progress-grades\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  const store = load();
  if (!store[id]) return fail(404, "PROGRESS_GRADE_NOT_FOUND", "Progress grade not found");
  if (method === "PUT") {
    const denied = requireAdmin();
    if (denied) return denied;
    const parsed = parse(payload);
    if ("error" in parsed) return parsed.error;
    if (parsed.input.mode !== store[id].mode) return fail(422, "VALIDATION_ERROR", "mode: can't be changed");
    const clash = conflict(parsed.input, id);
    if (clash) return clash;
    const level: ProgressGrade = { ...parsed.input, id };
    save({ ...store, [id]: level });
    return ok(level);
  }
  if (method === "DELETE") {
    const denied = requireAdmin();
    if (denied) return denied;
    if (isInUse(id)) {
      return fail(409, "PROGRESS_GRADE_IN_USE", `"${store[id].name}" is used by saved ratings. Hide it in reports instead, or change those ratings first.`);
    }
    const next = { ...store };
    delete next[id];
    save(next);
    return ok(null);
  }
  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}
