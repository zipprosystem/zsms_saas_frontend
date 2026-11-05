import type { HttpMethod, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import {
  isProgressionPoint,
  isPublishStatusFilter,
  progressionPercent,
  type ClassProgression,
  type MissingItem,
  type ProgressionAction,
  type ProgressionActivity,
  type ProgressionActor,
  type ProgressionClassCard,
  type ProgressionClasses,
  type ProgressionPoint,
  type ProgressionStudent,
} from "@/lib/exam/reportProgression/reportProgressionApi";
import {
  SEED_AFFECTIVE,
  SEED_CLASS_SCHOOL_TYPE,
  SEED_CLASSES,
  SEED_PSYCHOMOTOR,
  SEED_YEARS,
  seedStudentProfile,
  seedTerms,
  yearOfTerm,
} from "@/lib/exam/mock/examMockSeeds";
import { armRole, loadGradeMarks, loadMarks, readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { armOfStudent, compute, storedTraits, type Computed, type ComputedRow } from "@/lib/exam/mock/examResultsMock";
import { examIndex } from "@/lib/exam/mock/examListMock";
import { getMockActingAs, MOCK_ADMIN, mockActors } from "@/lib/exam/mock/mockActingAs";
import { progressGradeById } from "@/lib/exam/mock/progressGradesMock";
import { devList } from "@/lib/setup/academicStructure/schoolTypesDevMock";

/**
 * MOCK Report Progression (Stage 1: publish surface) — the contract is in
 * reportProgressionApi.ts. Completeness is COMPUTED ON READ from the same
 * sources the reports read (results engine subject statuses for the
 * point, the stored student-wise traits + remarks); only the publish /
 * stamp state is stored (its own localStorage side-store).
 */

const STORAGE_KEY = "zsms.mockExam.reportProgression.v1";

type StoredEvent = { at: string; by: string | null };
type StoredPublication = {
  published: StoredEvent | null;
  unpublished: StoredEvent | null;
  stamped: StoredEvent | null;
};

let cache: Record<string, StoredPublication> | null = null;

function loadPublications(): Record<string, StoredPublication> {
  if (!cache) cache = readStore<StoredPublication>(STORAGE_KEY);
  return cache;
}

function savePublications(next: Record<string, StoredPublication>): void {
  cache = next;
  writeStore(STORAGE_KEY, next);
}

function publicationKey(termId: string, point: ProgressionPoint, studentId: string): string {
  return `${termId}|${point}|${studentId}`;
}

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A stored actor id -> { staff_id, name }. null id = a school admin (name null; the screen labels it). */
function actor(id: string | null): ProgressionActor {
  if (!id) return { staff_id: null, name: null };
  return { staff_id: id, name: mockActors().find((item) => item.id === id)?.name ?? null };
}

function currentActorId(): string | null {
  const id = getMockActingAs();
  return id === MOCK_ADMIN ? null : id;
}

async function schoolTypeName(classId: string): Promise<string | null> {
  const typeId = SEED_CLASS_SCHOOL_TYPE[classId] ?? null;
  if (!typeId) return null;
  const types = await devList();
  return types.ok ? (types.data.find((type) => type.id === typeId)?.name ?? null) : null;
}

/** The point's engine run: CA = the progress computation (General CA part / British A point), Exam = the full term. */
function stageOf(point: ProgressionPoint): "progress" | "full" {
  return point === "ca" ? "progress" : "full";
}

type Completeness = { filled: number; required: number; missing: MissingItem[] };

const PSYCHOMOTOR_KEYS = SEED_PSYCHOMOTOR.map((item) => item.key);
const AFFECTIVE_KEYS = SEED_AFFECTIVE.map((item) => item.key);

/** §7.30 filled ÷ required for one student's report (see the contract). */
function completeness(computed: Computed, row: ComputedRow, termId: string): Completeness {
  let filled = 0;
  let required = 0;
  const missing: MissingItem[] = [];
  for (const column of computed.columns) {
    const result = row.subjects[column.subject_id];
    if (!result || result.status === "ne") continue;
    required += 1;
    if (result.status === "ready") filled += 1;
    else missing.push({ kind: "subject", label: column.subject_name });
  }
  if (computed.mode === "component_based") {
    const traits = storedTraits(termId, row.student.id);
    const rated = (keys: string[]) => keys.filter((key) => !!progressGradeById(traits?.ratings[key] ?? null)).length;
    for (const [kind, keys] of [["psychomotor", PSYCHOMOTOR_KEYS], ["affective", AFFECTIVE_KEYS]] as const) {
      const count = rated(keys);
      required += keys.length;
      filled += count;
      if (count < keys.length) missing.push({ kind, count: keys.length - count });
    }
    for (const kind of ["class_teacher_remark", "head_teacher_remark"] as const) {
      required += 1;
      if (traits?.[kind]?.trim()) filled += 1;
      else missing.push({ kind });
    }
  }
  return { filled, required, missing };
}

function latestOf(activities: Array<ProgressionActivity | null>): ProgressionActivity | null {
  return activities.filter((item): item is ProgressionActivity => !!item).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

/** The latest saved entry (marks / academic report) for this student in the point's exams. */
function latestEntry(examIds: Set<string>, armId: string, studentId: string): ProgressionActivity | null {
  const suffix = `|${armId}|${studentId}`;
  let latest: ProgressionActivity | null = null;
  for (const store of [loadMarks(), loadGradeMarks()]) {
    for (const [key, mark] of Object.entries(store)) {
      if (!key.endsWith(suffix) || !examIds.has(key.split("|")[0]) || !mark.updated_at) continue;
      if (!latest || mark.updated_at > latest.at) latest = { kind: "marks", at: mark.updated_at, by: actor(mark.entered_by_staff_id) };
    }
  }
  return latest;
}

/**
 * effective_scope for report publishing: admin / HOD / sectional head =
 * every arm of their classes; a class teacher (form tutor) = only their
 * own arm. Teaching a subject in an arm doesn't add it — the report
 * belongs to the arm's class teacher, so a form tutor of JSS 1 A who
 * also teaches English in JSS 1 B still sees only 1 A here.
 */
function reportArmInScope(armId: string): boolean {
  const role = armRole(armId);
  return role === "admin" || role === "sectional_head" || role === "class_teacher";
}

type ClassRun = { cls: (typeof SEED_CLASSES)[number]; runs: Array<{ armId: string; armName: string; computed: Computed }> };

/** Every in-scope arm of the class, computed for the point. null = no arm in scope. */
async function runClass(classId: string, termId: string, point: ProgressionPoint): Promise<ClassRun | WireResponse | null> {
  const cls = SEED_CLASSES.find((item) => item.id === classId);
  if (!cls) return fail(404, "CLASS_NOT_FOUND", "Class not found");
  const runs: ClassRun["runs"] = [];
  for (const arm of cls.arms) {
    if (!reportArmInScope(arm.id)) continue;
    const computed = await compute(arm.id, termId, stageOf(point));
    if ("status" in computed) return computed;
    runs.push({ armId: arm.id, armName: arm.name, computed });
  }
  return runs.length > 0 ? { cls, runs } : null;
}

function studentRow(
  run: ClassRun["runs"][number],
  row: ComputedRow,
  termId: string,
  point: ProgressionPoint,
  examIds: Set<string>,
): ProgressionStudent {
  const { filled, required, missing } = completeness(run.computed, row, termId);
  const stored = loadPublications()[publicationKey(termId, point, row.student.id)];
  const traits = storedTraits(termId, row.student.id);
  const event = (kind: ProgressionActivity["kind"], value: StoredEvent | null | undefined): ProgressionActivity | null =>
    value ? { kind, at: value.at, by: actor(value.by) } : null;
  return {
    student_id: row.student.id,
    student_name: row.student.name,
    admission_no: row.student.admission_no,
    photo_url: seedStudentProfile(row.student.id)?.photo_url ?? null,
    class_arm_id: run.armId,
    arm_name: run.armName,
    filled,
    required,
    progression_percent: progressionPercent(filled, required),
    missing,
    latest_activity: latestOf([
      latestEntry(examIds, run.armId, row.student.id),
      // Traits don't record who saved them (the class teacher of the arm).
      traits?.updated_at ? { kind: "traits", at: traits.updated_at, by: null } : null,
      event("published", stored?.published),
      event("unpublished", stored?.unpublished),
      event("stamped", stored?.stamped),
    ]),
    published: stored?.published ? { at: stored.published.at, by: actor(stored.published.by) } : null,
    stamped: stored?.stamped ? { at: stored.stamped.at, by: actor(stored.stamped.by) } : null,
    // DEC-008: the published PDF job isn't built — no file yet.
    pdf_file_id: null,
    pdf_url: null,
  };
}

async function pointExamIds(classId: string, termId: string, point: ProgressionPoint): Promise<Set<string>> {
  const exams = await examIndex();
  return new Set(exams.forClass(classId, termId).filter((exam) => exam.category === point).map((exam) => exam.id));
}

function resolveYearTerm(query: URLSearchParams): { yearId: string; termId: string } | WireResponse {
  const termParam = query.get("term_id");
  const yearId = query.get("academic_year_id") || (termParam ? yearOfTerm(termParam) : "") || SEED_YEARS.find((year) => year.is_current)?.id || SEED_YEARS[0].id;
  if (!SEED_YEARS.some((year) => year.id === yearId)) return fail(404, "ACADEMIC_YEAR_NOT_FOUND", "Academic year not found");
  const terms = seedTerms(yearId);
  const termId = termParam || terms[0].id;
  if (!terms.some((term) => term.id === termId)) return fail(404, "TERM_NOT_FOUND", "Term not found");
  return { yearId, termId };
}

async function getClasses(query: URLSearchParams): Promise<WireResponse> {
  const point = query.get("point") ?? "ca";
  if (!isProgressionPoint(point)) return fail(422, "VALIDATION_ERROR", "point must be ca or exam");
  const resolved = resolveYearTerm(query);
  if ("status" in resolved) return resolved;
  const { yearId, termId } = resolved;

  const items: ProgressionClassCard[] = [];
  for (const cls of SEED_CLASSES) {
    const run = await runClass(cls.id, termId, point);
    if (!run) continue;
    if ("status" in run) return run;
    let filled = 0;
    let required = 0;
    let students = 0;
    const subjects = new Set<string>();
    for (const armRun of run.runs) {
      armRun.computed.columns.forEach((column) => subjects.add(column.subject_id));
      for (const row of armRun.computed.rows) {
        const result = completeness(armRun.computed, row, termId);
        filled += result.filled;
        required += result.required;
        students += 1;
      }
    }
    items.push({
      class_id: cls.id,
      class_name: cls.name,
      school_type_name: await schoolTypeName(cls.id),
      assessment_mode: run.runs[0].computed.mode,
      student_count: students,
      subject_count: subjects.size,
      filled,
      required,
      progression_percent: progressionPercent(filled, required),
    });
  }
  const data: ProgressionClasses = {
    academic_year_id: yearId,
    years: SEED_YEARS,
    terms: seedTerms(yearId),
    term_id: termId,
    point,
    full_scope: getMockActingAs() === MOCK_ADMIN,
    items,
  };
  return ok(data);
}

async function classRows(classId: string, termId: string, point: ProgressionPoint): Promise<{ run: ClassRun; rows: ProgressionStudent[] } | WireResponse> {
  const run = await runClass(classId, termId, point);
  if (!run) return fail(403, "OUT_OF_SCOPE", "You don't have access to this class's reports.");
  if ("status" in run) return run;
  const examIds = await pointExamIds(classId, termId, point);
  const rows = run.runs.flatMap((armRun) => armRun.computed.rows.map((row) => studentRow(armRun, row, termId, point, examIds)));
  return { run, rows };
}

async function getClassView(classId: string, query: URLSearchParams): Promise<WireResponse> {
  const point = query.get("point") ?? "ca";
  if (!isProgressionPoint(point)) return fail(422, "VALIDATION_ERROR", "point must be ca or exam");
  const status = query.get("status") ?? "all";
  if (!isPublishStatusFilter(status)) return fail(422, "VALIDATION_ERROR", "status must be all, published or unpublished");
  const resolved = resolveYearTerm(query);
  if ("status" in resolved) return resolved;
  const { yearId, termId } = resolved;

  const result = await classRows(classId, termId, point);
  if ("status" in result) return result;
  const { run, rows } = result;
  const items = rows.filter((row) => status === "all" || (status === "published" ? !!row.published : !row.published));
  const terms = seedTerms(yearId);
  const data: ClassProgression = {
    class_id: run.cls.id,
    class_name: run.cls.name,
    school_type_name: await schoolTypeName(run.cls.id),
    assessment_mode: run.runs[0].computed.mode,
    academic_year_id: yearId,
    years: SEED_YEARS,
    terms,
    term_id: termId,
    term_name: terms.find((term) => term.id === termId)?.name ?? "",
    point,
    classes: SEED_CLASSES.filter((cls) => cls.arms.some((arm) => reportArmInScope(arm.id))).map((cls) => ({ id: cls.id, name: cls.name })),
    items,
  };
  return ok(data);
}

async function postAction(action: ProgressionAction, payload: unknown): Promise<WireResponse> {
  const body = record(payload);
  const termId = typeof body.term_id === "string" ? body.term_id : "";
  const point = typeof body.point === "string" ? body.point : "";
  if (!isProgressionPoint(point)) return fail(422, "VALIDATION_ERROR", "point must be ca or exam");
  if (!seedTerms(yearOfTerm(termId)).some((term) => term.id === termId)) return fail(422, "VALIDATION_ERROR", "term_id: term not found");
  const ids = Array.isArray(body.student_ids) ? body.student_ids.filter((id): id is string => typeof id === "string") : [];
  if (ids.length === 0) return fail(422, "VALIDATION_ERROR", "student_ids: pick at least one student");

  // Every student must be in a class the caller can see.
  const wanted = new Set(ids);
  const updated: ProgressionStudent[] = [];
  const armIds = new Set(ids.map((id) => armOfStudent(id)).filter(Boolean));
  const touchedClasses = SEED_CLASSES.filter((cls) => cls.arms.some((arm) => armIds.has(arm.id)));
  const found = new Set<string>();
  const now = new Date().toISOString();
  const event: StoredEvent = { at: now, by: currentActorId() };
  const next = { ...loadPublications() };
  for (const cls of touchedClasses) {
    const result = await classRows(cls.id, termId, point);
    if ("status" in result) return result;
    for (const row of result.rows) {
      if (!wanted.has(row.student_id)) continue;
      found.add(row.student_id);
      const key = publicationKey(termId, point, row.student_id);
      const current = next[key] ?? { published: null, unpublished: null, stamped: null };
      if (action === "publish") next[key] = { ...current, published: event };
      else if (action === "unpublish") next[key] = { ...current, published: null, unpublished: current.published ? event : current.unpublished };
      else next[key] = { ...current, stamped: event };
    }
  }
  const unknown = ids.find((id) => !found.has(id));
  if (unknown) return fail(422, "VALIDATION_ERROR", `student_ids: ${unknown} isn't on a report in your scope for this term`);
  savePublications(next);
  for (const cls of touchedClasses) {
    const result = await classRows(cls.id, termId, point);
    if ("status" in result) return result;
    updated.push(...result.rows.filter((row) => wanted.has(row.student_id)));
  }
  return ok({ items: updated });
}

/** Routes erp/report-progression/*; null = not ours. */
export async function handleReportProgression(method: HttpMethod, path: string, query: URLSearchParams, payload: unknown): Promise<WireResponse | null> {
  if (!path.startsWith("erp/report-progression")) return null;
  if (path === "erp/report-progression/classes" && method === "GET") return getClasses(query);
  const classMatch = path.match(/^erp\/report-progression\/classes\/([^/]+)$/);
  if (classMatch && method === "GET") return getClassView(decodeURIComponent(classMatch[1]), query);
  const actionMatch = path.match(/^erp\/report-progression\/(publish|unpublish|stamp)$/);
  if (actionMatch && method === "POST") return postAction(actionMatch[1] as ProgressionAction, payload);
  return fail(404, "NOT_FOUND", `Route not found: ${method} ${path}`);
}
