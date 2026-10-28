import { round2, structureTotal, type AssessmentStructure, type ComponentCategory } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { allLeaves, buildMarkColumns, componentPoints } from "@/lib/exam/markColumns";
import type { ComponentScores, ScaleLevel } from "@/lib/exam/examTypes";
import type { RankingRules, ResultStatus, ScoreBand, ScoreGradeScale } from "@/lib/exam/results/resultsTypes";

/**
 * Exam Stage 2a computation engine — PURE rules, no I/O. The mock backend
 * runs them today; the real backend must implement the same rules (this
 * file is the reference for them):
 *
 *   Subject total   roll up component_scores per the assessment structure —
 *                   plain components and "sum" breakdowns add up; a
 *                   "weighted" breakdown scores
 *                   Σ[(sub_score / sub_max) × (sub_weight / 100)] × component_max;
 *                   a component weight scales it to its share of the 100.
 *                   A blank leaf counts 0 but flags the row incomplete.
 *                   Normalised to /100 over the structure's max; the CA
 *                   and Exam parts are reported on the same basis
 *                   (CA + Exam = Total).
 *   Grade et al.    the total's band in the CLASS's grade scale -> grade,
 *                   remark, grade_weight, gpa.
 *   Positions       standard competition ranking (1, 2, 2, 4) unless a
 *                   Ranking Rules config says otherwise; RNG / NE unranked.
 *   Aggregate       grand_total = Σ subject totals; average = ÷ subjects
 *                   with a result; class position by average; overall grade
 *                   = average's band; GPA = Σ(gpa × units) ÷ Σ units, a null
 *                   unit weighing 1.
 *   Cumulative      per subject: Σ(totals this + earlier terms with a
 *                   result) ÷ the number of terms the student was ENROLLED
 *                   (never terms before they joined).
 *   VA (British)    CAG − MTG as grade steps on the class scale (+ above
 *                   target, − below, 0 on target).
 *   Status          RNG (enrolled, nothing in) -> incomplete -> ready; NE
 *                   only for an explicit not-enrolled record.
 */

/** Score entered per term, split by the point it was entered at (the CA point's marks and the Exam point's marks). */
export type TermScores = Partial<Record<ComponentCategory, ComponentScores>>;

export type SubjectTotal = {
  /** Out of 100; null when nothing has been entered. */
  total: number | null;
  /**
   * The CA and Exam parts of `total`, on the same /100 basis (so
   * ca + exam = total). null when nothing was entered for that part; the
   * exam part is total − ca, so the two always add up at 2 dp.
   */
  ca: number | null;
  exam: number | null;
  filled: number;
  leaves: number;
};

/** The subject total for one term from both points' scores (blank = 0, still counted as a leaf to fill). */
export function subjectTotal(structure: AssessmentStructure, scores: TermScores): SubjectTotal {
  let filled = 0;
  let leaves = 0;
  const part: Record<ComponentCategory, { points: number; filled: number }> = { ca: { points: 0, filled: 0 }, exam: { points: 0, filled: 0 } };
  for (const category of ["ca", "exam"] as const) {
    const entered = scores[category] ?? {};
    const groups = buildMarkColumns(structure, category);
    for (const leaf of allLeaves(groups)) {
      leaves += 1;
      if (typeof entered[leaf.id] === "number") part[category].filled += 1;
    }
    for (const group of groups) part[category].points += componentPoints(group, entered) ?? 0;
    filled += part[category].filled;
  }
  const max = structureTotal(structure.components);
  if (filled === 0 || max <= 0) return { total: null, ca: null, exam: null, filled, leaves };
  const total = round2(((part.ca.points + part.exam.points) / max) * 100);
  const ca = part.ca.filled > 0 ? round2((part.ca.points / max) * 100) : null;
  const exam = part.exam.filled > 0 ? round2(total - (ca ?? 0)) : null;
  return { total, ca, exam, filled, leaves };
}

export function statusOf(filled: number, leaves: number): ResultStatus {
  if (filled === 0) return "rng";
  return filled >= leaves ? "ready" : "incomplete";
}

/** A student's term status from their subjects (NE subjects don't count). */
export function studentStatus(subjectStatuses: ResultStatus[]): ResultStatus {
  const counted = subjectStatuses.filter((status) => status !== "ne");
  if (counted.length === 0) return subjectStatuses.length > 0 ? "ne" : "rng";
  if (counted.every((status) => status === "rng")) return "rng";
  return counted.every((status) => status === "ready") ? "ready" : "incomplete";
}

