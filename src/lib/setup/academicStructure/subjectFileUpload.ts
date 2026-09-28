// Client-side validation + mock upload for Subject Master's optional PDF
// attachment. Mirrors logoUpload.ts's shape/reasoning (validate, then hand
// back file metadata), but the actual "upload" here is entirely local —
// no backend endpoint exists yet for this (flagged for Muntajir: whether
// the real contract wants base64-in-JSON, like the school logo, or
// multipart is his call).

export const ALLOWED_SUBJECT_FILE_MIME_TYPES = ["application/pdf"] as const;

export const MAX_SUBJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type SubjectFile = { name: string; size: number; type: string; url: string };

export type SubjectFileValidation = { ok: true } | { ok: false; reason: "unsupportedType" | "tooLarge" };

export function validateSubjectFile(file: File): SubjectFileValidation {
  if (!(ALLOWED_SUBJECT_FILE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, reason: "unsupportedType" };
  }
  if (file.size > MAX_SUBJECT_FILE_SIZE_BYTES) {
    return { ok: false, reason: "tooLarge" };
  }
  return { ok: true };
}

/**
 * MOCK upload — creates a local blob: URL so the "attached" file is
 * genuinely downloadable/previewable during dev, standing in for the
 * retrievable URL a real upload endpoint would return. Good enough to
 * validate the UX; not persisted (a page reload loses it, same as every
 * other mock in this increment).
 */
export function mockUploadSubjectFile(file: File): SubjectFile {
  return { name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file) };
}
