import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import type { TraitMasterKind } from "@/lib/setup/assessmentConfiguration/traitMastersApi";

/**
 * REPORT PROGRESSION — Stage 3: Psychomotor Skill / Affective Domain
 * ratings, student-wise (Figma 2499:352523 / 2499:352196). One modal per
 * kind on the student entry (View Details), General classes, EXAM point
 * only. Same transport / USE_MOCK as Exam.
 *
 * Storage: the student's trait_assessment for the term (the same record
 * the Results traits panel and the report payload read): ratings keyed by
 * trait key -> progress_grade_id. A seeded master item keeps its trait key
 * (`<key>@<school type>` -> key); an item added in Setup is rated by its id.
 *
 * PROPOSED REST contract (names are proposals — reconcile with Muntajir):
 *
 *   GET /api/v1/erp/report-progression/students/:student_id/traits?term_id=&kind=psychomotor|affective
 *     -> StudentTraitEntry (below).
 *     - items: the class's School Type master list for the kind (Setup ›
 *       Psychomotor Skills / Affective Domain), in sort_order, each with
 *       its saved rating (null = unrated; a rating whose level was
 *       deleted reads as null).
 *     - rating_scale: the GENERAL Progress Grade scale (Setup › Progress
 *       Grades), in its order — the columns. Never hardcoded.
 *     - editable (DEC-009, like the report-only header fields): the arm's
 *       directly-assigned class teacher (form tutor), or the
 *       exam.report_progression.traits credential (mock: admin). Other
 *       full-report roles (sectional head) see them read-only.
 *     403 OUT_OF_SCOPE / FORBIDDEN (a subject-only viewer never sees
 *     traits), 404 STUDENT_NOT_FOUND / TERM_NOT_FOUND /
 *     NOT_ENROLLED_FOR_TERM, 422 TRAITS_NOT_APPLICABLE (a British class),
 *     422 VALIDATION_ERROR (kind).
 *
 *   PUT /api/v1/erp/report-progression/students/:student_id/traits
 *     body { term_id, kind, ratings: { <item key>: progress_grade_id | null } }
 *     -> StudentTraitEntry. Only the sent keys change (the other kind and
 *     unsent items are kept). 403 FORBIDDEN when not editable; 422 when a
 *     key isn't on the class's list for the kind or the id isn't a level
 *     of the General Progress Grades.
 *
 * Completeness: the ratings feed the Exam point's "traits" section
 * (reportProgressionApi.ts COMPLETENESS) — each listed item rated.
 */

export type StudentTraitKind = TraitMasterKind;

export type TraitRatingItem = { key: string; label: string; progress_grade_id: string | null };

/** A General Progress Grade level: value = the column heading (5, 4…, W, NI), label = its name. */
export type TraitScaleLevel = { id: string; value: string; label: string };

export type StudentTraitEntry = {
  student: { id: string; name: string; photo_url: string | null };
  class_name: string;
  arm_name: string;
  term_id: string;
  kind: StudentTraitKind;
  items: TraitRatingItem[];
  rating_scale: TraitScaleLevel[];
  editable: boolean;
  updated_at: string | null;
};

export type SaveStudentTraitsInput = {
  term_id: string;
  kind: StudentTraitKind;
  ratings: Record<string, string | null>;
};

export const studentTraitsQueryKey = (studentId: string, termId: string, kind: StudentTraitKind) =>
  ["exam", "report-progression", "traits", studentId, termId, kind] as const;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function entryFromWire(value: unknown): StudentTraitEntry | null {
  const r = rec(value);
  const student = rec(r.student);
  if (typeof student.id !== "string" || !Array.isArray(r.items) || !Array.isArray(r.rating_scale)) return null;
  return {
    student: { id: student.id, name: text(student.name), photo_url: typeof student.photo_url === "string" ? student.photo_url : null },
    class_name: text(r.class_name),
    arm_name: text(r.arm_name),
    term_id: text(r.term_id),
    kind: r.kind === "affective" ? "affective" : "psychomotor",
    items: r.items.map(rec).filter((item) => typeof item.key === "string").map((item) => ({
      key: item.key as string,
      label: text(item.label),
      progress_grade_id: typeof item.progress_grade_id === "string" ? item.progress_grade_id : null,
    })),
    rating_scale: r.rating_scale.map(rec).filter((level) => typeof level.id === "string").map((level) => ({
      id: level.id as string,
      value: text(level.value),
      label: text(level.label),
    })),
    editable: r.editable === true,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

export function getStudentTraitEntry(studentId: string, termId: string, kind: StudentTraitKind): Promise<CrudResult<StudentTraitEntry>> {
  const query = new URLSearchParams({ term_id: termId, kind });
  return examSend("GET", `erp/report-progression/students/${encodeURIComponent(studentId)}/traits?${query}`, undefined, entryFromWire);
}

export function saveStudentTraitEntry(studentId: string, input: SaveStudentTraitsInput): Promise<CrudResult<StudentTraitEntry>> {
  return examSend("PUT", `erp/report-progression/students/${encodeURIComponent(studentId)}/traits`, input, entryFromWire);
}
