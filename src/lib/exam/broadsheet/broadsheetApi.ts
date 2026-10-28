import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import { viewerFromWire } from "@/lib/exam/resultsApi";
import { RESULT_STATUSES, type ResultStatus, type ResultsViewer } from "@/lib/exam/results/resultsTypes";

/**
 * Exam Stage 2b — Broad Sheet (read side). Same transport as the results
 * calls (examApi's USE_MOCK flag); under the dev-auth bypass with the real
 * transport every call returns devBypassUnavailable.
 *
 * PROPOSED REST contract (the backend computes over the results engine;
 * the frontend only displays):
 *
 *   GET /api/v1/erp/broadsheets?class_arm_id=&term_id=
 *     General (component_based) classes only — 422 WRONG_ASSESSMENT_MODE
 *     for a grade-based class (its broadsheet is the Progression).
 *     The whole arm in one response (no paging: the foot stats and the
 *     ranking are over the whole class).
 *     -> { academic_year_id, term_id, term_name, class_arm_id, class_name,
 *          arm_name,
 *          viewer,                 (as erp/results)
 *          student_count,          students enrolled in the arm that term
 *          ranked_count,
 *          class_average|null,     mean of the students' averages (RNG/NE
 *                                  excluded); null for a subject teacher
 *          ca_out_of, exam_out_of, the CA / Exam share of the 100
 *          subjects: [{ subject_id, subject_name,
 *                       enrolled_count,  students enrolled in the subject (NE excluded)
 *                       average|null,    Σ subject totals ÷ enrolled_count
 *                                        (a blank score counts 0)
 *                       highest|null, lowest|null }],   over students with a total
 *          items: [{ student_id, student_name, admission_no, status,
 *                    subjects: { <subject_id>: { status, ca, exam, total,
 *                                vs_average: above|below|equal|null } },
 *                    cumulative_score|null,   Σ subject totals (= grand total)
 *                    average|null, class_position|null }] }
 *     ca + exam = total (the engine's subject total, /100 basis). RNG / NE
 *     cells carry the status and null numbers.
 *     Role scope: class teacher / sectional head / admin get every subject;
 *     a subject teacher gets only the subjects they teach in the arm, and
 *     the cross-subject numbers (cumulative_score, average,
 *     class_position, class_average) come back null.
 *   Errors: 422 VALIDATION_ERROR / WRONG_ASSESSMENT_MODE, 404
 *     CLASS_ARM_NOT_FOUND / TERM_NOT_FOUND, 403 OUT_OF_SCOPE.
 *
 *   GET /api/v1/erp/broadsheets/cumulative?class_arm_id=&term_id=
 *     General classes only (422 WRONG_ASSESSMENT_MODE otherwise). The
 *     year's terms, cumulative AS OF term_id (later terms come back
 *     included: false and carry no cells).
 *     -> { …header as above, viewer, student_count, ranked_count,
 *          class_average|null,        mean of the overall averages
 *          terms: [{ id, name, number, included }],
 *          subjects: [{ subject_id, subject_name }],
 *          items: [{ student_id, student_name, admission_no,
 *                    subjects: { <subject_id>: {
 *                      status,             this term's (ne = not taking the subject)
 *                      terms: { <term_id>: { enrolled, status|null, total|null,
 *                                            trend: up|down|equal|null } },
 *                      average|null,       the engine's enrolment-aware
 *                                          cumulative average
 *                      terms_enrolled } }, the divisor it used
 *                    cumulative_score|null,  Σ subject averages
 *                    average|null,           ÷ subjects with an average
 *                    class_position|null }] }
 *     enrolled: false = the student wasn't in the class that term (late
 *     enrolment) — shown NE, never counted in the divisor. trend compares
 *     a term's total with the previous term's; null when either is
 *     missing. Same role scope as the term broadsheet.
 *
 *   GET /api/v1/erp/broadsheets/progression?class_arm_id=&term_id=
 *     Grade-based (British) classes only — 422 WRONG_ASSESSMENT_MODE for
 *     a General class. One payload serves both views (Per/Term = the
 *     selected term's group; All Term = every term). The year's terms,
 *     as of term_id (later terms included: false, no cells).
 *     -> { …header, viewer, student_count, grade_scale_name,
 *          levels: [{ code, label, weight }],  the attainment scale, best first
 *          terms: [{ id, name, number, included,
 *                    points: [{ id, name }] }],  the term's actual points (1A, 1B…)
 *          subjects: [{ subject_id, subject_name }],
 *          items: [{ student_id, student_name, admission_no,
 *                    baselines: {             per STUDENT, not per subject
 *                      cem|null,              CEM standardised score
 *                      glsas: { eng: { score|null, grade|null },
 *                               mat: { score|null, grade|null } } },
 *                    subjects: { <subject_id>: {
 *                      status,               the selected term's (ne = not taking it)
 *                      mtg|null,             the ONE target grade
 *                      terms: { <term_id>: {
 *                        enrolled,           false = not in the class that term
 *                        status|null,
 *                        points: { <point_id>: grade|null },  attainment entered at that point
 *                        gb|null,            Grade Book score /100 for the term
 *                        cag|null,           current attainment = latest point's grade
 *                        va|null } },        CAG weight − MTG weight
 *                      gb_average|null,      enrolment-aware mean of the term GBs
 *                      cag_average|null } }] }  cumulative attainment grade (engine)
 *     Grade weight = a grade's position on the scale counted from the
 *     bottom (lowest = 1), so VA is in grade steps: + above target,
 *     − below, 0 on target. Same role scope as the other broadsheets.
 *
 *   Grade Book (GB) is a separate subject-wise /100 score per term, from
 *   its own entry page (configurable breakdown summing to 100, graded on
 *   the class's scale) — NOT BUILT YET; the mock seeds one per subject
 *   per term.
 *
 * Arm cards reuse GET erp/results/arms, which now also returns
 * items[].subject_count (subjects offered in the arm).
 *
 * FLAGGED for confirmation (Matthew / Muntajir):
 *   - Highest / lowest are over the students WITH a total (an RNG student
 *     doesn't make the lowest 0), while the subject average divides by
 *     every enrolled student (blank = 0), as specified.
 *   - A subject teacher's view drops the cross-subject numbers (same
 *     ruling as their report view).
 *   - Cumulative: cumulative score = Σ the subject averages; overall
 *     average = that ÷ subjects with an average (the engine's student
 *     cumulative_average); ranking by the overall average, same ranking
 *     rules as the term positions.
 *   - Cumulative shows every term of the year; terms after the selected
 *     one show "—" and aren't counted.
 *   - Progression GB AVG uses the General cumulative rule (Σ the GBs
 *     there are ÷ terms enrolled); attainment AVG is the engine's
 *     cumulative attainment (mean grade step over terms with a CAG,
 *     rounded to a grade).
 *   - GB is shown as the score only — British scales have no score bands
 *     yet, so its grade waits for the Grade Book build.
 *   - CEM and GL SAS are per student (external baselines, imported
 *     later); the mock seeds them on the standardised scale, with the GL
 *     SAS grade as the stanine (1–9). Shown to every viewer, including a
 *     subject teacher.
 */

