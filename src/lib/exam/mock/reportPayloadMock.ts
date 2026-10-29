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
  SEED_CLASS_TEACHERS,
  SEED_CLASS_SCHOOL_TYPE,
  SEED_PSYCHOMOTOR,
  SEED_TEACHERS,
  SEED_YEARS,
  enrolledForTerm,
  seedStudentProfile,
  seedTerms,
  termNumber,
  yearOfTerm,
} from "@/lib/exam/mock/examMockSeeds";
import { armInScope, readGradeMark, readScoreMark } from "@/lib/exam/mock/examMockStore";
import { subjectStats } from "@/lib/exam/mock/broadsheetMock";
import { loadExamSettings } from "@/lib/exam/mock/examSettingsMock";
import { levelWeight } from "@/lib/exam/results/resultsEngine";
import { classAttainmentBands } from "@/lib/exam/mock/gradesMock";
import { progressGradeById, progressGrades } from "@/lib/exam/mock/progressGradesMock";
import { reportTraitList } from "@/lib/exam/mock/traitMastersMock";
import { loadMockAssignments, mockReportLogoUrl } from "@/lib/setup/academicStructure/schoolTypeAssignments";
import { pointGradeBook } from "@/lib/exam/mock/gradeBookMock";
import type { ProgressGrade } from "@/lib/setup/assessmentConfiguration/progressGradesApi";
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
 * result template). Gender, date of birth and photo come from a seeded
 * stand-in for the student record (examMockSeeds.seedStudentProfile).
 *
 * Still null (the template shows "—"), each waiting on a later build:
 * attendance (Report Progression's present field), Form Tutor and
 * boarding (Report Progression's student-wise entry — the traits entry
 * doesn't capture them), British grade-boundary scores (grading
 * completion), the Grade Book GB score (Grade Book entry) and CEM / GL SAS
 * (external import).
 */

/** Mock Settings logo: a plain monogram badge, so the logo fallback shows on School Types without a report logo. */
const MOCK_SETTINGS_LOGO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#852b99"/><text x="50" y="62" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">ZS</text></svg>',
  );

/**
 * MOCK-ONLY, FLAGGED: the Settings fields the report header falls back
 * to / reads, at their SettingsData paths (src/lib/settings/types.ts).
 * identity.motto is an addition (Settings has no motto yet — backend
 * dependency). The logo fallback is branding.school_logo_url (the
 * Branding panel's school logo). The live payload resolves all of this
 * server-side; the report mock doesn't call the Settings API.
 */
const SEED_SETTINGS = {
  identity: {
    school_name: "ZSMS Demo School",
    phone: "+234 800 000 0000",
    email: "info@zsms-demo.example",
    website: "www.zsms-demo.example",
    motto: "Learning for life",
  },
  regional: { address: "1 Example Road, Lagos" },
  branding: { school_logo_url: MOCK_SETTINGS_LOGO as string | null },
};

/**
 * MOCK-ONLY, FLAGGED: a School Type's report identity — report_display_name
 * (the school name General headers and the British cover print), motto
 * (General header) and mission statement (British cover). School Types
 * don't carry these fields yet (backend dependency; the Setup screen to
 * edit them is a separate backlog item). The logo is real: the School
 * Type's report logo (Setup › School Types). A missing / blank field
 * falls back to Settings.
 */
const SCHOOL_TYPE_IDENTITY: Record<string, { report_display_name: string | null; motto: string | null; mission_statement: string | null }> = {
  "dev-school-type-primary": { report_display_name: "ZSMS Demo Primary School", motto: null, mission_statement: null },
  "dev-school-type-jss": { report_display_name: "ZSMS Demo Junior Secondary School", motto: "Knowledge, Discipline, Service", mission_statement: null },
  "dev-school-type-igcse": {
    report_display_name: "ZSMS Demo International College",
    motto: null,
    mission_statement: "We provide an excellent education that inspires every learner to lead, to serve and to excel in a global world.",
  },
};

