/**
 * Assessment structure (score structure) — the model plus the PURE rules
 * (roll-up maths + validation). Shared by the builder UI and the mock
 * backend so the two can never disagree; the real backend must enforce
 * the same rules (see assessmentStructuresApi.ts for the contract).
 *
 *   assessment_structure  { id, name, mode, is_default, is_active, components[] }
 *     assessment_component { id, name, category, max, weight, display_order, breakdown, subfields[] }
 *       assessment_subfield { id, name, max, weight, display_order }
 *
 * Two levels max: a sub-field never breaks down further.
 *
 * Scoring model (component_based):
 *   - A component is scored out of `max` marks. `weight` is optional: when
 *     set, the component's mark is scaled to `weight` points of the overall
 *     100 (e.g. an exam scored out of 100, weight 60). When null, the
 *     component contributes its `max` as-is. contribution = weight ?? max.
 *   - Overall: the components' contributions must total exactly 100.
 *   - breakdown "sum": sub-fields are scored out of their own max, and
 *     those maxes add up to the component's max (Test 10 + Test 10 +
 *     Assignment 10 = CA 30). Sub-field weight is unused (null).
 *   - breakdown "weighted": each sub-field is scored out of its own max and
 *     carries a weight %; weights total 100%. Component mark =
 *     Σ(score / sub.max × sub.weight) / 100 × component.max.
 *
 * grade_based (British attainment + rating domains) is a selectable mode
 * only — its fields arrive in Stage 1b; no component rules apply to it yet.
 */

export const ASSESSMENT_MODES = ["component_based", "grade_based"] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

export const COMPONENT_CATEGORIES = ["ca", "exam"] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export const BREAKDOWN_MODES = ["none", "sum", "weighted"] as const;
export type BreakdownMode = (typeof BREAKDOWN_MODES)[number];

export const STRUCTURE_TOTAL = 100;
export const WEIGHTED_SUBFIELD_TOTAL = 100;
export const STRUCTURE_NAME_MAX = 100;
export const PART_NAME_MAX = 60;
/** A breakdown with one sub-field is the same as no breakdown. */
export const MIN_SUBFIELDS = 2;

export type AssessmentSubfield = {
  id: string;
  name: string;
  max: number;
  weight: number | null;
  display_order: number;
};

export type AssessmentComponent = {
  id: string;
  name: string;
  category: ComponentCategory;
  max: number;
  weight: number | null;
  display_order: number;
  breakdown: BreakdownMode;
  subfields: AssessmentSubfield[];
};

export type AssessmentStructure = {
  id: string;
  name: string;
  mode: AssessmentMode;
  is_default: boolean;
  is_active: boolean;
  components: AssessmentComponent[];
};

/** Write body. Children carry their id when they already exist (kept), and omit it when new. */
export type AssessmentSubfieldInput = Omit<AssessmentSubfield, "id"> & { id?: string };
export type AssessmentComponentInput = Omit<AssessmentComponent, "id" | "subfields"> & {
  id?: string;
  subfields: AssessmentSubfieldInput[];
};
export type AssessmentStructureInput = Omit<AssessmentStructure, "id" | "components"> & {
  components: AssessmentComponentInput[];
};

// ---------------------------------------------------------------------------
// Roll-up maths (derived, never stored)
// ---------------------------------------------------------------------------

/** Two-decimal rounding, so 33.33 + 33.33 + 33.34 compares equal to 100. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function sumOf(values: Array<number | null>): number {
  return round2(values.reduce<number>((total, value) => total + (isPositive(value) ? value : 0), 0));
}

type ComponentShape = Pick<AssessmentComponent, "max" | "weight" | "breakdown"> & {
  subfields: Array<Pick<AssessmentSubfield, "max" | "weight">>;
};

/** Points this component adds to the overall total. */
export function componentContribution(component: Pick<AssessmentComponent, "max" | "weight">): number {
  return component.weight !== null ? component.weight : component.max;
}

/** What the sub-fields currently roll up to, and what they must reach. Null when there's no breakdown. */
export function subfieldRollup(component: ComponentShape): { actual: number; target: number } | null {
  if (component.breakdown === "sum") {
    return { actual: sumOf(component.subfields.map((sub) => sub.max)), target: component.max };
  }
  if (component.breakdown === "weighted") {
    return { actual: sumOf(component.subfields.map((sub) => sub.weight)), target: WEIGHTED_SUBFIELD_TOTAL };
  }
  return null;
}

export function structureTotal(components: Array<Pick<AssessmentComponent, "max" | "weight">>): number {
  return sumOf(components.map(componentContribution));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * One problem with a structure. `path` uses the wire field names
 * ("components.0.subfields.1.max") so the form can pin it to the input,
 * and the mock can name it in its 422 message.
 */
export type StructureIssue =
  | { code: "name_required" | "name_too_long" | "default_inactive" | "components_required"; path: string }
  | { code: "total_mismatch"; path: string; actual: number; target: number }
  | {
      code:
        | "component_name_required"
        | "component_name_too_long"
        | "component_name_duplicate"
        | "component_category_invalid"
        | "component_max_invalid"
        | "component_weight_invalid"
        | "subfields_required";
      path: string;
      component: number;
    }
  | { code: "subfields_sum_mismatch" | "subfields_weight_mismatch"; path: string; component: number; actual: number; target: number }
  | {
      code:
        | "subfield_name_required"
        | "subfield_name_too_long"
        | "subfield_name_duplicate"
        | "subfield_max_invalid"
        | "subfield_weight_invalid";
      path: string;
      component: number;
      subfield: number;
    };

function duplicateIndexes(names: string[]): Set<number> {
  const seen = new Map<string, number>();
  const duplicates = new Set<number>();
  names.forEach((name, index) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    if (seen.has(key)) duplicates.add(index);
    else seen.set(key, index);
  });
  return duplicates;
}

