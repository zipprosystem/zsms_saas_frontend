import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { ClassAutoFill, ExamSettings } from "@/lib/exam/settings/examSettingsApi";
import { SEED_CLASS_GRADE_STRUCTURE, SEED_CLASSES, SEED_GRADE_SCALES, SEED_GRADE_STRUCTURES } from "@/lib/exam/mock/examMockSeeds";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/**
 * MOCK exam settings (contract in examSettingsApi.ts). localStorage; PUTs
 * are admin-only.
 *   - GET / PUT erp/exam-settings: the school's attainment display.
 *   - GET erp/exam-settings/attainment-auto-fill, PUT …/:class_id: the
 *     per-class "auto-fill attainment from Grade Book" switch. Only saved
 *     overrides are stored; the default comes from the class's attainment
 *     scale (KS3 scale → ON, anything else — KS4 / GCSE — OFF).
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

/** KS3 on, KS4 off (by the class's attainment scale). */
function defaultAutoFill(classId: string): boolean {
  return scaleOf(classId)?.id === "scale-ks3";
}

/** Whether the class auto-fills Current Attainment from the Grade Book (saved override, else the default). */
export function autoFillAttainment(classId: string | null): boolean {
  if (!classId || !SEED_CLASS_GRADE_STRUCTURE[classId]) return false;
  const saved = readStore<boolean>(AUTO_FILL_KEY)[classId];
  return typeof saved === "boolean" ? saved : defaultAutoFill(classId);
}

function autoFillItem(classId: string): ClassAutoFill {
  return {
    class_id: classId,
    class_name: SEED_CLASSES.find((cls) => cls.id === classId)?.name ?? "",
    scale_name: scaleOf(classId)?.name ?? "",
    auto_fill_attainment: autoFillAttainment(classId),
    default_on: defaultAutoFill(classId),
  };
}

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

export function handleExamSettings(method: string, path: string, payload: unknown): WireResponse | null {
  if (path === "erp/exam-settings/attainment-auto-fill") {
    if (method !== "GET") return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const items = SEED_CLASSES.filter((cls) => SEED_CLASS_GRADE_STRUCTURE[cls.id]).map((cls) => autoFillItem(cls.id));
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
    if (typeof value !== "boolean") return fail(422, "VALIDATION_ERROR", "auto_fill_attainment: must be true or false");
    writeStore(AUTO_FILL_KEY, { ...readStore<boolean>(AUTO_FILL_KEY), [classId]: value });
    return ok(autoFillItem(classId));
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
