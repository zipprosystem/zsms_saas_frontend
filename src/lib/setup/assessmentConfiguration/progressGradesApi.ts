import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";

/**
 * Setup › Assessment Config › Progress Grades — the rating levels used for
 * student-wise traits and the British rating domains' report descriptors.
 * Two scales, one per assessment mode (the `mode` discriminator):
 *   - general: rates Psychomotor and Affective traits (View Results ›
 *     traits pop-up); General report cards show the level's value and
 *     name. Levels only — no descriptors.
 *   - british: the levels for Engagement, Learning Behaviour and Boarding —
 *     the Academic Report's Engagement / Learning Behaviour selects save a
 *     level BY ID; British report cards print its descriptors.
 * Admin-gated. Rides the Exam module's transport, so the exam USE_MOCK
 * flag swaps it.
 *
 * PROPOSED REST contract (confirm with Muntajir):
 *
 *   progress_grade: id, mode, name, value, hide_in_report,
 *                   descriptors: { <domain>: string }
 *     mode: "general" | "british" (required; can't change on PUT).
 *     name + value: required, each UNIQUE within the mode's scale (both
 *       case-insensitive). value: alphanumeric text, 1–4 letters or
 *       digits (e.g. A–D or 1–5). The number of levels is up to the
 *       school.
 *     descriptors: BRITISH only — OPTIONAL, per domain (engagement,
 *       learning_behaviour, boarding), ≤ 300 characters each. A General
 *       level has none: descriptors is {} (any key → 422).
 *     hide_in_report: the level still counts everywhere (entry, status,
 *       computation) but the report card suppresses it entirely — its
 *       label, value and descriptor, in the rating key and wherever a
 *       rating at that level would print.
 *     Listed best level first, both scales: ascending value, digits
 *     compared as numbers (1 = best / A = best; "2" before "10").
 *
 *   GET    /api/v1/erp/progress-grades?mode=   -> { items: progress_grade[] }
 *   POST   /api/v1/erp/progress-grades         body progress_grade minus id
 *   PUT    /api/v1/erp/progress-grades/:id     same body
 *   DELETE /api/v1/erp/progress-grades/:id
 *   Errors: 422 VALIDATION_ERROR (field-led), 409 DUPLICATE_LEVEL_NAME,
 *     409 DUPLICATE_LEVEL_VALUE, 409 PROGRESS_GRADE_IN_USE (DELETE: a
 *     saved trait or Academic Report rating references it), 403 FORBIDDEN (not an admin),
 *     404 PROGRESS_GRADE_NOT_FOUND.
 *
 * Ratings reference a level BY ID — traits (PUT erp/results/:id/traits
 * ratings: { trait_key: progress_grade_id | null }) and the Academic
 * Report's rating domains (component_scores: { <domain leaf id>:
 * progress_grade_id }) — so renaming a level or changing its value never
 * orphans a saved rating.
 */

export const PROGRESS_GRADE_MODES = ["general", "british"] as const;
export type ProgressGradeMode = (typeof PROGRESS_GRADE_MODES)[number];

/** Descriptor domains per scale: only the British scale has descriptors. */
export const PROGRESS_DOMAINS = {
  general: [],
  british: ["engagement", "learning_behaviour", "boarding"],
} as const satisfies Record<ProgressGradeMode, readonly string[]>;
export type ProgressDomain = (typeof PROGRESS_DOMAINS)["british"][number];

export const PROGRESS_DESCRIPTOR_MAX = 300;
export const PROGRESS_NAME_MAX = 40;
export const PROGRESS_VALUE_MAX = 4;
/** A level's value: 1–4 letters or digits (A, B… or 1, 2…). */
export const PROGRESS_VALUE_PATTERN = /^[A-Za-z0-9]{1,4}$/;

/** Best-first order of two level values: ascending, digits as numbers, case-insensitive (1 before 2 before 10; A before B). */
export function compareProgressValues(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

/** Same value within a scale: "a" and "A" clash, as do "1" and "01". */
export function sameProgressValue(a: string, b: string): boolean {
  return compareProgressValues(a, b) === 0;
}

export type ProgressGrade = {
  id: string;
  mode: ProgressGradeMode;
  name: string;
  /** Alphanumeric (A, 1…); best first = ascending. */
  value: string;
  hide_in_report: boolean;
  /** British only (General is always {}); a missing / empty domain = no descriptor. */
  descriptors: Partial<Record<ProgressDomain, string>>;
};

export type ProgressGradeInput = Omit<ProgressGrade, "id">;

export const progressGradesQueryKey = ["setup", "progressGrades"] as const;
export const progressGradesQueryKeyFor = (mode: ProgressGradeMode) => [...progressGradesQueryKey, mode] as const;

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function progressGradeFromWire(wire: unknown): ProgressGrade | null {
  const r = rec(wire);
  // value is text; a backend still sending a number is read as its digits.
  const value = typeof r.value === "string" ? r.value.trim() : typeof r.value === "number" && Number.isFinite(r.value) ? String(r.value) : "";
  if (typeof r.id !== "string" || !r.id || !value) return null;
  const mode: ProgressGradeMode = r.mode === "british" ? "british" : "general";
  const sent = rec(r.descriptors);
  const descriptors: ProgressGrade["descriptors"] = {};
  const domains: readonly ProgressDomain[] = PROGRESS_DOMAINS[mode];
  for (const domain of domains) {
    const text = sent[domain];
    if (typeof text === "string" && text.trim()) descriptors[domain] = text;
  }
  return {
    id: r.id,
    mode,
    name: typeof r.name === "string" ? r.name : "",
    value,
    hide_in_report: r.hide_in_report === true,
    descriptors,
  };
}

function listFromWire(value: unknown): ProgressGrade[] | null {
  const items = rec(value).items;
  if (!Array.isArray(items)) return null;
  return items.map(progressGradeFromWire).filter((level): level is ProgressGrade => level !== null);
}

export function listProgressGrades(mode: ProgressGradeMode): Promise<CrudResult<ProgressGrade[]>> {
  return examSend("GET", `erp/progress-grades?${new URLSearchParams({ mode })}`, undefined, listFromWire);
}

/** One CRUD service per scale (each tab lists only its own levels). */
export function progressGradesServiceFor(mode: ProgressGradeMode): CrudService<ProgressGrade, ProgressGradeInput, ProgressGradeInput> {
  return {
    queryKey: progressGradesQueryKeyFor(mode),
    // Trait entry, results traits status and report cards read these levels.
    relatedQueryKeys: [["exam", "results"]],
    list: () => listProgressGrades(mode),
    create: (data) => examSend("POST", "erp/progress-grades", data, progressGradeFromWire),
    update: (id, data) => examSend("PUT", `erp/progress-grades/${encodeURIComponent(id)}`, data, progressGradeFromWire),
    remove: (id) => examSend("DELETE", `erp/progress-grades/${encodeURIComponent(id)}`, undefined, () => undefined as unknown as void),
  };
}
