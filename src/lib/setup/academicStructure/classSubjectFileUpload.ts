// Class Subjects' optional file attachment — PDF/DOC/DOCX/PPT/PPTX, unlike
// Subject Master's PDF-only field (subjectFileUpload.ts). Same shared
// mock-upload implementation underneath (src/lib/upload/mockFileUpload.ts).
import { validateMockFile, mockUploadFile, type MockFile } from "@/lib/upload/mockFileUpload";

export const ALLOWED_CLASS_SUBJECT_FILE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const MAX_CLASS_SUBJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type ClassSubjectFile = MockFile;

export type ClassSubjectFileValidation = { ok: true } | { ok: false; reason: "unsupportedType" | "tooLarge" };

export function validateClassSubjectFile(file: File): ClassSubjectFileValidation {
  return validateMockFile(file, {
    allowedTypes: ALLOWED_CLASS_SUBJECT_FILE_MIME_TYPES,
    maxSizeBytes: MAX_CLASS_SUBJECT_FILE_SIZE_BYTES,
  });
}

export function mockUploadClassSubjectFile(file: File): ClassSubjectFile {
  return mockUploadFile(file);
}
