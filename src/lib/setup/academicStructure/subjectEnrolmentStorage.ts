import type { SubjectEnrolment } from "@/lib/setup/academicStructure/subjectEnrolmentApi";

/**
 * Persistence mechanism, isolated from the CRUD surface (subjectEnrolmentApi.ts)
 * so it can be swapped independently once the real API exists. Flat key, not
 * per-school scoped — mock-only data, same justification as studentsStorage.ts
 * / studentTermDetailsStorage.ts.
 */
const STORAGE_KEY = "zsms.mockSubjectEnrolments";

export function loadSubjectEnrolments(): SubjectEnrolment[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SubjectEnrolment[]) : null;
  } catch {
    // Corrupt JSON, storage disabled, private browsing — degrade to "nothing persisted", never crash.
    return null;
  }
}

export function persistSubjectEnrolments(rows: SubjectEnrolment[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Best-effort only (e.g. storage quota) — the in-memory copy still works for the rest of the session.
  }
}
