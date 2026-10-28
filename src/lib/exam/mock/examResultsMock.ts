import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { AssessmentMode, AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { round2 } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import type { Exam, GradeBasedStructure, ScaleLevel } from "@/lib/exam/examTypes";
import {
  bandFor,
  cumulativeAttainment,
  cumulativeAverage,
  rankBy,
  statusOf,
  studentStatus,
  subjectTotal,
  valueAdded,
  weightedGpa,
} from "@/lib/exam/results/resultsEngine";
import {
  RESULTS_VIEWS,
  type ClassResultRow,
  type ClassResults,
  type ArmResultSummary,
  type RankingRules,
  type ResultsArms,
  type ResultsViewer,
  type SaveStudentTraitsInput,
  type StudentTraits,
  type TraitsStatus,
  type ResultsView,
  type ResultSubjectColumn,
  type ScoreGradeScale,
  type StudentResult,
  type StudentTermResult,
  type SubjectResult,
} from "@/lib/exam/results/resultsTypes";
import {
  enrolledForTerm,
  SEED_AFFECTIVE,
  SEED_ARM_SUBJECTS,
  SEED_CLASSES,
  SEED_EXAMS,
  SEED_GRADE_SCALES,
  SEED_PSYCHOMOTOR,
  SEED_SUBJECT_UNITS,
  SEED_TRAIT_SCALE,
  SEED_YEARS,
  SEED_SUBJECTS,
  seedReferences,
  seedRoster,
  seedTerms,
  subjectEnrolment,
  termNumber,
  yearOfTerm,
  type SeedStudent,
} from "@/lib/exam/mock/examMockSeeds";
import {
  armInScope,
  armRole,
  classOfArm,
  isGradeClass,
  readGradeMark,
  readScoreMark,
  resolveGradeStructure,
  readStore,
  resolveStructure,
  taughtSubjects,
  writeStore,
} from "@/lib/exam/mock/examMockStore";
import { classGradeScale } from "@/lib/exam/mock/gradesMock";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK computed results (Exam Stage 2a). Runs the pure engine
 * (resultsEngine.ts) over the mock marks on every read — compute-on-read,
 * nothing is materialised. The real backend computes and serves the same
 * shapes (contract in resultsApi.ts).
 *
 *   GET erp/results?class_arm_id&term_id&view=all|grades|gpa&page&limit
 *   GET erp/results/:student_id?term_id
 *   GET erp/results/arms?academic_year_id&term_id          (arm cards)
 *   GET / PUT erp/results/:student_id/traits?term_id       (class teacher)
 *
 * General classes take their grade bands from Setup › Grades
 * (gradesMock.ts) — no bands for a class = no grades / GPA computed.
 *
 * Scope: admin = every arm; a teacher = arms they teach a subject in
 * (FLAGGED — see resultsApi.ts). Outside it -> 403 OUT_OF_SCOPE.
 */

/** No Ranking Rules config exists yet (Setup) — the engine's default (competition) applies. */
export const RANKING_RULES: RankingRules | null = null;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

const EMPTY_SUBJECT: Omit<SubjectResult, "subject_id" | "status"> = {
  total: null,
  grade: null,
  grade_weight: null,
  gpa: null,
  remark: null,
  subject_position: null,
  cag: null,
  mtg: null,
  va: null,
  cumulative_average: null,
  cumulative_grade: null,
  cumulative_terms: null,
};

export type ComputedRow = {
  student: SeedStudent;
  subjects: Record<string, SubjectResult>;
  aggregate: StudentTermResult;
  /** General: each subject total's CA and Exam parts (/100 basis, CA + Exam = Total). Empty for British. */
  split: Record<string, { ca: number | null; exam: number | null }>;
};

/**
 * Which part of the term a computation covers. "full" = the whole term
 * (CA + Exam, or both British points) — what the results screens show.
 * "progress" = the mid-term report: General classes run the engine over
 * the CA part of the structure only (so totals are CA scaled to 100);
 * British classes read the term's first point only.
 */
export type ComputeStage = "full" | "progress";

export type Computed = {
  mode: AssessmentMode;
  stage: ComputeStage;
  /** The structure the engine ran over (CA-only for a General progress run). */
  structure: AssessmentStructure | null;
  gradeStructure: GradeBasedStructure | null;
  scale: ScoreGradeScale | null;
  levels: ScaleLevel[];
  classId: string;
  className: string;
  armName: string;
  termName: string;
  scaleName: string | null;
  columns: ResultSubjectColumn[];
  rows: ComputedRow[];
  rankedCount: number;
};

/** This term and the earlier terms of the same academic year, oldest first. */
export function termsUpTo(termId: string): string[] {
  const year = yearOfTerm(termId);
  return seedTerms(year)
    .map((term) => term.id)
    .filter((id) => termNumber(id) <= termNumber(termId));
}

export function termPoints(termId: string, mode: AssessmentMode): Exam[] {
  return SEED_EXAMS.filter((exam) => exam.term_id === termId && exam.assessment_mode === mode);
}

function emptyAggregate(status: StudentTermResult["status"]): StudentTermResult {
  return { status, grand_total: null, average: null, class_position: null, overall_grade: null, gpa: null, cumulative_average: null, subjects_counted: 0 };
}

// ---------------------------------------------------------------------------
// General (component_based)
// ---------------------------------------------------------------------------

function generalTermTotal(structure: AssessmentStructure, termId: string, subjectId: string, armId: string, studentId: string) {
  const points = termPoints(termId, "component_based");
  const ca = points.find((exam) => exam.kind === "ca");
  const exam = points.find((item) => item.kind === "exam");
  return subjectTotal(structure, {
    ca: ca ? (readScoreMark(ca, subjectId, armId, studentId, structure)?.component_scores ?? {}) : {},
    exam: exam ? (readScoreMark(exam, subjectId, armId, studentId, structure)?.component_scores ?? {}) : {},
  });
}

function computeGeneral(
  armId: string,
  termId: string,
  students: Array<{ student: SeedStudent; index: number }>,
  columns: ResultSubjectColumn[],
  structure: AssessmentStructure | null,
  scale: ScoreGradeScale | null,
): ComputedRow[] {
  const earlierTerms = termsUpTo(termId);
  const rows: ComputedRow[] = students.map(({ student, index }) => {
    const subjects: Record<string, SubjectResult> = {};
    const split: ComputedRow["split"] = {};
    for (const column of columns) {
      const id = column.subject_id;
      if (subjectEnrolment(armId, id, index) === "not_enrolled") {
        subjects[id] = { ...EMPTY_SUBJECT, subject_id: id, status: "ne" };
        continue;
      }
      if (!structure) {
        subjects[id] = { ...EMPTY_SUBJECT, subject_id: id, status: "rng" };
        continue;
      }
      const now = generalTermTotal(structure, termId, id, armId, student.id);
      split[id] = { ca: now.ca, exam: now.exam };
      const band = bandFor(scale, now.total);
      const enrolledTerms = earlierTerms.filter((term) => enrolledForTerm(student.id, term));
      const totals = enrolledTerms.map((term) => (term === termId ? now.total : generalTermTotal(structure, term, id, armId, student.id).total));
      const cumulative = cumulativeAverage(totals, enrolledTerms.length);
      subjects[id] = {
        ...EMPTY_SUBJECT,
        subject_id: id,
        status: statusOf(now.filled, now.leaves),
        total: now.total,
        grade: band?.grade ?? null,
        grade_weight: band?.grade_weight ?? null,
        gpa: band?.gpa ?? null,
        remark: band?.remark ?? null,
        cumulative_average: cumulative,
        cumulative_grade: bandFor(scale, cumulative)?.grade ?? null,
        cumulative_terms: enrolledTerms.length,
      };
    }

    const results = Object.values(subjects);
    const counted = results.filter((result) => result.total !== null);
    const grandTotal = counted.length > 0 ? round2(counted.reduce((sum, result) => sum + (result.total ?? 0), 0)) : null;
    const average = grandTotal !== null ? round2(grandTotal / counted.length) : null;
    const cumulatives = results.map((result) => result.cumulative_average).filter((value): value is number => value !== null);
    const units = new Map(columns.map((column) => [column.subject_id, column.unit]));
    return {
      student,
      subjects,
      split,
      aggregate: {
        status: studentStatus(results.map((result) => result.status)),
        grand_total: grandTotal,
        average,
        class_position: null,
        overall_grade: bandFor(scale, average)?.grade ?? null,
        gpa: weightedGpa(counted.map((result) => ({ gpa: result.gpa, unit: units.get(result.subject_id) ?? null }))),
        cumulative_average: cumulatives.length > 0 ? round2(cumulatives.reduce((a, b) => a + b, 0) / cumulatives.length) : null,
        subjects_counted: counted.length,
      },
    };
  });

  // Subject positions (by total) and class positions (by average); RNG / NE are never ranked.
  for (const column of columns) {
    const ranked = rankBy(
      rows.flatMap((row) => {
        const result = row.subjects[column.subject_id];
        return result && result.total !== null ? [{ id: row.student.id, value: result.total }] : [];
      }),
      RANKING_RULES,
    );
    for (const row of rows) {
      const result = row.subjects[column.subject_id];
      if (result) result.subject_position = ranked.get(row.student.id) ?? null;
    }
  }
  const classRanks = rankBy(
    rows.flatMap((row) => (row.aggregate.average !== null ? [{ id: row.student.id, value: row.aggregate.average }] : [])),
    RANKING_RULES,
  );
  for (const row of rows) row.aggregate.class_position = classRanks.get(row.student.id) ?? null;
  return rows;
}

// ---------------------------------------------------------------------------
// British (grade_based)
// ---------------------------------------------------------------------------

function britishTerm(structure: GradeBasedStructure, termId: string, subjectId: string, armId: string, studentId: string, firstOnly = false) {
  const leafIds = [structure.attainment.id, ...structure.rating_domains.map((domain) => domain.id)];
  // Points in order (A then B): the CAG is the latest point's attainment.
  const points = termPoints(termId, "grade_based");
  const entries = (firstOnly ? points.slice(0, 1) : points).map((exam) => readGradeMark(exam, subjectId, armId, studentId, structure));
  let filled = 0;
  let cag: string | null = null;
  for (const entry of entries) {
    const scores = entry?.component_scores ?? {};
    filled += leafIds.filter((id) => !!scores[id]).length;
    cag = scores[structure.attainment.id] || cag;
  }
  return { cag, filled, leaves: leafIds.length * entries.length };
}

function computeBritish(
  armId: string,
  termId: string,
  students: Array<{ student: SeedStudent; index: number }>,
  columns: ResultSubjectColumn[],
  structure: GradeBasedStructure | null,
  levels: ScaleLevel[],
  firstOnly = false,
): ComputedRow[] {
  const earlierTerms = termsUpTo(termId);
  const scale = structure ? SEED_GRADE_SCALES.find((item) => item.id === structure.attainment.grade_scale_id) : undefined;
  const rosterIndex = new Map(seedRoster(armId).map((student, index) => [student.id, index]));
  return students.map(({ student, index }) => {
    const subjects: Record<string, SubjectResult> = {};
    for (const column of columns) {
      const id = column.subject_id;
      if (subjectEnrolment(armId, id, index) === "not_enrolled") {
        subjects[id] = { ...EMPTY_SUBJECT, subject_id: id, status: "ne" };
        continue;
      }
      if (!structure) {
        subjects[id] = { ...EMPTY_SUBJECT, subject_id: id, status: "rng" };
        continue;
      }
      const now = britishTerm(structure, termId, id, armId, student.id, firstOnly);
      const mtg = scale ? seedReferences(rosterIndex.get(student.id) ?? 0, id, scale).mtg : null;
      const enrolledTerms = earlierTerms.filter((term) => enrolledForTerm(student.id, term));
      const cags = enrolledTerms.map((term) => (term === termId ? now.cag : britishTerm(structure, term, id, armId, student.id, firstOnly).cag));
      const cumulative = cumulativeAttainment(levels, cags);
      subjects[id] = {
        ...EMPTY_SUBJECT,
        subject_id: id,
        status: statusOf(now.filled, now.leaves),
        cag: now.cag,
        mtg,
        va: valueAdded(levels, now.cag, mtg),
        cumulative_grade: cumulative.grade,
        cumulative_terms: cumulative.terms,
      };
    }
    const results = Object.values(subjects);
    return {
      student,
      subjects,
      split: {},
      aggregate: {
        ...emptyAggregate(studentStatus(results.map((result) => result.status))),
        subjects_counted: results.filter((result) => result.cag !== null).length,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Compute + handlers
// ---------------------------------------------------------------------------

/** The structure with only its CA components — the engine then normalises CA to 100. */
function caOnly(structure: AssessmentStructure | null): AssessmentStructure | null {
  return structure ? { ...structure, components: structure.components.filter((component) => component.category === "ca") } : null;
}

export async function compute(armId: string, termId: string, stage: ComputeStage = "full"): Promise<Computed | WireResponse> {
  const classId = classOfArm(armId);
  const cls = SEED_CLASSES.find((item) => item.id === classId);
  const arm = cls?.arms.find((item) => item.id === armId);
  if (!cls || !arm) return fail(404, "CLASS_ARM_NOT_FOUND", "Class-arm not found");
  const term = seedTerms(yearOfTerm(termId)).find((item) => item.id === termId);
  if (!term) return fail(404, "TERM_NOT_FOUND", "Term not found");
  if (!armInScope(armId)) return fail(403, "OUT_OF_SCOPE", "You don't have access to this class-arm's results.");

  const columns: ResultSubjectColumn[] = (SEED_ARM_SUBJECTS[armId] ?? []).map((offer) => ({
    subject_id: offer.subject_id,
    subject_name: SEED_SUBJECTS[offer.subject_id] ?? offer.subject_id,
    unit: SEED_SUBJECT_UNITS[cls.id]?.[offer.subject_id] ?? null,
  }));
  // Only students enrolled in the arm that term (joiners appear from their joining term).
  const students = seedRoster(armId)
    .map((student, index) => ({ student, index }))
    .filter(({ student }) => enrolledForTerm(student.id, termId));

  const base = { classId: cls.id, className: cls.name, armName: arm.name, termName: term.name, columns };
  if (isGradeClass(cls.id)) {
    const structure = resolveGradeStructure(armId);
    const scale = structure ? SEED_GRADE_SCALES.find((item) => item.id === structure.attainment.grade_scale_id) : undefined;
    const levels = scale?.grades ?? [];
    const rows = computeBritish(armId, termId, students, columns, structure, levels, stage === "progress");
    return {
      ...base,
      mode: "grade_based",
      stage,
      structure: null,
      gradeStructure: structure,
      scale: null,
      levels,
      scaleName: scale?.name ?? null,
      rows,
      rankedCount: 0,
    };
  }
  const full = await resolveStructure(armId);
  const structure = stage === "progress" ? caOnly(full) : full;
  const scale = classGradeScale(cls.id);
  const rows = computeGeneral(armId, termId, students, columns, structure, scale);
  return {
    ...base,
    mode: "component_based",
    stage,
    structure,
    gradeStructure: null,
    scale,
    levels: [],
    scaleName: scale?.name || null,
    rows,
    rankedCount: rows.filter((row) => row.aggregate.class_position !== null).length,
  };
}

/** Mean of the students' averages (those with one) — the arm's class average. null for grade-based classes. */
export function classAverage(computed: Computed): number | null {
  if (computed.mode === "grade_based") return null;
  const averages = computed.rows.map((row) => row.aggregate.average).filter((value): value is number => value !== null);
  return averages.length > 0 ? round2(averages.reduce((a, b) => a + b, 0) / averages.length) : null;
}

/** The caller's report view on this arm (role from the acting-as picker). */
export function viewerFor(armId: string): ResultsViewer {
  const role = armRole(armId) ?? "subject_teacher";
  if (role === "subject_teacher") {
    return { role, report_scope: "own_subjects", visible_subject_ids: taughtSubjects(armId), can_enter_traits: false };
  }
  return { role, report_scope: "full", visible_subject_ids: null, can_enter_traits: role === "class_teacher" };
}

// ----- Student-wise traits + remarks (class teacher) -----

const TRAITS_STORAGE_KEY = "zsms.mockExam.traits.v1";
const TRAIT_REMARK_MAX = 500;

export type StoredTraits = {
  ratings: Record<string, number | null>;
  class_teacher_remark: string;
  head_teacher_remark: string;
  updated_at: string;
};

let traitsCache: Record<string, StoredTraits> | null = null;

function loadTraits(): Record<string, StoredTraits> {
  if (!traitsCache) traitsCache = readStore<StoredTraits>(TRAITS_STORAGE_KEY);
  return traitsCache;
}

function traitsKey(termId: string, studentId: string): string {
  return `${termId}|${studentId}`;
}

const TRAIT_KEYS = [...SEED_PSYCHOMOTOR, ...SEED_AFFECTIVE].map((item) => item.key);

function traitsStatus(stored: StoredTraits | undefined): TraitsStatus {
  if (!stored) return "none";
  const rated = TRAIT_KEYS.filter((key) => typeof stored.ratings[key] === "number").length;
  const remarks = [stored.class_teacher_remark, stored.head_teacher_remark].filter((text) => text.trim()).length;
  if (rated === TRAIT_KEYS.length && remarks === 2) return "complete";
  return rated + remarks > 0 ? "partial" : "none";
}

/** The stored student-wise traits + remarks for a term (undefined = nothing entered). */
export function storedTraits(termId: string, studentId: string): StoredTraits | undefined {
  return loadTraits()[traitsKey(termId, studentId)];
}

export function armOfStudent(studentId: string): string | undefined {
  return SEED_CLASSES.flatMap((cls) => cls.arms).find((arm) => seedRoster(arm.id).some((student) => student.id === studentId))?.id;
}

/** Lean payloads: each view sends only the fields its columns show. */
function leanSubject(result: SubjectResult, view: ResultsView, mode: AssessmentMode): Partial<SubjectResult> {
  const { subject_id, status } = result;
  if (mode === "grade_based") {
    if (view === "all") return { subject_id, status, cag: result.cag, va: result.va, cumulative_grade: result.cumulative_grade };
    if (view === "grades") return { subject_id, status, cag: result.cag };
    return { subject_id, status };
  }
  if (view === "all") return { subject_id, status, total: result.total, grade: result.grade };
  if (view === "grades") return { subject_id, status, grade: result.grade };
  return { subject_id, status, grade: result.grade, gpa: result.gpa };
}

function leanAggregate(aggregate: StudentTermResult, view: ResultsView): Partial<StudentTermResult> {
  const { status, subjects_counted } = aggregate;
  if (view === "all") {
    return { status, subjects_counted, grand_total: aggregate.grand_total, average: aggregate.average, overall_grade: aggregate.overall_grade, class_position: aggregate.class_position };
  }
  if (view === "grades") return { status, subjects_counted, overall_grade: aggregate.overall_grade };
  return { status, subjects_counted, gpa: aggregate.gpa };
}

export async function getResults(query: URLSearchParams): Promise<WireResponse> {
  const armId = query.get("class_arm_id") ?? "";
  const termId = query.get("term_id") ?? "";
  if (!armId || !termId) return fail(422, "VALIDATION_ERROR", "class_arm_id and term_id are required");
  const viewParam = query.get("view") ?? "all";
  if (!(RESULTS_VIEWS as readonly string[]).includes(viewParam)) return fail(422, "VALIDATION_ERROR", "view must be all, grades or gpa");
  const view = viewParam as ResultsView;
  const page = Math.max(1, Number(query.get("page")) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.get("limit")) || DEFAULT_LIMIT));

  const computed = await compute(armId, termId);
  if ("status" in computed) return computed;
  const slice = computed.rows.slice((page - 1) * limit, page * limit);
  const items = slice.map(
    (row): ClassResultRow => ({
      student_id: row.student.id,
      student_name: row.student.name,
      admission_no: row.student.admission_no,
      subjects: Object.fromEntries(
        Object.entries(row.subjects).map(([id, result]) => [id, leanSubject(result, view, computed.mode) as SubjectResult]),
      ),
      aggregate: leanAggregate(row.aggregate, view) as StudentTermResult,
      traits_status: traitsStatus(loadTraits()[traitsKey(termId, row.student.id)]),
    }),
  );
  const data: ClassResults = {
    assessment_mode: computed.mode,
    view,
    academic_year_id: yearOfTerm(termId),
    term_id: termId,
    term_name: computed.termName,
    class_arm_id: armId,
    class_name: computed.className,
    arm_name: computed.armName,
    grade_scale_name: computed.scaleName,
    subjects: computed.columns,
    ranked_count: computed.rankedCount,
    class_average: classAverage(computed),
    viewer: viewerFor(armId),
    items,
    total: computed.rows.length,
    page,
    limit,
    has_more: page * limit < computed.rows.length,
  };
  return ok(data);
}

export async function getStudentResult(studentId: string, query: URLSearchParams): Promise<WireResponse> {
  const termId = query.get("term_id") ?? "";
  if (!termId) return fail(422, "VALIDATION_ERROR", "term_id is required");
  const armId = armOfStudent(studentId);
  if (!armId) return fail(404, "STUDENT_NOT_FOUND", "Student not found");
  const computed = await compute(armId, termId);
  if ("status" in computed) return computed;
  const row = computed.rows.find((item) => item.student.id === studentId);
  if (!row) return fail(404, "NOT_ENROLLED_FOR_TERM", "This student wasn't enrolled in their class for that term.");
  const data: StudentResult = {
    assessment_mode: computed.mode,
    academic_year_id: yearOfTerm(termId),
    term_id: termId,
    term_name: computed.termName,
    class_arm_id: armId,
    class_name: computed.className,
    arm_name: computed.armName,
    grade_scale_name: computed.scaleName,
    student: { id: row.student.id, name: row.student.name, admission_no: row.student.admission_no },
    subjects: computed.columns.flatMap((column) => {
      const result = row.subjects[column.subject_id];
      return result ? [{ ...column, ...result }] : [];
    }),
    aggregate: row.aggregate,
    ranked_count: computed.rankedCount,
  };
  return ok(data);
}

/** Arm cards: every arm in the caller's results scope for the term, with its size and class average. */
export async function getResultArms(query: URLSearchParams): Promise<WireResponse> {
  const yearId = query.get("academic_year_id") || SEED_YEARS.find((year) => year.is_current)?.id || SEED_YEARS[0].id;
  if (!SEED_YEARS.some((year) => year.id === yearId)) return fail(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year not found");
  const terms = seedTerms(yearId);
  const termId = query.get("term_id") || terms[0].id;
  if (!terms.some((term) => term.id === termId)) return fail(404, "TERM_NOT_FOUND", "Term not found");

  const items: ArmResultSummary[] = [];
  for (const cls of SEED_CLASSES) {
    for (const arm of cls.arms) {
      if (!armInScope(arm.id)) continue;
      const computed = await compute(arm.id, termId);
      if ("status" in computed) continue;
      items.push({
        class_id: cls.id,
        class_name: cls.name,
        class_arm_id: arm.id,
        arm_name: arm.name,
        assessment_mode: computed.mode,
        student_count: computed.rows.length,
        subject_count: computed.columns.length,
        class_average: classAverage(computed),
      });
    }
  }
  const data: ResultsArms = { academic_year_id: yearId, years: SEED_YEARS, terms, term_id: termId, items, full_scope: getMockActingAs() === MOCK_ADMIN };
  return ok(data);
}

function traitsPayload(studentId: string, studentName: string, termId: string, armId: string): StudentTraits {
  const stored = loadTraits()[traitsKey(termId, studentId)];
  const item = ({ key, label }: { key: string; label: string }) => ({ key, label, rating: stored?.ratings[key] ?? null });
  return {
    student_id: studentId,
    student_name: studentName,
    term_id: termId,
    rating_scale: SEED_TRAIT_SCALE,
    psychomotor: SEED_PSYCHOMOTOR.map(item),
    affective: SEED_AFFECTIVE.map(item),
    class_teacher_remark: stored?.class_teacher_remark ?? "",
    head_teacher_remark: stored?.head_teacher_remark ?? "",
    updated_at: stored?.updated_at ?? null,
    editable: armRole(armId) === "class_teacher",
  };
}

function traitsContext(studentId: string, termId: string): { armId: string; name: string } | WireResponse {
  if (!termId) return fail(422, "VALIDATION_ERROR", "term_id is required");
  const armId = armOfStudent(studentId);
  if (!armId) return fail(404, "STUDENT_NOT_FOUND", "Student not found");
  if (!seedTerms(yearOfTerm(termId)).some((term) => term.id === termId)) return fail(404, "TERM_NOT_FOUND", "Term not found");
  if (!enrolledForTerm(studentId, termId)) return fail(404, "NOT_ENROLLED_FOR_TERM", "This student wasn't enrolled in their class for that term.");
  if (!armInScope(armId)) return fail(403, "OUT_OF_SCOPE", "You don't have access to this class-arm's results.");
  const name = seedRoster(armId).find((student) => student.id === studentId)?.name ?? "";
  return { armId, name };
}

export function getStudentTraits(studentId: string, query: URLSearchParams): WireResponse {
  const termId = query.get("term_id") ?? "";
  const context = traitsContext(studentId, termId);
  if ("status" in context) return context;
  return ok(traitsPayload(studentId, context.name, termId, context.armId));
}

export function putStudentTraits(studentId: string, payload: unknown): WireResponse {
  const body = (payload && typeof payload === "object" ? payload : {}) as Partial<SaveStudentTraitsInput>;
  const termId = typeof body.term_id === "string" ? body.term_id : "";
  const context = traitsContext(studentId, termId);
  if ("status" in context) return context;
  if (armRole(context.armId) !== "class_teacher") return fail(403, "FORBIDDEN", "Only the class teacher can enter traits and remarks.");

  const levels = new Set(SEED_TRAIT_SCALE.map((level) => level.value));
  const ratings: Record<string, number | null> = {};
  const sent = body.ratings && typeof body.ratings === "object" ? body.ratings : {};
  for (const [key, value] of Object.entries(sent)) {
    if (!TRAIT_KEYS.includes(key)) return fail(422, "VALIDATION_ERROR", `ratings.${key}: unknown trait`);
    if (value !== null && !(typeof value === "number" && levels.has(value))) return fail(422, "VALIDATION_ERROR", `ratings.${key}: not on the rating scale`);
    ratings[key] = value;
  }
  const remark = (field: "class_teacher_remark" | "head_teacher_remark") => (typeof body[field] === "string" ? (body[field] as string).trim() : "");
  for (const field of ["class_teacher_remark", "head_teacher_remark"] as const) {
    if (remark(field).length > TRAIT_REMARK_MAX) return fail(422, "VALIDATION_ERROR", `${field}: must be ${TRAIT_REMARK_MAX} characters or fewer`);
  }

  const store = { ...loadTraits() };
  store[traitsKey(termId, studentId)] = {
    ratings,
    class_teacher_remark: remark("class_teacher_remark"),
    head_teacher_remark: remark("head_teacher_remark"),
    updated_at: new Date().toISOString(),
  };
  traitsCache = store;
  writeStore(TRAITS_STORAGE_KEY, store);
  return ok(traitsPayload(studentId, context.name, termId, context.armId));
}
