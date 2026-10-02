import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { ClassSubject } from "@/lib/setup/academicStructure/classSubjectsApi";
import {
  loadSubjectEnrolments,
  persistSubjectEnrolments,
} from "@/lib/setup/academicStructure/subjectEnrolmentStorage";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * MOCK — the real Subject Enrolment API doesn't exist yet (Muntajir hasn't
 * built it). Frontend-ahead, doubling as the spec for his backend. Every
 * business rule below is commented as backend-owned.
 *
 * CORE AUTO-INHERIT (business rule, BACKEND-OWNED) — a student in a
 * class-arm always has the class's CORE subjects. This is modeled as
 * DERIVE-AT-READ, not a stored fact: a stored SubjectEnrolment row only
 * ever represents an ELECTIVE. "Does student X have class Y's core
 * subjects" is answered by cross-referencing their current class (via
 * their Student Term Details row — studentTermDetailsApi.ts) against the
 * real ClassSubject list's `subject_group === "Core"` rows, computed fresh
 * every time with getCoreClassSubjectIds() below — never written anywhere.
 * This is the more robust model: it can never drift out of sync with the
 * class's actual core-subject configuration, and there's nothing to
 * migrate/backfill if that configuration changes later.
 *
 * Term-wise; carries forward on Student Term Details' auto-roll (see
 * carryForwardElectivesForTerm() below, called from
 * studentTermDetailsApi.ts's runAutoRollForYear() for each student it
 * rolls). Only elective rows ever need carrying forward — core is correct
 * automatically, by definition of being derived.
 */
export type SubjectEnrolment = {
  id: string;
  academic_year_id: string;
  class_term_id: string;
  section_id: string;
  student_id: string;
  /** Always an ELECTIVE class-subject id — core is never stored, see file header. */
  class_subject_id: string;
  created_at: string;
};

export function subjectEnrolmentsQueryKey(yearId: string): readonly unknown[] {
  return ["setup", "subjectEnrolments", yearId];
}

let cachedRows: SubjectEnrolment[] | null = null;

function getStore(): SubjectEnrolment[] {
  if (cachedRows) return cachedRows;
  cachedRows = loadSubjectEnrolments() ?? [];
  return cachedRows;
}

