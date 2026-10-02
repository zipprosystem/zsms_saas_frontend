import { MOCK_BOARDING_HOUSES, MOCK_HOUSES } from "@/lib/students/studentsMockData";
import type { Student, StudentStatus } from "@/lib/students/studentTypes";
import type { SchoolMode } from "@/lib/setup/academicStructure/academicYearsApi";
import type { SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import type { Section } from "@/lib/setup/academicStructure/sectionsApi";

/**
 * Boarding House only matters for a year that has boarding students at
 * all — a purely "day" year hides the field/column everywhere (wizard
 * Step 1, the list column, the export column). `schoolMode` should come
 * from useAcademicYear().activeYear — the school's real current mode, not
 * necessarily whichever year the admin happens to be viewing.
 */
export function isBoardingHouseVisible(schoolMode: SchoolMode): boolean {
  return schoolMode !== "day";
}

export function studentFullName(student: Student): string {
  return [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");
}

/**
 * Resolves against the REAL Classes for the student's year (classesApi —
 * the Add Student wizard's Step 1 has written real class_id/class_arm_id
 * since Commit 2/3, not mock ids). `classes` is whatever StudentsScreen.tsx
 * has already loaded via createClassesService(yearId) — passed in rather
 * than fetched here since this is a plain helper, not a hook.
 */
export function resolveClassName(classId: string, classes: SchoolClass[]): string {
  return classes.find((cls) => cls.id === classId)?.name ?? "—";
}

/** Resolves against the REAL Sections (sectionsApi) for the student's class — same reasoning as resolveClassName above. */
export function resolveArmName(classArmId: string, sections: Section[]): string {
  return sections.find((section) => section.id === classArmId)?.name ?? "—";
}

export function resolveHouseName(houseId: string | null): string {
  if (!houseId) return "—";
  return MOCK_HOUSES.find((house) => house.id === houseId)?.name ?? "—";
}

export function resolveBoardingHouseName(boardingHouseId: string | null): string {
  if (!boardingHouseId) return "—";
  return MOCK_BOARDING_HOUSES.find((house) => house.id === boardingHouseId)?.name ?? "—";
}

/** i18n key under students.status.* (top-level "students" namespace — this is a module, not a Setup item) — component calls t(`students.status.${student.status}`). */
export function statusLabelKey(student: Student): string {
  return `students.status.${student.status}`;
}

export function modeLabelKey(student: Student): string {
  return `students.mode.${student.mode}`;
}

export function genderLabelKey(student: Student): string {
  return `students.gender.${student.gender}`;
}

/** Statuses combined on the Withdrawn tab/stat card — one admin flow (Withdraw/Suspend/Expel), distinguished later by a Status column. */
const WITHDRAWN_GROUP_STATUSES: readonly StudentStatus[] = ["withdrawn", "suspended", "expelled"];

export function isWithdrawnGroup(student: Student): boolean {
  return (WITHDRAWN_GROUP_STATUSES as readonly string[]).includes(student.status);
}

const NEWLY_ENROLLED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * "Newly Enrolled" stat card definition — created_at within the last 30
 * days. Flagged as my interpretation (the brief said "define sensibly,
 * e.g. enrolled this term/year"); this mock module has no academic-term
 * context of its own to compute "this term" against, so a rolling window
 * off created_at is the self-contained choice. Revisit once the real API
 * (and a concrete "this term" definition) exists.
 */
export function isNewlyEnrolled(student: Student, now: Date = new Date()): boolean {
  return now.getTime() - new Date(student.created_at).getTime() <= NEWLY_ENROLLED_WINDOW_MS;
}

export function matchesStudentSearch(student: Student, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    studentFullName(student).toLowerCase().includes(needle) ||
    (student.admission_number?.toLowerCase().includes(needle) ?? false)
  );
}

/**
 * "Arm" filters by arm NAME (e.g. "Gold"), not class_arm_id — the same arm
 * name exists per-class (real Sections, sectionsApi), so filtering by id
 * would only ever match one specific class's arm. Matching by resolved
 * name lets "Arm = Gold" narrow across every class at once, same as
 * Class-arms' own "armName" filter (ClassArmsScreen.tsx). `sections` is
 * passed in for the same reason resolveArmName takes it — a plain helper,
 * not a hook.
 *
 * "Status" here only ever has to distinguish Active vs Draft — the Student
 * List tab is prefiltered upstream in StudentsScreen.tsx to just those two
 * statuses (withdrawn/suspended/expelled/graduated live on other tabs), so
 * this filter's "All Statuses" option already means "active + draft."
 */
export function matchesStudentFilters(student: Student, filters: Record<string, string>, sections: Section[]): boolean {
  return (
    (!filters.status || student.status === filters.status) &&
    (!filters.class || student.class_id === filters.class) &&
    (!filters.arm || resolveArmName(student.class_arm_id, sections) === filters.arm) &&
    (!filters.boardingHouse || student.boarding_house_id === filters.boardingHouse) &&
    (!filters.mode || student.mode === filters.mode)
  );
}
