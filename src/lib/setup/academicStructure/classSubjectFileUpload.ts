// Class Subjects' optional file attachment — PDF/DOC/DOCX/PPT/PPTX, unlike
// Subject Master's PDF-only field (subjectFileUpload.ts). Same shared
// validator underneath (src/lib/files/fileValidation.ts); the upload goes
// through src/lib/files/filesApi.ts.
import { validateFile, type FileValidation } from "@/lib/files/fileValidation";

export const ALLOWED_CLASS_SUBJECT_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const MAX_CLASS_SUBJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function validateClassSubjectFile(file: File): FileValidation {
  return validateFile(file, {
    allowedTypes: ALLOWED_CLASS_SUBJECT_FILE_MIME_TYPES,
    maxSizeBytes: MAX_CLASS_SUBJECT_FILE_SIZE_BYTES,
  });
}
