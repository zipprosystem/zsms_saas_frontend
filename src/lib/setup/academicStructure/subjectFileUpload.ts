// Subject Master's optional PDF attachment — thin, entity-specific wrapper
// around the shared validator (src/lib/files/fileValidation.ts). The
// upload itself goes through the shared real utility
// (src/lib/files/filesApi.ts); the entity stores only the file_id.
import { validateFile, type FileValidation } from "@/lib/files/fileValidation";

export const ALLOWED_SUBJECT_FILE_MIME_TYPES = ["application/pdf"] as const;

export const MAX_SUBJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function validateSubjectFile(file: File): FileValidation {
  return validateFile(file, {
    allowedTypes: ALLOWED_SUBJECT_FILE_MIME_TYPES,
    maxSizeBytes: MAX_SUBJECT_FILE_SIZE_BYTES,
  });
}
