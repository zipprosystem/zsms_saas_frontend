import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { GradeBand, GradeBandInput, GradeScaleType } from "@/lib/setup/assessmentConfiguration/gradesApi";
import type { GradeScale, ScaleLevel } from "@/lib/exam/examTypes";
import type { ScoreGradeScale } from "@/lib/exam/results/resultsTypes";
import {
  SEED_CLASS_GRADE_STRUCTURE,
  SEED_CLASS_SCORE_SCALE,
  SEED_CLASSES,
  SEED_GRADE_SCALES,
  SEED_GRADE_STRUCTURES,
  SEED_SCORE_GRADE_SCALES,
} from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Setup › Assessment Config › Grades + Attainment Grades (contract in
 * gradesApi.ts). Bands live in localStorage, one store for both scale
 * types. The first read seeds:
 *   - general: the Stage 2a score scales (JSS A–F → JSS 1, WAEC A1–F9 →
 *     SS 1); is_pass = every grade but the F band.
 *   - attainment: the British seed scales per grade-based class (KS3 →
 *     Year 9, GCSE → Year 11) with the agreed weights (GCSE 9 → 9 … U → 0;
 *     KS3 M 4 … E 1). FLAGGED seed guesses: the score ranges (GCSE 10-point
 *     bands, KS3 quarters) and is_pass (GCSE 4+, KS3 Secure+).
 * A v1 store (general bands only, from before this change) is migrated:
 * its bands keep their edits and gain the new flags, and the attainment
 * seeds are added.
 *
 * Read by the results mock: general bands via classGradeScale (grades,
 * GPA), attainment bands via resolveGradeScale (the British class's levels
 * and weights — so editing a weight changes VA and the weight display).
 *
 * Writes are admin-only (403 FORBIDDEN for anyone else, per the acting-as
 * picker); reads are open.
 */

const STORAGE_KEY = "zsms.mockExam.grades.v2";
const LEGACY_STORAGE_KEY = "zsms.mockExam.grades.v1";
const REMARK_MAX = 100;

type Store = Record<string, GradeBand>;

/** FLAGGED seed ranges (%), best grade first, matching SEED_GRADE_SCALES' order. */
const ATTAINMENT_SEED_RANGES: Record<string, Array<[number, number]>> = {
  "scale-gcse": [[90, 100], [80, 89.99], [70, 79.99], [60, 69.99], [50, 59.99], [40, 49.99], [30, 39.99], [20, 29.99], [10, 19.99], [0, 9.99]],
  "scale-ks3": [[75, 100], [50, 74.99], [25, 49.99], [0, 24.99]],
};
/** FLAGGED seed pass marks: the lowest passing grade of each seed scale. */
const ATTAINMENT_SEED_PASS: Record<string, string> = { "scale-gcse": "4", "scale-ks3": "S" };

function isFailGrade(grade: string): boolean {
  return /^F/i.test(grade);
}

function seedGeneral(): Store {
  const store: Store = {};
  for (const scale of SEED_SCORE_GRADE_SCALES) {
    const classIds = Object.entries(SEED_CLASS_SCORE_SCALE)
      .filter(([, scaleId]) => scaleId === scale.id)
      .map(([classId]) => classId);
    scale.bands.forEach((band, index) => {
      const id = `grd-${scale.id}-${index + 1}`;
      store[id] = {
        id,
        scale_type: "general",
        grade: band.grade,
        grade_weight: band.grade_weight,
        gpa: band.gpa,
        min_score: band.min,
        max_score: band.max,
        remark: band.remark,
        is_pass: !isFailGrade(band.grade),
        show_on_report: true,
        class_ids: classIds,
      };
    });
  }
  return store;
}

function seedAttainment(): Store {
  const store: Store = {};
  for (const scale of SEED_GRADE_SCALES) {
    const classIds = Object.entries(SEED_CLASS_GRADE_STRUCTURE)
      .filter(([, structureId]) => SEED_GRADE_STRUCTURES.find((item) => item.id === structureId)?.attainment.grade_scale_id === scale.id)
      .map(([classId]) => classId);
    const ranges = ATTAINMENT_SEED_RANGES[scale.id] ?? [];
    const passIndex = scale.grades.findIndex((level) => level.code === ATTAINMENT_SEED_PASS[scale.id]);
    scale.grades.forEach((level, index) => {
      const [min, max] = ranges[index] ?? [0, 0];
      const id = `att-${scale.id}-${index + 1}`;
      store[id] = {
        id,
        scale_type: "attainment",
        grade: level.code,
        grade_weight: level.weight ?? scale.grades.length - index,
        gpa: null,
        min_score: min,
        max_score: max,
        remark: level.label === level.code ? "" : level.label,
        is_pass: passIndex >= 0 && index <= passIndex,
        show_on_report: true,
        class_ids: classIds,
      };
    });
  }
  return store;
}

/** A v1 band (general only, no flags) as a v2 band. */
function migrate(band: Partial<GradeBand> & { id: string }): GradeBand {
  return {
    id: band.id,
    scale_type: "general",
    grade: band.grade ?? "",
    grade_weight: band.grade_weight ?? 0,
    gpa: band.gpa ?? null,
    min_score: band.min_score ?? 0,
    max_score: band.max_score ?? 0,
    remark: band.remark ?? "",
    is_pass: !isFailGrade(band.grade ?? ""),
    show_on_report: true,
    class_ids: band.class_ids ?? [],
  };
}

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  // Stored as { bands } so a school that deletes every band isn't re-seeded on reload.
  const stored = readStore<Store>(STORAGE_KEY).bands;
  if (stored && typeof stored === "object") {
    cache = stored;
    return cache;
  }
  const legacy = readStore<Store>(LEGACY_STORAGE_KEY).bands;
  const general =
    legacy && typeof legacy === "object" ? Object.fromEntries(Object.values(legacy).map((band) => [band.id, migrate(band)])) : seedGeneral();
  cache = { ...general, ...seedAttainment() };
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

