import {
  validateStructure,
  type AssessmentMode,
  type AssessmentStructure,
  type AssessmentStructureInput,
  type BreakdownMode,
  type ComponentCategory,
  type StructureIssue,
} from "@/lib/setup/assessmentConfiguration/assessmentStructure";

/**
 * Builder form state. Numbers stay strings while editing (so "", "1." and
 * "abc" don't jump around); they're parsed only when building the input.
 * Each row has a local `key` that survives reorders, so inline errors stay
 * on the right row after a move or delete. `id` is the saved child's id
 * (absent for a new row) and goes back to the API so the row is kept.
 */
export type SubfieldForm = { key: string; id?: string; name: string; max: string; weight: string };

export type ComponentForm = {
  key: string;
  id?: string;
  name: string;
  category: ComponentCategory;
  max: string;
  weight: string;
  breakdown: BreakdownMode;
  subfields: SubfieldForm[];
};

export type StructureForm = {
  name: string;
  mode: AssessmentMode;
  is_default: boolean;
  is_active: boolean;
  components: ComponentForm[];
};

let keySeq = 0;
export function nextRowKey(): string {
  keySeq += 1;
  return `row-${keySeq}`;
}

export function emptySubfield(): SubfieldForm {
  return { key: nextRowKey(), name: "", max: "", weight: "" };
}

export function emptyComponent(category: ComponentCategory = "ca"): ComponentForm {
  return { key: nextRowKey(), name: "", category, max: "", weight: "", breakdown: "none", subfields: [] };
}

export function emptyStructureForm(): StructureForm {
  return { name: "", mode: "component_based", is_default: false, is_active: true, components: [emptyComponent()] };
}

function numText(value: number | null): string {
  return value === null ? "" : String(value);
}

export function toStructureForm(row: AssessmentStructure): StructureForm {
  return {
    name: row.name,
    mode: row.mode,
    is_default: row.is_default,
    is_active: row.is_active,
    components: row.components.map((component) => ({
      key: nextRowKey(),
      id: component.id,
      name: component.name,
      category: component.category,
      max: numText(component.max),
      weight: numText(component.weight),
      breakdown: component.breakdown,
      subfields: component.subfields.map((sub) => ({
        key: nextRowKey(),
        id: sub.id,
        name: sub.name,
        max: numText(sub.max),
        weight: numText(sub.weight),
      })),
    })),
  };
}

/** "" or junk -> NaN (validation rejects it; never silently 0). */
export function parseNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : Number.NaN;
}

function parseOptional(value: string): number | null {
  return value.trim() ? Number(value.trim()) : null;
}

export function toStructureInput(form: StructureForm): AssessmentStructureInput {
  return {
    name: form.name,
    mode: form.mode,
    is_default: form.is_default,
    is_active: form.is_active,
    components: form.components.map((component, ci) => ({
      ...(component.id ? { id: component.id } : {}),
      name: component.name,
      category: component.category,
      max: parseNumber(component.max),
      weight: parseOptional(component.weight),
      display_order: ci + 1,
      breakdown: component.breakdown,
      subfields: component.subfields.map((sub, si) => ({
        ...(sub.id ? { id: sub.id } : {}),
        name: sub.name,
        max: parseNumber(sub.max),
        weight: parseOptional(sub.weight),
        display_order: si + 1,
      })),
    })),
  };
}

/**
 * Error-map keys. Index-based issue paths are re-keyed onto the rows'
 * stable keys: "name", "is_default", "mode", "components" (overall),
 * "<componentKey>.<field>", "<componentKey>.subfields" (roll-up),
 * "<subfieldKey>.<field>".
 */
export function issueErrorKey(issue: StructureIssue, form: StructureForm): string {
  if (!("component" in issue)) return issue.path;
  const component = form.components[issue.component];
  if (!component) return "components";
  const field = issue.path.split(".").pop() ?? "";
  if ("subfield" in issue) {
    const sub = component.subfields[issue.subfield];
    return sub ? `${sub.key}.${field}` : `${component.key}.subfields`;
  }
  return `${component.key}.${field}`;
}

export function validateStructureForm(form: StructureForm): StructureIssue[] {
  return validateStructure(toStructureInput(form));
}
