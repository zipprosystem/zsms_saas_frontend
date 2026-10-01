// Generic client-side validation, shared by every entity's optional
// file-attachment field (Subject Master's PDF, Class Subjects'
// PDF/DOC/DOCX/PPT/PPTX, Students' passport photo and past-record
// attachments, and whatever comes next). Each entity keeps its own thin
// file declaring its allowed types/size limit and wrapping validateFile()
// under its own name. The backend validates too — this is just the fast,
// friendly first line.

export type FileValidation = { ok: true } | { ok: false; reason: "unsupportedType" | "tooLarge" };

export function validateFile(
  file: File,
  { allowedTypes, maxSizeBytes }: { allowedTypes: readonly string[]; maxSizeBytes: number },
): FileValidation {
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, reason: "unsupportedType" };
  }
  if (file.size > maxSizeBytes) {
    return { ok: false, reason: "tooLarge" };
  }
  return { ok: true };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