export const broadsheetQueryKeys = {
  all: ["exam", "broadsheet"] as const,
  general: (armId: string, termId: string) => ["exam", "broadsheet", "general", armId, termId] as const,
  cumulative: (armId: string, termId: string) => ["exam", "broadsheet", "cumulative", armId, termId] as const,
  progression: (armId: string, termId: string) => ["exam", "broadsheet", "progression", armId, termId] as const,
};

export const BROADSHEET_COMPARISONS = ["above", "below", "equal"] as const;
export type BroadsheetComparison = (typeof BROADSHEET_COMPARISONS)[number];

export type BroadsheetSubject = {
  subject_id: string;
  subject_name: string;
  enrolled_count: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
};

export type BroadsheetCell = {
  status: ResultStatus;
  ca: number | null;
  exam: number | null;
  total: number | null;
  /** The student's subject total against the subject average. null = no total, or no average to compare with. */
  vs_average: BroadsheetComparison | null;
};

export type BroadsheetRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  status: ResultStatus;
  /** Keyed by subject_id; every subject column has an entry (NE when not enrolled). */
  subjects: Record<string, BroadsheetCell>;
  cumulative_score: number | null;
  average: number | null;
  class_position: number | null;
};

export type Broadsheet = {
  academic_year_id: string;
  term_id: string;
  term_name: string;
  class_arm_id: string;
  class_name: string;
  arm_name: string;
  viewer: ResultsViewer;
  student_count: number;
  ranked_count: number;
  class_average: number | null;
  ca_out_of: number | null;
  exam_out_of: number | null;
  subjects: BroadsheetSubject[];
  items: BroadsheetRow[];
};

