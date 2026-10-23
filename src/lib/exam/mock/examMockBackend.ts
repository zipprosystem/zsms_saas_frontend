import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { HttpMethod, Transport, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { allLeaves, buildMarkColumns, isScoreValid } from "@/lib/exam/markColumns";
import {
  SUBJECT_REMARK_MAX,
  type ComponentScores,
  type Exam,
  type ExamEntryOptions,
  type GradeMarkRow,
  type GradeMarksSheet,
  type GradeScores,
  type SubjectMarkRow,
  type SubjectMarksSheet,
} from "@/lib/exam/examTypes";
import {
  enrolledIn,
  SEED_ARM_SUBJECTS,
  SEED_CLASS_GRADE_STRUCTURE,
  SEED_CLASS_STRUCTURE,
  SEED_CLASSES,
  SEED_GRADE_SCALES,
  SEED_GRADE_STRUCTURES,
  SEED_RATING_SCALES,
  seedReferences,
  seedRoster,
  SEED_EXAMS,
  SEED_SUBJECTS,
  SEED_TEACHERS,
  SEED_YEARS,
  seedTerms,
} from "@/lib/exam/mock/examMockSeeds";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK Exam backend (Stage 1b: marks entry) — localStorage-backed,
 * answering the PROPOSED endpoints at the HTTP level (ERP envelope, status
 * codes, error bodies), same model as the HR and Assessment Types mocks.
 * The contract is documented in examApi.ts. Rules here are BACKEND-OWNED:
 *
 *   - effective_scope: an admin sees every class-arm/subject; a teacher
 *     only the subject + class-arm pairs they're assigned. Options are cut
 *     down to that scope; marks GET/PUT outside it -> 403 OUT_OF_SCOPE.
 *     (Caller = the dev "acting as" picker, mockActingAs.ts; the real
 *     backend reads it from the token.)
 *   - Cutoff: after exam.entry_closes_on, GET still works (entry_open:false)
 *     but PUT -> 403 ENTRY_CLOSED.
 *   - Structure in force: class mapping (SEED_CLASS_STRUCTURE), else the
 *     school's default; an inactive structure is never "in force". None ->
 *     assessment_structure_id null, and PUT -> 409 NO_ASSESSMENT_STRUCTURE.
 *     Structures come from the Stage 1a service (mock or real).
 *   - component_scores keys must be leaves of that structure for the
 *     exam's kind (CA vs Exam components) -> else 422; each value null or
 *     0..max -> else 422 (message led by the field path).
 *   - Roster = students enrolled in the subject for that arm (electives:
 *     only those who take it). A row for anyone else -> 422.
 *   - PUT upserts the rows it's given (others untouched) and stamps
 *     entered_by_staff_id with the caller. No totals/grades are stored —
 *     computation is Stage 2.
 *
 * GRADE-BASED (Stage 1c, British — Academic Report), same endpoints:
 *   - A class with a grade_based structure in force (SEED_CLASS_GRADE_STRUCTURE)
 *     answers GET with assessment_mode "grade_based": the resolved
 *     structure inline + the grade / rating scales its leaves use + per
 *     student mtg / grade_book references (seeded; Stage 3 manages
 *     them). Exam kind doesn't filter grade leaves — every leaf applies.
 *   - PUT: component_scores keys must be that structure's leaves; each
 *     value null or a code on the leaf's scale -> else 422. Comment =
 *     subject_remark. Stored apart from score marks (own localStorage key).
 *   - entry-options tags each class with its assessment_mode.
 *   - No VA, averages or any other computation (Stage 2).
 */

const STORAGE_KEY = "zsms.mockExam.marks.v1";

type StoredMark = Pick<
  SubjectMarkRow,
  "component_scores" | "present" | "mark_completed" | "subject_remark" | "entered_by_staff_id" | "updated_at"
>;

/** A few marks so the first open grid isn't empty: 2026/2027 First Term CA, Mathematics, JSS 1 A (Standard structure CA 1 / CA 2). */
function seedMarks(): Record<string, StoredMark> {
  const marks: Record<string, StoredMark> = {};
  enrolledIn("arm-jss1-a", "sub-math")
    .slice(0, 4)
    .forEach((student, i) => {
      marks[markKey("y-2026-t1-ca", "sub-math", "arm-jss1-a", student.id)] = {
        component_scores: { "as-seed-standard-ca1": 12 + i * 2, "as-seed-standard-ca2": i === 3 ? null : 14 + i },
        present: true,
        mark_completed: i < 2,
        subject_remark: i === 0 ? "Steady improvement." : "",
        entered_by_staff_id: "stf-okafor",
        updated_at: "2026-10-20T09:00:00.000Z",
      };
    });
  return marks;
}

let cache: Record<string, StoredMark> | null = null;

function loadMarks(): Record<string, StoredMark> {
  if (cache) return cache;
  let marks = seedMarks();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) marks = parsed as Record<string, StoredMark>;
    } catch {
      // Corrupt JSON / storage disabled — fall back to the seeds.
    }
  }
  cache = marks;
  return marks;
}

