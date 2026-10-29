"use client";

import { uploadFile, type AttachedFile } from "@/lib/files/filesApi";
import { useFileImageUrl } from "@/lib/files/useFileImageUrl";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * A School Type's template + report-logo assignments.
 *
 * SWAP FLAG. The backend's School Type PUT doesn't accept these four
 * fields yet. Until it does (false), they live in a per-browser MOCK side-store
 * keyed by school_type_id, merged onto each School Type on read
 * (schoolTypesApi.ts) — the real School Type POST/PUT body is untouched.
 * Flip to true once the backend ships them: the four fields then travel
 * in the real POST/PUT body and are read from its response, and the
 * report logo goes through the real files service.
 */
export const SCHOOL_TYPE_ASSIGNMENTS_LIVE = false;

export type SchoolTypeAssignments = {
  /** Mandatory on save. */
  result_template_id: string | null;
  /** Optional — blank falls back to the school-wide default pair (General Settings, later). */
  student_id_card_template_id: string | null;
  staff_id_card_template_id: string | null;
  /** Mandatory on save. */
  report_logo_file_id: string | null;
};

export const EMPTY_ASSIGNMENTS: SchoolTypeAssignments = {
  result_template_id: null,
  student_id_card_template_id: null,
  staff_id_card_template_id: null,
  report_logo_file_id: null,
};

export function assignmentsFromWire(record: Record<string, unknown>): SchoolTypeAssignments {
  const read = (key: keyof SchoolTypeAssignments) => (typeof record[key] === "string" && record[key] ? (record[key] as string) : null);
  return {
    result_template_id: read("result_template_id"),
    student_id_card_template_id: read("student_id_card_template_id"),
    staff_id_card_template_id: read("staff_id_card_template_id"),
    report_logo_file_id: read("report_logo_file_id"),
  };
}

// ---------------------------------------------------------------------------
// MOCK side-store (SCHOOL_TYPE_ASSIGNMENTS_LIVE = false only)
// ---------------------------------------------------------------------------

const ASSIGNMENTS_KEY = "zsms.mockSchoolTypeAssignments";

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadMockAssignments(schoolTypeId: string): SchoolTypeAssignments {
  const all = readJson<Record<string, SchoolTypeAssignments>>(ASSIGNMENTS_KEY) ?? {};
  return { ...EMPTY_ASSIGNMENTS, ...all[schoolTypeId] };
}

export function saveMockAssignments(schoolTypeId: string, assignments: SchoolTypeAssignments): void {
  const all = readJson<Record<string, SchoolTypeAssignments>>(ASSIGNMENTS_KEY) ?? {};
  writeJson(ASSIGNMENTS_KEY, { ...all, [schoolTypeId]: assignments });
}

export function deleteMockAssignments(schoolTypeId: string): void {
  const all = readJson<Record<string, SchoolTypeAssignments>>(ASSIGNMENTS_KEY) ?? {};
  delete all[schoolTypeId];
  writeJson(ASSIGNMENTS_KEY, all);
}

// ---------------------------------------------------------------------------
// Report logo
// ---------------------------------------------------------------------------

/** FLAGGED: types/limit are this mock's choice — reconcile with the files service's real rules for this purpose. */
export const REPORT_LOGO_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const REPORT_LOGO_MAX_SIZE_BYTES = 1024 * 1024;

const MOCK_LOGOS_KEY = "zsms.mockReportLogos";
/** In-memory copy, so a logo that didn't fit in localStorage still shows for this session. */
const mockLogoCache = new Map<string, string>();

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Live: the real files service, purpose "report_logo" (UNCONFIRMED — must
 * be agreed with the backend before the flag flips). Mock: the image is
 * kept locally as a data URL under a generated id, so its preview
 * survives a reload in this browser only.
 */
export async function uploadReportLogo(file: File): Promise<CrudResult<AttachedFile>> {
  if (SCHOOL_TYPE_ASSIGNMENTS_LIVE) return uploadFile(file, "report_logo");

  let dataUrl: string;
  try {
    dataUrl = await readAsDataUrl(file);
  } catch {
    return { ok: false, kind: "server" };
  }
  const fileId = `mock-report-logo-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;
  mockLogoCache.set(fileId, dataUrl);
  const stored = readJson<Record<string, string>>(MOCK_LOGOS_KEY) ?? {};
  writeJson(MOCK_LOGOS_KEY, { ...stored, [fileId]: dataUrl });
  return { ok: true, data: { file_id: fileId, name: file.name, size: file.size, type: file.type } };
}

/** MOCK: the stored data URL for a report_logo_file_id (null = none / not in this browser). Also read by the report payload mock. */
export function mockReportLogoUrl(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  return mockLogoCache.get(fileId) ?? readJson<Record<string, string>>(MOCK_LOGOS_KEY)?.[fileId] ?? null;
}

/** An <img>-ready URL for a stored report_logo_file_id (signed URL live, data URL in the mock). */
export function useReportLogoUrl(fileId: string | null | undefined): string | null {
  const liveUrl = useFileImageUrl(SCHOOL_TYPE_ASSIGNMENTS_LIVE ? fileId : null);
  return SCHOOL_TYPE_ASSIGNMENTS_LIVE ? liveUrl : mockReportLogoUrl(fileId);
}
