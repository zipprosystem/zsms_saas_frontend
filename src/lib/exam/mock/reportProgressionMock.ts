import type { HttpMethod, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import {
  isProgressionPoint,
  isPublishStatusFilter,
  PROGRESSION_SECTION_WEIGHTS,
  weightedProgressionPercent,
  type ClassProgression,
  type MissingItem,
  type ProgressionAction,
  type ProgressionActivity,
  type ProgressionActor,
  type ProgressionClassCard,
  type ProgressionClasses,
  type ProgressionPoint,
  type ProgressionStudent,
  type PublishStatusFilter,
} from "@/lib/exam/reportProgression/reportProgressionApi";
import type { CommentGradeRole, CommentGrades, ProgressionSection, RemarkKey, ReportField, StudentEntry } from "@/lib/exam/reportProgression/studentEntryApi";
import { isCommentGradeRole, REMARK_KEYS } from "@/lib/exam/reportProgression/studentEntryApi";
import {
  enrolledForTerm,
  SEED_CLASS_SCHOOL_TYPE,
  SEED_CLASSES,
  SEED_YEARS,
  seedStudentProfile,
  seedTerms,
  yearOfTerm,
} from "@/lib/exam/mock/examMockSeeds";
import { armInScope, armRole, classOfArm, loadGradeMarks, taughtSubjects, teachesStudent, loadMarks, readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { armOfStudent, compute, storedTraits, writeTraitRatings, type Computed, type ComputedRow } from "@/lib/exam/mock/examResultsMock";
import { classTraitLists, type TraitList } from "@/lib/exam/mock/traitMastersMock";
import { TRAIT_MASTER_KINDS, type TraitMasterKind } from "@/lib/setup/assessmentConfiguration/traitMastersApi";
import type { StudentTraitEntry } from "@/lib/exam/reportProgression/studentTraitsApi";
import { examIndex } from "@/lib/exam/mock/examListMock";
import { getMockActingAs, MOCK_ADMIN, mockActors } from "@/lib/exam/mock/mockActingAs";
import { progressGradeById, progressGrades } from "@/lib/exam/mock/progressGradesMock";
import { devList } from "@/lib/setup/academicStructure/schoolTypesDevMock";
import {
  attendanceOf,
  readAttendance,
  canWriteField,
  commentGradeKey,
  readRemarks,
  REMARK_MAX,
  reportFieldDecls,
  writeAttendance,
  writeRemarks,
  type FieldDecl,
} from "@/lib/exam/mock/reportFieldsMock";

/**
 * MOCK Report Progression — Stage 1 (publish surface, contract in
 * reportProgressionApi.ts) and Stage 2 (student-wise entry, contract in
 * studentEntryApi.ts; the marks themselves go through the exam marks
 * mock). Completeness is COMPUTED ON READ from the same sources the
 * reports read (results engine subject statuses for the point, the
 * template's report-only fields — term_remark + attendance, see
 * reportFieldsMock.ts — and the stored traits); only the publish / stamp
 * state is stored here (its own localStorage side-store).
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

type Completeness = { filled: number; required: number; percent: number; sections: ProgressionSection[]; missing: MissingItem[] };

/** What the class's report asks for besides the scores: the template's report-only fields at the point + its School Type trait lists. */
type ReportSpec = { fields: FieldDecl[]; traits: Record<TraitMasterKind, TraitList> };

function section(key: ProgressionSection["key"]): ProgressionSection {
  return { key, weight: PROGRESSION_SECTION_WEIGHTS[key], filled: 0, required: 0 };
}

/**
 * §7.30 for one student's report at the point — template + point driven,
 * section-weighted (see the contract). `fields` = what the class's
 * template prints at this point; a subject-scoped row (visible) is scores only.
 */
function completeness(
  computed: Computed,
  row: ComputedRow,
  termId: string,
  point: ProgressionPoint,
  visible: Set<string> | null,
  { fields, traits: traitLists }: ReportSpec,
): Completeness {
  const missing: MissingItem[] = [];
  const scores = section("scores");
  for (const column of computed.columns) {
    if (visible && !visible.has(column.subject_id)) continue;
    const result = row.subjects[column.subject_id];
    if (!result || result.status === "ne") continue;
    scores.required += 1;
    if (result.status === "ready") scores.filled += 1;
    else missing.push({ kind: "subject", label: column.subject_name });
  }
  const sections = [scores];
  // Comments, attendance and traits belong to the class teacher's full report, not a subject-scoped view.
  if (!visible) {
    const studentId = row.student.id;
    const comments = section("comments");
    const attendance = section("attendance");
    const remarks = readRemarks(termId, point, studentId);
    for (const field of fields) {
      if (field.kind === "attendance") {
        attendance.required += 1;
        if (readAttendance(termId, studentId).present !== null) attendance.filled += 1;
        else missing.push({ kind: "attendance" });
      } else {
        comments.required += 1;
        if (remarks[field.key].trim()) comments.filled += 1;
        else missing.push({ kind: "remark", role: field.role });
        // British: the Form Tutor / Boarding House comment also needs its grade.
        if (computed.mode === "grade_based" && isCommentGradeRole(field.role)) {
          comments.required += 1;
          if (commentGradeOf(termId, point, studentId, field.role)) comments.filled += 1;
          else missing.push({ kind: "grade", role: field.role });
        }
      }
    }
    sections.push(comments, attendance);
    // Psychomotor / Affective: General, Exam point only (never CA).
    if (computed.mode === "component_based" && point === "exam") {
      const traits = section("traits");
      const stored = storedTraits(termId, studentId);
      // Each item on the class's School Type list (Setup › Psychomotor Skills / Affective Domain), rated with a live level.
      for (const kind of TRAIT_MASTER_KINDS) {
        const keys = traitLists[kind].map((item) => item.key);
        const count = keys.filter((key) => !!progressGradeById(stored?.ratings[key] ?? null)).length;
        traits.required += keys.length;
        traits.filled += count;
        if (count < keys.length) missing.push({ kind, count: keys.length - count });
      }
      sections.push(traits);
    }
  }
  const filled = sections.reduce((total, item) => total + item.filled, 0);
  const required = sections.reduce((total, item) => total + item.required, 0);
  return { filled, required, percent: weightedProgressionPercent(sections), sections, missing };
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

/** One scoped student: the subjects their row covers (null = the whole report). */
type ScopedRow = { row: ComputedRow; visible: Set<string> | null };
type ArmRun = { armId: string; armName: string; computed: Computed; canManage: boolean; rows: ScopedRow[] };
type ClassRun = { cls: (typeof SEED_CLASSES)[number]; runs: ArmRun[] } & ReportSpec;

/**
 * The caller's rows in one arm (standard effective_scope): a full-report
 * role sees every student; a subject teacher sees only the students they
 * teach (subject-set aware), each limited to the subjects they teach them.
 */
function scopeArm(armId: string, computed: Computed): { canManage: boolean; rows: ScopedRow[] } {
  const role = armRole(armId);
  if (role !== "subject_teacher") return { canManage: true, rows: computed.rows.map((row) => ({ row, visible: null })) };
  const subjects = taughtSubjects(armId);
  const rows: ScopedRow[] = [];
  for (const row of computed.rows) {
    const taught = subjects.filter((id) => row.subjects[id] && row.subjects[id].status !== "ne" && teachesStudent(armId, id, row.student.id));
    if (taught.length > 0) rows.push({ row, visible: new Set(taught) });
  }
  return { canManage: false, rows };
}

/** Every in-scope arm of the class, computed for the point. null = nobody in scope. */
async function runClass(classId: string, termId: string, point: ProgressionPoint): Promise<ClassRun | WireResponse | null> {
  const cls = SEED_CLASSES.find((item) => item.id === classId);
  if (!cls) return fail(404, "CLASS_NOT_FOUND", "Class not found");
  const runs: ArmRun[] = [];
  for (const arm of cls.arms) {
    if (!armInScope(arm.id)) continue;
    const computed = await compute(arm.id, termId, stageOf(point));
    if ("status" in computed) return computed;
    const scoped = scopeArm(arm.id, computed);
    if (scoped.rows.length > 0) runs.push({ armId: arm.id, armName: arm.name, computed, ...scoped });
  }
  return runs.length > 0 ? { cls, runs, fields: await reportFieldDecls(cls.id, point), traits: await classTraitLists(cls.id) } : null;
}

function studentRow(run: ArmRun, { row, visible }: ScopedRow, termId: string, point: ProgressionPoint, examIds: Set<string>, spec: ReportSpec): ProgressionStudent {
  const { filled, required, percent, missing } = completeness(run.computed, row, termId, point, visible, spec);
  const remarks = readRemarks(termId, point, row.student.id);
  const attendance = readAttendance(termId, row.student.id);
  const commentsAt = [remarks.updated_at, attendance.updated_at].filter((at): at is string => !!at).sort().pop() ?? null;
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
    progression_percent: percent,
    missing,
    latest_activity: latestOf([
      latestEntry(examIds, run.armId, row.student.id),
      // Traits don't record who saved them (the class teacher of the arm).
      traits?.updated_at ? { kind: "traits", at: traits.updated_at, by: null } : null,
      // Comments + attendance (report-only fields); who saved them isn't surfaced here.
      commentsAt ? { kind: "comments", at: commentsAt, by: null } : null,
      event("published", stored?.published),
      event("unpublished", stored?.unpublished),
      event("stamped", stored?.stamped),
    ]),
    published: stored?.published ? { at: stored.published.at, by: actor(stored.published.by) } : null,
    stamped: stored?.stamped ? { at: stored.stamped.at, by: actor(stored.stamped.by) } : null,
    // DEC-008: the published PDF job isn't built — no file yet.
    pdf_file_id: null,
    pdf_url: null,
    can_manage: run.canManage,
    visible_subject_ids: visible ? Array.from(visible) : null,
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
    let percents = 0;
    const subjects = new Set<string>();
    for (const armRun of run.runs) {
      for (const { row, visible } of armRun.rows) {
        armRun.computed.columns.forEach((column) => {
          if (!visible || visible.has(column.subject_id)) subjects.add(column.subject_id);
        });
        const result = completeness(armRun.computed, row, termId, point, visible, run);
        filled += result.filled;
        required += result.required;
        percents += result.percent;
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
      // The mean of the students' (section-weighted) percents.
      progression_percent: students > 0 ? Math.round(percents / students) : 0,
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
  const rows = run.runs.flatMap((armRun) => armRun.rows.map((scoped) => studentRow(armRun, scoped, termId, point, examIds, run)));
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
    classes: SEED_CLASSES.filter((cls) => cls.arms.some((arm) => armInScope(arm.id))).map((cls) => ({ id: cls.id, name: cls.name })),
    can_manage: rows.some((row) => row.can_manage),
    subject_scoped: rows.some((row) => !row.can_manage),
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
      if (!row.can_manage) return fail(403, "FORBIDDEN", "Only the form tutor or a report manager can publish or stamp this report.");
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

// ---------------------------------------------------------------------------
// Stage 2 — student-wise entry (studentEntryApi.ts)
// ---------------------------------------------------------------------------

type StudentLookup = {
  run: ClassRun;
  armRun: ArmRun;
  scoped: ScopedRow;
  rows: ProgressionStudent[];
  termId: string;
  yearId: string;
  point: ProgressionPoint;
};

/** The student's report in the caller's scope for term × point (the class view's rows, so scope matches Stage 1). */
async function lookupStudent(studentId: string, termParam: string, pointParam: string): Promise<StudentLookup | WireResponse> {
  if (!isProgressionPoint(pointParam)) return fail(422, "VALIDATION_ERROR", "point must be ca or exam");
  const armId = armOfStudent(studentId);
  const classId = armId ? classOfArm(armId) : null;
  if (!armId || !classId) return fail(404, "STUDENT_NOT_FOUND", "Student not found");
  const resolved = resolveYearTerm(new URLSearchParams(termParam ? { term_id: termParam } : {}));
  if ("status" in resolved) return resolved;
  const { yearId, termId } = resolved;
  if (!enrolledForTerm(studentId, termId)) return fail(404, "NOT_ENROLLED_FOR_TERM", "This student wasn't enrolled in their class for that term.");
  const result = await classRows(classId, termId, pointParam);
  if ("status" in result) return result;
  const armRun = result.run.runs.find((item) => item.armId === armId);
  const scoped = armRun?.rows.find((item) => item.row.student.id === studentId);
  if (!armRun || !scoped) return fail(403, "OUT_OF_SCOPE", "You don't have access to this student's report.");
  return { run: result.run, armRun, scoped, rows: result.rows, termId, yearId, point: pointParam };
}

/** British: the Form Tutor / Boarding House comments carry a grade. */
function isGraded(mode: Computed["mode"], decl: FieldDecl): boolean {
  return mode === "grade_based" && decl.kind === "comment" && isCommentGradeRole(decl.role);
}

/** The saved grade (a live British Progress Grade id) for the comment at the point; null = not graded. */
function commentGradeOf(termId: string, point: ProgressionPoint, studentId: string, role: CommentGradeRole): string | null {
  const id = storedTraits(termId, studentId)?.ratings[commentGradeKey(role, point)] ?? null;
  return progressGradeById(id)?.mode === "british" ? id : null;
}

function reportFieldOf(armId: string, decl: FieldDecl, mode: Computed["mode"]): ReportField {
  const editable = canWriteField(armId, decl);
  return decl.kind === "attendance" ? { kind: "attendance", editable } : { kind: "comment", key: decl.key, role: decl.role, editable, graded: isGraded(mode, decl) };
}

async function studentEntry(found: StudentLookup, status: PublishStatusFilter): Promise<StudentEntry> {
  const { run, armRun, scoped, termId, yearId, point } = found;
  const studentId = scoped.row.student.id;
  const canManage = armRun.canManage;
  const fields = canManage ? run.fields : [];
  const progress = completeness(armRun.computed, scoped.row, termId, point, scoped.visible, run);

  // Prev / next through the class view's list (same scope + order, status filter applied; the student stays reachable).
  const list = found.rows.filter((row) => status === "all" || (status === "published" ? !!row.published : !row.published) || row.student_id === studentId);
  const index = list.findIndex((row) => row.student_id === studentId);
  const ref = (row: ProgressionStudent | undefined) => (row ? { id: row.student_id, name: row.student_name } : null);

  const exams = (await examIndex()).forClass(run.cls.id, termId).filter((exam) => exam.category === point);
  const terms = seedTerms(yearId);
  const storedRemarks = readRemarks(termId, point, studentId);
  const remarks = Object.fromEntries(REMARK_KEYS.map((key) => [key, storedRemarks[key]])) as Record<RemarkKey, string>;
  const { present, absent, open_days, sessions_per_day, total_sessions } = await attendanceOf(termId, studentId);
  const attendance = { present, absent, open_days, sessions_per_day, total_sessions };
  return {
    student: {
      id: studentId,
      name: scoped.row.student.name,
      admission_no: scoped.row.student.admission_no,
      photo_url: seedStudentProfile(studentId)?.photo_url ?? null,
    },
    class_id: run.cls.id,
    class_name: run.cls.name,
    class_arm_id: armRun.armId,
    arm_name: armRun.armName,
    assessment_mode: armRun.computed.mode,
    academic_year_id: yearId,
    terms,
    term_id: termId,
    term_name: terms.find((term) => term.id === termId)?.name ?? "",
    point,
    exams,
    can_manage: canManage,
    visible_subject_ids: scoped.visible ? Array.from(scoped.visible) : null,
    report_fields: fields.map((decl) => reportFieldOf(armRun.armId, decl, armRun.computed.mode)),
    remarks: canManage ? remarks : null,
    attendance: canManage && fields.some((decl) => decl.kind === "attendance") ? attendance : null,
    comment_grades: commentGradesOf(found, fields),
    traits_apply: canManage && armRun.computed.mode === "component_based" && point === "exam",
    progression: { percent: progress.percent, filled: progress.filled, required: progress.required, sections: progress.sections, missing: progress.missing },
    navigation: { index, count: list.length, previous: ref(list[index - 1]), next: ref(list[index + 1]) },
  };
}

/** The graded comments' scale + this point's saved grades (British, full-report caller); null = none graded here. */
function commentGradesOf(found: StudentLookup, fields: FieldDecl[]): CommentGrades | null {
  const roles = fields.filter((decl) => isGraded(found.armRun.computed.mode, decl)).map((decl) => (decl.kind === "comment" ? decl.role : null));
  const graded = roles.filter((role): role is CommentGradeRole => !!role && isCommentGradeRole(role));
  if (graded.length === 0) return null;
  const studentId = found.scoped.row.student.id;
  return {
    scale: progressGrades("british").map((level) => ({ id: level.id, value: String(level.value), label: level.name })),
    values: Object.fromEntries(graded.map((role) => [role, commentGradeOf(found.termId, found.point, studentId, role)])),
  };
}

async function getStudentEntry(studentId: string, query: URLSearchParams): Promise<WireResponse> {
  const status = query.get("status") || "all";
  if (!isPublishStatusFilter(status)) return fail(422, "VALIDATION_ERROR", "status must be all, published or unpublished");
  const found = await lookupStudent(studentId, query.get("term_id") ?? "", query.get("point") ?? "ca");
  if ("status" in found) return found;
  return ok(await studentEntry(found, status));
}

async function putReportFields(studentId: string, payload: unknown): Promise<WireResponse> {
  const body = record(payload);
  const termId = typeof body.term_id === "string" ? body.term_id : "";
  if (!termId) return fail(422, "VALIDATION_ERROR", "term_id is required");
  const found = await lookupStudent(studentId, termId, typeof body.point === "string" ? body.point : "");
  if ("status" in found) return found;
  const { run, armRun, point } = found;
  if (!armRun.canManage) return fail(403, "FORBIDDEN", "Only the form tutor or a report manager can enter this report's comments.");

  const remarks: Partial<Record<RemarkKey, string>> = {};
  for (const [key, value] of Object.entries(record(body.remarks))) {
    const decl = run.fields.find((field) => field.kind === "comment" && field.key === key);
    if (!decl || !(REMARK_KEYS as readonly string[]).includes(key)) return fail(422, "VALIDATION_ERROR", `remarks.${key}: not a comment on this report`);
    if (!canWriteField(armRun.armId, decl)) return fail(403, "FORBIDDEN", `remarks.${key}: you can't write this comment`);
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > REMARK_MAX) return fail(422, "VALIDATION_ERROR", `remarks.${key}: must be ${REMARK_MAX} characters or fewer`);
    remarks[key as RemarkKey] = text;
  }

  let present: number | null | undefined;
  if ("attendance_present" in body) {
    const decl = run.fields.find((field) => field.kind === "attendance");
    if (!decl) return fail(422, "VALIDATION_ERROR", "attendance_present: this report has no attendance");
    if (!canWriteField(armRun.armId, decl)) return fail(403, "FORBIDDEN", "attendance_present: only the class teacher can record attendance");
    const total = (await attendanceOf(found.termId, studentId)).total_sessions;
    const value = body.attendance_present;
    if (value !== null && !(typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= total)) {
      return fail(422, "VALIDATION_ERROR", `attendance_present: must be a whole number from 0 to ${total}`);
    }
    present = value as number | null;
  }

  // British comment grades: only on a graded comment of this report, writable by whoever may write the comment.
  const grades: Record<string, string | null> = {};
  const britishLevels = new Set(progressGrades("british").map((level) => level.id));
  for (const [role, value] of Object.entries(record(body.comment_grades))) {
    const decl = run.fields.find((field) => field.kind === "comment" && field.role === role);
    if (!decl || !isCommentGradeRole(role) || !isGraded(armRun.computed.mode, decl)) return fail(422, "VALIDATION_ERROR", `comment_grades.${role}: not a graded comment on this report`);
    if (!canWriteField(armRun.armId, decl)) return fail(403, "FORBIDDEN", `comment_grades.${role}: you can't grade this comment`);
    if (value !== null && !(typeof value === "string" && britishLevels.has(value))) return fail(422, "VALIDATION_ERROR", `comment_grades.${role}: not a level of the British progress grades`);
    grades[commentGradeKey(role, point)] = value as string | null;
  }

  if (Object.keys(remarks).length > 0) writeRemarks(found.termId, point, studentId, remarks);
  if (Object.keys(grades).length > 0) writeTraitRatings(found.termId, studentId, grades);
  if (present !== undefined) writeAttendance(found.termId, studentId, present);
  const refreshed = await lookupStudent(studentId, found.termId, point);
  if ("status" in refreshed) return refreshed;
  return ok(await studentEntry(refreshed, "all"));
}

// ---------------------------------------------------------------------------
// Stage 3: Psychomotor / Affective ratings (contract: studentTraitsApi.ts)
// ---------------------------------------------------------------------------

function isTraitKind(value: unknown): value is TraitMasterKind {
  return (TRAIT_MASTER_KINDS as readonly unknown[]).includes(value);
}

/** The student's Exam-point report in scope, General only, viewable by a full-report role. */
async function lookupTraits(studentId: string, termId: string, kind: unknown): Promise<StudentLookup | WireResponse> {
  if (!isTraitKind(kind)) return fail(422, "VALIDATION_ERROR", "kind must be psychomotor or affective");
  if (!termId) return fail(422, "VALIDATION_ERROR", "term_id is required");
  const found = await lookupStudent(studentId, termId, "exam");
  if ("status" in found) return found;
  if (found.armRun.computed.mode !== "component_based") return fail(422, "TRAITS_NOT_APPLICABLE", "Psychomotor and affective ratings apply to General classes only.");
  if (!found.armRun.canManage) return fail(403, "FORBIDDEN", "Only the form tutor or a report manager can see this student's traits.");
  return found;
}

/** DEC-009, like the class-teacher comment: the arm's directly-assigned class teacher, or an admin (the credential). */
function canRateTraits(armId: string): boolean {
  const role = armRole(armId);
  return role === "admin" || role === "class_teacher";
}

function traitEntry(found: StudentLookup, kind: TraitMasterKind): StudentTraitEntry {
  const studentId = found.scoped.row.student.id;
  const stored = storedTraits(found.termId, studentId);
  return {
    student: { id: studentId, name: found.scoped.row.student.name, photo_url: seedStudentProfile(studentId)?.photo_url ?? null },
    class_name: found.run.cls.name,
    arm_name: found.armRun.armName,
    term_id: found.termId,
    kind,
    items: found.run.traits[kind].map(({ key, label }) => {
      const id = stored?.ratings[key] ?? null;
      return { key, label, progress_grade_id: progressGradeById(id) ? id : null };
    }),
    rating_scale: progressGrades("general").map((level) => ({ id: level.id, value: String(level.value), label: level.name })),
    editable: canRateTraits(found.armRun.armId),
    updated_at: stored?.updated_at ?? null,
  };
}

async function getStudentTraitEntry(studentId: string, query: URLSearchParams): Promise<WireResponse> {
  const kind = query.get("kind");
  const found = await lookupTraits(studentId, query.get("term_id") ?? "", kind);
  if ("status" in found) return found;
  return ok(traitEntry(found, kind as TraitMasterKind));
}

async function putStudentTraitEntry(studentId: string, payload: unknown): Promise<WireResponse> {
  const body = record(payload);
  const found = await lookupTraits(studentId, typeof body.term_id === "string" ? body.term_id : "", body.kind);
  if ("status" in found) return found;
  const kind = body.kind as TraitMasterKind;
  if (!canRateTraits(found.armRun.armId)) return fail(403, "FORBIDDEN", "Only the student's class teacher (or an admin) can rate traits.");
  const listed = new Set(found.run.traits[kind].map((item) => item.key));
  const levels = new Set(progressGrades("general").map((level) => level.id));
  const ratings: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(record(body.ratings))) {
    if (!listed.has(key)) return fail(422, "VALIDATION_ERROR", `ratings.${key}: not on this class's ${kind} list`);
    if (value !== null && !(typeof value === "string" && levels.has(value))) return fail(422, "VALIDATION_ERROR", `ratings.${key}: not a level of the General progress grades`);
    ratings[key] = value as string | null;
  }
  if (Object.keys(ratings).length > 0) writeTraitRatings(found.termId, studentId, ratings);
  return ok(traitEntry(found, kind));
}

/** Routes erp/report-progression/*; null = not ours. */
export async function handleReportProgression(method: HttpMethod, path: string, query: URLSearchParams, payload: unknown): Promise<WireResponse | null> {
  if (!path.startsWith("erp/report-progression")) return null;
  if (path === "erp/report-progression/classes" && method === "GET") return getClasses(query);
  const classMatch = path.match(/^erp\/report-progression\/classes\/([^/]+)$/);
  if (classMatch && method === "GET") return getClassView(decodeURIComponent(classMatch[1]), query);
  const studentMatch = path.match(/^erp\/report-progression\/students\/([^/]+)$/);
  if (studentMatch && method === "GET") return getStudentEntry(decodeURIComponent(studentMatch[1]), query);
  const traitsMatch = path.match(/^erp\/report-progression\/students\/([^/]+)\/traits$/);
  if (traitsMatch && method === "GET") return getStudentTraitEntry(decodeURIComponent(traitsMatch[1]), query);
  if (traitsMatch && method === "PUT") return putStudentTraitEntry(decodeURIComponent(traitsMatch[1]), payload);
  const fieldsMatch = path.match(/^erp\/report-progression\/students\/([^/]+)\/report-fields$/);
  if (fieldsMatch && method === "PUT") return putReportFields(decodeURIComponent(fieldsMatch[1]), payload);
  const actionMatch = path.match(/^erp\/report-progression\/(publish|unpublish|stamp)$/);
  if (actionMatch && method === "POST") return postAction(actionMatch[1] as ProgressionAction, payload);
  return fail(404, "NOT_FOUND", `Route not found: ${method} ${path}`);
}
