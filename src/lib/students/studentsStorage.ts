import type { Student } from "@/lib/students/studentTypes";

/**
 * Persistence mechanism, isolated from the CRUD surface (studentsApi.ts) so
 * it can be swapped independently once the real API exists. A single flat
 * key, not scoped per-school like AcademicYearContext's persisted year id —
 * that scoping matters there because switching schools in the same browser
 * is a real scenario for the deployed app; here it's mock data only, which
 * stops mattering entirely the moment the real Students API ships. Not
 * worth the extra complexity for data that's about to be deleted.
 */
const STORAGE_KEY = "zsms.mockStudents";

export function loadStudents(): Student[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Student[]) : null;
  } catch {
    // Corrupt JSON, storage disabled, private browsing — degrade to "nothing persisted", never crash.
    return null;
  }
}

export function persistStudents(students: Student[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch {
    // Best-effort only (e.g. storage quota) — the in-memory copy still works for the rest of the session.
  }
}
