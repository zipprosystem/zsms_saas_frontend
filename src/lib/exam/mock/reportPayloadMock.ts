import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { buildMarkColumns, shownTotal } from "@/lib/exam/markColumns";
import type { Exam } from "@/lib/exam/examTypes";
import type { SubjectResult } from "@/lib/exam/results/resultsTypes";
import type {
  ClassPdfJob,
  ReportComponent,
  ReportPayload,
  ReportSubject,
  ReportVariant,
} from "@/lib/exam/report/reportPayload";
import { resultTemplatesService } from "@/lib/setup/assessmentConfiguration/resultTemplatesApi";
import {
  SEED_AFFECTIVE,
  SEED_PSYCHOMOTOR,
  SEED_RATING_SCALES,
  SEED_TEACHERS,
  SEED_TRAIT_SCALE,
  SEED_YEARS,
  seedTerms,
  termNumber,
  yearOfTerm,
} from "@/lib/exam/mock/examMockSeeds";
import { armInScope, readGradeMark, readScoreMark } from "@/lib/exam/mock/examMockStore";
import { armOfStudent, classAverage, compute, storedTraits, termPoints, viewerFor, type Computed, type ComputedRow } from "@/lib/exam/mock/examResultsMock";

/**
 * MOCK report payload (reportPayload.ts has the contract) — built on read
 * from the same computation the results screens use (examResultsMock →
 * resultsEngine), so every number is the engine's. The real backend
 * serves the same shape.
 *
 *   GET  erp/results/:student_id/report?term_id=&variant=
 *   POST erp/report-cards/generate       (stub: the class PDF is a server job)
 *
 * MOCK-ONLY data, FLAGGED: the school block, term dates and each class's
 * selected template are seeds here (the real ones come from the tenant's
 * school profile, the academic calendar and the School Type's assigned
 * result template). Attendance, gender, date of birth and photo have no
 * source yet (null → the template shows "—").
 */

const SEED_SCHOOL: ReportPayload["school"] = {
  name: "ZSMS Demo School",
  logo_url: null,
  address: "1 Example Road, Lagos",
  motto: "Learning for life",
};

/** Term start/end dates — the academic calendar isn't in the Exam mock yet. */
const TERM_DATES: Record<string, [string, string]> = {
  "y-2025-t1": ["2025-09-08", "2025-12-19"],
  "y-2025-t2": ["2026-01-12", "2026-04-03"],
  "y-2025-t3": ["2026-04-27", "2026-07-24"],
  "y-2026-t1": ["2026-09-07", "2026-12-18"],
  "y-2026-t2": ["2027-01-11", "2027-04-02"],
  "y-2026-t3": ["2027-04-26", "2027-07-23"],
};

/**
 * The result template each mock class reports in (template_key in the
 * Result Templates catalog). Stands in for "the School Type's selected
 * template" — the Exam mock's classes aren't linked to School Types.
 */
const CLASS_TEMPLATE_KEY: Record<string, string> = {
  "cls-jss1": "lela_blossom",
  "cls-ss1": "nigerian_terminal",
  "cls-y9": "british_progress",
  "cls-y11": "british_progress",
};

/** Pages each built-in template declares (the template file's own zsms-report-pages meta is the source of truth). */
const TEMPLATE_PAGES: Record<string, 1 | 2> = { lela_blossom: 2 };

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

/** The next term's start date (after Third Term: the next academic year's first term). */
function resumptionDate(termId: string): string | null {
  const year = yearOfTerm(termId);
  const n = termNumber(termId);
  if (n < 3) return TERM_DATES[`${year}-t${n + 1}`]?.[0] ?? null;
  const years = [...SEED_YEARS].sort((a, b) => a.id.localeCompare(b.id));
  const next = years[years.findIndex((item) => item.id === year) + 1];
  return next ? (TERM_DATES[`${next.id}-t1`]?.[0] ?? null) : null;
}

