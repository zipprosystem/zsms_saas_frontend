import { mockDelay } from "@/lib/onboarding/mockDelay";

/**
 * MOCK — the real Students API/file endpoint doesn't exist yet (Muntajir
 * hasn't built it), and the Students module as a whole is frontend-ahead/
 * mock-backed for Phase 1 (see studentsApi.ts). This deliberately does NOT
 * call a real backend (no apiFetch) — NEXT_PUBLIC_API_BASE in this repo's
 * .env.local points at the real deployed API
 * (https://api.zsmsapp.com/api/v1), and a mock wizard must never send a
 * file there. Uploads just read the File locally and hand back an object
 * URL for preview — nothing leaves the browser.
 *
 * Intended real contract once Muntajir confirms it (same shape CrudResult
 * consumers expect elsewhere): POST {API_BASE}/erp/files (multipart,
 * "file" + "purpose") -> { success, data: { file_id, ...metadata } }.
 * `purpose` is REQUIRED per every other file-upload consumer in this app —
 * `student_photo`/`past_record_attachment` are NOT confirmed values,
 * they're this module's best guess; reconcile with Muntajir before this
 * is de-mocked.
 */

export type FileUploadPurpose = "student_photo" | "past_record_attachment";

export type AttachedFile = {
  file_id: string;
  name: string;
  size: number;
  type: string;
  /**
   * MOCK-ONLY field — a browser object URL for local preview this session.
   * The real API has no equivalent; previews there would come from a
   * signed download-url endpoint instead (see every other *Api.ts's
   * FLAGGED download-url note). Never persisted — studentsStorage.ts
   * (Commit 3) must not round-trip this through localStorage, since
   * object URLs don't survive a reload anyway.
   */
  previewUrl: string;
};

let mockFileCounter = 0;

export async function uploadFile(file: File, purpose: FileUploadPurpose): Promise<AttachedFile> {
  await mockDelay(400);
  mockFileCounter += 1;
  return {
    file_id: `mock-file-${purpose}-${mockFileCounter}`,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl: URL.createObjectURL(file),
  };
}