export const TERM_TRENDS = ["up", "down", "equal"] as const;
export type TermTrend = (typeof TERM_TRENDS)[number];

export type CumulativeTermCell = {
  /** false = not in the class that term (late enrolment): shown NE, not in the divisor. */
  enrolled: boolean;
  status: ResultStatus | null;
  total: number | null;
  /** This term's total against the previous term's; null when either is missing. */
  trend: TermTrend | null;
};

export type CumulativeSubjectCell = {
  /** The selected term's status; ne = not taking the subject. */
  status: ResultStatus;
  /** Keyed by term_id — only the included terms. */
  terms: Record<string, CumulativeTermCell>;
  average: number | null;
  terms_enrolled: number;
};

export type CumulativeRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  subjects: Record<string, CumulativeSubjectCell>;
  cumulative_score: number | null;
  average: number | null;
  class_position: number | null;
};

export type CumulativeBroadsheet = {
  academic_year_id: string;
  term_id: string;
  term_name: string;
  class_arm_id: string;
  class_name: string;
  arm_name: string;
  viewer: ResultsViewer;
  student_count: number;
  ranked_count: number;
  class_average: number | null;
  terms: Array<{ id: string; name: string; number: number; included: boolean }>;
  subjects: Array<{ subject_id: string; subject_name: string }>;
  items: CumulativeRow[];
};

export type ProgressionTermCell = {
  /** false = not in the class that term (late enrolment). */
  enrolled: boolean;
  status: ResultStatus | null;
  /** Attainment grade entered at each of the term's points, keyed by point id. */
  points: Record<string, string | null>;
  /** Grade Book score /100. */
  gb: number | null;
  cag: string | null;
  /** CAG weight − MTG weight (grade steps). */
  va: number | null;
};

export type ProgressionSubjectCell = {
  status: ResultStatus;
  mtg: string | null;
  /** Keyed by term_id — only the included terms. */
  terms: Record<string, ProgressionTermCell>;
  gb_average: number | null;
  cag_average: string | null;
};

/** GL SAS's fixed subjects. */
export const GLSAS_SUBJECTS = ["eng", "mat"] as const;
export type GlsasSubject = (typeof GLSAS_SUBJECTS)[number];

/** A student's external baselines — one set per student, not per subject. */
export type ProgressionBaselines = {
  cem: number | null;
  glsas: Record<GlsasSubject, { score: number | null; grade: string | null }>;
};

export type ProgressionRow = {
  student_id: string;
  student_name: string;
  admission_no: string;
  baselines: ProgressionBaselines;
  subjects: Record<string, ProgressionSubjectCell>;
};

export type ProgressionTerm = { id: string; name: string; number: number; included: boolean; points: Array<{ id: string; name: string }> };

export type ProgressionBroadsheet = {
  academic_year_id: string;
  term_id: string;
  term_name: string;
  class_arm_id: string;
  class_name: string;
  arm_name: string;
  viewer: ResultsViewer;
  student_count: number;
  grade_scale_name: string | null;
  /** The attainment scale, best first; weight = the grade's numeric value (shown by default — see examSettingsApi). */
  levels: Array<{ code: string; label: string; weight: number }>;
  terms: ProgressionTerm[];
  subjects: Array<{ subject_id: string; subject_name: string }>;
  items: ProgressionRow[];
};

