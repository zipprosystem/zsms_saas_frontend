import { useQuery } from "@tanstack/react-query";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import type { ScaleLevel } from "@/lib/exam/examTypes";

/**
 * School-wide exam display settings. Rides the Exam module's transport, so
 * the exam USE_MOCK flag swaps it (mock: examSettingsMock.ts).
 *
 * PROPOSED REST contract (confirm with Muntajir):
 *
 *   GET /api/v1/erp/exam-settings  -> { attainment_display }
 *   PUT /api/v1/erp/exam-settings  body { attainment_display } -> same
 *     attainment_display: "weight" (DEFAULT) | "label"
 *       How British attainment grades (the points 1A/1B…, MTG, CAG, the
 *       term and cumulative grades) are shown: the grade's numeric weight
 *       (KS3 M → 4, GCSE 9 → 9) or its grade label (M / S / D, 9–1).
 *       Display only — grades are stored and sent as codes either way,
 *       and VA is always CAG weight − MTG weight. One setting for the
 *       whole system: Academic Report entry, Progression broadsheet, and
 *       the report card (the report payload carries it as
 *       meta.attainment_display, with each level's weight in grade_key).
 *   Errors: 422 VALIDATION_ERROR, 403 FORBIDDEN (PUT: admins only).
 *
 * Grade weights come with the scale: each level carries weight (see
 * ScaleLevel), so GET erp/exams/entry-options and the Progression payload's
 * levels[] now include weight per level.
 *
 * PER-CLASS: auto-fill attainment from the Grade Book (spec §7.22), British
 * classes only. Admin-only to change.
 *
 *   GET /api/v1/erp/exam-settings/attainment-auto-fill
 *     -> { items: [{ class_id, class_name, scale_name, auto_fill_attainment,
 *                    default_on }] }   every British (grade_based) class
 *   PUT /api/v1/erp/exam-settings/attainment-auto-fill/:class_id
 *     body { auto_fill_attainment: boolean } -> the item
 *   Default (no setting saved): ON for KS3 classes, OFF for KS4 — default_on
 *   says which; the mock decides it from the class's attainment scale
 *   (KS3 scale → ON). When ON: the point's Grade Book total → the class's
 *   attainment score ranges → grade (+ weight) fills Current Attainment on
 *   the Academic Report wherever nothing was entered, on read (GET marks,
 *   results, Progression, report cards — so VA computes from it). The
 *   teacher can override it by choosing a grade (saved = wins); Engagement
 *   and Learning Behaviour stay manual. OFF: attainment entered manually.
 *   Errors: 422 VALIDATION_ERROR, 403 FORBIDDEN (not an admin), 404
 *   CLASS_NOT_FOUND, 422 WRONG_ASSESSMENT_MODE (not a British class).
 */

export const ATTAINMENT_DISPLAYS = ["weight", "label"] as const;
export type AttainmentDisplay = (typeof ATTAINMENT_DISPLAYS)[number];
export const DEFAULT_ATTAINMENT_DISPLAY: AttainmentDisplay = "weight";

export type ExamSettings = { attainment_display: AttainmentDisplay };

export const examSettingsQueryKey = ["exam", "settings"] as const;

function fromWire(value: unknown): ExamSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const display = (value as Record<string, unknown>).attainment_display;
  return { attainment_display: display === "label" ? "label" : DEFAULT_ATTAINMENT_DISPLAY };
}

export type ClassAutoFill = {
  class_id: string;
  class_name: string;
  scale_name: string;
  auto_fill_attainment: boolean;
  /** What the class gets with nothing saved (KS3 on, KS4 off). */
  default_on: boolean;
};

export const attainmentAutoFillQueryKey = ["exam", "settings", "attainmentAutoFill"] as const;

function autoFillFromWire(value: unknown): ClassAutoFill | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.class_id !== "string" || !r.class_id) return null;
  return {
    class_id: r.class_id,
    class_name: typeof r.class_name === "string" ? r.class_name : "",
    scale_name: typeof r.scale_name === "string" ? r.scale_name : "",
    auto_fill_attainment: r.auto_fill_attainment === true,
    default_on: r.default_on === true,
  };
}

export function listAttainmentAutoFill(): Promise<CrudResult<ClassAutoFill[]>> {
  return examSend("GET", "erp/exam-settings/attainment-auto-fill", undefined, (body) => {
    const items = body && typeof body === "object" ? (body as Record<string, unknown>).items : null;
    return Array.isArray(items) ? items.map(autoFillFromWire).filter((item): item is ClassAutoFill => item !== null) : null;
  });
}

export function updateAttainmentAutoFill(classId: string, autoFill: boolean): Promise<CrudResult<ClassAutoFill>> {
  return examSend("PUT", `erp/exam-settings/attainment-auto-fill/${encodeURIComponent(classId)}`, { auto_fill_attainment: autoFill }, autoFillFromWire);
}

export function getExamSettings(): Promise<CrudResult<ExamSettings>> {
  return examSend("GET", "erp/exam-settings", undefined, fromWire);
}

export function updateExamSettings(input: ExamSettings): Promise<CrudResult<ExamSettings>> {
  return examSend("PUT", "erp/exam-settings", input, fromWire);
}

/** The school's attainment display; the default (weight) while loading or when it can't be read. */
export function useAttainmentDisplay(): AttainmentDisplay {
  const query = useQuery({ queryKey: examSettingsQueryKey, queryFn: getExamSettings, staleTime: 60_000 });
  return query.data?.ok ? query.data.data.attainment_display : DEFAULT_ATTAINMENT_DISPLAY;
}

/** A grade level's weight: its own, else its position from the bottom (lowest = 1). Mirrors resultsEngine.levelWeight. */
export function weightOf(levels: ScaleLevel[], code: string): number | null {
  const index = levels.findIndex((level) => level.code === code);
  if (index < 0) return null;
  return levels[index].weight ?? levels.length - index;
}

/** How an attainment grade code reads under the school's setting; the code itself when it isn't on the scale. */
export function attainmentText(code: string, levels: ScaleLevel[], display: AttainmentDisplay): string {
  if (display === "label") return code;
  const weight = weightOf(levels, code);
  return weight === null ? code : String(weight);
}
