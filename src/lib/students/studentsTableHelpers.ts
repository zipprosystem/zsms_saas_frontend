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

/** Statuses combined on the Withdrawn tab/stat card — one admin flow (the Withdraw form's three categories), told apart by the tab's Status column. */
const WITHDRAWN_GROUP_STATUSES: readonly StudentStatus[] = ["withdrawn", "suspended", "expelled"];

export function isWithdrawnGroup(student: Student): boolean {
  return (WITHDRAWN_GROUP_STATUSES as readonly string[]).includes(student.status);
}
