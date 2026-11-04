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
 * Stored in localStorage: admin edits to an auto exam (overrides by id)
 * and manually created exams (drafts until completed). Every mock read of an exam goes
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

// ----- Create / Edit (the wizard) -----

const NAME_MAX = 60;
const RESULT_TITLE_MAX = 150;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function invalid(field: string, message: string): WireResponse {
  return fail(422, "VALIDATION_ERROR", `${field}: ${message}`);
}

async function classComponents(classId: string): Promise<AssessmentStructure["components"]> {
  if (isGradeClass(classId)) return [];
  const result = await assessmentStructuresService.list();
  return pickClassStructure(classId, result.ok ? result.data : [])?.components ?? [];
}

/** Components already covered by an exam of the class that term (drafts count), minus the exam being edited. */
function takenComponents(index: ExamIndex, classId: string, termId: string, exceptId?: string): Set<string> {
  return new Set(index.forClass(classId, termId, { includeDrafts: true }).filter((exam) => exam.id !== exceptId).flatMap((exam) => exam.component_ids ?? []));
}

/** GET erp/exams/form-options — the class's components (General) and which are taken that term. */
async function formOptions(index: ExamIndex, query: URLSearchParams): Promise<WireResponse> {
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can manage the Exam List.");
  const classId = query.get("class_id") ?? "";
  const termId = query.get("term_id") ?? "";
  if (!SEED_CLASSES.some((cls) => cls.id === classId)) return fail(404, "CLASS_NOT_FOUND", "Class not found");
  const components = (await classComponents(classId)).map((component) => ({ id: component.id, name: component.name, category: component.category, max: component.max }));
  return ok({
    class_id: classId,
    assessment_mode: isGradeClass(classId) ? "grade_based" : "component_based",
    components,
    taken_component_ids: Array.from(takenComponents(index, classId, termId)),
  });
}

type ParsedInput = Omit<Exam, "id" | "assessment_mode" | "kind" | "entry_closes_on" | "status" | "is_auto">;

