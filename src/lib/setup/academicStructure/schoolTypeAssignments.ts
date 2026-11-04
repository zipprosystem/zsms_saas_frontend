"use client";

import { uploadFile, type AttachedFile } from "@/lib/files/filesApi";
import { useFileImageUrl } from "@/lib/files/useFileImageUrl";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { SEED_YEARS } from "@/lib/exam/mock/examMockSeeds";

/**
 * A School Type's template + report-logo assignments, and its optional
 * report identity overrides (school name on reports, motto, mission
 * statement — blank falls back to Settings › School Identity), and the
 * default for its classes' "auto-fill attainment from Grade Book" switch
 * (auto_fill_attainment_default, default false — backend field pending),
 * and its report signatories: the Head Teacher and Principal (staff ids)
 * for the ACTIVE academic session.
 *
 * SWAP FLAG. The backend's School Type PUT doesn't accept these ten
 * fields yet. Until it does (false), they live in a per-browser MOCK side-store
 * keyed by school_type_id, merged onto each School Type on read
 * (schoolTypesApi.ts) — the real School Type POST/PUT body is untouched.
 * Flip to true once the backend ships them: the eight fields then travel
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
  /** Optional — blank falls back to the Settings school logo. */
  report_logo_file_id: string | null;
  /**
   * Optional report identity overrides; blank falls back to Settings.
   * report_display_name is the school name printed on this type's
   * reports — a distinct field, never the School Type's own name.
   */
  report_display_name: string | null;
  motto: string | null;
  mission_statement: string | null;
  /**
   * What this type's classes get for "auto-fill attainment from Grade
   * Book" when the class itself has no setting (NULL). A class-level
   * on/off always wins. Default false.
   */
  auto_fill_attainment_default: boolean;
  /**
   * Report signatories (staff ids) for the ACTIVE academic session — the
   * backend stores them per session and carries them into the next one
   * (Muntajir); the frontend only ever reads/writes the active session's
   * pair. null = none selected (the report hides that signature).
   */
  head_teacher_staff_id: string | null;
  principal_staff_id: string | null;
};

export const EMPTY_ASSIGNMENTS: SchoolTypeAssignments = {
  result_template_id: null,
  student_id_card_template_id: null,
  staff_id_card_template_id: null,
  report_logo_file_id: null,
  report_display_name: null,
  motto: null,
  mission_statement: null,
  auto_fill_attainment_default: false,
  head_teacher_staff_id: null,
  principal_staff_id: null,
};

export function assignmentsFromWire(record: Record<string, unknown>): SchoolTypeAssignments {
  const read = (key: Exclude<keyof SchoolTypeAssignments, "auto_fill_attainment_default">) => {
    const value = record[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return {
    result_template_id: read("result_template_id"),
    student_id_card_template_id: read("student_id_card_template_id"),
    staff_id_card_template_id: read("staff_id_card_template_id"),
    report_logo_file_id: read("report_logo_file_id"),
    report_display_name: read("report_display_name"),
    motto: read("motto"),
    mission_statement: read("mission_statement"),
    auto_fill_attainment_default: record.auto_fill_attainment_default === true,
    head_teacher_staff_id: read("head_teacher_staff_id"),
    principal_staff_id: read("principal_staff_id"),
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

type Signatories = Pick<SchoolTypeAssignments, "head_teacher_staff_id" | "principal_staff_id">;
/** Stored shape: the signatories are kept per academic session (only the active one is read or written). */
type StoredAssignments = Omit<SchoolTypeAssignments, keyof Signatories> & { signatories_by_session?: Record<string, Signatories> };

/**
 * MOCK: the active academic session. The Setup academic-years API is
 * unreachable under the dev bypass, so this uses the exam mock's current
 * session — the same one the mock reports read. FLAGGED: the real backend
 * resolves the active session itself.
 */
export function mockActiveSessionId(): string {
  return SEED_YEARS.find((year) => year.is_current)?.id ?? SEED_YEARS[0]?.id ?? "";
}

export function loadMockAssignments(schoolTypeId: string): SchoolTypeAssignments {
  const all = readJson<Record<string, StoredAssignments>>(ASSIGNMENTS_KEY) ?? {};
  const { signatories_by_session: bySession, ...stored } = all[schoolTypeId] ?? {};
  const signatories = bySession?.[mockActiveSessionId()];
  return {
    ...EMPTY_ASSIGNMENTS,
    ...stored,
    head_teacher_staff_id: signatories?.head_teacher_staff_id ?? null,
    principal_staff_id: signatories?.principal_staff_id ?? null,
  };
}

export function saveMockAssignments(schoolTypeId: string, assignments: SchoolTypeAssignments): void {
  const all = readJson<Record<string, StoredAssignments>>(ASSIGNMENTS_KEY) ?? {};
  const { head_teacher_staff_id, principal_staff_id, ...rest } = assignments;
  // Other sessions' signatories are kept; only the active session's pair is replaced.
  const bySession = { ...all[schoolTypeId]?.signatories_by_session, [mockActiveSessionId()]: { head_teacher_staff_id, principal_staff_id } };
  writeJson(ASSIGNMENTS_KEY, { ...all, [schoolTypeId]: { ...rest, signatories_by_session: bySession } });
}

/** MOCK: a School Type's auto-fill default (false for no type / nothing saved). Read by the exam settings mock. */
export function mockAutoFillAttainmentDefault(schoolTypeId: string | null): boolean {
  return schoolTypeId ? loadMockAssignments(schoolTypeId).auto_fill_attainment_default === true : false;
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
