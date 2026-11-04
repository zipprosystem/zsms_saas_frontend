import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import type { Exam, ExamKind } from "@/lib/exam/examTypes";
import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import { schoolTypesService } from "@/lib/setup/academicStructure/schoolTypesApi";
import { SEED_CLASS_SCHOOL_TYPE, SEED_CLASSES, SEED_EXAM_CLOSES_ON, SEED_YEARS, seedTerms, termNumber, yearOfTerm } from "@/lib/exam/mock/examMockSeeds";
import { isGradeClass, pickClassStructure, readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Exam List (contract in examApi.ts). Compute-on-read: every class
 * gets its term's exams DERIVED from defaults at read time — never stored —
 * so auto-create can't fall out of step with the assessment structures:
 *   - General: one exam per component of the class's structure (CA 1,
 *     CA 2, Exam…), CA before Exam, named after the component.
 *   - British: 1A (Progress) and 1B (Full).
 * Stored in localStorage: admin edits to any exam (overrides by id) and
 * manually created exams (stage 2). Every mock read of an exam goes
 * through examIndex(), so the entry screens, results, report cards and
 * broadsheets all see the same list.
 */

const STORE_KEY = "zsms.mockExam.examList.v1";

type StoredList = { overrides: Record<string, Partial<Exam>>; manual: Exam[] };

function loadStore(): StoredList {
  const raw = readStore<unknown>(STORE_KEY);
  const overrides = raw.overrides && typeof raw.overrides === "object" ? (raw.overrides as StoredList["overrides"]) : {};
  const manual = Array.isArray(raw.manual) ? (raw.manual as Exam[]) : [];
  return { overrides, manual };
}

function saveStore(store: StoredList): void {
  writeStore(STORE_KEY, store);
}

const CATEGORY_ORDER: Record<ExamKind, number> = { ca: 0, exam: 1 };

type Ordered = { exam: Exam; order: number };

function baseExam(classId: string, termId: string): Omit<Exam, "id" | "name" | "assessment_mode" | "kind" | "category" | "report_variant" | "component_ids" | "entry_closes_on"> {
  return {
    academic_year_id: yearOfTerm(termId),
    term_id: termId,
    class_id: classId,
    result_title: null,
    start_date: null,
    end_date: null,
    duration_hours: null,
    report_date: null,
    status: "active",
    is_auto: true,
    show_grade_book: true,
    show_va: true,
  };
}

/** The exams every class gets for every term, from defaults (General: its structure's components; British: 1A / 1B). */
function autoExams(structures: AssessmentStructure[]): Ordered[] {
  const out: Ordered[] = [];
  for (const year of SEED_YEARS) {
    for (const term of seedTerms(year.id)) {
      const n = termNumber(term.id);
      const [caCloses, examCloses] = SEED_EXAM_CLOSES_ON[term.id] ?? [null, null];
      for (const cls of SEED_CLASSES) {
        const base = baseExam(cls.id, term.id);
        if (isGradeClass(cls.id)) {
          out.push({
            order: 0,
            exam: { ...base, id: `${term.id}-${cls.id}-a`, name: `${n}A`, assessment_mode: "grade_based", kind: null, category: "ca", report_variant: "progress", component_ids: null, entry_closes_on: caCloses },
          });
          out.push({
            order: 1,
            exam: { ...base, id: `${term.id}-${cls.id}-b`, name: `${n}B`, assessment_mode: "grade_based", kind: null, category: "exam", report_variant: "full", component_ids: null, entry_closes_on: examCloses },
          });
          continue;
        }
        const structure = pickClassStructure(cls.id, structures);
        const components = [...(structure?.components ?? [])].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.display_order - b.display_order);
        components.forEach((component, index) => {
          out.push({
            order: index,
            exam: {
              ...base,
              id: `${term.id}-${cls.id}-${component.id}`,
              name: component.name,
              assessment_mode: "component_based",
              kind: component.category,
              category: component.category,
              report_variant: null,
              component_ids: [component.id],
              entry_closes_on: component.category === "ca" ? caCloses : examCloses,
            },
          });
        });
      }
    }
  }
  return out;
}

export type ExamIndex = {
  /** Every exam (drafts included), ordered: term, class, CA before Exam, then the defaults' order, then creation. */
  all: Exam[];
  byId: (id: string) => Exam | undefined;
  /** A class's exams for a term — ACTIVE only (scoreable) unless includeDrafts. */
  forClass: (classId: string, termId: string, options?: { includeDrafts?: boolean }) => Exam[];
};