/** The band a value falls in: the first (best-first) band whose min it reaches. */
export function bandFor(scale: ScoreGradeScale | null, value: number | null): ScoreBand | null {
  if (!scale || value === null) return null;
  const bands = [...scale.bands].sort((a, b) => b.min - a.min);
  return bands.find((band) => value >= band.min) ?? null;
}

/**
 * Positions by value, highest first. competition: 1, 2, 2, 4 (ties share,
 * next rank skips) — the default. dense: 1, 2, 2, 3. Values compare at 2 dp.
 */
export function rankBy(entries: Array<{ id: string; value: number }>, rules?: RankingRules | null): Map<string, number> {
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const positions = new Map<string, number>();
  let previous: number | null = null;
  let position = 0;
  sorted.forEach((entry, index) => {
    const value = round2(entry.value);
    if (previous === null || value !== previous) {
      position = rules?.method === "dense" ? position + 1 : index + 1;
      previous = value;
    }
    positions.set(entry.id, position);
  });
  return positions;
}

/** Σ(gpa × units) ÷ Σ units; a null unit weighs 1. null when no subject has a GPA. */
export function weightedGpa(subjects: Array<{ gpa: number | null; unit: number | null }>): number | null {
  let points = 0;
  let units = 0;
  for (const subject of subjects) {
    if (subject.gpa === null) continue;
    const unit = subject.unit ?? 1;
    points += subject.gpa * unit;
    units += unit;
  }
  return units > 0 ? round2(points / units) : null;
}

/**
 * Enrolment-aware cumulative average: Σ of the totals the student HAS
 * (this + earlier terms) ÷ the number of terms they were actually enrolled.
 * Joined term 3 -> ÷1; joined term 2 -> (t2 + t3) ÷ 2. null when there's no
 * result to average or no enrolled term.
 */
export function cumulativeAverage(termTotals: Array<number | null>, termsEnrolled: number): number | null {
  const present = termTotals.filter((total): total is number => total !== null);
  if (present.length === 0 || termsEnrolled <= 0) return null;
  return round2(present.reduce((sum, total) => sum + total, 0) / termsEnrolled);
}

/**
 * A grade's numeric weight on a best-first scale: the level's own weight,
 * else its position counted from the bottom (lowest = 1). null when the
 * code is missing or not on the scale.
 */
export function levelWeight(levels: ScaleLevel[], code: string | null): number | null {
  if (code === null) return null;
  const index = levels.findIndex((level) => level.code === code);
  if (index < 0) return null;
  return levels[index].weight ?? levels.length - index;
}

/**
 * VA = CAG weight − MTG weight: positive when attainment is above target,
 * negative below, 0 on target. null when either grade is missing or not
 * on the scale.
 */
export function valueAdded(levels: ScaleLevel[], cag: string | null, mtg: string | null): number | null {
  const cagWeight = levelWeight(levels, cag);
  const mtgWeight = levelWeight(levels, mtg);
  if (cagWeight === null || mtgWeight === null) return null;
  return round2(cagWeight - mtgWeight);
}

/**
 * British cumulative attainment: the mean weight of the term CAGs the
 * student has, rounded to the nearest grade on the scale (ties go to the
 * better grade). Grades have no zero, so terms without a CAG can't be
 * averaged in — the divisor is the terms that have one. (FLAGGED for
 * confirmation — see resultsApi.ts.)
 */
export function cumulativeAttainment(levels: ScaleLevel[], cags: Array<string | null>): { grade: string | null; terms: number } {
  const weights = cags.map((code) => levelWeight(levels, code)).filter((weight): weight is number => weight !== null);
  if (weights.length === 0) return { grade: null, terms: 0 };
  const mean = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  // Nearest level by weight; on a tie the better (earlier, best-first) level wins.
  let grade: string | null = null;
  let nearest = Infinity;
  for (const level of levels) {
    const distance = Math.abs((levelWeight(levels, level.code) ?? 0) - mean);
    if (distance < nearest - 1e-9) {
      grade = level.code;
      nearest = distance;
    }
  }
  return { grade, terms: weights.length };
}
