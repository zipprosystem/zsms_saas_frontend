import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { GradeBand, GradeBandInput } from "@/lib/setup/assessmentConfiguration/gradesApi";
import type { ScoreGradeScale } from "@/lib/exam/results/resultsTypes";
import { SEED_CLASS_SCORE_SCALE, SEED_CLASSES, SEED_SCORE_GRADE_SCALES } from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Setup › Assessment Config › Grades (contract in gradesApi.ts).
 * Bands live in localStorage; the first read seeds them from the Stage 2a
 * score scales (JSS A–F -> JSS 1, WAEC A1–F9 -> SS 1) so results look the
 * same as before. The results mock reads the class's bands from here
 * (classGradeScale) — editing a band changes computed grades.
 *
 * Writes are admin-only (403 FORBIDDEN for anyone else, per the acting-as
 * picker); reads are open.
 */

const STORAGE_KEY = "zsms.mockExam.grades.v1";
const REMARK_MAX = 100;

type Store = Record<string, GradeBand>;

function seedBands(): Store {
  const store: Store = {};
  for (const scale of SEED_SCORE_GRADE_SCALES) {
    const classIds = Object.entries(SEED_CLASS_SCORE_SCALE)
      .filter(([, scaleId]) => scaleId === scale.id)
      .map(([classId]) => classId);
    scale.bands.forEach((band, index) => {
      const id = `grd-${scale.id}-${index + 1}`;
      store[id] = {
        id,
        grade: band.grade,
        grade_weight: band.grade_weight,
        gpa: band.gpa,
        min_score: band.min,
        max_score: band.max,
        remark: band.remark,
        class_ids: classIds,
      };
    });
  }
  return store;
}

let cache: Store | null = null;

function load(): Store {
  if (!cache) {
    // Stored as { bands } so a school that deletes every band isn't re-seeded on reload.
    const stored = readStore<Store>(STORAGE_KEY).bands;
    cache = stored && typeof stored === "object" ? stored : seedBands();
  }
  return cache;
}

function save(store: Store): void {
  cache = store;
  writeStore(STORAGE_KEY, { bands: store });
}

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

/** Best band first (highest min), so tables and the engine read in order. */
function sorted(bands: GradeBand[]): GradeBand[] {
  return [...bands].sort((a, b) => b.min_score - a.min_score || a.grade.localeCompare(b.grade));
}

/** The class's bands as the engine's score scale; null when the class has none (no grades computed). */
export function classGradeScale(classId: string): ScoreGradeScale | null {
  const bands = sorted(Object.values(load()).filter((band) => band.class_ids.includes(classId)));
  if (bands.length === 0) return null;
  return {
    id: `grades-${classId}`,
    name: "",
    bands: bands.map((band) => ({
      grade: band.grade,
      min: band.min_score,
      max: band.max_score,
      remark: band.remark,
      grade_weight: band.grade_weight,
      gpa: band.gpa,
    })),
  };
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parse(payload: unknown): { input: GradeBandInput } | { error: WireResponse } {
  const r = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const invalid = (message: string) => ({ error: fail(422, "VALIDATION_ERROR", message) });
  const grade = typeof r.grade === "string" ? r.grade.trim() : "";
  if (!grade) return invalid("grade: is required");
  if (grade.length > 10) return invalid("grade: must be 10 characters or fewer");
  if (!isNum(r.grade_weight) || r.grade_weight < 0) return invalid("grade_weight: must be a number of 0 or more");
  if (r.gpa !== null && r.gpa !== undefined && (!isNum(r.gpa) || r.gpa < 0)) return invalid("gpa: must be a number of 0 or more, or empty");
  if (!isNum(r.min_score) || r.min_score < 0 || r.min_score > 100) return invalid("min_score: must be between 0 and 100");
  if (!isNum(r.max_score) || r.max_score < 0 || r.max_score > 100) return invalid("max_score: must be between 0 and 100");
  if (r.min_score > r.max_score) return invalid("min_score: can't be above max_score");
  const remark = typeof r.remark === "string" ? r.remark.trim() : "";
  if (remark.length > REMARK_MAX) return invalid(`remark: must be ${REMARK_MAX} characters or fewer`);
  const classIds = Array.isArray(r.class_ids) ? Array.from(new Set(r.class_ids.filter((id): id is string => typeof id === "string"))) : [];
  if (classIds.length === 0) return invalid("class_ids: pick at least one class");
  const known = new Set(SEED_CLASSES.map((cls) => cls.id));
  if (classIds.some((id) => !known.has(id))) return invalid("class_ids: unknown class");
  return {
    input: {
      grade,
      grade_weight: r.grade_weight,
      gpa: isNum(r.gpa) ? r.gpa : null,
      min_score: r.min_score,
      max_score: r.max_score,
      remark,
      class_ids: classIds,
    },
  };
}

function className(id: string): string {
  return SEED_CLASSES.find((cls) => cls.id === id)?.name ?? id;
}

/** 409 when the band clashes with another band of a class they share. */
function conflict(input: GradeBandInput, selfId: string | null): WireResponse | null {
  for (const other of Object.values(load())) {
    if (other.id === selfId) continue;
    const shared = other.class_ids.find((id) => input.class_ids.includes(id));
    if (!shared) continue;
    if (other.grade.toLowerCase() === input.grade.toLowerCase()) {
      return fail(409, "DUPLICATE_GRADE", `${className(shared)} already has a grade "${other.grade}".`);
    }
    if (input.min_score <= other.max_score && other.min_score <= input.max_score) {
      return fail(409, "GRADE_RANGE_OVERLAP", `${className(shared)}: ${input.min_score}–${input.max_score} overlaps grade ${other.grade} (${other.min_score}–${other.max_score}).`);
    }
  }
  return null;
}

function requireAdmin(): WireResponse | null {
  return getMockActingAs() === MOCK_ADMIN ? null : fail(403, "FORBIDDEN", "Only an administrator can change grades.");
}

export function handleGrades(method: string, path: string, query: URLSearchParams, payload: unknown): WireResponse | null {
  if (path === "erp/grades") {
    if (method === "GET") {
      const classId = query.get("class_id");
      const items = sorted(Object.values(load()).filter((band) => !classId || band.class_ids.includes(classId)));
      return ok({ items });
    }
    if (method === "POST") {
      const denied = requireAdmin();
      if (denied) return denied;
      const parsed = parse(payload);
      if ("error" in parsed) return parsed.error;
      const clash = conflict(parsed.input, null);
      if (clash) return clash;
      const band: GradeBand = { ...parsed.input, id: `grd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
      save({ ...load(), [band.id]: band });
      return ok(band, 201);
    }
    return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  const match = path.match(/^erp\/grades\/([^/]+)$/);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  const store = load();
  if (!store[id]) return fail(404, "GRADE_NOT_FOUND", "Grade not found");
  if (method === "PUT") {
    const denied = requireAdmin();
    if (denied) return denied;
    const parsed = parse(payload);
    if ("error" in parsed) return parsed.error;
    const clash = conflict(parsed.input, id);
    if (clash) return clash;
    const band: GradeBand = { ...parsed.input, id };
    save({ ...store, [id]: band });
    return ok(band);
  }
  if (method === "DELETE") {
    const denied = requireAdmin();
    if (denied) return denied;
    const next = { ...store };
    delete next[id];
    save(next);
    return ok(null);
  }
  return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
}