function saveStore(rows: SubjectEnrolment[]): void {
  cachedRows = rows;
  persistSubjectEnrolments(rows);
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `mock-subject-enrolment-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

/** Pure — the derive-at-read half of CORE AUTO-INHERIT. No store involved. */
export function getCoreClassSubjectIds(classId: string, classSubjects: ClassSubject[]): string[] {
  return classSubjects.filter((cs) => cs.class_id === classId && cs.subject_group === "Core").map((cs) => cs.id);
}

/** A student's full effective subject list for one term: derived core + stored electives. */
export function effectiveSubjectIds(
  studentId: string,
  classId: string,
  classTermId: string,
  classSubjects: ClassSubject[],
  enrolments: SubjectEnrolment[],
): string[] {
  const core = getCoreClassSubjectIds(classId, classSubjects);
  const electives = enrolments
    .filter((row) => row.student_id === studentId && row.class_term_id === classTermId)
    .map((row) => row.class_subject_id);
  return Array.from(new Set([...core, ...electives]));
}

export async function listSubjectEnrolments(yearId: string): Promise<CrudResult<SubjectEnrolment[]>> {
  await mockDelay(250);
  return { ok: true, data: getStore().filter((row) => row.academic_year_id === yearId) };
}

/**
 * Enrol New wizard's submit — one call per chosen elective per selected
 * student. Core is never written here (see file header); only the chosen
 * electives are. Dedupes against existing rows (skip, not fail — same
 * created/existing counting convention the real Class Subjects bulk
 * endpoint uses, classSubjectsApi.ts) rather than rejecting the whole
 * batch over one already-enrolled pair.
 */
export async function enrolStudentsInElectives(input: {
  academic_year_id: string;
  class_term_id: string;
  /** Each student's OWN section_id (their actual class-arm, from Student Term Details) — a multi-arm enrol batch can span more than one arm of the same class. */
  students: Array<{ student_id: string; section_id: string }>;
  elective_class_subject_ids: string[];
}): Promise<CrudResult<{ created_count: number; existing_count: number }>> {
  await mockDelay(400);
  const store = getStore();
  const existingKeys = new Set(store.map((row) => `${row.student_id}:${row.class_term_id}:${row.class_subject_id}`));

  const additions: SubjectEnrolment[] = [];
  let existingCount = 0;
  const now = nowIso();

  for (const { student_id, section_id } of input.students) {
    for (const classSubjectId of input.elective_class_subject_ids) {
      const key = `${student_id}:${input.class_term_id}:${classSubjectId}`;
      if (existingKeys.has(key)) {
        existingCount += 1;
        continue;
      }
      existingKeys.add(key);
      additions.push({
        id: newId(),
        academic_year_id: input.academic_year_id,
        class_term_id: input.class_term_id,
        section_id,
        student_id,
        class_subject_id: classSubjectId,
        created_at: now,
      });
    }
  }

  if (additions.length > 0) saveStore([...store, ...additions]);
  return { ok: true, data: { created_count: additions.length, existing_count: existingCount } };
}

/**
 * Details views' per-student elective toggle — diffs the student's current
 * elective rows for this term against `desiredElectiveIds`, adding/removing
 * only the difference. Core is never touched (it's never stored, see file
 * header) — this function only ever sees/changes elective rows.
 */
export async function setStudentElectives(
  academicYearId: string,
  studentId: string,
  classTermId: string,
  sectionId: string,
  desiredElectiveIds: string[],
): Promise<CrudResult<void>> {
  await mockDelay(250);
  const store = getStore();
  const current = store.filter((row) => row.student_id === studentId && row.class_term_id === classTermId);
  const currentIds = new Set(current.map((row) => row.class_subject_id));
  const desiredIds = new Set(desiredElectiveIds);

  const now = nowIso();
  const kept = store.filter(
    (row) => !(row.student_id === studentId && row.class_term_id === classTermId && !desiredIds.has(row.class_subject_id)),
  );
  const additions: SubjectEnrolment[] = desiredElectiveIds
    .filter((id) => !currentIds.has(id))
    .map((classSubjectId) => ({
      id: newId(),
      academic_year_id: academicYearId,
      class_term_id: classTermId,
      section_id: sectionId,
      student_id: studentId,
      class_subject_id: classSubjectId,
      created_at: now,
    }));

  saveStore([...kept, ...additions]);
  return { ok: true, data: undefined };
}

/**
 * Called from studentTermDetailsApi.ts's auto-roll for each student it
 * rolls into a new term — copies that student's ELECTIVE rows from the
 * prior term into the new one. Since Student Term Details' auto-roll is
 * explicitly scoped to the SAME class/arm within one academic year (never
 * class promotion — see studentTermDetailsApi.ts), a class_subject_id from
 * the old term is still valid in the new one: no subject re-matching is
 * needed, just a straight copy onto the new class_term_id/section_id. Core
 * needs no carry-forward at all — it's derived fresh from the (unchanged)
 * class's ClassSubject list every time, by definition.
 */
export async function carryForwardElectivesForTerm(
  studentId: string,
  fromClassTermId: string,
  toClassTermId: string,
  toSectionId: string,
): Promise<void> {
  const store = getStore();
  const alreadyInNewTerm = new Set(
    store.filter((row) => row.student_id === studentId && row.class_term_id === toClassTermId).map((row) => row.class_subject_id),
  );
  const toCopy = store.filter(
    (row) =>
      row.student_id === studentId &&
      row.class_term_id === fromClassTermId &&
      !alreadyInNewTerm.has(row.class_subject_id),
  );
  if (toCopy.length === 0) return;

  const now = nowIso();
  const additions: SubjectEnrolment[] = toCopy.map((row) => ({
    ...row,
    id: newId(),
    class_term_id: toClassTermId,
    section_id: toSectionId,
    created_at: now,
  }));
  saveStore([...store, ...additions]);
}

export async function removeSubjectEnrolment(id: string): Promise<CrudResult<void>> {
  await mockDelay(250);
  saveStore(getStore().filter((row) => row.id !== id));
  return { ok: true, data: undefined };
}
