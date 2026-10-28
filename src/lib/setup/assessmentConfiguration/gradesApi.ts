import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";

/**
 * Setup › Assessment Config › Grades — per-class grade bands, two scale
 * types on one model (scale_type discriminator):
 *   - general: score bands for General (component-based) classes — what
 *     results computation reads (grade / remark / weight / GPA for a
 *     subject total and a student's average). Screen: Grades.
 *   - attainment: the British attainment grade scale for grade-based
 *     classes — the class's attainment levels (code + weight) and each
 *     level's score range. Screen: Attainment Grades.
 * Admin-gated.
 *
 * Rides the Exam module's transport, so the exam USE_MOCK flag swaps it;
 * with the real transport under the local dev-auth bypass every call
 * returns devBypassUnavailable and the screen shows the "deployed tenant"
 * notice.
 *
 * PROPOSED REST contract (confirm with Muntajir):
 *
 *   grade_band: id, scale_type, grade, grade_weight, gpa|null, min_score,
 *               max_score, remark, is_pass, show_on_report, class_ids[]
 *     scale_type: "general" | "attainment" (required; can't change on PUT).
 *     A band applies to one or more classes (and so to every arm of
 *     them); general bands to General classes only, attainment bands to
 *     grade-based (British) classes only. Scores are % (0–100).
 *     grade_weight means different things per type (both kept):
 *       general    — a RANK, 1 = best (unchanged).
 *       attainment — the POINT VALUE, higher = better (GCSE 9 → 9 … U → 0;
 *                    KS3 M 4 … E 1); VA = CAG weight − MTG weight, and the
 *                    attainment display "weight" shows it.
 *     gpa: general only, OPTIONAL — null = the school doesn't use GPA for
 *       that band. Always null for attainment (422 if sent).
 *     is_pass: whether the grade counts as a pass (subjects passed /
 *       failed on the report).
 *     show_on_report: whether the band appears in the report's grade key
 *       (attainment screen; general bands default true).
 *     An attainment score (e.g. a Grade Book /100) resolves to the band
 *     its score falls in → grade + weight (resultsEngine.bandFor).
 *
 *   GET    /api/v1/erp/grades?scale_type=&class_id=   -> { items: grade_band[] }
 *          (scale_type omitted = both types)
 *   POST   /api/v1/erp/grades             body grade_band minus id -> grade_band
 *   PUT    /api/v1/erp/grades/:id         same body -> grade_band
 *   DELETE /api/v1/erp/grades/:id
 *   Errors: 422 VALIDATION_ERROR (field-led message), 409 GRADE_RANGE_OVERLAP
 *     (the range overlaps another band of the same scale_type in a shared
 *     class), 409 DUPLICATE_GRADE (same grade, same scale_type, in a
 *     shared class), 403 FORBIDDEN (not an
 *     admin), 404 GRADE_NOT_FOUND.
 */

export const GRADE_SCALE_TYPES = ["general", "attainment"] as const;
export type GradeScaleType = (typeof GRADE_SCALE_TYPES)[number];

export type GradeBand = {
  id: string;
  scale_type: GradeScaleType;
  grade: string;
  grade_weight: number;
  /** null = this school doesn't use GPA (the report leaves GPA out). */
  gpa: number | null;
  min_score: number;
  max_score: number;
  remark: string;
  /** The grade counts as a pass (drives subjects passed / failed). */
  is_pass: boolean;
  /** Listed in the report's grade key. */
  show_on_report: boolean;
  class_ids: string[];
};

export type GradeBandInput = Omit<GradeBand, "id">;

export const gradesQueryKey = ["setup", "grades"] as const;
export const gradesQueryKeyFor = (scaleType: GradeScaleType) => [...gradesQueryKey, scaleType] as const;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function gradeBandFromWire(value: unknown): GradeBand | null {
  const r = rec(value);
  if (typeof r.id !== "string" || !r.id) return null;
  return {
    id: r.id,
    scale_type: r.scale_type === "attainment" ? "attainment" : "general",
    grade: typeof r.grade === "string" ? r.grade : "",
    grade_weight: num(r.grade_weight) ?? 0,
    gpa: num(r.gpa),
    min_score: num(r.min_score) ?? 0,
    max_score: num(r.max_score) ?? 0,
    remark: typeof r.remark === "string" ? r.remark : "",
    is_pass: r.is_pass === true,
    show_on_report: r.show_on_report !== false,
    class_ids: Array.isArray(r.class_ids) ? r.class_ids.filter((id): id is string => typeof id === "string") : [],
  };
}

function listFromWire(value: unknown): GradeBand[] | null {
  const items = rec(value).items;
  if (!Array.isArray(items)) return null;
  return items.map(gradeBandFromWire).filter((band): band is GradeBand => band !== null);
}

export function listGrades(scaleType: GradeScaleType): Promise<CrudResult<GradeBand[]>> {
  return examSend("GET", `erp/grades?${new URLSearchParams({ scale_type: scaleType })}`, undefined, listFromWire);
}

/** One CRUD service per scale type (each screen lists only its own bands). */
export function gradesServiceFor(scaleType: GradeScaleType): CrudService<GradeBand, GradeBandInput, GradeBandInput> {
  return {
    queryKey: gradesQueryKeyFor(scaleType),
    // General bands feed results; attainment bands also feed entry options, broadsheets and reports — re-read the Exam module.
    relatedQueryKeys: scaleType === "general" ? [["exam", "results"]] : [["exam"]],
    list: () => listGrades(scaleType),
    create: (data) => examSend("POST", "erp/grades", data, gradeBandFromWire),
    update: (id, data) => examSend("PUT", `erp/grades/${encodeURIComponent(id)}`, data, gradeBandFromWire),
    remove: (id) => examSend("DELETE", `erp/grades/${encodeURIComponent(id)}`, undefined, () => undefined as unknown as void),
  };
}