function classBands(classId: string, scaleType: GradeScaleType): GradeBand[] {
  return sorted(Object.values(load()).filter((band) => band.scale_type === scaleType && band.class_ids.includes(classId)));
}

/** The class's general bands as the engine's score scale; null when the class has none (no grades computed). */
export function classGradeScale(classId: string): ScoreGradeScale | null {
  const bands = classBands(classId, "general");
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
      is_pass: band.is_pass,
    })),
  };
}

/** The class's attainment bands, best first (min / max / pass / show-on-report for reports). Empty = none set. */
export function classAttainmentBands(classId: string): GradeBand[] {
  return classBands(classId, "attainment");
}

/**
 * A British class's attainment scale as the Exam module reads it: the
 * structure's scale, with its levels taken from the class's attainment
 * bands (code = grade, label = remark or grade, weight = grade_weight)
 * whenever the class has any. Keeps the structure's scale id, so entry
 * options and stored codes still line up.
 */
export function resolveGradeScale(classId: string | null, scale: GradeScale | undefined): GradeScale | undefined {
  if (!scale || !classId) return scale;
  const bands = classAttainmentBands(classId);
  if (bands.length === 0) return scale;
  const grades: ScaleLevel[] = bands.map((band) => ({ code: band.grade, label: band.remark || band.grade, weight: band.grade_weight }));
  return { ...scale, grades };
}

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parse(payload: unknown): { input: GradeBandInput } | { error: WireResponse } {
  const r = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const invalid = (message: string) => ({ error: fail(422, "VALIDATION_ERROR", message) });
  if (r.scale_type !== "general" && r.scale_type !== "attainment") return invalid('scale_type: must be "general" or "attainment"');
  const scaleType: GradeScaleType = r.scale_type;
  const grade = typeof r.grade === "string" ? r.grade.trim() : "";
  if (!grade) return invalid("grade: is required");
  if (grade.length > 10) return invalid("grade: must be 10 characters or fewer");
  if (!isNum(r.grade_weight) || r.grade_weight < 0) return invalid("grade_weight: must be a number of 0 or more");
  if (scaleType === "attainment" && r.gpa !== null && r.gpa !== undefined) return invalid("gpa: attainment grades don't carry a GPA");
  if (r.gpa !== null && r.gpa !== undefined && (!isNum(r.gpa) || r.gpa < 0)) return invalid("gpa: must be a number of 0 or more, or empty");
  if (!isNum(r.min_score) || r.min_score < 0 || r.min_score > 100) return invalid("min_score: must be between 0 and 100");
  if (!isNum(r.max_score) || r.max_score < 0 || r.max_score > 100) return invalid("max_score: must be between 0 and 100");
  if (r.min_score > r.max_score) return invalid("min_score: can't be above max_score");
  const remark = typeof r.remark === "string" ? r.remark.trim() : "";
  if (remark.length > REMARK_MAX) return invalid(`remark: must be ${REMARK_MAX} characters or fewer`);
  if (typeof r.is_pass !== "boolean") return invalid("is_pass: must be true or false");
  if (r.show_on_report !== undefined && typeof r.show_on_report !== "boolean") return invalid("show_on_report: must be true or false");
  const classIds = Array.isArray(r.class_ids) ? Array.from(new Set(r.class_ids.filter((id): id is string => typeof id === "string"))) : [];
  if (classIds.length === 0) return invalid("class_ids: pick at least one class");
  const known = new Set(SEED_CLASSES.map((cls) => cls.id));
  if (classIds.some((id) => !known.has(id))) return invalid("class_ids: unknown class");
  // General bands apply to General classes, attainment bands to grade-based (British) classes.
  const wrongMode = classIds.find((id) => !!SEED_CLASS_GRADE_STRUCTURE[id] !== (scaleType === "attainment"));
  if (wrongMode) {
    return invalid(`class_ids: ${className(wrongMode)} ${scaleType === "attainment" ? "isn't a grade-based class" : "is a grade-based class — use Attainment Grades"}`);
  }
  return {
    input: {
      scale_type: scaleType,
      grade,
      grade_weight: r.grade_weight,
      gpa: scaleType === "general" && isNum(r.gpa) ? r.gpa : null,
      min_score: r.min_score,
      max_score: r.max_score,
      remark,
      is_pass: r.is_pass,
      show_on_report: r.show_on_report !== false,
      class_ids: classIds,
    },
  };
}

function className(id: string): string {
  return SEED_CLASSES.find((cls) => cls.id === id)?.name ?? id;
}

/** 409 when the band clashes with another band of the same scale type in a class they share. */
function conflict(input: GradeBandInput, selfId: string | null): WireResponse | null {
  for (const other of Object.values(load())) {
    if (other.id === selfId || other.scale_type !== input.scale_type) continue;
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
      const scaleType = query.get("scale_type");
      if (scaleType && scaleType !== "general" && scaleType !== "attainment") return fail(422, "VALIDATION_ERROR", 'scale_type: must be "general" or "attainment"');
      const items = sorted(
        Object.values(load()).filter((band) => (!classId || band.class_ids.includes(classId)) && (!scaleType || band.scale_type === scaleType)),
      );
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
    if (parsed.input.scale_type !== store[id].scale_type) return fail(422, "VALIDATION_ERROR", "scale_type: can't be changed");
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
