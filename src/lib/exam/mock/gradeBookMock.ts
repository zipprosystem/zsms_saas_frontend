import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { SEED_ASSESSMENT_STRUCTURES } from "@/lib/setup/assessmentConfiguration/mock/assessmentStructuresMockSeeds";
import { bandForTotal, gradeBookColumns, gradeBookResult, type GradeBookBand } from "@/lib/exam/gradeBook/gradeBookMath";
import { allLeaves } from "@/lib/exam/markColumns";
import type { ComponentScores, Exam } from "@/lib/exam/examTypes";
import { classOfArm, generatedGradeBookScores, markKey, readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { classAttainmentBands } from "@/lib/exam/mock/gradesMock";

/**
 * MOCK Grade Book data (contract in gradeBookApi.ts): saved entries in
 * localStorage, laid over GENERATED seed entries for the seeded Grade Book
 * structure (same seed policy as the Academic Report — which points have
 * marks), so Progression / reports / auto-fill have data across terms.
 *
 * Stored per (point, subject, arm, student, grade book) with its total
 * (/100, fixed at save time from the structure then in force); the grade
 * is looked up on READ from the class's attainment score ranges, so
 * changing a range regrades without a re-save.
 */

const STORAGE_KEY = "zsms.mockExam.gradeBook.v1";

export type StoredGradeBook = {
  grade_book_id: string;
  component_scores: ComponentScores;
  total: number | null;
  entered_by_staff_id: string | null;
  updated_at: string | null;
};

/** The seeded Grade Book structure — generated entries use it. */
export const SEED_GRADE_BOOK: AssessmentStructure | undefined = SEED_ASSESSMENT_STRUCTURES.find((structure) => structure.is_grade_book);

let cache: Record<string, StoredGradeBook> | null = null;

export function loadGradeBooks(): Record<string, StoredGradeBook> {
  if (!cache) cache = readStore<StoredGradeBook>(STORAGE_KEY);
  return cache;
}

export function saveGradeBooks(entries: Record<string, StoredGradeBook>): void {
  cache = entries;
  writeStore(STORAGE_KEY, entries);
}

export function gradeBookKey(examId: string, subjectId: string, armId: string, studentId: string, gradeBookId: string): string {
  return `${markKey(examId, subjectId, armId, studentId)}|${gradeBookId}`;
}

/** The class's attainment score ranges as Grade Book bands, best first (empty = none set). */
export function classGradeBookBands(classId: string | null): GradeBookBand[] {
  if (!classId) return [];
  return classAttainmentBands(classId).map((band) => ({
    grade: band.grade,
    label: band.remark || band.grade,
    min: band.min_score,
    max: band.max_score,
    weight: band.grade_weight,
  }));
}

function generated(exam: Exam, subjectId: string, armId: string, studentId: string): StoredGradeBook | null {
  if (!SEED_GRADE_BOOK) return null;
  const groups = gradeBookColumns(SEED_GRADE_BOOK);
  const scores = generatedGradeBookScores(exam, subjectId, armId, studentId, allLeaves(groups));
  if (!scores) return null;
  return {
    grade_book_id: SEED_GRADE_BOOK.id,
    component_scores: scores,
    total: gradeBookResult(groups, scores, []).total,
    entered_by_staff_id: null,
    updated_at: "2026-07-20T09:00:00.000Z",
  };
}

/** One student's entry for a point under one Grade Book: saved first, else the generated seed (seeded Grade Book only). */
export function readGradeBookEntry(exam: Exam, subjectId: string, armId: string, studentId: string, gradeBookId: string): StoredGradeBook | null {
  const saved = loadGradeBooks()[gradeBookKey(exam.id, subjectId, armId, studentId, gradeBookId)];
  if (saved) return saved;
  return gradeBookId === SEED_GRADE_BOOK?.id ? generated(exam, subjectId, armId, studentId) : null;
}

/**
 * THE point's Grade Book for a student/subject, as other screens read it:
 * the most recently saved entry with a total (across Grade Book
 * structures), else the generated seed. Graded on the class's attainment
 * ranges. Doesn't apply exam.show_grade_book — callers do.
 */
export function pointGradeBook(exam: Exam, subjectId: string, armId: string, studentId: string): { total: number; grade: string | null; weight: number | null } | null {
  const prefix = `${markKey(exam.id, subjectId, armId, studentId)}|`;
  const saved = Object.entries(loadGradeBooks())
    .filter(([key]) => key.startsWith(prefix))
    .map(([, entry]) => entry);
  const latest = saved.filter((entry) => entry.total !== null).sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))[0];
  // A saved (even cleared) entry under the seeded Grade Book replaces its generated seed.
  const entry = latest ?? (saved.some((item) => item.grade_book_id === SEED_GRADE_BOOK?.id) ? null : generated(exam, subjectId, armId, studentId));
  if (!entry || entry.total === null) return null;
  const band = bandForTotal(classGradeBookBands(classOfArm(armId)), entry.total);
  return { total: entry.total, grade: band?.grade ?? null, weight: band?.weight ?? null };
}
