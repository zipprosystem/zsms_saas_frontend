// Subject Master's optional PDF attachment — thin, entity-specific wrapper
// around the shared mock-upload implementation (src/lib/upload/mockFileUpload.ts),
// which C2's Class Subjects file field also builds on. No backend endpoint
// exists yet for this (flagged for Muntajir: whether the real contract
// wants base64-in-JSON, like the school logo, or multipart is his call).
import { validateMockFile, mockUploadFile, type MockFile } from "@/lib/upload/mockFileUpload";

export const ALLOWED_SUBJECT_FILE_MIME_TYPES = ["application/pdf"] as const;

export const MAX_SUBJECT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type SubjectFile = MockFile;

export type SubjectFileValidation = { ok: true } | { ok: false; reason: "unsupportedType" | "tooLarge" };

export function validateSubjectFile(file: File): SubjectFileValidation {
  return validateMockFile(file, {
    allowedTypes: ALLOWED_SUBJECT_FILE_MIME_TYPES,
    maxSizeBytes: MAX_SUBJECT_FILE_SIZE_BYTES,
  });
}

export function mockUploadSubjectFile(file: File): SubjectFile {
  return mockUploadFile(file);
}
