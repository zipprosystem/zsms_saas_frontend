import type { AcademicYear } from "./academicYearsApi";

/**
 * Shared by AcademicYearsScreen (the setup CRUD table) and the header
 * session picker — both need the same "Active/Upcoming/Completed" concept,
 * so it lives here once rather than being derived twice.
 *
 * FLAGGED derivation: the confirmed contract only gives is_active + dates,
 * no explicit status field. is_active=true -> Active. Otherwise, Completed
 * if the year has already ended, else Upcoming. Only one row can ever be
 * "active" at a time (server-enforced via the activate endpoint).
 */
export type AcademicYearStatus = "active" | "upcoming" | "completed";

export function deriveAcademicYearStatus(year: AcademicYear): AcademicYearStatus {
  if (year.is_active) return "active";
  const today = new Date().toISOString().slice(0, 10);
  return year.end_date < today ? "completed" : "upcoming";
}

export const ACADEMIC_YEAR_STATUS_BADGE_STYLES: Record<AcademicYearStatus, string> = {
  active: "bg-category-green-tint text-status-done-text",
  upcoming: "bg-category-amber-tint text-warning",
  completed: "bg-background text-text-muted",
};
