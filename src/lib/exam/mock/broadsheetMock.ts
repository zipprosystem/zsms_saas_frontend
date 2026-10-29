import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { round2, structureTotal } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { buildMarkColumns, shownTotal } from "@/lib/exam/markColumns";
import { cumulativeAverage, levelWeight, rankBy, studentStatus } from "@/lib/exam/results/resultsEngine";
import type {
  Broadsheet,
  BroadsheetCell,
  BroadsheetComparison,
  BroadsheetRow,
  BroadsheetSubject,
  CumulativeBroadsheet,
  CumulativeRow,
  CumulativeSubjectCell,
  CumulativeTermCell,
  ProgressionBroadsheet,
  ProgressionRow,
  ProgressionSubjectCell,
  ProgressionTermCell,
  TermTrend,
} from "@/lib/exam/broadsheet/broadsheetApi";
import { seedTerms, termNumber, yearOfTerm } from "@/lib/exam/mock/examMockSeeds";
import { readGradeMark, seededBaselines } from "@/lib/exam/mock/examMockStore";
import { pointGradeBook } from "@/lib/exam/mock/gradeBookMock";
import { classAverage, compute, RANKING_RULES, termPoints, viewerFor, type Computed, type ComputedRow } from "@/lib/exam/mock/examResultsMock";

/**
 * MOCK Broad Sheet (Exam Stage 2b) — contract in broadsheet/broadsheetApi.ts.
 * Built on read from the same engine run the results screens use
 * (examResultsMock.compute → resultsEngine); the per-subject foot stats
 * (average / highest / lowest) are computed here over that output.
 *
 *   GET erp/broadsheets?class_arm_id&term_id             (General, one term)
 *   GET erp/broadsheets/cumulative?class_arm_id&term_id  (General, the year so far)
 *   GET erp/broadsheets/progression?class_arm_id&term_id (British, both views)
 *
 * The cumulative view runs the engine once per term of the year up to the
 * selected one; a student missing from an earlier term's run wasn't in the
 * class then (late enrolment).
 */

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

function mean(values: number[], divisor = values.length): number | null {
  return divisor > 0 ? round2(values.reduce((sum, value) => sum + value, 0) / divisor) : null;
}

/**
 * Subject average = Σ totals ÷ students enrolled in the subject (blank = 0,
 * NE excluded); highest / lowest over the totals there are. Shared with
 * the report payload (reportPayloadMock) so both read the same numbers.
 */
export function subjectStats(computed: Computed, subjectId: string): Omit<BroadsheetSubject, "subject_id" | "subject_name"> {
  const enrolled = computed.rows.map((row) => row.subjects[subjectId]).filter((result) => result && result.status !== "ne");
  const totals = enrolled.map((result) => result.total).filter((total): total is number => total !== null);
  const anyScore = totals.length > 0;
  return {
    enrolled_count: enrolled.length,
    average: anyScore ? mean(totals, enrolled.length) : null,
    highest: anyScore ? Math.max(...totals) : null,
    lowest: anyScore ? Math.min(...totals) : null,
  };
}

function compare(total: number | null, average: number | null): BroadsheetComparison | null {
  if (total === null || average === null) return null;
  const difference = round2(total) - round2(average);
  return difference > 0 ? "above" : difference < 0 ? "below" : "equal";
}

/** The CA / Exam share of the 100 (what the column headers show the parts out of). */
function outOf(computed: Computed, kind: "ca" | "exam"): number | null {
  const structure = computed.structure;
  const max = structure ? structureTotal(structure.components) : 0;
  if (!structure || max <= 0) return null;
  return round2((shownTotal(buildMarkColumns(structure, kind), {}).outOf / max) * 100);
}

export async function getBroadsheet(query: URLSearchParams): Promise<WireResponse> {
  const armId = query.get("class_arm_id") ?? "";
  const termId = query.get("term_id") ?? "";
  if (!armId || !termId) return fail(422, "VALIDATION_ERROR", "class_arm_id and term_id are required");
  const computed = await compute(armId, termId);
  if ("status" in computed) return computed;
  if (computed.mode !== "component_based") {
    return fail(422, "WRONG_ASSESSMENT_MODE", "This class reports by grades — its broadsheet is the Progression.");
  }

  const viewer = viewerFor(armId);
  const own = viewer.report_scope === "own_subjects";
  const visible = new Set(viewer.visible_subject_ids ?? computed.columns.map((column) => column.subject_id));
  const columns = computed.columns.filter((column) => visible.has(column.subject_id));
  const subjects: BroadsheetSubject[] = columns.map((column) => ({
    subject_id: column.subject_id,
    subject_name: column.subject_name,
    ...subjectStats(computed, column.subject_id),
  }));
  const averages = new Map(subjects.map((subject) => [subject.subject_id, subject.average]));

  const items: BroadsheetRow[] = computed.rows.map((row) => {
    const cells: Record<string, BroadsheetCell> = {};
    for (const column of columns) {
      const result = row.subjects[column.subject_id];
      const split = row.split[column.subject_id];
      cells[column.subject_id] = {
        status: result?.status ?? "ne",
        ca: split?.ca ?? null,
        exam: split?.exam ?? null,
        total: result?.total ?? null,
        vs_average: compare(result?.total ?? null, averages.get(column.subject_id) ?? null),
      };
    }
    return {
      student_id: row.student.id,
      student_name: row.student.name,
      admission_no: row.student.admission_no,
      // A subject teacher's row status is over their subjects only.
      status: own ? studentStatus(Object.values(cells).map((cell) => cell.status)) : row.aggregate.status,
      subjects: cells,
      cumulative_score: own ? null : row.aggregate.grand_total,
      average: own ? null : row.aggregate.average,
      class_position: own ? null : row.aggregate.class_position,
    };
  });

  const data: Broadsheet = {
    academic_year_id: yearOfTerm(termId),
    term_id: termId,
    term_name: computed.termName,
    class_arm_id: armId,
    class_name: computed.className,
    arm_name: computed.armName,
    viewer,
    student_count: computed.rows.length,
    ranked_count: computed.rankedCount,
    class_average: own ? null : classAverage(computed),
    ca_out_of: outOf(computed, "ca"),
    exam_out_of: outOf(computed, "exam"),
    subjects,
    items,
  };
  return ok(data);
}

