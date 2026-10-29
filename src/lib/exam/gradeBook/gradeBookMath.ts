import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { buildGradeBookColumns, shownTotal, type MarkColumnGroup } from "@/lib/exam/markColumns";
import type { ComponentScores } from "@/lib/exam/examTypes";

/**
 * Grade Book rules shared by the entry grid (live) and the mock backend
 * (stored) — PURE, no transport, so the two can't disagree. Contract in
 * gradeBookApi.ts.
 */

/** One attainment score range, as the Grade Book grades a total (best first). */
export type GradeBookBand = { grade: string; label: string; min: number; max: number | null; weight: number | null };

/** The Grade Book's columns: every field of the structure (no CA/Exam split). */
export function gradeBookColumns(structure: AssessmentStructure): MarkColumnGroup[] {
  return buildGradeBookColumns(structure);
}

/** The band a /100 total falls in (bands best first; the first whose min it reaches). */
export function bandForTotal(bands: GradeBookBand[], total: number | null): GradeBookBand | null {
  if (total === null || !Number.isFinite(total)) return null;
  return [...bands].sort((a, b) => b.min - a.min).find((band) => total >= band.min) ?? null;
}

/** Total /100 (null = nothing entered) and its grade + weight. */
export function gradeBookResult(groups: MarkColumnGroup[], scores: ComponentScores, bands: GradeBookBand[]): { total: number | null; grade: string | null; weight: number | null } {
  const total = shownTotal(groups, scores).value;
  const band = bandForTotal(bands, total);
  return { total, grade: band?.grade ?? null, weight: band?.weight ?? null };
}