/** The Exam List as of now: the derived defaults + admin edits + admin-created exams. */
export async function examIndex(): Promise<ExamIndex> {
  const structuresResult = await assessmentStructuresService.list();
  const structures = structuresResult.ok ? structuresResult.data : [];
  const store = loadStore();
  const withEdits = (exam: Exam): Exam => (store.overrides[exam.id] ? { ...exam, ...store.overrides[exam.id], id: exam.id } : exam);
  const rows: Ordered[] = [
    ...autoExams(structures).map(({ exam, order }) => ({ exam: withEdits(exam), order })),
    ...store.manual.map((exam, index) => ({ exam: withEdits(exam), order: 100 + index })),
  ];
  const classOrder = new Map(SEED_CLASSES.map((cls, index) => [cls.id, index]));
  rows.sort(
    (a, b) =>
      a.exam.academic_year_id.localeCompare(b.exam.academic_year_id) ||
      termNumber(a.exam.term_id) - termNumber(b.exam.term_id) ||
      (classOrder.get(a.exam.class_id) ?? 99) - (classOrder.get(b.exam.class_id) ?? 99) ||
      CATEGORY_ORDER[a.exam.category] - CATEGORY_ORDER[b.exam.category] ||
      a.order - b.order,
  );
  const all = rows.map((row) => row.exam);
  return {
    all,
    byId: (id) => all.find((exam) => exam.id === id),
    forClass: (classId, termId, options) =>
      all.filter((exam) => exam.class_id === classId && exam.term_id === termId && (options?.includeDrafts || exam.status === "active")),
  };
}

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

/** GET erp/exams — the entry screens ask for one class's active exams. */
function listExams(index: ExamIndex, query: URLSearchParams): WireResponse {
  const yearId = query.get("academic_year_id");
  const termId = query.get("term_id");
  const classId = query.get("class_id");
  const status = query.get("status");
  const mode = query.get("assessment_mode");
  const items = index.all.filter(
    (exam) =>
      (!yearId || exam.academic_year_id === yearId) &&
      (!termId || exam.term_id === termId) &&
      (!classId || exam.class_id === classId) &&
      (!status || exam.status === status) &&
      (!mode || exam.assessment_mode === mode),
  );
  return ok({ items, total: items.length, page: 1, limit: Math.max(1, items.length), has_more: false });
}

/** GET erp/exams/class-cards — the List page: one card per class. */
async function classCards(index: ExamIndex, query: URLSearchParams): Promise<WireResponse> {
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can manage the Exam List.");
  const yearId = query.get("academic_year_id") || SEED_YEARS.find((year) => year.is_current)?.id || "";
  const termId = query.get("term_id") || "";
  const classId = query.get("class_id") || "";
  const category = query.get("category");
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(query.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.get("limit")) || 12));

  const terms = seedTerms(yearId);
  const typesResult = await schoolTypesService.list();
  const typeNames = new Map(typesResult.ok ? typesResult.data.map((type) => [type.id, type.name]) : []);

  const cards = SEED_CLASSES.filter((cls) => !classId || cls.id === classId).flatMap((cls) => {
    // q: a class name match keeps every term; otherwise a term-name match keeps just those terms.
    const classMatch = !q || cls.name.toLowerCase().includes(q);
    const termIds = new Set(terms.filter((term) => (!termId || term.id === termId) && (classMatch || term.name.toLowerCase().includes(q))).map((term) => term.id));
    if (termIds.size === 0) return [];
    const exams = index.all.filter((exam) => exam.class_id === cls.id && termIds.has(exam.term_id) && (!category || exam.category === category));
    if (!classMatch && exams.length === 0) return [];
    const count = (kind: ExamKind) => {
      const ofKind = exams.filter((exam) => exam.category === kind);
      return { active: ofKind.filter((exam) => exam.status === "active").length, total: ofKind.length };
    };
    const schoolTypeId = SEED_CLASS_SCHOOL_TYPE[cls.id] ?? null;
    return [
      {
        class_id: cls.id,
        class_name: cls.name,
        assessment_mode: isGradeClass(cls.id) ? "grade_based" : "component_based",
        school_type_id: schoolTypeId,
        school_type_name: schoolTypeId ? (typeNames.get(schoolTypeId) ?? null) : null,
        counts: { ca: count("ca"), exam: count("exam") },
        exams,
      },
    ];
  });
  const start = (page - 1) * limit;
  return ok({ items: cards.slice(start, start + limit), total: cards.length, page, limit, has_more: start + limit < cards.length });
}

/** PUT erp/exams/:id — stage 1: the British on-report flags; stage 2 widens it to the full edit. */
function updateExam(index: ExamIndex, examId: string, payload: unknown): WireResponse {
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can change the Exam List.");
  const exam = index.byId(examId);
  if (!exam) return fail(404, "EXAM_NOT_FOUND", "Exam not found");
  if (exam.assessment_mode !== "grade_based") {
    return fail(422, "WRONG_ASSESSMENT_MODE", "Gradebook and Tracking apply to British (grade-based) exams only.");
  }
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const next: Partial<Exam> = {};
  for (const key of ["show_grade_book", "show_va"] as const) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== "boolean") return fail(422, "VALIDATION_ERROR", `${key}: must be true or false`);
    next[key] = body[key] as boolean;
  }
  const store = loadStore();
  saveStore({ ...store, overrides: { ...store.overrides, [examId]: { ...store.overrides[examId], ...next } } });
  return ok({ ...exam, ...next });
}

/** The Exam List endpoints; null when the path isn't one of them. */
export async function handleExamList(method: string, path: string, query: URLSearchParams, payload: unknown): Promise<WireResponse | null> {
  if (path === "erp/exams" && method === "GET") return listExams(await examIndex(), query);
  if (path === "erp/exams/class-cards" && method === "GET") return classCards(await examIndex(), query);
  const match = path.match(/^erp\/exams\/([^/]+)$/);
  if (match && method === "PUT") return updateExam(await examIndex(), decodeURIComponent(match[1]), payload);
  return null;
}
