import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";

/**
 * Setup › Assessment Config › Grades — per-class grade bands. This is what
 * results computation reads (the engine's grade / remark / weight / GPA
 * for a subject total and for a student's average). Admin-gated.
 *
 * Rides the Exam module's transport, so the exam USE_MOCK flag swaps it;
 * with the real transport under the local dev-auth bypass every call
 * returns devBypassUnavailable and the screen shows the "deployed tenant"
 * notice.
 *
 * PROPOSED REST contract (confirm with Muntajir):
 *
 *   grade_band: id, grade, grade_weight, gpa|null, min_score, max_score,
 *               remark, class_ids[]
 *     A band applies to one or more classes (and so to every arm of
 *     them). gpa is OPTIONAL — null = the school doesn't use GPA for that
 *     band; reports show GPA only where it's set. Scores are % (0–100).
 *
 *   GET    /api/v1/erp/grades?class_id=   -> { items: grade_band[] }
 *   POST   /api/v1/erp/grades             body grade_band minus id -> grade_band
 *   PUT    /api/v1/erp/grades/:id         same body -> grade_band
 *   DELETE /api/v1/erp/grades/:id
 *   Errors: 422 VALIDATION_ERROR (field-led message), 409 GRADE_RANGE_OVERLAP
 *     (the range overlaps another band of a shared class), 409
 *     DUPLICATE_GRADE (same grade in a shared class), 403 FORBIDDEN (not an
 *     admin), 404 GRADE_NOT_FOUND.
 */

export type GradeBand = {
  id: string;
  grade: string;
  grade_weight: number;
  /** null = this school doesn't use GPA (the report leaves GPA out). */
  gpa: number | null;
  min_score: number;
  max_score: number;
  remark: string;
  class_ids: string[];
};

export type GradeBandInput = Omit<GradeBand, "id">;

export const gradesQueryKey = ["setup", "grades"] as const;

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
    grade: typeof r.grade === "string" ? r.grade : "",
    grade_weight: num(r.grade_weight) ?? 0,
    gpa: num(r.gpa),
    min_score: num(r.min_score) ?? 0,
    max_score: num(r.max_score) ?? 0,
    remark: typeof r.remark === "string" ? r.remark : "",
    class_ids: Array.isArray(r.class_ids) ? r.class_ids.filter((id): id is string => typeof id === "string") : [],
  };
}

function listFromWire(value: unknown): GradeBand[] | null {
  const items = rec(value).items;
  if (!Array.isArray(items)) return null;
  return items.map(gradeBandFromWire).filter((band): band is GradeBand => band !== null);
}

export function listGrades(): Promise<CrudResult<GradeBand[]>> {
  return examSend("GET", "erp/grades", undefined, listFromWire);
}

export const gradesService: CrudService<GradeBand, GradeBandInput, GradeBandInput> = {
  queryKey: gradesQueryKey,
  // Results are computed from these bands — any change re-reads them.
  relatedQueryKeys: [["exam", "results"]],
  list: listGrades,
  create: (data) => examSend("POST", "erp/grades", data, gradeBandFromWire),
  update: (id, data) => examSend("PUT", `erp/grades/${encodeURIComponent(id)}`, data, gradeBandFromWire),
  remove: (id) => examSend("DELETE", `erp/grades/${encodeURIComponent(id)}`, undefined, () => undefined as unknown as void),
};
