import { mockDelay } from "@/lib/onboarding/mockDelay";
import { buildSeedStudents } from "@/lib/students/studentsMockData";
import type { Student } from "@/lib/students/studentTypes";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * MOCK — the real Students API doesn't exist yet (Muntajir hasn't built
 * it). This file is frontend-ahead: built to the same CrudResult<T> shape
 * every real ERP service already uses, so swapping in the real backend
 * later is a one-file change — nothing in StudentsScreen.tsx or the Add
 * Student wizard needs to change beyond the import.
 *
 * Commit 1 only needs list() (read-only, for the Students table + stat
 * cards). create()/update()/saveDraft()/remove() land in Commit 3 once the
 * wizard exists, backed by src/lib/students/studentsStorage.ts
 * (localStorage, per-school) so the mock data survives a reload.
 *
 * OPEN DECISION FOR MUNTAJIR (flagged, not settled): should draft students
 * (status:"draft", saved mid-wizard via "Save Draft") be persisted
 * server-side at all in the real API — i.e. cross-device resumable, which
 * is what this mock's eventual design leans toward — or should "Save
 * Draft" stay a frontend-only affordance (e.g. localStorage, device-local,
 * never sent to the server until the wizard is finished)? Do not build the
 * real API's draft handling off this mock's choice without checking first.
 */
export const studentsQueryKey = ["students", "list"] as const;

let seeded: Student[] | null = null;

function seedData(): Student[] {
  if (!seeded) seeded = buildSeedStudents();
  return seeded;
}

export async function listStudents(): Promise<CrudResult<Student[]>> {
  await mockDelay(300);
  return { ok: true, data: [...seedData()] };
}