/** Blank → null, so the template drops that line. */
function present(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The school block for a class. Name, logo and motto: the class's School
 * Type first, else Settings. Address / phone / email / website: Settings.
 */
function schoolBlock(schoolTypeId: string | null): ReportPayload["school"] {
  const identity = schoolTypeId ? SCHOOL_TYPE_IDENTITY[schoolTypeId] : undefined;
  const typeLogo = schoolTypeId ? mockReportLogoUrl(loadMockAssignments(schoolTypeId).report_logo_file_id) : null;
  return {
    name: present(identity?.report_display_name) ?? SEED_SETTINGS.identity.school_name,
    logo_url: present(typeLogo) ?? present(SEED_SETTINGS.branding.school_logo_url),
    address: present(SEED_SETTINGS.regional.address),
    phone: present(SEED_SETTINGS.identity.phone),
    email: present(SEED_SETTINGS.identity.email),
    website: present(SEED_SETTINGS.identity.website),
    motto: present(identity?.motto) ?? present(SEED_SETTINGS.identity.motto),
    mission_statement: present(identity?.mission_statement),
  };
}

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
const TEMPLATE_PAGES: Record<string, number> = { lela_blossom: 2, british_progress: 4 };

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

async function selectedTemplate(classId: string): Promise<{ id: string | null; pages: number }> {
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
  units: null,
  class_highest: null,
  class_lowest: null,
  class_average: null,
  cumulative_average: null,
  earlier_terms: [],
  history: [],
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

/**
 * A British report's columns (oldest first): every point of each term up
 * to this one — Term 1 → 1A,1B; Term 3 → 1A…3B. Points after the report
 * point (the term's B on a Progress report) stay listed but blank.
 */
function britishReportPoints(termId: string): Exam[] {
  return seedTerms(yearOfTerm(termId))
    .filter((term) => termNumber(term.id) <= termNumber(termId))
    .flatMap((term) => termPoints(term.id, "grade_based"));
}

/** Mean of the shown subjects' VA (engine values), 2 dp; null when none has one. */
function vaAverage(subjects: ReportSubject[]): number | null {
  const values = subjects.filter((subject) => !subject.redacted && typeof subject.va === "number").map((subject) => subject.va as number);
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}

/**
 * A British rating domain entry (a British Progress Grade, by id) as the
 * report prints it: the level's value, or null when not rated or the
 * level is hidden in reports (hide_in_report — it still counts; the report
 * just doesn't show it).
 */
function britishRatingShown(code: string | null | undefined): string | null {
  const level = progressGradeById(code);
  return level && level.mode === "british" && !level.hide_in_report ? level.value : null;
}

/** The report's level key for a Progress Grades scale: visible levels only, best first, with their descriptors. */
function ratingKey(levels: ProgressGrade[]): ReportPayload["traits"]["rating_key"] {
  return levels
    .filter((level) => !level.hide_in_report)
    .map((level) => ({ rating: level.value, descriptor: level.name, descriptors: { ...level.descriptors } }));
}

function britishSubject(computed: Computed, result: SubjectResult, reportPoint: Exam | undefined, history: Exam[], currentIndex: number, armId: string, studentId: string) {
  const structure = computed.gradeStructure;
  const mark = structure && reportPoint ? readGradeMark(reportPoint, result.subject_id, armId, studentId, structure) : null;
  const scores = mark?.component_scores ?? {};
  const components: ReportComponent[] = (structure?.rating_domains ?? []).map((domain) => {
    return {
      label: domain.name,
      score: britishRatingShown(scores[domain.id]),
      // Levels on the British Progress Grades scale (hidden ones still count).
      max: progressGrades("british").length,
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
    // The subject Comment is a Full-report field only (null on a Progress report).
    comment: computed.stage === "full" && reportPoint?.report_variant === "full" ? mark?.subject_remark?.trim() || null : null,
    redacted: false,
    // What was entered at each column's point (before the student joined, or after the report point -> blank).
    history: history.map((exam, index) => {
      const enrolled = index <= currentIndex && enrolledForTerm(studentId, exam.term_id);
      const entry = structure && enrolled ? readGradeMark(exam, result.subject_id, armId, studentId, structure) : null;
      const at = entry?.component_scores ?? {};
      return {
        label: exam.name,
        attainment: (structure && at[structure.attainment.id]) || null,
        ratings: (structure?.rating_domains ?? []).map((domain) => britishRatingShown(at[domain.id])),
        // That point's Grade Book /100 (Grade Book page), unless the point hides it.
        grade_book: enrolled && exam.show_grade_book ? (pointGradeBook(exam, result.subject_id, armId, studentId)?.total ?? null) : null,
      };
    }),
  };
}

/** The arm's form tutor (its class teacher) with their term remark; null when the arm has no class teacher and no remark. */
function formTutor(armId: string, comment: string | null): ReportPayload["remarks"]["form_tutor"] {
  const staffId = SEED_CLASS_TEACHERS[armId];
  const name = staffId ? (SEED_TEACHERS.find((teacher) => teacher.id === staffId)?.name ?? null) : null;
  return name || comment ? { name, comment } : null;
}

/** Earlier terms of the year, each with the engine's full-term run for the arm (General reports' earlier-term figures). */
type EarlierRun = { number: number; name: string; computed: Computed };

async function earlierRuns(armId: string, termId: string): Promise<EarlierRun[]> {
  const terms = seedTerms(yearOfTerm(termId)).filter((term) => termNumber(term.id) < termNumber(termId));
  const runs: EarlierRun[] = [];
  for (const term of terms) {
    const run = await compute(armId, term.id, "full");
    if (!("status" in run)) runs.push({ number: termNumber(term.id), name: term.name, computed: run });
  }
  return runs;
}

/** The skills / traits the report lists, in order: key = what a saved rating is stored under. */
type TraitLists = Record<"psychomotor" | "affective", Array<{ key: string; label: string }>>;

function buildPayload(
  computed: Computed,
  row: ComputedRow,
  armId: string,
  termId: string,
  template: { id: string | null; pages: number },
  earlier: EarlierRun[],
  traitLists: TraitLists,
  schoolType: string | null,
): ReportPayload {
  const viewer = viewerFor(armId);
  const visible = viewer.visible_subject_ids ? new Set(viewer.visible_subject_ids) : null;
  const general = computed.mode === "component_based";
  const points = termPoints(termId, computed.mode);
  const pointOf = (kind: "ca" | "exam") => points.find((exam) => exam.kind === kind);
  const reportPoint = computed.stage === "progress" ? points[0] : points[points.length - 1];
  const britishPoints = general ? [] : britishReportPoints(termId);
  const currentIndex = general || !reportPoint ? -1 : britishPoints.findIndex((exam) => exam.id === reportPoint.id);
  const earlierRow = (run: EarlierRun) => run.computed.rows.find((item) => item.student.id === row.student.id);

  const subjects: ReportSubject[] = computed.columns.flatMap((column) => {
    const result = row.subjects[column.subject_id];
    // Not offered / explicitly not enrolled -> not on the report.
    if (!result || result.status === "ne") return [];
    const base = { name: column.subject_name, teacher_name: teacherOf(column.subject_id, armId) };
    if (visible && !visible.has(column.subject_id)) return [{ ...base, ...REDACTED }];
    if (!general) {
      return [
        {
          ...base,
          ...britishSubject(computed, result, reportPoint, britishPoints, currentIndex, armId, row.student.id),
          units: column.unit,
          class_highest: null,
          class_lowest: null,
          class_average: null,
          cumulative_average: null,
          earlier_terms: [],
        },
      ];
    }
    // Class stats are over this report's run (Progress: the CA-only totals the report shows).
    const stats = subjectStats(computed, column.subject_id);
    return [
      {
        ...base,
        ...generalSubject(computed, result, pointOf, armId, row.student.id),
        units: column.unit,
        class_highest: stats.highest,
        class_lowest: stats.lowest,
        class_average: stats.average,
        cumulative_average: computed.stage === "full" ? result.cumulative_average : null,
        earlier_terms: earlier.map((run) => ({
          number: run.number,
          name: run.name,
          total: earlierRow(run)?.subjects[column.subject_id]?.total ?? null,
        })),
        history: [],
      },
    ];
  });

  // Report points: General = the term's points this report covers; British = the year's points up to this one.
  const structure = computed.structure;
  const reportPoints: ReportPayload["meta"]["points"] = general
    ? (computed.stage === "progress" ? (["ca"] as const) : (["ca", "exam"] as const)).flatMap((kind) => {
        const exam = pointOf(kind);
        return exam ? [{ label: exam.name, kind, max: structure ? shownTotal(buildMarkColumns(structure, kind), {}).outOf : null }] : [];
      })
    : britishPoints.map((exam) => ({ label: exam.name, kind: exam.report_variant ?? "progress", max: null }));

  const own = viewer.report_scope === "own_subjects";
  const aggregate = row.aggregate;
  const stored = storedTraits(termId, row.student.id);
  // A trait rating = a General Progress Grade (by id): its value + name. Hidden in reports -> the whole level is suppressed.
  const traitOf = ({ key, label }: { key: string; label: string }) => {
    const level = progressGradeById(stored?.ratings[key]);
    if (!level || level.hide_in_report) return { skill: label, rating: null, descriptor: null };
    return { skill: label, rating: level.value, descriptor: level.name };
  };
  const [startDate, endDate] = TERM_DATES[termId] ?? [null, null];
  const profile = seedStudentProfile(row.student.id);

  return {
    meta: {
      template_id: template.id,
      variant: computed.stage,
      academic_year: { id: yearOfTerm(termId), name: SEED_YEARS.find((year) => year.id === yearOfTerm(termId))?.name ?? "" },
      term: { id: termId, name: computed.termName, number: termNumber(termId), start_date: startDate, end_date: endDate },
      points: reportPoints,
      current_point_index: general || currentIndex < 0 ? null : currentIndex,
      pages: template.pages,
      generated_at: new Date().toISOString(),
      scope: viewer.report_scope,
      assessment_mode: computed.mode,
      attainment_display: loadExamSettings().attainment_display,
    },
    school: schoolBlock(schoolType),
    student: {
      full_name: row.student.name,
      admission_no: row.student.admission_no,
      class: computed.className,
      arm: computed.armName,
      gender: profile?.gender ?? null,
      dob: profile?.dob ?? null,
      photo_url: profile?.photo_url ?? null,
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
      earlier_terms:
        own || !general
          ? []
          : earlier.map((run) => {
              const before = earlierRow(run)?.aggregate;
              return {
                number: run.number,
                name: run.name,
                grand_total: before?.grand_total ?? null,
                average: before?.average ?? null,
                subjects_counted: before ? before.subjects_counted : null,
              };
            }),
      va_average: own || general ? null : vaAverage(subjects),
    },
    traits: {
      // The class's School Type lists (Setup › Psychomotor Skills / Affective Domain), in their sort order.
      psychomotor: traitLists.psychomotor.map(traitOf),
      affective: traitLists.affective.map(traitOf),
      engagement: null,
      learning_behaviour: null,
      boarding: null,
      form_tutor_comment: null,
      // General: the trait scale. British: the Engagement / Learning Behaviour / Boarding level key.
      rating_key: ratingKey(progressGrades(general ? "general" : "british")),
    },
    remarks: {
      class_teacher: stored?.class_teacher_remark || null,
      head_teacher: stored?.head_teacher_remark || null,
      // Form tutor = the arm's class teacher; comment = their term remark.
      form_tutor: formTutor(armId, stored?.class_teacher_remark || null),
      // Boarding: Report Progression's student-wise entry isn't built — nothing to send yet.
      boarding_house: null,
    },
    grade_key: general
      ? (computed.scale?.bands ?? []).map((band) => ({ grade: band.grade, min: band.min, max: band.max, remark: band.remark, show_on_report: true, gpa: band.gpa, weight: null }))
      : computed.levels.map((level) => {
          // Score range + show-on-report from the class's attainment band (Setup › Attainment Grades), when there is one.
          const band = classAttainmentBands(computed.classId).find((item) => item.grade === level.code);
          return {
            grade: level.code,
            min: band?.min_score ?? null,
            max: band?.max_score ?? null,
            remark: level.label,
            show_on_report: band?.show_on_report ?? true,
            gpa: null,
            weight: levelWeight(computed.levels, level.code),
          };
        }),
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
  const earlier = computed.mode === "component_based" ? await earlierRuns(armId, termId) : [];
  const schoolType = SEED_CLASS_SCHOOL_TYPE[computed.classId] ?? null;
  const traitLists: TraitLists = {
    psychomotor: (await reportTraitList("psychomotor", schoolType)) ?? SEED_PSYCHOMOTOR,
    affective: (await reportTraitList("affective", schoolType)) ?? SEED_AFFECTIVE,
  };
  return ok(buildPayload(computed, row, armId, termId, await selectedTemplate(computed.classId), earlier, traitLists, schoolType));
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