function optionalText(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Validates an ExamInput body; `self` = the exam being edited (null on create). */
async function parseInput(index: ExamIndex, payload: unknown, self: Exam | null): Promise<ParsedInput | WireResponse> {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const category = body.category;
  if (category !== "exam" && category !== "ca") return invalid("category", 'must be "exam" or "ca"');
  const yearId = typeof body.academic_year_id === "string" ? body.academic_year_id : "";
  if (!SEED_YEARS.some((year) => year.id === yearId)) return invalid("academic_year_id", "not a session of this school");
  const termId = typeof body.term_id === "string" ? body.term_id : "";
  if (!seedTerms(yearId).some((term) => term.id === termId)) return invalid("term_id", "not a term of that session");
  const classId = typeof body.class_id === "string" ? body.class_id : "";
  if (!SEED_CLASSES.some((cls) => cls.id === classId)) return invalid("class_id", "class not found");
  const british = isGradeClass(classId);

  const componentIds = Array.isArray(body.component_ids) ? body.component_ids.filter((id): id is string => typeof id === "string") : null;
  if (self) {
    const sameComponents = JSON.stringify(self.component_ids ?? null) === JSON.stringify(british ? null : componentIds);
    if (self.academic_year_id !== yearId || self.term_id !== termId || self.class_id !== classId || self.category !== category || !sameComponents) {
      return fail(422, "IDENTITY_LOCKED", "Session, term, class, exam category and component can't change once an exam exists.");
    }
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return invalid("name", "is required");
  if (name.length > NAME_MAX) return invalid("name", `at most ${NAME_MAX} characters`);
  const clash = index.forClass(classId, termId, { includeDrafts: true }).some((exam) => exam.id !== self?.id && exam.name.toLowerCase() === name.toLowerCase());
  if (clash) return invalid("name", "another exam of this class and term already has this title");
  const resultTitle = optionalText(body, "result_title");
  if (resultTitle && resultTitle.length > RESULT_TITLE_MAX) return invalid("result_title", `at most ${RESULT_TITLE_MAX} characters`);

  const dates: Record<"start_date" | "end_date" | "report_date", string | null> = { start_date: null, end_date: null, report_date: null };
  for (const key of ["start_date", "end_date", "report_date"] as const) {
    const value = optionalText(body, key);
    if (value && !DATE.test(value)) return invalid(key, "must be a date (YYYY-MM-DD)");
    dates[key] = value;
  }
  if (dates.start_date && dates.end_date && dates.end_date < dates.start_date) return invalid("end_date", "can't be before the start date");
  let duration: number | null = null;
  if (body.duration_hours !== null && body.duration_hours !== undefined && body.duration_hours !== "") {
    duration = Number(body.duration_hours);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24) return invalid("duration_hours", "must be more than 0 and at most 24 hours");
  }

  let reportVariant: Exam["report_variant"] = null;
  let components: string[] | null = null;
  if (british) {
    if (body.report_variant !== "progress" && body.report_variant !== "full") return invalid("report_variant", 'must be "progress" or "full"');
    reportVariant = body.report_variant;
  } else {
    if (!componentIds || componentIds.length !== 1) return invalid("component_ids", "pick one assessment component");
    const component = (await classComponents(classId)).find((item) => item.id === componentIds[0]);
    if (!component) return invalid("component_ids", "not a component of this class's assessment");
    if (component.category !== category) return invalid("component_ids", "the component's category doesn't match the exam category");
    if (!self && takenComponents(index, classId, termId).has(component.id)) {
      return fail(422, "COMPONENT_TAKEN", `component_ids: ${component.name} already has an exam this term`);
    }
    components = [component.id];
  }

  return {
    name,
    category,
    report_variant: reportVariant,
    academic_year_id: yearId,
    term_id: termId,
    class_id: classId,
    component_ids: components,
    result_title: resultTitle,
    start_date: dates.start_date,
    end_date: dates.end_date,
    duration_hours: duration,
    report_date: dates.report_date,
    // Gradebook / Tracking are British; a General exam keeps the defaults.
    show_grade_book: british ? body.show_grade_book !== false : true,
    show_va: british ? body.show_va !== false : true,
  };
}

/** POST erp/exams — a manual exam, listed as a DRAFT until its wizard is completed. */
async function createExam(index: ExamIndex, payload: unknown): Promise<WireResponse> {
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can manage the Exam List.");
  const parsed = await parseInput(index, payload, null);
  if ("status" in parsed && "body" in parsed) return parsed;
  const input = parsed as ParsedInput;
  const british = isGradeClass(input.class_id);
  const [caCloses, examCloses] = SEED_EXAM_CLOSES_ON[input.term_id] ?? [null, null];
  const exam: Exam = {
    ...input,
    id: `exm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    assessment_mode: british ? "grade_based" : "component_based",
    kind: british ? null : input.category,
    // FLAGGED: cutoffs belong to Cutoff Management (not built) — a new exam takes its term's default.
    entry_closes_on: input.category === "ca" ? caCloses : examCloses,
    status: "draft",
    is_auto: false,
  };
  const store = loadStore();
  saveStore({ ...store, manual: [...store.manual, exam] });
  return ok(exam);
}

/** PUT erp/exams/:id — the wizard's Step 1 on an existing exam (auto or manual); status kept. */
async function updateExam(index: ExamIndex, examId: string, payload: unknown): Promise<WireResponse> {
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can manage the Exam List.");
  const exam = index.byId(examId);
  if (!exam) return fail(404, "EXAM_NOT_FOUND", "Exam not found");
  const parsed = await parseInput(index, payload, exam);
  if ("status" in parsed && "body" in parsed) return parsed;
  return ok(writeExam(exam, parsed as ParsedInput));
}

/** Saves fields onto an exam: a manual one is rewritten in place, an auto one gets an override. */
function writeExam(exam: Exam, patch: Partial<Exam>): Exam {
  const next = { ...exam, ...patch, id: exam.id };
  const store = loadStore();
  if (exam.is_auto) {
    saveStore({ ...store, overrides: { ...store.overrides, [exam.id]: { ...store.overrides[exam.id], ...patch } } });
  } else {
    saveStore({ ...store, manual: store.manual.map((item) => (item.id === exam.id ? next : item)) });
  }
  return next;
}

/** POST erp/exams/:id/complete — Step 2 done (schedule optional): the exam becomes active. */
function completeExam(index: ExamIndex, examId: string): WireResponse {
  if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can manage the Exam List.");
  const exam = index.byId(examId);
  if (!exam) return fail(404, "EXAM_NOT_FOUND", "Exam not found");
  return ok(exam.status === "active" ? exam : writeExam(exam, { status: "active" }));
}

/** The Exam List endpoints; null when the path isn't one of them. */
export async function handleExamList(method: string, path: string, query: URLSearchParams, payload: unknown): Promise<WireResponse | null> {
  if (path === "erp/exams" && method === "GET") return listExams(await examIndex(), query);
  if (path === "erp/exams/class-cards" && method === "GET") return classCards(await examIndex(), query);
  if (path === "erp/exams/form-options" && method === "GET") return formOptions(await examIndex(), query);
  if (path === "erp/exams" && method === "POST") return createExam(await examIndex(), payload);
  const complete = path.match(/^erp\/exams\/([^/]+)\/complete$/);
  if (complete && method === "POST") return completeExam(await examIndex(), decodeURIComponent(complete[1]));
  const match = path.match(/^erp\/exams\/([^/]+)$/);
  if (match && method === "PUT") return updateExam(await examIndex(), decodeURIComponent(match[1]), payload);
  return null;
}
