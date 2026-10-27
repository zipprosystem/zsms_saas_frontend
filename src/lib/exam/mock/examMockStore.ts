import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { allLeaves, buildMarkColumns } from "@/lib/exam/markColumns";
import type { Exam, GradeBasedStructure, GradeMarkRow, SubjectMarkRow } from "@/lib/exam/examTypes";
import {
  SEED_ARM_SUBJECTS,
  SEED_CLASS_GRADE_STRUCTURE,
  SEED_CLASS_TEACHERS,
  SEED_CLASS_STRUCTURE,
  SEED_CLASSES,
  SEED_GRADE_SCALES,
  SEED_GRADE_STRUCTURES,
  SEED_SECTIONAL_HEADS,
  SEED_TEACHERS,
  seedHash,
  seedRoster,
  termNumber,
  yearOfTerm,
} from "@/lib/exam/mock/examMockSeeds";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Exam data layer shared by the marks endpoints (Stage 1b/1c) and the
 * results engine (Stage 2a): scope, structure resolution, and the two mark
 * stores.
 *
 * Marks = what was saved through entry (localStorage, per mark) laid over
 * deterministic GENERATED seed marks, so the results have data across
 * terms without filling storage. Generated policy:
 *   - 2025/2026: every point of every term entered for every enrolled
 *     student — except the 7th student in each arm, who has one blank field
 *     at the term-3 second point (-> incomplete), and the 9th student of
 *     JSS 1 A, who has nothing for Basic Science in term 3 (-> RNG).
 *   - 2026/2027 term 1 (in progress): the first point (CA / A) for all but
 *     the 10th student (-> RNG); the second point (Exam / B) for the first five.
 *   - Later terms: nothing.
 */

export const STORAGE_KEY = "zsms.mockExam.marks.v1";
// v2: grade points moved to A/B per term and Boarding Commitment left the subject grid (2026-10-26).
export const GRADE_STORAGE_KEY = "zsms.mockExam.academicReport.v2";

export type StoredMark = Pick<
  SubjectMarkRow,
  "component_scores" | "present" | "mark_completed" | "subject_remark" | "entered_by_staff_id" | "updated_at"
>;

export type StoredGradeMark = Pick<
  GradeMarkRow,
  "component_scores" | "present" | "mark_completed" | "subject_remark" | "entered_by_staff_id" | "updated_at"
>;

export function markKey(examId: string, subjectId: string, armId: string, studentId: string): string {
  return `${examId}|${subjectId}|${armId}|${studentId}`;
}

export function readStore<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, T>;
  } catch {
    // Corrupt JSON / storage disabled — fall back to generated marks only.
  }
  return {};
}

export function writeStore(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort; the in-memory copy still works for this session.
  }
}

let scoreCache: Record<string, StoredMark> | null = null;
let gradeCache: Record<string, StoredGradeMark> | null = null;

/** Marks saved through Manage Exam Result (overrides of the generated ones). */
export function loadMarks(): Record<string, StoredMark> {
  if (!scoreCache) scoreCache = readStore<StoredMark>(STORAGE_KEY);
  return scoreCache;
}

export function saveMarks(marks: Record<string, StoredMark>): void {
  scoreCache = marks;
  writeStore(STORAGE_KEY, marks);
}

/** Entries saved through the Academic Report (overrides of the generated ones). */
export function loadGradeMarks(): Record<string, StoredGradeMark> {
  if (!gradeCache) gradeCache = readStore<StoredGradeMark>(GRADE_STORAGE_KEY);
  return gradeCache;
}

export function saveGradeMarks(marks: Record<string, StoredGradeMark>): void {
  gradeCache = marks;
  writeStore(GRADE_STORAGE_KEY, marks);
}

// ---------------------------------------------------------------------------
// Scope + structures
// ---------------------------------------------------------------------------

export function inScope(subjectId: string, armId: string): boolean {
  const actor = getMockActingAs();
  if (actor === MOCK_ADMIN) return true;
  const teacher = SEED_TEACHERS.find((item) => item.id === actor);
  return !!teacher?.assignments.some((a) => a.subject_id === subjectId && a.class_arm_id === armId);
}