async function selectedTemplate(classId: string): Promise<{ id: string | null; pages: 1 | 2 }> {
  const result = await resultTemplatesService.list();
  const templates = result.ok ? result.data.filter((template) => template.status !== "archived") : [];
  const key = CLASS_TEMPLATE_KEY[classId];
  const chosen = templates.find((template) => template.template_key === key) ?? templates.find((template) => template.is_default) ?? null;
  return { id: chosen?.id ?? null, pages: (chosen?.template_key && TEMPLATE_PAGES[chosen.template_key]) || 1 };
}

function teacherOf(subjectId: string, armId: string): string | null {
  return SEED_TEACHERS.find((teacher) => teacher.assignments.some((a) => a.subject_id === subjectId && a.class_arm_id === armId))?.name ?? null;
}

/** Default variant: Full once the term's second point (Exam / B) has any mark for the student, else Progress. */
function defaultVariant(computed: Computed, armId: string, termId: string, studentId: string): ReportVariant {
  const points = termPoints(termId, computed.mode);
  const second = points[points.length - 1];
  if (!second) return "progress";
  const subjects = computed.columns.map((column) => column.subject_id);
  const entered =
    computed.mode === "grade_based"
      ? subjects.some((id) => Object.values(readGradeMark(second, id, armId, studentId, computed.gradeStructure)?.component_scores ?? {}).some(Boolean))
      : subjects.some((id) => {
          const scores = readScoreMark(second, id, armId, studentId, computed.structure)?.component_scores ?? {};
          return Object.values(scores).some((value) => typeof value === "number");
        });
  return entered ? "full" : "progress";
}

const REDACTED: Omit<ReportSubject, "name" | "teacher_name"> = {
  components: [],
  ca: null,
  exam: null,
  total: null,
  grade: null,
  grade_weight: null,
  gpa: null,
  remark: null,
  position: null,
  cag: null,
  mtg: null,
  va: null,
  comment: null,
  redacted: true,
};

function generalSubject(computed: Computed, result: SubjectResult, point: (kind: "ca" | "exam") => Exam | undefined, armId: string, studentId: string) {
  const structure = computed.structure;
  const kinds = computed.stage === "progress" ? (["ca"] as const) : (["ca", "exam"] as const);
  const components: ReportComponent[] = [];
  const totals: Record<"ca" | "exam", number | null> = { ca: null, exam: null };
  let comment: string | null = null;
  for (const kind of kinds) {
    const exam = point(kind);
    if (!structure || !exam) continue;
    const mark = readScoreMark(exam, result.subject_id, armId, studentId, structure);
    const scores = mark?.component_scores ?? {};
    const groups = buildMarkColumns(structure, kind);
    for (const group of groups) {
      for (const leaf of group.leaves) {
        const score = scores[leaf.id];
        components.push({
          label: group.hasTotal ? `${group.component.name}: ${leaf.name}` : leaf.name,
          score: typeof score === "number" ? score : null,
          max: leaf.max,
          kind,
        });
      }
    }
    totals[kind] = shownTotal(groups, scores).value;
    if (kind === "exam") comment = mark?.subject_remark?.trim() || null;
  }
  return {
    components,
    ca: totals.ca,
    exam: totals.exam,
    total: result.total,
    grade: result.grade,
    grade_weight: result.grade_weight,
    gpa: result.gpa,
    remark: result.remark,
    position: result.subject_position,
    cag: null,
    mtg: null,
    va: null,
    comment,
    redacted: false,
  };
}