function saveMarks(marks: Record<string, StoredMark>): void {
  cache = marks;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Best-effort; the in-memory copy still works for this session.
  }
}

function markKey(examId: string, subjectId: string, armId: string, studentId: string): string {
  return `${examId}|${subjectId}|${armId}|${studentId}`;
}

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Scope, cutoff, structure
// ---------------------------------------------------------------------------

function inScope(subjectId: string, armId: string): boolean {
  const actor = getMockActingAs();
  if (actor === MOCK_ADMIN) return true;
  const teacher = SEED_TEACHERS.find((item) => item.id === actor);
  return !!teacher?.assignments.some((a) => a.subject_id === subjectId && a.class_arm_id === armId);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function entryOpen(exam: Exam): boolean {
  return !exam.entry_closes_on || todayIso() <= exam.entry_closes_on;
}

function classOfArm(armId: string): string | null {
  return SEED_CLASSES.find((cls) => cls.arms.some((arm) => arm.id === armId))?.id ?? null;
}

async function resolveStructure(armId: string): Promise<AssessmentStructure | null> {
  const result = await assessmentStructuresService.list();
  if (!result.ok) return null;
  const active = result.data.filter((structure) => structure.is_active);
  const classId = classOfArm(armId);
  const mappedId = classId ? SEED_CLASS_STRUCTURE[classId] : undefined;
  return active.find((structure) => structure.id === mappedId) ?? active.find((structure) => structure.is_default) ?? null;
}

// ---------------------------------------------------------------------------
// Grade-based (British) structure + store
// ---------------------------------------------------------------------------

const GRADE_STORAGE_KEY = "zsms.mockExam.academicReport.v1";

type StoredGradeMark = Pick<
  GradeMarkRow,
  "component_scores" | "present" | "mark_completed" | "subject_remark" | "entered_by_staff_id" | "updated_at"
>;

let gradeCache: Record<string, StoredGradeMark> | null = null;

/** A few entries so the first Academic Report isn't empty: 2026/2027 First Term Examination, Mathematics, Year 9 Oak. */
function seedGradeMarks(): Record<string, StoredGradeMark> {
  const marks: Record<string, StoredGradeMark> = {};
  const attainment = ["S", "D", "M"];
  enrolledIn("arm-y9-oak", "sub-math")
    .slice(0, 3)
    .forEach((student, i) => {
      marks[markKey("y-2026-t1-exam", "sub-math", "arm-y9-oak", student.id)] = {
        component_scores: { "gs-ks3-att": attainment[i], "gs-ks3-eng": String(1 + i), "gs-ks3-lb": i === 2 ? null : "2" },
        present: true,
        mark_completed: i === 0,
        subject_remark: i === 0 ? "Works carefully and asks good questions." : "",
        entered_by_staff_id: "stf-okafor",
        updated_at: "2026-10-21T10:00:00.000Z",
      };
    });
  return marks;
}

function loadGradeMarks(): Record<string, StoredGradeMark> {
  if (gradeCache) return gradeCache;
  let marks = seedGradeMarks();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(GRADE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) marks = parsed as Record<string, StoredGradeMark>;
    } catch {
      // Corrupt JSON / storage disabled — fall back to the seeds.
    }
  }
  gradeCache = marks;
  return marks;
}

function saveGradeMarks(marks: Record<string, StoredGradeMark>): void {
  gradeCache = marks;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRADE_STORAGE_KEY, JSON.stringify(marks));
  } catch {
    // Best-effort; the in-memory copy still works for this session.
  }
}

/** The grade_based structure in force for the arm's class, or null when the class reports by scores. */
function resolveGradeStructure(armId: string) {
  const classId = classOfArm(armId);
  const id = classId ? SEED_CLASS_GRADE_STRUCTURE[classId] : undefined;
  return SEED_GRADE_STRUCTURES.find((structure) => structure.id === id) ?? null;
}

function isGradeClass(classId: string): boolean {
  return !!SEED_CLASS_GRADE_STRUCTURE[classId];
}

