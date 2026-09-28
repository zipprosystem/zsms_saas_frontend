import type { CrudResult } from "@/lib/setup/crudTypes";
import type { ClassSubjectFile } from "@/lib/setup/academicStructure/classSubjectFileUpload";

/**
 * MOCK service — no backend endpoint exists yet; Muntajir is finalizing
 * the contract. In-memory only (resets on page reload). Not a plain
 * CrudService (crudTypes.ts) — create() FANS OUT one independent record
 * per (class × subject) pair and returns a batch result, not a single
 * entity, so it can't satisfy that shape. Starts empty: seeding fake rows
 * would need real class ids, and Classes is a real-API-backed service (see
 * classesApi.ts) this mock has no way to know about — a seeded row here
 * would just show a permanently-unresolvable "—" for its class name.
 *
 * Year-scoped like Classes itself (createClassesService(yearId)) — list()
 * takes a yearId and classSubjectsQueryKey(yearId) is the shared cache key
 * every consumer (the screen's own table, the subjects-count style
 * derivations elsewhere, setupProgress.ts) reads through.
 */
export type SubjectGroup = "core" | "elective";

export type ClassSubject = {
  id: string;
  academic_year_id: string;
  class_id: string;
  subject_id: string;
  subject_group: SubjectGroup;
  unit: number | null;
  room_id: string | null;
  file: ClassSubjectFile | null;
  created_at: string;
  updated_at: string;
};

export type ClassSubjectCreateInput = {
  academic_year_id: string;
  class_ids: string[];
  subject_ids: string[];
  subject_group: SubjectGroup;
  unit: number | null;
  room_id: string | null;
  file: ClassSubjectFile | null;
};

export type ClassSubjectUpdateInput = {
  subject_group: SubjectGroup;
  unit: number | null;
  room_id: string | null;
  file: ClassSubjectFile | null;
};

export type ClassSubjectCreateResult = { created: ClassSubject[]; skipped: number };

function resolveAfter<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cs-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

let classSubjects: ClassSubject[] = [];

export function classSubjectsQueryKey(yearId: string): readonly unknown[] {
  return ["setup", "classSubjects", yearId];
}

export async function fetchClassSubjectsForYear(yearId: string): Promise<CrudResult<ClassSubject[]>> {
  return resolveAfter({ ok: true, data: classSubjects.filter((row) => row.academic_year_id === yearId) });
}

// Fans out class_ids × subject_ids into one independent record per pair,
// SKIPPING (not failing) any pair that already exists for this year — see
// ClassSubjectsScreen's toast, which reports both counts to the user.
export async function createClassSubjects(
  input: ClassSubjectCreateInput,
): Promise<CrudResult<ClassSubjectCreateResult>> {
  const created: ClassSubject[] = [];
  let skipped = 0;

  for (const classId of input.class_ids) {
    for (const subjectId of input.subject_ids) {
      const exists = classSubjects.some(
        (row) =>
          row.academic_year_id === input.academic_year_id &&
          row.class_id === classId &&
          row.subject_id === subjectId,
      );
      if (exists) {
        skipped += 1;
        continue;
      }
      const record: ClassSubject = {
        id: makeId(),
        academic_year_id: input.academic_year_id,
        class_id: classId,
        subject_id: subjectId,
        subject_group: input.subject_group,
        unit: input.unit,
        room_id: input.room_id,
        file: input.file,
        created_at: now(),
        updated_at: now(),
      };
      classSubjects = [...classSubjects, record];
      created.push(record);
    }
  }

  return resolveAfter({ ok: true, data: { created, skipped } });
}

export async function updateClassSubject(
  id: string,
  data: ClassSubjectUpdateInput,
): Promise<CrudResult<ClassSubject>> {
  const existing = classSubjects.find((row) => row.id === id);
  if (!existing) return resolveAfter({ ok: false, kind: "conflict" });
  const updated: ClassSubject = { ...existing, ...data, updated_at: now() };
  classSubjects = classSubjects.map((row) => (row.id === id ? updated : row));
  return resolveAfter({ ok: true, data: updated });
}

export async function removeClassSubject(id: string): Promise<CrudResult<void>> {
  classSubjects = classSubjects.filter((row) => row.id !== id);
  return resolveAfter({ ok: true, data: undefined });
}