/** The caller's role on one arm's results (null = no access). Most senior role wins. */
export type ArmRole = "admin" | "sectional_head" | "class_teacher" | "subject_teacher";

export function armRole(armId: string): ArmRole | null {
  const actor = getMockActingAs();
  if (actor === MOCK_ADMIN) return "admin";
  const classId = classOfArm(armId);
  if (classId && SEED_SECTIONAL_HEADS.some((head) => head.id === actor && head.class_ids.includes(classId))) return "sectional_head";
  if (SEED_CLASS_TEACHERS[armId] === actor) return "class_teacher";
  const teacher = SEED_TEACHERS.find((item) => item.id === actor);
  return teacher?.assignments.some((a) => a.class_arm_id === armId) ? "subject_teacher" : null;
}

/**
 * Arm-level scope for results: admin = every arm; sectional head = their
 * classes' arms; class teacher = their arm; a subject teacher = arms they
 * teach any subject in.
 */
export function armInScope(armId: string): boolean {
  return armRole(armId) !== null;
}

/** The subjects the caller teaches in the arm (what a subject teacher's report view is limited to). */
export function taughtSubjects(armId: string): string[] {
  const teacher = SEED_TEACHERS.find((item) => item.id === getMockActingAs());
  const offered = new Set((SEED_ARM_SUBJECTS[armId] ?? []).map((offer) => offer.subject_id));
  return (teacher?.assignments ?? []).filter((a) => a.class_arm_id === armId && offered.has(a.subject_id)).map((a) => a.subject_id);
}

export function classOfArm(armId: string): string | null {
  return SEED_CLASSES.find((cls) => cls.arms.some((arm) => arm.id === armId))?.id ?? null;
}

export async function resolveStructure(armId: string): Promise<AssessmentStructure | null> {
  const result = await assessmentStructuresService.list();
  if (!result.ok) return null;
  const active = result.data.filter((structure) => structure.is_active);
  const classId = classOfArm(armId);
  const mappedId = classId ? SEED_CLASS_STRUCTURE[classId] : undefined;
  return active.find((structure) => structure.id === mappedId) ?? active.find((structure) => structure.is_default) ?? null;
}

/** The grade_based structure in force for the arm's class, or null when the class reports by scores. */
export function resolveGradeStructure(armId: string): GradeBasedStructure | null {
  const classId = classOfArm(armId);
  const id = classId ? SEED_CLASS_GRADE_STRUCTURE[classId] : undefined;
  return SEED_GRADE_STRUCTURES.find((structure) => structure.id === id) ?? null;
}

export function isGradeClass(classId: string): boolean {
  return !!SEED_CLASS_GRADE_STRUCTURE[classId];
}

// ---------------------------------------------------------------------------
// Generated seed marks
// ---------------------------------------------------------------------------

type SeedPolicy = { entered: boolean; blankLeaf: boolean };

/** Which points have generated marks (see the policy in the header). */
function seedPolicy(exam: Exam, armId: string, subjectId: string, studentIndex: number): SeedPolicy {
  const none = { entered: false, blankLeaf: false };
  const year = yearOfTerm(exam.term_id);
  const term = termNumber(exam.term_id);
  const secondPoint = exam.kind === "exam" || exam.id.endsWith("-b");
  if (year === "y-2025") {
    if (term === 3 && armId === "arm-jss1-a" && subjectId === "sub-bsc" && studentIndex === 8) return none;
    return { entered: true, blankLeaf: term === 3 && secondPoint && studentIndex === 6 };
  }
  if (year === "y-2026" && term === 1) {
    if (studentIndex === 9) return none;
    if (!secondPoint) return { entered: true, blankLeaf: false };
    return { entered: studentIndex < 5, blankLeaf: false };
  }
  return none;
}

/** 0..1 performance for a student/subject/point: a stable per-student ability plus subject and point noise. */
function performance(studentId: string, subjectId: string, examId: string, salt: string): number {
  const ability = 0.32 + (seedHash(studentId) % 62) / 100;
  const subject = ((seedHash(studentId + subjectId) % 21) - 10) / 100;
  const noise = ((seedHash(studentId + subjectId + examId + salt) % 15) - 7) / 100;
  return Math.min(1, Math.max(0, ability + subject + noise));
}