// ---------------------------------------------------------------------------
// Cumulative (General): the year's terms side by side, as of the selected term
// ---------------------------------------------------------------------------

function trendOf(total: number | null, previous: number | null): TermTrend | null {
  if (total === null || previous === null) return null;
  const difference = round2(total) - round2(previous);
  return difference > 0 ? "up" : difference < 0 ? "down" : "equal";
}

export async function getCumulativeBroadsheet(query: URLSearchParams): Promise<WireResponse> {
  const armId = query.get("class_arm_id") ?? "";
  const termId = query.get("term_id") ?? "";
  if (!armId || !termId) return fail(422, "VALIDATION_ERROR", "class_arm_id and term_id are required");
  const computed = await compute(armId, termId);
  if ("status" in computed) return computed;
  if (computed.mode !== "component_based") {
    return fail(422, "WRONG_ASSESSMENT_MODE", "This class reports by grades — its broadsheet is the Progression.");
  }

  const terms = seedTerms(yearOfTerm(termId)).map((term) => ({
    id: term.id,
    name: term.name,
    number: termNumber(term.id),
    included: termNumber(term.id) <= termNumber(termId),
  }));
  // One engine run per included term; a student absent from a run wasn't in the class that term.
  const runs = new Map<string, Map<string, ComputedRow>>();
  for (const term of terms.filter((item) => item.included)) {
    const run = term.id === termId ? computed : await compute(armId, term.id);
    if ("status" in run) return run;
    runs.set(term.id, new Map(run.rows.map((row) => [row.student.id, row])));
  }

  const viewer = viewerFor(armId);
  const own = viewer.report_scope === "own_subjects";
  const visible = new Set(viewer.visible_subject_ids ?? computed.columns.map((column) => column.subject_id));
  const columns = computed.columns.filter((column) => visible.has(column.subject_id));

  const rows = computed.rows.map((row) => {
    const subjects: Record<string, CumulativeSubjectCell> = {};
    for (const column of columns) {
      const id = column.subject_id;
      const now = row.subjects[id];
      if (!now || now.status === "ne") {
        subjects[id] = { status: "ne", terms: {}, average: null, terms_enrolled: 0 };
        continue;
      }
      const cells: Record<string, CumulativeTermCell> = {};
      let previous: number | null = null;
      for (const term of terms.filter((item) => item.included)) {
        const result = runs.get(term.id)?.get(row.student.id)?.subjects[id];
        if (!result) {
          cells[term.id] = { enrolled: false, status: null, total: null, trend: null };
          previous = null;
          continue;
        }
        cells[term.id] = { enrolled: true, status: result.status, total: result.total, trend: trendOf(result.total, previous) };
        previous = result.total;
      }
      subjects[id] = { status: now.status, terms: cells, average: now.cumulative_average, terms_enrolled: now.cumulative_terms ?? 0 };
    }
    const averages = Object.values(subjects)
      .map((cell) => cell.average)
      .filter((value): value is number => value !== null);
    const score = averages.length > 0 ? round2(averages.reduce((sum, value) => sum + value, 0)) : null;
    return { row, subjects, score, average: score !== null ? round2(score / averages.length) : null };
  });

  // Ranked over the whole class's overall averages (never over a subject teacher's subset).
  const ranks = rankBy(
    computed.rows.flatMap((row) => (row.aggregate.cumulative_average !== null ? [{ id: row.student.id, value: row.aggregate.cumulative_average }] : [])),
    RANKING_RULES,
  );
  const overall = computed.rows.map((row) => row.aggregate.cumulative_average).filter((value): value is number => value !== null);

  const items: CumulativeRow[] = rows.map(({ row, subjects, score, average }) => ({
    student_id: row.student.id,
    student_name: row.student.name,
    admission_no: row.student.admission_no,
    subjects,
    cumulative_score: own ? null : score,
    average: own ? null : average,
    class_position: own ? null : (ranks.get(row.student.id) ?? null),
  }));

  const data: CumulativeBroadsheet = {
    academic_year_id: yearOfTerm(termId),
    term_id: termId,
    term_name: computed.termName,
    class_arm_id: armId,
    class_name: computed.className,
    arm_name: computed.armName,
    viewer,
    student_count: computed.rows.length,
    ranked_count: ranks.size,
    class_average: own ? null : mean(overall),
    terms,
    subjects: columns.map((column) => ({ subject_id: column.subject_id, subject_name: column.subject_name })),
    items,
  };
  return ok(data);
}

