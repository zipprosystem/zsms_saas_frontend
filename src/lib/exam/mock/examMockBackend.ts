import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { HttpMethod, Transport, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { allLeaves, buildMarkColumns, isScoreValid } from "@/lib/exam/markColumns";
import {
  SUBJECT_REMARK_MAX,
  type ComponentScores,
  type Exam,
  type ExamEntryOptions,
  type GradeMarkRow,
  type GradeMarksSheet,
  type GradeScores,
  type RatingScale,
  type SubjectMarkRow,
  type SubjectMarksSheet,
} from "@/lib/exam/examTypes";
import {
  enrolledIn,
  SEED_ARM_SUBJECTS,
  SEED_CLASSES,
  SEED_GRADE_SCALES,
  SEED_RATING_SCALES,
  seedReferences,
  seedRoster,
  SEED_EXAMS,
  SEED_SUBJECTS,
  SEED_YEARS,
  seedTerms,
} from "@/lib/exam/mock/examMockSeeds";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import {
  classOfArm,
  inScope,
  isGradeClass,
  loadGradeMarks,
  loadMarks,
  markKey,
  gradeMarksReference,
  readGradeMark,
  readScoreMark,
  resolveGradeStructure,
  resolveStructure,
  saveGradeMarks,
  saveMarks,
  type StoredGradeMark,
  type StoredMark,
} from "@/lib/exam/mock/examMockStore";
import { getResultArms, getResults, getStudentResult, getStudentTraits, progressGradeInUse, putStudentTraits } from "@/lib/exam/mock/examResultsMock";
import { handleGrades, resolveGradeScale } from "@/lib/exam/mock/gradesMock";
import { handleProgressGrades, progressGrades } from "@/lib/exam/mock/progressGradesMock";
import { handleTraitMasters } from "@/lib/exam/mock/traitMastersMock";
import { handleExamSettings } from "@/lib/exam/mock/examSettingsMock";
import { getStudentReport, postGenerateClassPdf } from "@/lib/exam/mock/reportPayloadMock";
import { getBroadsheet, getCumulativeBroadsheet, getProgressionBroadsheet } from "@/lib/exam/mock/broadsheetMock";

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
 *   - Roster = students enrolled in the subject for that arm in the exam's
 *     term (electives: only those who take it; mid-year joiners only from
 *     their joining term). A row for anyone else -> 422.
 *   - Marks live in examMockStore.ts (saved entries over generated seeds),
 *     shared with the Stage 2a results engine (examResultsMock.ts), which
 *     answers GET erp/results and erp/results/:student_id; the report
 *     payload (GET erp/results/:student_id/report) and the class PDF stub
 *     (POST erp/report-cards/generate) are reportPayloadMock.ts; the Broad
 *     Sheet (GET erp/broadsheets, …/cumulative, …/progression) is
 *     broadsheetMock.ts.
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
 *   - Exam points are per mode: each term has exactly two of each
 *     (score: CA + Examination; British: A/B, e.g. 1A / 1B, each with a
 *     report_variant "progress" | "full"). GET erp/exams filters by
 *     ?assessment_mode=; marks for a point of the other mode -> 409
 *     EXAM_MODE_MISMATCH.
 *   - Only subject-wise rating domains (Engagement, Learning Behaviour) —
 *     student-wise ones (Boarding Commitment…) are Report Progression.
 *   - Present / Mark-as-completed are stored as sent; the auto-ticks are
 *     screen behaviour (examEntryShared.applyAutoTicks), not derived here.
 *   - No VA, averages or any other computation (Stage 2).
 */

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function entryOpen(exam: Exam): boolean {
  return !exam.entry_closes_on || todayIso() <= exam.entry_closes_on;
}

// ---------------------------------------------------------------------------
// Grade-based (British)
// ---------------------------------------------------------------------------

/** Leaf id -> the codes allowed for it (attainment: its grade scale; domains: their rating scale). */
function gradeLeafCodes(armId: string): Map<string, { name: string; codes: Set<string> }> {
  const structure = resolveGradeStructure(armId);
  const leaves = new Map<string, { name: string; codes: Set<string> }>();
  if (!structure) return leaves;
  const scale = resolveGradeScale(classOfArm(armId), SEED_GRADE_SCALES.find((item) => item.id === structure.attainment.grade_scale_id));
  leaves.set(structure.attainment.id, { name: structure.attainment.name, codes: new Set(scale?.grades.map((grade) => grade.code) ?? []) });
  // Rating domains take a British Progress Grades level, by id.
  const britishLevels = new Set(progressGrades("british").map((level) => level.id));
  for (const domain of structure.rating_domains) {
    leaves.set(domain.id, { name: domain.name, codes: britishLevels });
  }
  return leaves;
}

/**
 * The rating domains' scale = the British Progress Grades (Setup ›
 * Progress Grades): each level's code is its progress_grade_id, label its
 * name, value its value. Keeps the structure's rating_scale_id so the
 * domains still find it.
 */
function ratingScalesFor(ids: Set<string>): RatingScale[] {
  const levels = progressGrades("british").map((level) => ({ code: level.id, label: level.name, value: level.value }));
  return SEED_RATING_SCALES.filter((scale) => ids.has(scale.id)).map((scale) => ({ ...scale, levels }));
}

function buildGradeSheet({ exam, subjectId, armId }: SheetContext): GradeMarksSheet {
  const structure = resolveGradeStructure(armId);
  const gradeScale = structure ? resolveGradeScale(classOfArm(armId), SEED_GRADE_SCALES.find((scale) => scale.id === structure.attainment.grade_scale_id)) : undefined;
  const ratingIds = new Set(structure?.rating_domains.map((domain) => domain.rating_scale_id) ?? []);
  const rosterIndex = new Map(seedRoster(armId).map((student, index) => [student.id, index]));
  const items: GradeMarkRow[] = enrolledIn(armId, subjectId, exam.term_id).map((student) => {
    const stored = readGradeMark(exam, subjectId, armId, student.id, structure);
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
      // No Comment on a Progress point (Full only).
      subject_remark: exam.report_variant === "full" ? (stored?.subject_remark ?? "") : "",
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
    rating_scales: ratingScalesFor(ratingIds),
    entry_open: entryOpen(exam),
    items,
  };
}

async function putGradeMarks(context: SheetContext, body: Record<string, unknown>): Promise<WireResponse> {
  const leaves = gradeLeafCodes(context.armId);
  if (leaves.size === 0) return fail(409, "NO_ASSESSMENT_STRUCTURE", "No grade-based structure is in force for this class.");
  const roster = new Set(enrolledIn(context.armId, context.subjectId, context.exam.term_id).map((student) => student.id));
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
    // The Comment exists only on a Full report point; on a Progress point it's ignored (stored "").
    const remark = context.exam.report_variant === "full" && typeof row.subject_remark === "string" ? row.subject_remark.trim() : "";
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
  const mode = query.get("assessment_mode");
  const items = SEED_EXAMS.filter(
    (exam) =>
      (!yearId || exam.academic_year_id === yearId) &&
      (!termId || exam.term_id === termId) &&
      (!mode || exam.assessment_mode === mode),
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
  const classId = classOfArm(armId);
  const classMode = classId && isGradeClass(classId) ? "grade_based" : "component_based";
  if (exam.assessment_mode !== classMode) {
    return fail(409, "EXAM_MODE_MISMATCH", `${exam.name} is a ${exam.assessment_mode === "grade_based" ? "grade-based" : "score-based"} exam point; this class reports the other way.`);
  }
  return { exam, subjectId, armId };
}

async function buildSheet({ exam, subjectId, armId }: SheetContext): Promise<SubjectMarksSheet> {
  const structure = await resolveStructure(armId);
  const items: SubjectMarkRow[] = enrolledIn(armId, subjectId, exam.term_id).map((student) => {
    const stored = readScoreMark(exam, subjectId, armId, student.id, structure);
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
  const leaves = new Map(allLeaves(buildMarkColumns(structure, context.exam.kind ?? "exam")).map((leaf) => [leaf.id, leaf]));
  const roster = new Set(enrolledIn(context.armId, context.subjectId, context.exam.term_id).map((student) => student.id));

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
  if (path === "erp/broadsheets" && method === "GET") return getBroadsheet(query);
  if (path === "erp/broadsheets/cumulative" && method === "GET") return getCumulativeBroadsheet(query);
  if (path === "erp/broadsheets/progression" && method === "GET") return getProgressionBroadsheet(query);
  if (path === "erp/results" && method === "GET") return getResults(query);
  if (path === "erp/results/arms" && method === "GET") return getResultArms(query);
  const traitsMatch = path.match(/^erp\/results\/([^/]+)\/traits$/);
  if (traitsMatch) {
    const studentId = decodeURIComponent(traitsMatch[1]);
    if (method === "GET") return getStudentTraits(studentId, query);
    if (method === "PUT") return putStudentTraits(studentId, payload);
    return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }
  const reportMatch = path.match(/^erp\/results\/([^/]+)\/report$/);
  if (reportMatch && method === "GET") return getStudentReport(decodeURIComponent(reportMatch[1]), query);
  if (path === "erp/report-cards/generate" && method === "POST") return postGenerateClassPdf(payload);
  const grades = handleGrades(method, path, query, payload);
  if (grades) return grades;
  const progress = handleProgressGrades(method, path, query, payload, (id) => progressGradeInUse(id) || gradeMarksReference(id));
  if (progress) return progress;
  const masters = await handleTraitMasters(method, path, query, payload);
  if (masters) return masters;
  const settings = handleExamSettings(method, path, payload);
  if (settings) return settings;
  const studentMatch = path.match(/^erp\/results\/([^/]+)$/);
  if (studentMatch && method === "GET") return getStudentResult(decodeURIComponent(studentMatch[1]), query);
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