/**
 * Every rule a save must pass. Numbers may be NaN (an unparseable form
 * input) — treated as invalid, never coerced. Empty result = valid.
 */
export function validateStructure(input: AssessmentStructureInput): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const name = input.name.trim();
  if (!name) issues.push({ code: "name_required", path: "name" });
  else if (name.length > STRUCTURE_NAME_MAX) issues.push({ code: "name_too_long", path: "name" });
  if (input.is_default && !input.is_active) issues.push({ code: "default_inactive", path: "is_default" });

  if (input.mode !== "component_based") return issues;

  if (input.components.length === 0) {
    issues.push({ code: "components_required", path: "components" });
    return issues;
  }

  const duplicateComponents = duplicateIndexes(input.components.map((component) => component.name));
  input.components.forEach((component, ci) => {
    const base = `components.${ci}`;
    const componentName = component.name.trim();
    if (!componentName) issues.push({ code: "component_name_required", path: `${base}.name`, component: ci });
    else if (componentName.length > PART_NAME_MAX) {
      issues.push({ code: "component_name_too_long", path: `${base}.name`, component: ci });
    } else if (duplicateComponents.has(ci)) {
      issues.push({ code: "component_name_duplicate", path: `${base}.name`, component: ci });
    }
    if (!COMPONENT_CATEGORIES.includes(component.category)) {
      issues.push({ code: "component_category_invalid", path: `${base}.category`, component: ci });
    }
    if (!isPositive(component.max)) issues.push({ code: "component_max_invalid", path: `${base}.max`, component: ci });
    if (component.weight !== null && (!isPositive(component.weight) || component.weight > STRUCTURE_TOTAL)) {
      issues.push({ code: "component_weight_invalid", path: `${base}.weight`, component: ci });
    }

    if (component.breakdown === "none") return;
    if (component.subfields.length < MIN_SUBFIELDS) {
      issues.push({ code: "subfields_required", path: `${base}.subfields`, component: ci });
      return;
    }

    const duplicateSubfields = duplicateIndexes(component.subfields.map((sub) => sub.name));
    component.subfields.forEach((sub, si) => {
      const subBase = `${base}.subfields.${si}`;
      const subName = sub.name.trim();
      if (!subName) issues.push({ code: "subfield_name_required", path: `${subBase}.name`, component: ci, subfield: si });
      else if (subName.length > PART_NAME_MAX) {
        issues.push({ code: "subfield_name_too_long", path: `${subBase}.name`, component: ci, subfield: si });
      } else if (duplicateSubfields.has(si)) {
        issues.push({ code: "subfield_name_duplicate", path: `${subBase}.name`, component: ci, subfield: si });
      }
      if (!isPositive(sub.max)) issues.push({ code: "subfield_max_invalid", path: `${subBase}.max`, component: ci, subfield: si });
      if (component.breakdown === "weighted" && (!isPositive(sub.weight) || (sub.weight ?? 0) > WEIGHTED_SUBFIELD_TOTAL)) {
        issues.push({ code: "subfield_weight_invalid", path: `${subBase}.weight`, component: ci, subfield: si });
      }
    });

    const rollup = subfieldRollup(component);
    if (rollup && isPositive(component.max) && rollup.actual !== round2(rollup.target)) {
      issues.push({
        code: component.breakdown === "sum" ? "subfields_sum_mismatch" : "subfields_weight_mismatch",
        path: `${base}.subfields`,
        component: ci,
        actual: rollup.actual,
        target: round2(rollup.target),
      });
    }
  });

  const total = structureTotal(input.components);
  if (total !== STRUCTURE_TOTAL) {
    issues.push({ code: "total_mismatch", path: "components", actual: total, target: STRUCTURE_TOTAL });
  }
  return issues;
}

/**
 * Canonical write body: trims names, renumbers display_order from array
 * position (1-based), drops sub-fields when there's no breakdown, and
 * nulls sub-field weights under a "sum" breakdown. Used by the form before
 * sending and by the mock before storing.
 */
export function normalizeStructureInput(input: AssessmentStructureInput): AssessmentStructureInput {
  const componentBased = input.mode === "component_based";
  return {
    name: input.name.trim(),
    mode: input.mode,
    is_default: input.is_default,
    is_active: input.is_active,
    components: componentBased
      ? input.components.map((component, ci) => ({
          ...(component.id ? { id: component.id } : {}),
          name: component.name.trim(),
          category: component.category,
          max: component.max,
          weight: component.weight,
          display_order: ci + 1,
          breakdown: component.breakdown,
          subfields:
            component.breakdown === "none"
              ? []
              : component.subfields.map((sub, si) => ({
                  ...(sub.id ? { id: sub.id } : {}),
                  name: sub.name.trim(),
                  max: sub.max,
                  weight: component.breakdown === "weighted" ? sub.weight : null,
                  display_order: si + 1,
                })),
        }))
      : [],
  };
}