/** Leaf id -> the codes allowed for it (attainment: its grade scale; domains: their rating scale). */
function gradeLeafCodes(armId: string): Map<string, { name: string; codes: Set<string> }> {
  const structure = resolveGradeStructure(armId);
  const leaves = new Map<string, { name: string; codes: Set<string> }>();
  if (!structure) return leaves;
  const scale = SEED_GRADE_SCALES.find((item) => item.id === structure.attainment.grade_scale_id);
  leaves.set(structure.attainment.id, { name: structure.attainment.name, codes: new Set(scale?.grades.map((grade) => grade.code) ?? []) });
  for (const domain of structure.rating_domains) {
    const rating = SEED_RATING_SCALES.find((item) => item.id === domain.rating_scale_id);
    leaves.set(domain.id, { name: domain.name, codes: new Set(rating?.levels.map((level) => level.code) ?? []) });
  }
  return leaves;
}

function buildGradeSheet({ exam, subjectId, armId }: SheetContext): GradeMarksSheet {
  const structure = resolveGradeStructure(armId);
  const gradeScale = structure ? SEED_GRADE_SCALES.find((scale) => scale.id === structure.attainment.grade_scale_id) : undefined;
  const ratingIds = new Set(structure?.rating_domains.map((domain) => domain.rating_scale_id) ?? []);
  const marks = loadGradeMarks();
  const rosterIndex = new Map(seedRoster(armId).map((student, index) => [student.id, index]));
  const items: GradeMarkRow[] = enrolledIn(armId, subjectId).map((student) => {
    const stored = marks[markKey(exam.id, subjectId, armId, student.id)];
    const refs = gradeScale
      ? seedReferences(rosterIndex.get(student.id) ?? 0, subjectId, gradeScale)
      : { mtg: null, grade_book: null };
    return {
      student_id: student.id,
      student_name: student.name,
      admission_no: student.admission_no,
      seat_no: student.seat_no,
      component_scores: stored?.component_scores ?? {},
      present: stored?.present ?? null,
      mark_completed: stored?.mark_completed ?? false,
      subject_remark: stored?.subject_remark ?? "",
      entered_by_staff_id: stored?.entered_by_staff_id ?? null,
      updated_at: stored?.updated_at ?? null,
      ...refs,
    };
  });
  return {
    assessment_mode: "grade_based",
    exam,
    subject_id: subjectId,
    class_arm_id: armId,
    assessment_structure_id: structure?.id ?? null,
    structure,
    grade_scales: gradeScale ? [gradeScale] : [],
    rating_scales: SEED_RATING_SCALES.filter((scale) => ratingIds.has(scale.id)),
    entry_open: entryOpen(exam),
    items,
  };
}

