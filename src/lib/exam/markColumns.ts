import { componentContribution, round2, type AssessmentComponent, type AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import type { ComponentScores, ExamKind } from "@/lib/exam/examTypes";

/**
 * Turns an assessment structure (Stage 1a) into the marks grid's input
 * columns — PURE, shared by the grid and the mock backend's PUT validation.
 *
 *   - Only components whose category matches the exam's kind (CA vs Exam).
 *   - Plain component  -> one input column, keyed by the component id.
 *   - Broken-down one  -> one input per sub-field (keyed by sub-field id),
 *                         plus a read-only computed component total.
 *
 * Totals here are DISPLAY-ONLY live sums — nothing is stored. Grades,
 * stored totals and positions are Stage 2.
 */

export type MarkLeaf = { id: string; name: string; max: number };

export type MarkColumnGroup = {
  component: AssessmentComponent;
  leaves: MarkLeaf[];
  /** true when the component is broken down — it then gets a read-only total column. */
  hasTotal: boolean;
};

export function buildMarkColumns(structure: AssessmentStructure, kind: ExamKind): MarkColumnGroup[] {
  if (structure.mode !== "component_based") return [];
  return structure.components
    .filter((component) => component.category === kind)
    .map((component) =>
      component.breakdown === "none"
        ? { component, leaves: [{ id: component.id, name: component.name, max: component.max }], hasTotal: false }
        : {
            component,
            leaves: component.subfields.map((sub) => ({ id: sub.id, name: sub.name, max: sub.max })),
            hasTotal: true,
          },
    );
}

export function allLeaves(groups: MarkColumnGroup[]): MarkLeaf[] {
  return groups.flatMap((group) => group.leaves);
}

/** A score is valid when blank (null) or a finite number from 0 to the field max. */
export function isScoreValid(value: number | null, max: number): boolean {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= max);
}

/**
 * The component's mark out of its own max, from what's been entered so far
 * (blank fields count as 0). null when nothing has been entered.
 *   sum:      Σ sub-field scores
 *   weighted: Σ(score / sub.max × sub.weight) / 100 × component.max
 */
export function componentMark(group: MarkColumnGroup, scores: ComponentScores): number | null {
  const entered = group.leaves.filter((leaf) => typeof scores[leaf.id] === "number");
  if (entered.length === 0) return null;
  const { component } = group;
  if (component.breakdown === "weighted") {
    const weighted = component.subfields.reduce((total, sub) => {
      const score = scores[sub.id];
      return typeof score === "number" && sub.max > 0 ? total + (score / sub.max) * (sub.weight ?? 0) : total;
    }, 0);
    return round2((weighted / 100) * component.max);
  }
  return round2(entered.reduce((total, leaf) => total + (scores[leaf.id] as number), 0));
}

/** The component's points toward the overall 100 (scaled when the component has a weight). */
export function componentPoints(group: MarkColumnGroup, scores: ComponentScores): number | null {
  const mark = componentMark(group, scores);
  if (mark === null) return null;
  const { component } = group;
  return component.weight !== null && component.max > 0 ? round2((mark / component.max) * component.weight) : mark;
}

/** Live total of the shown components (CA or Exam), and what it's out of. */
export function shownTotal(groups: MarkColumnGroup[], scores: ComponentScores): { value: number | null; outOf: number } {
  const outOf = round2(groups.reduce((total, group) => total + componentContribution(group.component), 0));
  const points = groups.map((group) => componentPoints(group, scores)).filter((value): value is number => value !== null);
  return { value: points.length > 0 ? round2(points.reduce((a, b) => a + b, 0)) : null, outOf };
}