// ---------------------------------------------------------------------------
// Tolerant wire readers
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function s(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function status(value: unknown): ResultStatus {
  return (RESULT_STATUSES as readonly string[]).includes(value as string) ? (value as ResultStatus) : "rng";
}

function comparison(value: unknown): BroadsheetComparison | null {
  return (BROADSHEET_COMPARISONS as readonly string[]).includes(value as string) ? (value as BroadsheetComparison) : null;
}

function broadsheetFromWire(value: unknown): Broadsheet | null {
  const r = rec(value);
  if (!Array.isArray(r.items) || !Array.isArray(r.subjects)) return null;
  const subjects = arr(r.subjects)
    .map((item): BroadsheetSubject => {
      const x = rec(item);
      return {
        subject_id: s(x.subject_id),
        subject_name: s(x.subject_name),
        enrolled_count: num(x.enrolled_count) ?? 0,
        average: num(x.average),
        highest: num(x.highest),
        lowest: num(x.lowest),
      };
    })
    .filter((subject) => subject.subject_id);
  return {
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    term_name: s(r.term_name),
    class_arm_id: s(r.class_arm_id),
    class_name: s(r.class_name),
    arm_name: s(r.arm_name),
    viewer: viewerFromWire(r.viewer),
    student_count: num(r.student_count) ?? 0,
    ranked_count: num(r.ranked_count) ?? 0,
    class_average: num(r.class_average),
    ca_out_of: num(r.ca_out_of),
    exam_out_of: num(r.exam_out_of),
    subjects,
    items: arr(r.items).map((item): BroadsheetRow => {
      const x = rec(item);
      const cells = rec(x.subjects);
      return {
        student_id: s(x.student_id),
        student_name: s(x.student_name),
        admission_no: s(x.admission_no),
        status: status(x.status),
        // A column with no cell reads as not enrolled.
        subjects: Object.fromEntries(
          subjects.map((subject) => {
            const c = rec(cells[subject.subject_id]);
            const present = subject.subject_id in cells;
            return [
              subject.subject_id,
              { status: present ? status(c.status) : "ne", ca: num(c.ca), exam: num(c.exam), total: num(c.total), vs_average: comparison(c.vs_average) },
            ];
          }),
        ),
        cumulative_score: num(x.cumulative_score),
        average: num(x.average),
        class_position: num(x.class_position),
      };
    }),
  };
}

function trend(value: unknown): TermTrend | null {
  return (TERM_TRENDS as readonly string[]).includes(value as string) ? (value as TermTrend) : null;
}

function cumulativeFromWire(value: unknown): CumulativeBroadsheet | null {
  const r = rec(value);
  if (!Array.isArray(r.items) || !Array.isArray(r.subjects) || !Array.isArray(r.terms)) return null;
  const terms = arr(r.terms)
    .map((item) => {
      const x = rec(item);
      return { id: s(x.id), name: s(x.name), number: num(x.number) ?? 0, included: x.included === true };
    })
    .filter((term) => term.id);
  const subjects = arr(r.subjects)
    .map((item) => ({ subject_id: s(rec(item).subject_id), subject_name: s(rec(item).subject_name) }))
    .filter((subject) => subject.subject_id);
  return {
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    term_name: s(r.term_name),
    class_arm_id: s(r.class_arm_id),
    class_name: s(r.class_name),
    arm_name: s(r.arm_name),
    viewer: viewerFromWire(r.viewer),
    student_count: num(r.student_count) ?? 0,
    ranked_count: num(r.ranked_count) ?? 0,
    class_average: num(r.class_average),
    terms,
    subjects,
    items: arr(r.items).map((item): CumulativeRow => {
      const x = rec(item);
      const cells = rec(x.subjects);
      return {
        student_id: s(x.student_id),
        student_name: s(x.student_name),
        admission_no: s(x.admission_no),
        subjects: Object.fromEntries(
          subjects.map((subject) => {
            const present = subject.subject_id in cells;
            const c = rec(cells[subject.subject_id]);
            const termCells = rec(c.terms);
            return [
              subject.subject_id,
              {
                status: present ? status(c.status) : "ne",
                terms: Object.fromEntries(
                  terms
                    .filter((term) => term.included && term.id in termCells)
                    .map((term) => {
                      const t = rec(termCells[term.id]);
                      return [term.id, { enrolled: t.enrolled !== false, status: t.status == null ? null : status(t.status), total: num(t.total), trend: trend(t.trend) }];
                    }),
                ),
                average: num(c.average),
                terms_enrolled: num(c.terms_enrolled) ?? 0,
              },
            ];
          }),
        ),
        cumulative_score: num(x.cumulative_score),
        average: num(x.average),
        class_position: num(x.class_position),
      };
    }),
  };
}

function code(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function progressionFromWire(value: unknown): ProgressionBroadsheet | null {
  const r = rec(value);
  if (!Array.isArray(r.items) || !Array.isArray(r.subjects) || !Array.isArray(r.terms)) return null;
  const terms = arr(r.terms)
    .map((item): ProgressionTerm => {
      const x = rec(item);
      return {
        id: s(x.id),
        name: s(x.name),
        number: num(x.number) ?? 0,
        included: x.included === true,
        points: arr(x.points)
          .map((point) => ({ id: s(rec(point).id), name: s(rec(point).name) }))
          .filter((point) => point.id),
      };
    })
    .filter((term) => term.id);
  const subjects = arr(r.subjects)
    .map((item) => ({ subject_id: s(rec(item).subject_id), subject_name: s(rec(item).subject_name) }))
    .filter((subject) => subject.subject_id);
  return {
    academic_year_id: s(r.academic_year_id),
    term_id: s(r.term_id),
    term_name: s(r.term_name),
    class_arm_id: s(r.class_arm_id),
    class_name: s(r.class_name),
    arm_name: s(r.arm_name),
    viewer: viewerFromWire(r.viewer),
    student_count: num(r.student_count) ?? 0,
    grade_scale_name: code(r.grade_scale_name),
    levels: arr(r.levels)
      .map((item, index, all) => ({ code: s(rec(item).code), label: s(rec(item).label), weight: num(rec(item).weight) ?? all.length - index }))
      .filter((level) => level.code),
    terms,
    subjects,
    items: arr(r.items).map((item): ProgressionRow => {
      const x = rec(item);
      const cells = rec(x.subjects);
      const baselines = rec(x.baselines);
      const glsas = rec(baselines.glsas);
      return {
        student_id: s(x.student_id),
        student_name: s(x.student_name),
        admission_no: s(x.admission_no),
        baselines: {
          cem: num(baselines.cem),
          glsas: Object.fromEntries(
            GLSAS_SUBJECTS.map((key) => {
              const g = rec(glsas[key]);
              return [key, { score: num(g.score), grade: g.grade == null ? null : code(String(g.grade)) }];
            }),
          ) as ProgressionBaselines["glsas"],
        },
        subjects: Object.fromEntries(
          subjects.map((subject) => {
            const present = subject.subject_id in cells;
            const c = rec(cells[subject.subject_id]);
            const termCells = rec(c.terms);
            return [
              subject.subject_id,
              {
                status: present ? status(c.status) : "ne",
                mtg: code(c.mtg),
                terms: Object.fromEntries(
                  terms
                    .filter((term) => term.included && term.id in termCells)
                    .map((term) => {
                      const t = rec(termCells[term.id]);
                      const points = rec(t.points);
                      return [
                        term.id,
                        {
                          enrolled: t.enrolled !== false,
                          status: t.status == null ? null : status(t.status),
                          points: Object.fromEntries(term.points.map((point) => [point.id, code(points[point.id])])),
                          gb: num(t.gb),
                          cag: code(t.cag),
                          va: num(t.va),
                        },
                      ];
                    }),
                ),
                gb_average: num(c.gb_average),
                cag_average: code(c.cag_average),
              },
            ];
          }),
        ),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function getBroadsheet(armId: string, termId: string): Promise<CrudResult<Broadsheet>> {
  const query = new URLSearchParams({ class_arm_id: armId, term_id: termId });
  return examSend("GET", `erp/broadsheets?${query}`, undefined, broadsheetFromWire);
}

export function getCumulativeBroadsheet(armId: string, termId: string): Promise<CrudResult<CumulativeBroadsheet>> {
  const query = new URLSearchParams({ class_arm_id: armId, term_id: termId });
  return examSend("GET", `erp/broadsheets/cumulative?${query}`, undefined, cumulativeFromWire);
}

export function getProgressionBroadsheet(armId: string, termId: string): Promise<CrudResult<ProgressionBroadsheet>> {
  const query = new URLSearchParams({ class_arm_id: armId, term_id: termId });
  return examSend("GET", `erp/broadsheets/progression?${query}`, undefined, progressionFromWire);
}