function studentIndexOf(armId: string, studentId: string): number {
  return seedRoster(armId).findIndex((student) => student.id === studentId);
}

const SEED_COMMENTS = ["Consistent effort this term.", "Good progress; keep practising.", "Needs to revise core topics.", "Participates well in class."];

function generatedScoreMark(exam: Exam, subjectId: string, armId: string, studentId: string, structure: AssessmentStructure | null): StoredMark | null {
  if (!structure || !exam.kind) return null;
  const index = studentIndexOf(armId, studentId);
  const policy = seedPolicy(exam, armId, subjectId, index);
  if (!policy.entered) return null;
  const leaves = allLeaves(buildMarkColumns(structure, exam.kind));
  if (leaves.length === 0) return null;
  const scores = Object.fromEntries(
    leaves.map((leaf, i) => [
      leaf.id,
      policy.blankLeaf && i === leaves.length - 1 ? null : Math.round(performance(studentId, subjectId, exam.id, leaf.id) * leaf.max),
    ]),
  );
  return {
    component_scores: scores,
    present: true,
    mark_completed: !policy.blankLeaf,
    // The Exam point carries the subject comment (it prints on the Full report).
    subject_remark: exam.kind === "exam" ? SEED_COMMENTS[seedHash(studentId + subjectId + exam.id) % SEED_COMMENTS.length] : "",
    entered_by_staff_id: null,
    updated_at: "2026-07-20T09:00:00.000Z",
  };
}

function generatedGradeMark(exam: Exam, subjectId: string, armId: string, studentId: string, structure: GradeBasedStructure | null): StoredGradeMark | null {
  if (!structure) return null;
  const index = studentIndexOf(armId, studentId);
  const policy = seedPolicy(exam, armId, subjectId, index);
  if (!policy.entered) return null;
  const scale = SEED_GRADE_SCALES.find((item) => item.id === structure.attainment.grade_scale_id);
  const codes = (scale?.grades ?? []).map((grade) => grade.code).filter((code) => code !== "U");
  if (codes.length === 0) return null;
  const level = performance(studentId, subjectId, exam.id, "att");
  const attainment = codes[Math.min(codes.length - 1, Math.max(0, Math.round((1 - level) * (codes.length - 1))))];
  const rating = (salt: string) => {
    const value = performance(studentId, subjectId, exam.id, salt);
    return value > 0.8 ? "1" : value > 0.6 ? "2" : value > 0.45 ? "3" : "4";
  };
  const domains = structure.rating_domains;
  const scores: Record<string, string | null> = { [structure.attainment.id]: attainment };
  domains.forEach((domain, i) => {
    scores[domain.id] = policy.blankLeaf && i === domains.length - 1 ? null : rating(domain.key);
  });
  return {
    component_scores: scores,
    present: true,
    mark_completed: !policy.blankLeaf,
    subject_remark: exam.report_variant === "full" ? SEED_COMMENTS[seedHash(studentId + subjectId + exam.id) % SEED_COMMENTS.length] : "",
    entered_by_staff_id: null,
    updated_at: "2026-07-20T09:00:00.000Z",
  };
}

/** A student's score mark for one point: saved entry first, else the generated seed. */
export function readScoreMark(exam: Exam, subjectId: string, armId: string, studentId: string, structure: AssessmentStructure | null): StoredMark | null {
  return loadMarks()[markKey(exam.id, subjectId, armId, studentId)] ?? generatedScoreMark(exam, subjectId, armId, studentId, structure);
}

/** A student's Academic Report entry for one point: saved entry first, else the generated seed. */
export function readGradeMark(exam: Exam, subjectId: string, armId: string, studentId: string, structure: GradeBasedStructure | null): StoredGradeMark | null {
  return loadGradeMarks()[markKey(exam.id, subjectId, armId, studentId)] ?? generatedGradeMark(exam, subjectId, armId, studentId, structure);
}
