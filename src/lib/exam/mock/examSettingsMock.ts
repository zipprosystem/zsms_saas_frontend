import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { ClassAutoFill, ExamSettings } from "@/lib/exam/settings/examSettingsApi";
import {
  SEED_CLASS_GRADE_STRUCTURE,
  SEED_CLASS_SCHOOL_TYPE,
  SEED_CLASSES,
  SEED_GRADE_SCALES,
  SEED_GRADE_STRUCTURES,
} from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import { mockAutoFillAttainmentDefault } from "@/lib/setup/academicStructure/schoolTypeAssignments";
import { schoolTypesService } from "@/lib/setup/academicStructure/schoolTypesApi";

/**
 * MOCK exam settings (contract in examSettingsApi.ts). localStorage; PUTs
 * are admin-only.
 *   - GET / PUT erp/exam-settings: the school's attainment display.
 *   - GET erp/exam-settings/attainment-auto-fill, PUT …/:class_id: the
 *     per-class "auto-fill attainment from Grade Book" switch. Only saved
 *     class values are stored (null clears one); with none, the class
 *     follows its School Type's auto_fill_attainment_default (School Type
 *     side-store; no School Type → off).
 */

const STORAGE_KEY = "zsms.mockExam.settings.v1";
const AUTO_FILL_KEY = "zsms.mockExam.attainmentAutoFill.v1";

/** The stored setting (default weight) — also read by the report payload mock. */
export function loadExamSettings(): ExamSettings {
  const stored = readStore<unknown>(STORAGE_KEY).attainment_display;
  return { attainment_display: stored === "label" ? "label" : "weight" };
}

function scaleOf(classId: string) {
  const structure = SEED_GRADE_STRUCTURES.find((item) => item.id === SEED_CLASS_GRADE_STRUCTURE[classId]);
  return structure ? (SEED_GRADE_SCALES.find((scale) => scale.id === structure.attainment.grade_scale_id) ?? null) : null;
}

/** The class's School Type default (off when the class has no School Type). */
function defaultAutoFill(classId: string): boolean {
  return mockAutoFillAttainmentDefault(SEED_CLASS_SCHOOL_TYPE[classId] ?? null);
}

/** The class's own saved value; null = unset (follows its School Type). */
function classAutoFill(classId: string): boolean | null {
  const saved = readStore<boolean>(AUTO_FILL_KEY)[classId];
  return typeof saved === "boolean" ? saved : null;
}

/** Whether the class auto-fills Current Attainment from the Grade Book (its own value, else its School Type's default). */
export function autoFillAttainment(classId: string | null): boolean {
  if (!classId || !SEED_CLASS_GRADE_STRUCTURE[classId]) return false;
  return classAutoFill(classId) ?? defaultAutoFill(classId);
}

/** School Type names by id; empty if the list can't be read. */
async function schoolTypeNames(): Promise<Map<string, string>> {
  const result = await schoolTypesService.list();
  return new Map(result.ok ? result.data.map((type) => [type.id, type.name]) : []);
}

function autoFillItem(classId: string, typeNames: Map<string, string>): ClassAutoFill {
  const schoolTypeId = SEED_CLASS_SCHOOL_TYPE[classId] ?? null;
  return {
    class_id: classId,
    class_name: SEED_CLASSES.find((cls) => cls.id === classId)?.name ?? "",
    scale_name: scaleOf(classId)?.name ?? "",
    school_type_id: schoolTypeId,
    school_type_name: schoolTypeId ? (typeNames.get(schoolTypeId) ?? null) : null,
    class_setting: classAutoFill(classId),
    default_on: defaultAutoFill(classId),
    auto_fill_attainment: autoFillAttainment(classId),
  };
}

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

export async function handleExamSettings(method: string, path: string, payload: unknown): Promise<WireResponse | null> {
  if (path === "erp/exam-settings/attainment-auto-fill") {
    if (method !== "GET") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const typeNames = await schoolTypeNames();
    const items = SEED_CLASSES.filter((cls) => SEED_CLASS_GRADE_STRUCTURE[cls.id]).map((cls) => autoFillItem(cls.id, typeNames));
    return ok({ items });
  }
  const autoFillMatch = path.match(/^erp\/exam-settings\/attainment-auto-fill\/([^/]+)$/);
  if (autoFillMatch) {
    if (method !== "PUT") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can change exam settings.");
    const classId = decodeURIComponent(autoFillMatch[1]);
    if (!SEED_CLASSES.some((cls) => cls.id === classId)) return fail(404, "CLASS_NOT_FOUND", "Class not found");
    if (!SEED_CLASS_GRADE_STRUCTURE[classId]) return fail(422, "WRONG_ASSESSMENT_MODE", "Auto-fill applies to British (grade-based) classes only.");
    const value = payload && typeof payload === "object" ? (payload as Record<string, unknown>).auto_fill_attainment : undefined;
    if (typeof value !== "boolean" && value !== null) return fail(422, "VALIDATION_ERROR", "auto_fill_attainment: must be true, false or null");
    const next = { ...readStore<boolean>(AUTO_FILL_KEY) };
    if (value === null) delete next[classId];
    else next[classId] = value;
    writeStore(AUTO_FILL_KEY, next);
    return ok(autoFillItem(classId, await schoolTypeNames()));
  }
  if (path !== "erp/exam-settings") return null;
  if (method === "GET") return ok(loadExamSettings());
  if (method === "PUT") {
    if (getMockActingAs() !== MOCK_ADMIN) return fail(403, "FORBIDDEN", "Only an admin can change exam settings.");
    const display = payload && typeof payload === "object" ? (payload as Record<string, unknown>).attainment_display : undefined;
    if (display !== "weight" && display !== "label") return fail(422, "VALIDATION_ERROR", 'attainment_display: must be "weight" or "label"');
    const next: ExamSettings = { attainment_display: display };
    writeStore(STORAGE_KEY, next);
    return ok(next);
  }
  return null;
}
