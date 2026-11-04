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

export type ExamStatus = "draft" | "active";

/**
 * An exam on the Exam List (Academics › Exam › List). Exams are per CLASS
 * (every arm of the class shares them) and per term. Each term
 * auto-creates its exams with defaults (is_auto):
 *   - General (component_based): one exam per component of the class's
 *     assessment structure — CA 1, CA 2, Exam … — CA before Exam, named
 *     after the component (`component_ids` = that one component).
 *   - British (grade_based): points 1A (Progress) and 1B (Full) per term.
 * An admin can create more and edit any. Only ACTIVE exams are scoreable
 * (the entry screens' selectors list them); a manually created exam is a
 * DRAFT until its wizard's Step 2 is completed.
 */
export type Exam = {
  id: string;
  /** Exam Title — the name the entry selectors show (General default: the component's name; British: 1A / 1B). */
  name: string;
  assessment_mode: AssessmentMode;
  /** component_based only: the category of the components this exam shows (= category). null on grade_based points. */
  kind: ExamKind | null;
  /** Exam category: "exam" | "ca" (CA / Half-Term). British: 1A = ca, 1B = exam by default. */
  category: ExamKind;
  /** grade_based only: which report this point produces. null on component_based points. */
  report_variant: ReportVariant | null;
  academic_year_id: string;
  term_id: string;
  class_id: string;
  /** component_based only: the assessment components this exam covers (one). null on grade_based points. */
  component_ids: string[] | null;
  /** Prints on the report under the school header (e.g. "First Term Final Examination"). null = not set. */
  result_title: string | null;
  start_date: string | null;
  end_date: string | null;
  /** Duration in hours. null = not set. */
  duration_hours: number | null;
  /** The result-issue date (prints by the signature on the report). null = not set. */
  report_date: string | null;
  /** Last day marks may be entered (cutoff). null = no cutoff. */
  entry_closes_on: string | null;
  status: ExamStatus;
  /** true = created automatically for the term (defaults); false = created by an admin. */
  is_auto: boolean;
  /**
   * grade_based only ("Gradebook" on the form): whether this point's Grade
   * Book shows (Academic Report GB column, report card, Progression).
   * Default true. Display only — the Grade Book data is kept.
   */
  show_grade_book: boolean;
  /**
   * grade_based only ("Tracking" on the form): whether Value Added
   * (CAG − MTG) shows. Default true. A report reads its own point's flag;
   * a Progression term reads its last point's. Display only.
   */
  show_va: boolean;
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
/**
 * A level of a grade or rating scale. Grade scales: weight = the grade's
 * point value. Rating scales (British Progress Grades): code = the
 * progress_grade_id, label = its name, value = its value (alphanumeric text).
 */
export type ScaleLevel = { code: string; label: string; weight?: number; value?: string };
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

/** A point's Grade Book as other screens read it: the /100 total and its attainment grade (null = no score range matches). */
export type GradeBookRef = { total: number; grade: string | null };

export type GradeMarkRow = Omit<SubjectMarkRow, "component_scores"> & {
  component_scores: GradeScores;
  /**
   * Read-only reference (Stage 3 manages it), as a grade code: the
   * student's ONE target grade (Minimum Target Grade — the Target column
   * here and on the Progression broadsheet, where VA = CAG − MTG). There is
   * no second target; labels stay generic (no school-branded names).
   */
  mtg: string | null;
  /** This point's Grade Book (Grade Book entry page); null = not entered or hidden (exam.show_grade_book off). */
  grade_book: GradeBookRef | null;
  /** The attainment shown was auto-filled from the Grade Book (not a saved entry). */
  attainment_auto: boolean;
};

export type GradeMarksSheet = Omit<SubjectMarksSheet, "assessment_mode" | "items"> & {
  assessment_mode: "grade_based";
  /** The class's "auto-fill attainment from Grade Book" setting. */
  auto_fill_attainment: boolean;
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
