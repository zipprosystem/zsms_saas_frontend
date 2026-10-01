import { mockDelay } from "@/lib/onboarding/mockDelay";
import { buildSeedStudents } from "@/lib/students/studentsMockData";
import { loadStudents, persistStudents } from "@/lib/students/studentsStorage";
import type { Student, StudentStatus } from "@/lib/students/studentTypes";
import type { CrudResult } from "@/lib/setup/crudTypes";

/**
 * MOCK — the real Students API doesn't exist yet (Muntajir hasn't built
 * it). This file is frontend-ahead: built to the same CrudResult<T> shape
 * every real ERP service already uses, so swapping in the real backend
 * later is a one-file change — nothing in StudentsScreen.tsx or the Add
 * Student wizard needs to change beyond the import.
 *
 * Backed by studentsStorage.ts (localStorage) so the mock data — including
 * drafts — survives a reload. Seeded once from studentsMockData.ts on first
 * load; every mutation after that reads/writes through storage.
 *
 * OPEN DECISION FOR MUNTAJIR (flagged, not settled): should draft students
 * (status:"draft", saved mid-wizard via "Save Draft") be persisted
 * server-side at all in the real API — i.e. cross-device resumable, which
 * is what this mock's choice leans toward — or should "Save Draft" stay a
 * frontend-only affordance (e.g. localStorage, device-local, never sent to
 * the server until the wizard is finished)? Do not build the real API's
 * draft handling off this mock's choice without checking first.
 */
export const studentsQueryKey = ["students", "list"] as const;

/** Everything a create/update/saveDraft call provides — the service fills in id/status/draft_last_step/created_at/updated_at itself. */
export type StudentUpsertInput = Omit<Student, "id" | "status" | "draft_last_step" | "created_at" | "updated_at">;

let cachedStudents: Student[] | null = null;

function getStore(): Student[] {
  if (cachedStudents) return cachedStudents;
  const stored = loadStudents();
  cachedStudents = stored ?? buildSeedStudents();
  if (!stored) persistStudents(cachedStudents);
  return cachedStudents;
}

function saveStore(students: Student[]): void {
  cachedStudents = students;
  persistStudents(students);
}

function nowIso(): string {
  return new Date().toISOString();
}

function newStudentId(): string {
  return `mock-student-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

export async function listStudents(): Promise<CrudResult<Student[]>> {
  await mockDelay(300);
  return { ok: true, data: [...getStore()] };
}

export async function getStudent(id: string): Promise<CrudResult<Student>> {
  await mockDelay(150);
  const found = getStore().find((student) => student.id === id);
  if (!found) return { ok: false, kind: "conflict", message: "Student not found." };
  return { ok: true, data: found };
}

/** Finishing the wizard (step 7 submit) — always status:"active", whether this was a brand-new student or a draft being completed. */
export async function createStudent(input: StudentUpsertInput, draftId?: string): Promise<CrudResult<Student>> {
  await mockDelay(400);
  const store = getStore();
  const now = nowIso();

  if (draftId) {
    const index = store.findIndex((student) => student.id === draftId);
    if (index === -1) return { ok: false, kind: "conflict", message: "Draft no longer exists." };
    const finalized: Student = { ...store[index], ...input, status: "active", draft_last_step: null, updated_at: now };
    const next = [...store];
    next[index] = finalized;
    saveStore(next);
    return { ok: true, data: finalized };
  }

  const created: Student = { ...input, id: newStudentId(), status: "active", draft_last_step: null, created_at: now, updated_at: now };
  saveStore([...store, created]);
  return { ok: true, data: created };
}

/** Save Draft — upserts whatever's been filled in so far, no validation gate. First call on a new student creates a status:"draft" row; later calls just refresh it. Never force-downgrades an already-finalized student's status (editing an active student and clicking Save Draft shouldn't quietly un-enroll them). */
export async function saveDraftStudent(
  studentId: string | null,
  input: StudentUpsertInput,
  currentStep: number,
): Promise<CrudResult<Student>> {
  await mockDelay(300);
  const store = getStore();
  const now = nowIso();

  if (!studentId) {
    const created: Student = {
      ...input,
      id: newStudentId(),
      status: "draft",
      draft_last_step: currentStep,
      created_at: now,
      updated_at: now,
    };
    saveStore([...store, created]);
    return { ok: true, data: created };
  }

  const index = store.findIndex((student) => student.id === studentId);
  if (index === -1) return { ok: false, kind: "conflict", message: "Student no longer exists." };
  const existing = store[index];
  const stillDraft = existing.status === "draft";
  const updated: Student = {
    ...existing,
    ...input,
    status: existing.status,
    draft_last_step: stillDraft ? currentStep : null,
    updated_at: now,
  };
  const next = [...store];
  next[index] = updated;
  saveStore(next);
  return { ok: true, data: updated };
}

/** Generic field patch — used for status transitions (Withdraw) and will back the wizard's "edit an existing active student" save path. */
export async function updateStudent(id: string, patch: Partial<Student>): Promise<CrudResult<Student>> {
  await mockDelay(300);
  const store = getStore();
  const index = store.findIndex((student) => student.id === id);
  if (index === -1) return { ok: false, kind: "conflict", message: "Student no longer exists." };
  const updated: Student = { ...store[index], ...patch, updated_at: nowIso() };
  const next = [...store];
  next[index] = updated;
  saveStore(next);
  return { ok: true, data: updated };
}

export async function setStudentStatus(id: string, status: StudentStatus): Promise<CrudResult<Student>> {
  // Only include draft_last_step when clearing it — {...existing, draft_last_step: undefined}
  // would overwrite the existing cursor with undefined (the key is present either way), not leave it alone.
  return updateStudent(id, status === "draft" ? { status } : { status, draft_last_step: null });
}
