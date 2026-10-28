import type { WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { ExamSettings } from "@/lib/exam/settings/examSettingsApi";
import { readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";

/** MOCK GET / PUT erp/exam-settings (contract in examSettingsApi.ts). localStorage; PUT is admin-only. */

const STORAGE_KEY = "zsms.mockExam.settings.v1";

/** The stored setting (default weight) — also read by the report payload mock. */
export function loadExamSettings(): ExamSettings {
  const stored = readStore<unknown>(STORAGE_KEY).attainment_display;
  return { attainment_display: stored === "label" ? "label" : "weight" };
}

export function handleExamSettings(method: string, path: string, payload: unknown): WireResponse | null {
  if (path !== "erp/exam-settings") return null;
  if (method === "GET") return { status: 200, body: { success: true, data: loadExamSettings() } };
  if (method === "PUT") {
    if (getMockActingAs() !== MOCK_ADMIN) {
      return { status: 403, body: { success: false, error: { code: "FORBIDDEN", message: "Only an admin can change exam settings." } } };
    }
    const display = payload && typeof payload === "object" ? (payload as Record<string, unknown>).attainment_display : undefined;
    if (display !== "weight" && display !== "label") {
      return { status: 422, body: { success: false, error: { code: "VALIDATION_ERROR", message: 'attainment_display: must be "weight" or "label"' } } };
    }
    const next: ExamSettings = { attainment_display: display };
    writeStore(STORAGE_KEY, next);
    return { status: 200, body: { success: true, data: next } };
  }
  return null;
}