// ---------------------------------------------------------------------------
// Progression (British): attainment per point, GB, MTG, CAG, VA per term
// ---------------------------------------------------------------------------

export async function getProgressionBroadsheet(query: URLSearchParams): Promise<WireResponse> {
  const armId = query.get("class_arm_id") ?? "";
  const termId = query.get("term_id") ?? "";
  if (!armId || !termId) return fail(422, "VALIDATION_ERROR", "class_arm_id and term_id are required");
  const computed = await compute(armId, termId);
  if ("status" in computed) return computed;
  if (computed.mode !== "grade_based") {
    return fail(422, "WRONG_ASSESSMENT_MODE", "This class reports by scores — use the Broadsheet and Cumulative Broadsheet.");
  }
  const structure = computed.gradeStructure;

  const terms = seedTerms(yearOfTerm(termId)).map((term) => ({
    id: term.id,
    name: term.name,
    number: termNumber(term.id),
    included: termNumber(term.id) <= termNumber(termId),
    points: termPoints(term.id, "grade_based").map((exam) => ({ id: exam.id, name: exam.name })),
  }));
  const included = terms.filter((term) => term.included);
  // One engine run per included term (CAG / VA); a student absent from a run wasn't in the class then.
  const runs = new Map<string, Map<string, ComputedRow>>();
  for (const term of included) {
    const run = term.id === termId ? computed : await compute(armId, term.id);
    if ("status" in run) return run;
    runs.set(term.id, new Map(run.rows.map((row) => [row.student.id, row])));
  }

  const viewer = viewerFor(armId);
  const visible = new Set(viewer.visible_subject_ids ?? computed.columns.map((column) => column.subject_id));
  const columns = computed.columns.filter((column) => visible.has(column.subject_id));

  const items: ProgressionRow[] = computed.rows.map((row) => {
    const subjects: Record<string, ProgressionSubjectCell> = {};
    for (const column of columns) {
      const id = column.subject_id;
      const now = row.subjects[id];
      if (!now || now.status === "ne") {
        subjects[id] = { status: "ne", mtg: null, terms: {}, gb_average: null, cag_average: null };
        continue;
      }
      const cells: Record<string, ProgressionTermCell> = {};
      const gbs: Array<number | null> = [];
      for (const term of included) {
        const result = runs.get(term.id)?.get(row.student.id)?.subjects[id];
        if (!result) {
          cells[term.id] = { enrolled: false, status: null, points: {}, gb: null, cag: null, va: null };
          continue;
        }
        const points = Object.fromEntries(
          term.points.map((point) => {
            const exam = termPoints(term.id, "grade_based").find((item) => item.id === point.id);
            const mark = exam && structure ? readGradeMark(exam, id, armId, row.student.id, structure) : null;
            return [point.id, (structure && mark?.component_scores[structure.attainment.id]) || null];
          }),
        );
        // The term's Grade Book: its latest point that has one (B, else A), from the Grade Book entry page;
        // a point whose show_grade_book is off doesn't count.
        const gb =
          [...termPoints(term.id, "grade_based")]
            .reverse()
            .filter((exam) => exam.show_grade_book)
            .map((exam) => pointGradeBook(exam, id, armId, row.student.id)?.total ?? null)
            .find((total) => total !== null) ?? null;
        gbs.push(gb);
        cells[term.id] = { enrolled: true, status: result.status, points, gb, cag: result.cag, va: result.va };
      }
      subjects[id] = {
        status: now.status,
        mtg: now.mtg,
        terms: cells,
        gb_average: cumulativeAverage(gbs, gbs.length),
        cag_average: now.cumulative_grade,
      };
    }
    return {
      student_id: row.student.id,
      student_name: row.student.name,
      admission_no: row.student.admission_no,
      baselines: seededBaselines(armId, row.student.id, yearOfTerm(termId)),
      subjects,
    };
  });

  const data: ProgressionBroadsheet = {
    academic_year_id: yearOfTerm(termId),
    term_id: termId,
    term_name: computed.termName,
    class_arm_id: armId,
    class_name: computed.className,
    arm_name: computed.armName,
    viewer,
    student_count: computed.rows.length,
    grade_scale_name: computed.scaleName,
    levels: computed.levels.map((level) => ({ code: level.code, label: level.label, weight: levelWeight(computed.levels, level.code) ?? 0 })),
    terms,
    subjects: columns.map((column) => ({ subject_id: column.subject_id, subject_name: column.subject_name })),
    items,
  };
  return ok(data);
}