function britishSubject(computed: Computed, result: SubjectResult, reportPoint: Exam | undefined, armId: string, studentId: string) {
  const structure = computed.gradeStructure;
  const mark = structure && reportPoint ? readGradeMark(reportPoint, result.subject_id, armId, studentId, structure) : null;
  const scores = mark?.component_scores ?? {};
  const components: ReportComponent[] = (structure?.rating_domains ?? []).map((domain) => {
    const code = scores[domain.id];
    const level = code ? Number(code) : NaN;
    return {
      label: domain.name,
      score: Number.isFinite(level) ? level : null,
      max: SEED_RATING_SCALES.find((scale) => scale.id === domain.rating_scale_id)?.levels.length ?? 0,
      kind: "rating" as const,
    };
  });
  return {
    components,
    ca: null,
    exam: null,
    total: null,
    grade: null,
    grade_weight: null,
    gpa: null,
    remark: null,
    position: null,
    cag: result.cag,
    mtg: result.mtg,
    va: result.va,
    comment: computed.stage === "full" ? mark?.subject_remark?.trim() || null : null,
    redacted: false,
  };
}

function buildPayload(
  computed: Computed,
  row: ComputedRow,
  armId: string,
  termId: string,
  template: { id: string | null; pages: 1 | 2 },
): ReportPayload {
  const viewer = viewerFor(armId);
  const visible = viewer.visible_subject_ids ? new Set(viewer.visible_subject_ids) : null;
  const general = computed.mode === "component_based";
  const points = termPoints(termId, computed.mode);
  const pointOf = (kind: "ca" | "exam") => points.find((exam) => exam.kind === kind);
  const reportPoint = computed.stage === "progress" ? points[0] : points[points.length - 1];

  const subjects: ReportSubject[] = computed.columns.flatMap((column) => {
    const result = row.subjects[column.subject_id];
    // Not offered / explicitly not enrolled -> not on the report.
    if (!result || result.status === "ne") return [];
    const base = { name: column.subject_name, teacher_name: teacherOf(column.subject_id, armId) };
    if (visible && !visible.has(column.subject_id)) return [{ ...base, ...REDACTED }];
    return [{ ...base, ...(general ? generalSubject(computed, result, pointOf, armId, row.student.id) : britishSubject(computed, result, reportPoint, armId, row.student.id)) }];
  });

  // Report points: General = the term's points this report covers; British = the year's points up to this one.
  const structure = computed.structure;
  const reportPoints: ReportPayload["meta"]["points"] = general
    ? (computed.stage === "progress" ? (["ca"] as const) : (["ca", "exam"] as const)).flatMap((kind) => {
        const exam = pointOf(kind);
        return exam ? [{ label: exam.name, kind, max: structure ? shownTotal(buildMarkColumns(structure, kind), {}).outOf : null }] : [];
      })
    : seedTerms(yearOfTerm(termId))
        .filter((term) => termNumber(term.id) <= termNumber(termId))
        .flatMap((term) => termPoints(term.id, "grade_based"))
        .filter((exam) => exam.term_id !== termId || computed.stage === "full" || exam.id === points[0]?.id)
        .map((exam) => ({ label: exam.name, kind: exam.report_variant ?? "progress", max: null }));

  const own = viewer.report_scope === "own_subjects";
  const aggregate = row.aggregate;
  const stored = storedTraits(termId, row.student.id);
  const descriptor = (rating: number | null) => SEED_TRAIT_SCALE.find((level) => level.value === rating)?.label ?? null;
  const trait = ({ key, label }: { key: string; label: string }) => {
    const rating = stored?.ratings[key] ?? null;
    return { skill: label, rating, descriptor: descriptor(rating) };
  };
  const [startDate, endDate] = TERM_DATES[termId] ?? [null, null];

  return {
    meta: {
      template_id: template.id,
      variant: computed.stage,
      academic_year: { id: yearOfTerm(termId), name: SEED_YEARS.find((year) => year.id === yearOfTerm(termId))?.name ?? "" },
      term: { id: termId, name: computed.termName, number: termNumber(termId), start_date: startDate, end_date: endDate },
      points: reportPoints,
      pages: template.pages,
      generated_at: new Date().toISOString(),
      scope: viewer.report_scope,
      assessment_mode: computed.mode,
    },
    school: SEED_SCHOOL,
    student: {
      full_name: row.student.name,
      admission_no: row.student.admission_no,
      class: computed.className,
      arm: computed.armName,
      gender: null,
      dob: null,
      photo_url: null,
      resumption_date: resumptionDate(termId),
    },
    attendance: { present: null, absent: null, total_days: null, time_school_opened: null },
    subjects,
    aggregate: {
      grand_total: own ? null : aggregate.grand_total,
      average: own ? null : aggregate.average,
      overall_grade: own ? null : aggregate.overall_grade,
      class_position: own ? null : aggregate.class_position,
      gpa: own ? null : aggregate.gpa,
      cumulative_average: own || computed.stage === "progress" ? null : aggregate.cumulative_average,
      out_of: general ? computed.rankedCount : null,
      subjects_counted: own ? null : aggregate.subjects_counted,
      marks_obtainable: own || !general ? null : aggregate.subjects_counted * 100,
      class_average: classAverage(computed),
    },
    traits: {
      psychomotor: SEED_PSYCHOMOTOR.map(trait),
      affective: SEED_AFFECTIVE.map(trait),
      engagement: null,
      learning_behaviour: null,
      boarding: null,
      form_tutor_comment: null,
      rating_key: SEED_TRAIT_SCALE.map((level) => ({ rating: level.value, descriptor: level.label })),
    },
    remarks: {
      class_teacher: stored?.class_teacher_remark || null,
      head_teacher: stored?.head_teacher_remark || null,
    },
    grade_key: general
      ? (computed.scale?.bands ?? []).map((band) => ({ grade: band.grade, min: band.min, max: band.max, remark: band.remark, show_on_report: true, gpa: band.gpa }))
      : computed.levels.map((level) => ({ grade: level.code, min: null, max: null, remark: level.label, show_on_report: true, gpa: null })),
  };
}

