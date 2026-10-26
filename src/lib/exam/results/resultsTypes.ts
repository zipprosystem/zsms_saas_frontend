import type { AssessmentMode } from "@/lib/setup/assessmentConfiguration/assessmentStructure";

/**
 * Exam Stage 2a — COMPUTED results (the read side). Every number here is
 * derived by the backend's computation engine from the entered marks
 * (Stage 1b/1c); the screens only display it. See resultsApi.ts for the
 * contract and resultsEngine.ts for the rules.
 */

/**
 * Per student+subject (and rolled up per student):
 *   rng        — enrolled, nothing entered yet ("result not given")
 *   incomplete — some fields entered, some still blank (blank counts as 0)
 *   ready      — every field in
 *   ne         — EXPLICITLY not enrolled in the subject (a missing enrolment record is never NE)
 */
export const RESULT_STATUSES = ["rng", "incomplete", "ready", "ne"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

export const RESULTS_VIEWS = ["all", "grades", "gpa"] as const;
export type ResultsView = (typeof RESULTS_VIEWS)[number];

/** One band of a score grade scale (General classes). Bands are best first; a total belongs to the first band whose `min` it reaches. */
export type ScoreBand = {
  grade: string;
  min: number;
  max: number;
  remark: string;
  grade_weight: number;
  gpa: number;
};

export type ScoreGradeScale = { id: string; name: string; bands: ScoreBand[] };

/** Optional Ranking Rules config (Setup, not built yet). Absent = standard competition ranking. */
export type RankingRules = { method: "competition" | "dense" };

/** A subject column of the class results — what the table's columns are built from. */
export type ResultSubjectColumn = {
  subject_id: string;
  subject_name: string;
  /** Subject units for GPA weighting; null = not set (weighs 1). */
  unit: number | null;
};

/**
 * subject_result — one student × subject × term. General (component_based)
 * classes fill total…subject_position; British (grade_based) classes fill
 * cag / mtg / va. Fields a view doesn't need are omitted from the wire
 * (lean payloads) and read back as null.
 */
export type SubjectResult = {
  subject_id: string;
  status: ResultStatus;
  /** Out of 100 (normalised to the structure's max). */
  total: number | null;
  grade: string | null;
  grade_weight: number | null;
  gpa: number | null;
  remark: string | null;
  /** Rank within the class-arm by subject total (ties share; next rank skips). null when not ranked (RNG / NE). */
  subject_position: number | null;
  /** British: current attainment grade — the term's latest point with an attainment entered. */
  cag: string | null;
  /** British: the student's target grade (reference). */
  mtg: string | null;
  /** British: value added = CAG − MTG in grade steps on the class scale (+ above target, − below, 0 on target). */
  va: number | null;
  /** General: Σ this subject's totals (this + earlier terms with results) ÷ terms actually enrolled. */
  cumulative_average: number | null;
  /** General: the cumulative average's grade. British: the cumulative attainment grade. */
  cumulative_grade: string | null;
  /** The divisor used: terms enrolled (General) / terms with an attainment grade (British). */
  cumulative_terms: number | null;
};

/** student_term_result — one student × term, rolled up from their subject results. */
export type StudentTermResult = {
  status: ResultStatus;
  grand_total: number | null;
  average: number | null;
  /** Rank by average within the arm. null for RNG students and British classes. */
  class_position: number | null;
  overall_grade: string | null;
  /** Σ(subject gpa × units) ÷ Σ units, null units weighing 1. */
  gpa: number | null;
  /** Mean of the subjects' cumulative averages. */
  cumulative_average: number | null;
  /** How many subjects the average divides by (those with a result). */
  subjects_counted: number;
};

export type ClassResultRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  /** Keyed by subject_id; a subject with no entry here isn't offered to the student. */
  subjects: Record<string, SubjectResult>;
  aggregate: StudentTermResult;
};

/** GET erp/results — the computed class results for one arm and term (one page of students). */
export type ClassResults = {
  assessment_mode: AssessmentMode;
  view: ResultsView;
  academic_year_id: string;
  term_id: string;
  term_name: string;
  class_arm_id: string;
  class_name: string;
  arm_name: string;
  /** The class's grade scale name (score bands for General, attainment scale for British). */
  grade_scale_name: string | null;
  subjects: ResultSubjectColumn[];
  /** Students ranked in this arm (positions are "of" this). */
  ranked_count: number;
  items: ClassResultRow[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
};

/** GET erp/results/:student_id — one student's full computed result for a term. */
export type StudentResult = {
  assessment_mode: AssessmentMode;
  academic_year_id: string;
  term_id: string;
  term_name: string;
  class_arm_id: string;
  class_name: string;
  arm_name: string;
  grade_scale_name: string | null;
  student: { id: string; name: string; admission_no: string };
  subjects: Array<SubjectResult & ResultSubjectColumn>;
  aggregate: StudentTermResult;
  ranked_count: number;
};
