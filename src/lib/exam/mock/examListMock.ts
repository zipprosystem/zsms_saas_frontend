import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { Exam } from "@/lib/exam/examTypes";
import { SEED_EXAMS } from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Setup › Exam List (contract: PUT erp/exams/:id in examApi.ts).
 * The seeded points with their saved on-report switches (show_grade_book,
 * show_va) applied. Every mock read of an exam goes through mockExams(),
 * so the Academic Report, report cards and Progression all see the flags.
 * Only changed flags are stored (localStorage, per exam id).
 */

type StoredFlags = Partial<Pick<Exam, "show_grade_book" | "show_va">>;

const FLAGS_KEY = "zsms.mockExam.examFlags.v1";

/** The seeded exams with their saved flags. */
export function mockExams(): Exam[] {
  const flags = readStore<StoredFlags>(FLAGS_KEY);
  return SEED_EXAMS.map((exam) => (flags[exam.id] ? { ...exam, ...flags[exam.id] } : exam));
}

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

/** PUT erp/exams/:id — null when the path isn't this endpoint. */
export function handleExamUpdate(method: string, path: string, payload: unknown): WireResponse | null {
  const match = path.match(/^erp\/exams\/([^/]+)$/);
  if (!match || method !== "PUT") return null;
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can change the Exam List.");
  const examId = decodeURIComponent(match[1]);
  const exam = mockExams().find((item) => item.id === examId);
  if (!exam) return fail(404, "EXAM_NOT_FOUND", "Exam not found");
  if (exam.assessment_mode !== "grade_based") {
    return fail(422, "WRONG_ASSESSMENT_MODE", "Grade Book and Value Added apply to British (grade-based) points only.");
  }
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const next: StoredFlags = {};
  for (const key of ["show_grade_book", "show_va"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") return fail(422, "VALIDATION_ERROR", `${key}: must be true or false`);
    next[key] = body[key] as boolean;
  }
  const all = readStore<StoredFlags>(FLAGS_KEY);
  writeStore(FLAGS_KEY, { ...all, [examId]: { ...all[examId], ...next } });
  return ok({ ...exam, ...next });
}
