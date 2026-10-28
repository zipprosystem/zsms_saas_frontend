import type { AssessmentMode, ComponentCategory } from "@/lib/setup/assessmentConfiguration/assessmentStructure";

/**
 * Exam module types — Stage 1b (raw marks entry). Field names follow the
 * Exam backend contract (Exam-Backend-Spec §2.4 / §4, relayed 2026-10-23);
 * see examApi.ts for the endpoints.
 */

/** An exam instance is either a CA sitting or the exam proper — it shows only the structure's components of that category. */
export type ExamKind = ComponentCategory;

export type ExamYearOption = { id: string; name: string; is_current: boolean };
export type ExamTermOption = { id: string; name: string };
export type ExamArmOption = { id: string; name: string };
/**
 * assessment_mode (FLAGGED, proposed): which entry screen the class uses —
 * component_based -> Manage Exam Result (scores), grade_based -> Academic
 * Report (British grades). null/absent = unknown, shown on both screens.
 */
export type ExamClassOption = { id: string; name: string; arms: ExamArmOption[]; assessment_mode: AssessmentMode | null };
/** A subject offered to one class-arm. `scoped` lists are already cut down to the caller's effective_scope by the backend. */
export type ExamSubjectOption = { class_arm_id: string; subject_id: string; subject_name: string };

/** GET erp/exams/entry-options — everything the filter bar needs for one year, scoped to the caller. */
export type ExamEntryOptions = {
  academic_year_id: string;
  years: ExamYearOption[];
  terms: ExamTermOption[];
  classes: ExamClassOption[];
  subjects: ExamSubjectOption[];
  /** true = admin / full scope; false = cut down to the caller's teaching assignments. */
  full_scope: boolean;
};

/**
 * Which Academic Report a grade-based (British) point produces: a short
 * "progress" report or the "full" report. It drives the completed rule
 * (gradeDraft.ts). A school may use the same variant at both of a term's points.
 */
export type ReportVariant = "progress" | "full";

/**
 * An exam point. Each term auto-creates exactly two per assessment mode;
 * names are school-editable. component_based points are framed CA / Exam
 * (`kind`); grade_based (British) points have no CA/Exam framing — they're
 * labelled A/B per term (1A, 1B, 2A…) and carry a `report_variant`.
 */
export type Exam = {
  id: string;
  name: string;
  assessment_mode: AssessmentMode;
  /** component_based only: which of the structure's components the point shows. null on grade_based points. */
  kind: ExamKind | null;
  /** grade_based only: which report this point produces. null on component_based points. */
  report_variant: ReportVariant | null;
  academic_year_id: string;
  term_id: string;
  /** Last day marks may be entered (cutoff). null = no cutoff. */
  entry_closes_on: string | null;
};

/** Keyed by component id (plain component) or sub-field id (broken-down component). null = not entered. */
export type ComponentScores = Record<string, number | null>;

/** One student's row in GET erp/exams/:id/marks. */
export type SubjectMarkRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  seat_no: string;
  component_scores: ComponentScores;
  /** Attendance for this exam; null = not recorded yet. */
  present: boolean | null;
  mark_completed: boolean;
  subject_remark: string;
  entered_by_staff_id: string | null;
  updated_at: string | null;
};

export type SubjectMarksSheet = {
  assessment_mode: "component_based";
  exam: Exam;
  subject_id: string;
  class_arm_id: string;
  /** The structure in force for this class/subject, resolved by the backend. null = none configured. */
  assessment_structure_id: string | null;
  /** false once the exam's cutoff has passed — the grid becomes read-only (PUT would 403). */
  entry_open: boolean;
  items: SubjectMarkRow[];
};

/** One row of the batch PUT body. */
export type SubjectMarkInput = Pick<
  SubjectMarkRow,
  "student_id" | "component_scores" | "present" | "mark_completed" | "subject_remark"
>;

export type SaveMarksInput = { subject_id: string; class_arm_id: string; rows: SubjectMarkInput[] };

// ---------------------------------------------------------------------------
// Grade-based (British) — Stage 1c Academic Report. Same endpoints as the
// score sheet; GET answers with assessment_mode "grade_based" and this shape.
// ---------------------------------------------------------------------------

/**
 * One grade or rating level, best first (e.g. 9…1, U; or 1 Excellent … 4
 * Cause for concern). weight = the grade's numeric value (GCSE 9 → 9, U →
 * 0; KS3 M → 4 … E → 1). Attainment shows as the weight by default (the
 * school's attainment_display setting), and VA = CAG weight − MTG weight.
 * Absent → the level's position counted from the bottom (lowest = 1).
 */
export type ScaleLevel = { code: string; label: string; weight?: number };
export type GradeScale = { id: string; name: string; grades: ScaleLevel[] };
export type RatingScale = { id: string; name: string; levels: ScaleLevel[] };

/** A subject-wise rating domain leaf (Engagement, Learning Behaviour). `key` is the stable domain key; `id` keys component_scores. */
export type RatingDomainLeaf = { id: string; key: string; name: string; rating_scale_id: string };

/**
 * The rating domains the subject-wise Academic Report grid carries. Student-wise
 * domains (Boarding Commitment, Form Tutor, House…) belong to Report
 * Progression (Stage 3), never to a subject grid.
 */
export const SUBJECT_RATING_DOMAIN_KEYS = ["engagement", "learning_behaviour"] as const;

/**
 * The resolved grade_based structure (server-authoritative): one Current
 * Attainment leaf graded on the class's grade scale, plus one leaf per
 * subject-wise rating domain (SUBJECT_RATING_DOMAIN_KEYS). Leaf ids key
 * component_scores.
 */
export type GradeBasedStructure = {
  id: string;
  name: string;
  attainment: { id: string; name: string; grade_scale_id: string };
  rating_domains: RatingDomainLeaf[];
};

/** Grade codes / rating codes keyed by leaf id; null = not entered. */
export type GradeScores = Record<string, string | null>;

export type GradeMarkRow = Omit<SubjectMarkRow, "component_scores"> & {
  component_scores: GradeScores;
  /**
   * Read-only references (Stage 3 manages them), as grade codes: mtg = the
   * student's ONE target grade (Minimum Target Grade — the Target column
   * here and on the Stage 2 Progression broadsheet, where VA = CAG − MTG),
   * and grade_book. There is no second target; labels stay generic (no
   * school-branded names).
   */
  mtg: string | null;
  grade_book: string | null;
};

export type GradeMarksSheet = Omit<SubjectMarksSheet, "assessment_mode" | "items"> & {
  assessment_mode: "grade_based";
  /** Inline — the resolved structure plus the scales its leaves point at. null = none in force. */
  structure: GradeBasedStructure | null;
  grade_scales: GradeScale[];
  rating_scales: RatingScale[];
  items: GradeMarkRow[];
};

/** What GET erp/exams/:id/marks returns — discriminated by assessment_mode. */
export type MarksSheet = SubjectMarksSheet | GradeMarksSheet;

export type GradeMarkInput = Omit<SubjectMarkInput, "component_scores"> & { component_scores: GradeScores };

export type SaveGradeMarksInput = { subject_id: string; class_arm_id: string; rows: GradeMarkInput[] };

export const SUBJECT_REMARK_MAX = 500;