async function putGradeMarks(context: SheetContext, body: Record<string, unknown>): Promise<WireResponse> {
  const leaves = gradeLeafCodes(context.armId);
  if (leaves.size === 0) return fail(409, "NO_ASSESSMENT_STRUCTURE", "No grade-based structure is in force for this class.");
  const roster = new Set(enrolledIn(context.armId, context.subjectId).map((student) => student.id));
  if (!Array.isArray(body.rows)) return fail(422, "VALIDATION_ERROR", "rows must be an array");

  const parsed: Array<{ studentId: string; mark: Omit<StoredGradeMark, "entered_by_staff_id" | "updated_at"> }> = [];
  for (let index = 0; index < body.rows.length; index += 1) {
    const row = record(body.rows[index]);
    const path = `rows.${index}`;
    const studentId = typeof row.student_id === "string" ? row.student_id : "";
    if (!roster.has(studentId)) return fail(422, "VALIDATION_ERROR", `${path}.student_id: not enrolled in this subject for this class-arm`);

    const scores: GradeScores = {};
    for (const [leafId, value] of Object.entries(record(row.component_scores))) {
      const leaf = leaves.get(leafId);
      if (!leaf) return fail(422, "VALIDATION_ERROR", `${path}.component_scores.${leafId}: not a field of this class's report structure`);
      if (value !== null && (typeof value !== "string" || !leaf.codes.has(value))) {
        return fail(422, "VALIDATION_ERROR", `${path}.component_scores.${leafId}: ${String(value)} isn't on the ${leaf.name} scale`);
      }
      scores[leafId] = value as string | null;
    }
    const remark = typeof row.subject_remark === "string" ? row.subject_remark.trim() : "";
    if (remark.length > SUBJECT_REMARK_MAX) {
      return fail(422, "VALIDATION_ERROR", `${path}.subject_remark: must be ${SUBJECT_REMARK_MAX} characters or fewer`);
    }
    parsed.push({
      studentId,
      mark: {
        component_scores: scores,
        present: typeof row.present === "boolean" ? row.present : null,
        mark_completed: row.mark_completed === true,
        subject_remark: remark,
      },
    });
  }

  const actor = getMockActingAs();
  const now = new Date().toISOString();
  const marks = { ...loadGradeMarks() };
  for (const { studentId, mark } of parsed) {
    marks[markKey(context.exam.id, context.subjectId, context.armId, studentId)] = {
      ...mark,
      entered_by_staff_id: actor === MOCK_ADMIN ? null : actor,
      updated_at: now,
    };
  }
  saveGradeMarks(marks);
  return ok(buildGradeSheet(context));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function entryOptions(query: URLSearchParams): WireResponse {
  const yearId = query.get("academic_year_id") || SEED_YEARS.find((year) => year.is_current)?.id || SEED_YEARS[0].id;
  if (!SEED_YEARS.some((year) => year.id === yearId)) return fail(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year not found");

  const subjects = Object.entries(SEED_ARM_SUBJECTS).flatMap(([armId, offers]) =>
    offers
      .filter((offer) => inScope(offer.subject_id, armId))
      .map((offer) => ({ class_arm_id: armId, subject_id: offer.subject_id, subject_name: SEED_SUBJECTS[offer.subject_id] })),
  );
  const scopedArms = new Set(subjects.map((subject) => subject.class_arm_id));
  const classes = SEED_CLASSES.map((cls) => ({
    ...cls,
    arms: cls.arms.filter((arm) => scopedArms.has(arm.id)),
    assessment_mode: isGradeClass(cls.id) ? ("grade_based" as const) : ("component_based" as const),
  })).filter((cls) => cls.arms.length > 0);

  const data: ExamEntryOptions = {
    academic_year_id: yearId,
    years: SEED_YEARS,
    terms: seedTerms(yearId),
    classes,
    subjects,
    full_scope: getMockActingAs() === MOCK_ADMIN,
  };
  return ok(data);
}

function listExams(query: URLSearchParams): WireResponse {
  const yearId = query.get("academic_year_id");
  const termId = query.get("term_id");
  const items = SEED_EXAMS.filter(
    (exam) => (!yearId || exam.academic_year_id === yearId) && (!termId || exam.term_id === termId),
  );
  return ok({ items, total: items.length, page: 1, limit: Math.max(1, items.length), has_more: false });
}

type SheetContext = { exam: Exam; subjectId: string; armId: string };

function sheetContext(examId: string, subjectId: string, armId: string): SheetContext | WireResponse {
  const exam = SEED_EXAMS.find((item) => item.id === examId);
  if (!exam) return fail(404, "EXAM_NOT_FOUND", "Exam not found");
  if (!subjectId || !armId) return fail(422, "VALIDATION_ERROR", "subject_id and class_arm_id are required");
  if (!SEED_ARM_SUBJECTS[armId]?.some((offer) => offer.subject_id === subjectId)) {
    return fail(404, "SUBJECT_NOT_OFFERED", "This subject isn't offered to that class-arm");
  }
  if (!inScope(subjectId, armId)) {
    return fail(403, "OUT_OF_SCOPE", "You aren't assigned to this subject for this class-arm.");
  }
  return { exam, subjectId, armId };
}

async function buildSheet({ exam, subjectId, armId }: SheetContext): Promise<SubjectMarksSheet> {
  const structure = await resolveStructure(armId);
  const marks = loadMarks();
  const items: SubjectMarkRow[] = enrolledIn(armId, subjectId).map((student) => {
    const stored = marks[markKey(exam.id, subjectId, armId, student.id)];
    return {
      student_id: student.id,
      student_name: student.name,
      admission_no: student.admission_no,
      seat_no: student.seat_no,
      component_scores: stored?.component_scores ?? {},
      present: stored?.present ?? null,
      mark_completed: stored?.mark_completed ?? false,
      subject_remark: stored?.subject_remark ?? "",
      entered_by_staff_id: stored?.entered_by_staff_id ?? null,
      updated_at: stored?.updated_at ?? null,
    };
  });
  return {
    assessment_mode: "component_based",
    exam,
    subject_id: subjectId,
    class_arm_id: armId,
    assessment_structure_id: structure?.id ?? null,
    entry_open: entryOpen(exam),
    items,
  };
}

async function getMarks(examId: string, query: URLSearchParams): Promise<WireResponse> {
  const context = sheetContext(examId, query.get("subject_id") ?? "", query.get("class_arm_id") ?? "");
  if ("status" in context) return context;
  if (resolveGradeStructure(context.armId)) return ok(buildGradeSheet(context));
  return ok(await buildSheet(context));
}

async function putMarks(examId: string, payload: unknown): Promise<WireResponse> {
  const body = record(payload);
  const context = sheetContext(examId, typeof body.subject_id === "string" ? body.subject_id : "", typeof body.class_arm_id === "string" ? body.class_arm_id : "");
  if ("status" in context) return context;
  if (!entryOpen(context.exam)) {
    return fail(403, "ENTRY_CLOSED", `Marks entry for ${context.exam.name} closed on ${context.exam.entry_closes_on}.`);
  }
  if (resolveGradeStructure(context.armId)) return putGradeMarks(context, body);

  const structure = await resolveStructure(context.armId);
  if (!structure) return fail(409, "NO_ASSESSMENT_STRUCTURE", "No active assessment structure is in force for this class.");
  const leaves = new Map(allLeaves(buildMarkColumns(structure, context.exam.kind)).map((leaf) => [leaf.id, leaf]));
  const roster = new Set(enrolledIn(context.armId, context.subjectId).map((student) => student.id));

  if (!Array.isArray(body.rows)) return fail(422, "VALIDATION_ERROR", "rows must be an array");
  const parsed: Array<{ studentId: string; mark: Omit<StoredMark, "entered_by_staff_id" | "updated_at"> }> = [];
  for (let index = 0; index < body.rows.length; index += 1) {
    const row = record(body.rows[index]);
    const path = `rows.${index}`;
    const studentId = typeof row.student_id === "string" ? row.student_id : "";
    if (!roster.has(studentId)) return fail(422, "VALIDATION_ERROR", `${path}.student_id: not enrolled in this subject for this class-arm`);

    const scores: ComponentScores = {};
    for (const [fieldId, score] of Object.entries(record(row.component_scores))) {
      const leaf = leaves.get(fieldId);
      if (!leaf) return fail(422, "VALIDATION_ERROR", `${path}.component_scores.${fieldId}: not a field of this exam's structure`);
      const numeric = score === null ? null : typeof score === "number" ? score : Number.NaN;
      if (!isScoreValid(numeric, leaf.max)) {
        return fail(422, "VALIDATION_ERROR", `${path}.component_scores.${fieldId}: ${String(score)} must be between 0 and ${leaf.max} (${leaf.name})`);
      }
      scores[fieldId] = numeric;
    }
    const remark = typeof row.subject_remark === "string" ? row.subject_remark.trim() : "";
    if (remark.length > SUBJECT_REMARK_MAX) {
      return fail(422, "VALIDATION_ERROR", `${path}.subject_remark: must be ${SUBJECT_REMARK_MAX} characters or fewer`);
    }
    parsed.push({
      studentId,
      mark: {
        component_scores: scores,
        present: typeof row.present === "boolean" ? row.present : null,
        mark_completed: row.mark_completed === true,
        subject_remark: remark,
      },
    });
  }

  const actor = getMockActingAs();
  const now = new Date().toISOString();
  const marks = { ...loadMarks() };
  for (const { studentId, mark } of parsed) {
    marks[markKey(context.exam.id, context.subjectId, context.armId, studentId)] = {
      ...mark,
      entered_by_staff_id: actor === MOCK_ADMIN ? null : actor,
      updated_at: now,
    };
  }
  saveMarks(marks);
  return ok(await buildSheet(context));
}

async function handle(method: HttpMethod, path: string, query: URLSearchParams, payload: unknown): Promise<WireResponse> {
  if (path === "erp/exams" && method === "GET") return listExams(query);
  if (path === "erp/exams/entry-options" && method === "GET") return entryOptions(query);
  const match = path.match(/^erp\/exams\/([^/]+)\/marks$/);
  if (match) {
    const examId = decodeURIComponent(match[1]);
    if (method === "GET") return getMarks(examId, query);
    if (method === "PUT") return putMarks(examId, payload);
    return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  return fail(404, "NOT_FOUND", `Route not found: ${method} ${path}`);
}

export const examMockTransport: Transport = async (method, fullPath, payload) => {
  await mockDelay(250);
  const [path, queryString = ""] = fullPath.split("?");
  return handle(method, path, new URLSearchParams(queryString), payload);
};