export async function getStudentReport(studentId: string, query: URLSearchParams): Promise<WireResponse> {
  const termId = query.get("term_id") ?? "";
  if (!termId) return fail(422, "VALIDATION_ERROR", "term_id is required");
  const variantParam = query.get("variant");
  if (variantParam && variantParam !== "progress" && variantParam !== "full") return fail(422, "VALIDATION_ERROR", "variant must be progress or full");
  const armId = armOfStudent(studentId);
  if (!armId) return fail(404, "STUDENT_NOT_FOUND", "Student not found");

  let variant = variantParam as ReportVariant | null;
  if (!variant) {
    const full = await compute(armId, termId, "full");
    if ("status" in full) return full;
    if (!full.rows.some((item) => item.student.id === studentId)) return fail(404, "NOT_ENROLLED_FOR_TERM", "This student wasn't enrolled in their class for that term.");
    variant = defaultVariant(full, armId, termId, studentId);
  }
  const computed = await compute(armId, termId, variant);
  if ("status" in computed) return computed;
  const row = computed.rows.find((item) => item.student.id === studentId);
  if (!row) return fail(404, "NOT_ENROLLED_FOR_TERM", "This student wasn't enrolled in their class for that term.");
  return ok(buildPayload(computed, row, armId, termId, await selectedTemplate(computed.classId)));
}

/** Class PDF stub: the batch render is a backend job (async, cached) — the mock only answers "not available here". */
export function postGenerateClassPdf(payload: unknown): WireResponse {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const armId = typeof body.class_arm_id === "string" ? body.class_arm_id : "";
  const termId = typeof body.term_id === "string" ? body.term_id : "";
  if (!armId || !termId) return fail(422, "VALIDATION_ERROR", "class_arm_id and term_id are required");
  if (!armInScope(armId)) return fail(403, "OUT_OF_SCOPE", "You don't have access to this class-arm's results.");
  if (viewerFor(armId).report_scope !== "full") return fail(403, "FORBIDDEN", "Only a full-report role can generate the class PDF.");
  const job: ClassPdfJob = { job_id: null, status: "unavailable", download_url: null, message: null };
  return ok(job, 202);
}
