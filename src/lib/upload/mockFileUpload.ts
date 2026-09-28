// Generic client-side validation + mock upload, shared by every entity's
// optional file-attachment field (Subject Master's PDF, Class Subjects'
// PDF/DOC/DOCX/PPT/PPTX, and whatever comes next) until real upload
// endpoints exist. Extracted out of Subject Master's original
// subjectFileUpload.ts so the logic isn't copy-pasted per entity — each
// entity keeps its own thin file declaring its own allowed types/size
// limit and re-exporting these under its own names.

export type MockFile = { name: string; size: number; type: string; url: string };

export type MockFileValidation = { ok: true } | { ok: false; reason: "unsupportedType" | "tooLarge" };

export function validateMockFile(
  file: File,
  { allowedTypes, maxSizeBytes }: { allowedTypes: readonly string[]; maxSizeBytes: number },
): MockFileValidation {
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, reason: "unsupportedType" };
  }
  if (file.size > maxSizeBytes) {
    return { ok: false, reason: "tooLarge" };
  }
  return { ok: true };
}

/**
 * MOCK upload — creates a local blob: URL so the "attached" file is
 * genuinely downloadable/previewable during dev, standing in for the
 * retrievable URL a real upload endpoint would return. Not persisted (a
 * page reload loses it).
 */
export function mockUploadFile(file: File): MockFile {
  return { name: file.name, size: file.size, type: file.type, url: URL.createObjectURL(file) };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
