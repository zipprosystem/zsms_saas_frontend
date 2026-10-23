import type { ComponentCategory } from "@/lib/setup/assessmentConfiguration/assessmentStructure";

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
export type ExamClassOption = { id: string; name: string; arms: ExamArmOption[] };
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

export type Exam = {
  id: string;
  name: string;
  kind: ExamKind;
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

export const SUBJECT_REMARK_MAX = 500;
