import { mockDelay } from "@/lib/onboarding/mockDelay";
import { createClassesService } from "@/lib/setup/academicStructure/classesApi";
import { fetchTermsForClass, findActiveClassTerm } from "@/lib/setup/academicStructure/classTermsApi";
import { carryForwardElectivesForTerm } from "@/lib/setup/academicStructure/subjectEnrolmentApi";
import {
  loadStudentTermDetails,
  persistStudentTermDetails,
} from "@/lib/setup/academicStructure/studentTermDetailsStorage";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * MOCK — the real Student Term Details API doesn't exist yet (Muntajir
 * hasn't built it). This file is frontend-ahead, built to the same
 * CrudResult<T>/CrudService<T> shape every real ERP service already uses,
 * so swapping in the real backend later is a one-file change. Doubles as
 * the spec for Muntajir's backend — every business rule below is commented
 * as backend-owned, not a frontend invention.
 *
 * Consumes REAL Classes (classesApi)/Class Terms (classTermsApi) — gated by
 * DEV_AUTH_BYPASS like every other real ERP read, so locally this screen's
 * cascades are empty and auto-roll can't run (see runAutoRoll() below);
 * only meaningfully testable on deploy. The mock Student list (studentsApi)
 * is local either way.
 *
 * Backed by localStorage (studentTermDetailsStorage.ts) so mock rows
 * survive a reload, same pattern as studentsApi.ts.
 */
export type StudentTermDetail = {
  id: string;
  academic_year_id: string;
  /** Real ClassTerm id (classTermsApi) — carries its own class_id/term_type/dates. */
  class_term_id: string;
  /** Denormalized from class_term_id, so display/filtering never needs a lookup chain. */
  class_id: string;
  /** Real Section id (sectionsApi) — the "class-arm". */
  section_id: string;
  /** Mock Student id (studentsApi). */
  student_id: string;
  /** MOCK_HOUSES id (studentsMockData.ts) — the academic/inter-house competition house, optional. */
  house_id: string | null;
  seat_number: string | null;
  roll_no: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentTermDetailInput = Omit<StudentTermDetail, "id" | "created_at" | "updated_at">;

export function studentTermDetailsQueryKey(yearId: string): readonly unknown[] {
  return ["setup", "studentTermDetails", yearId];
}

let cachedRows: StudentTermDetail[] | null = null;

function getStore(): StudentTermDetail[] {
  if (cachedRows) return cachedRows;
  cachedRows = loadStudentTermDetails() ?? [];
  return cachedRows;
}

function saveStore(rows: StudentTermDetail[]): void {
  cachedRows = rows;
  persistStudentTermDetails(rows);
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function newId(): string {
  return `mock-term-detail-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

/**
 * AUTO-ROLL — business rule, BACKEND-OWNED (spec for Muntajir).
 *
 * When a new term starts, every student placed in the PRIOR term of a
 * class, whose prior term's end_date has already passed, automatically
 * gets a term-detail row in that SAME class's CURRENT term (by date) —
 * same section/house/seat/roll carried over. This is TERM-TO-TERM WITHIN
 * ONE ACADEMIC YEAR, same class/arm only — it is NOT class promotion
 * (e.g. JSS1 -> JSS2 across a year boundary), which is a separate,
 * later feature and must not be conflated with this.
 *
 * In production this is a backend trigger (cron, or fired on term
 * activation) with no client involvement. Here it's approximated by
 * computing it fresh on every list() call (compute-on-read, not an eager
 * write some other action triggers) — idempotent, since the one-term
 * uniqueness check below means it can never double-create a row. Requires
 * the REAL Classes/Class Terms APIs to know each class's current term; if
 * those are unavailable (DEV_AUTH_BYPASS locally, or a real failure), this
 * silently no-ops and list() just returns whatever's already stored.
 */
async function runAutoRollForYear(yearId: string): Promise<void> {
  const classesService = createClassesService(yearId);
  const classesResult = await classesService.list();
  if (!classesResult.ok) return;

  const store = getStore();
  const additions: StudentTermDetail[] = [];
  const carryForwards: Array<{ studentId: string; fromClassTermId: string; toClassTermId: string; toSectionId: string }> = [];
  const today = todayIso();

  for (const cls of classesResult.data) {
    const termsResult = await fetchTermsForClass(cls.id);
    if (!termsResult.ok) continue;

    const currentTerm = findActiveClassTerm(termsResult.data);
    if (!currentTerm) continue;

    const priorTermIds = new Set(
      termsResult.data.filter((term) => term.id !== currentTerm.id && term.end_date < today).map((term) => term.id),
    );
    if (priorTermIds.size === 0) continue;

    for (const row of store) {
      if (row.class_id !== cls.id || !priorTermIds.has(row.class_term_id)) continue;

      const alreadyRolled =
        store.some((existing) => existing.student_id === row.student_id && existing.class_term_id === currentTerm.id) ||
        additions.some((pending) => pending.student_id === row.student_id && pending.class_term_id === currentTerm.id);
      if (alreadyRolled) continue;

      const newRow: StudentTermDetail = {
        ...row,
        id: newId(),
        class_term_id: currentTerm.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      additions.push(newRow);
      carryForwards.push({
        studentId: row.student_id,
        fromClassTermId: row.class_term_id,
        toClassTermId: currentTerm.id,
        toSectionId: newRow.section_id,
      });
    }
  }

  if (additions.length > 0) saveStore([...store, ...additions]);

  // Part 2 coupling point (the one deliberate link between the two mock
  // modules): a rolled student's ELECTIVE subject enrolments carry forward
  // into their new term row too — see subjectEnrolmentApi.ts's
  // carryForwardElectivesForTerm() for why this is a safe straight copy
  // (same class/arm, never promotion) and why core needs no equivalent call
  // at all (it's derived fresh, never stored).
  for (const carry of carryForwards) {
    await carryForwardElectivesForTerm(carry.studentId, carry.fromClassTermId, carry.toClassTermId, carry.toSectionId);
  }
}

export async function listStudentTermDetails(yearId: string): Promise<CrudResult<StudentTermDetail[]>> {
  await mockDelay(300);
  await runAutoRollForYear(yearId);
  return { ok: true, data: getStore().filter((row) => row.academic_year_id === yearId) };
}

/**
 * ONE-TERM RULE — business rule, BACKEND-OWNED (spec for Muntajir): a
 * student can hold at most one term-detail row per class_term_id — a real
 * backend should enforce this as a unique (student_id, class_term_id)
 * constraint, not just an application-level check.
 */
function findTermConflict(
  store: StudentTermDetail[],
  input: StudentTermDetailInput,
  excludeId?: string,
): StudentTermDetail | undefined {
  return store.find(
    (row) => row.id !== excludeId && row.student_id === input.student_id && row.class_term_id === input.class_term_id,
  );
}

export async function createStudentTermDetail(input: StudentTermDetailInput): Promise<CrudResult<StudentTermDetail>> {
  await mockDelay(300);
  const store = getStore();
  if (findTermConflict(store, input)) {
    return { ok: false, kind: "conflict", message: "This student is already enrolled in this term." };
  }
  const now = nowIso();
  const created: StudentTermDetail = { ...input, id: newId(), created_at: now, updated_at: now };
  saveStore([...store, created]);
  return { ok: true, data: created };
}

export async function updateStudentTermDetail(
  id: string,
  input: StudentTermDetailInput,
): Promise<CrudResult<StudentTermDetail>> {
  await mockDelay(300);
  const store = getStore();
  const index = store.findIndex((row) => row.id === id);
  if (index === -1) return { ok: false, kind: "conflict", message: "Record no longer exists." };
  if (findTermConflict(store, input, id)) {
    return { ok: false, kind: "conflict", message: "This student is already enrolled in this term." };
  }
  const updated: StudentTermDetail = { ...store[index], ...input, updated_at: nowIso() };
  const next = [...store];
  next[index] = updated;
  saveStore(next);
  return { ok: true, data: updated };
}

export async function removeStudentTermDetail(id: string): Promise<CrudResult<void>> {
  await mockDelay(300);
  saveStore(getStore().filter((row) => row.id !== id));
  return { ok: true, data: undefined };
}

/**
 * AUTO-POPULATE ON STUDENT CREATION — business rule, BACKEND-OWNED (spec
 * for Muntajir): saving a student as active with a class/arm/term already
 * set (Add Student wizard Step 1) automatically creates their first
 * Student Term Details record for that term — they appear on this screen
 * without the admin ever using "Add Student Term" manually. Called from
 * studentsApi.ts's createStudent() right after a student is finalized to
 * status:"active". Idempotent via the ONE-TERM RULE's own uniqueness check
 * above (createStudentTermDetail rejects a duplicate (student, term) pair
 * as a conflict, which this treats as "already exists" rather than an
 * error) — safe to call on every save, including re-saving an
 * already-enrolled student in edit mode.
 */
export async function ensureStudentTermDetailFromStudent(
  yearId: string,
  student: {
    id: string;
    class_id: string;
    class_arm_id: string;
    class_term_id: string | null;
    academic_house_id: string | null;
  },
): Promise<void> {
  if (!student.class_term_id) return;
  await createStudentTermDetail({
    academic_year_id: yearId,
    class_term_id: student.class_term_id,
    class_id: student.class_id,
    section_id: student.class_arm_id,
    student_id: student.id,
    house_id: student.academic_house_id,
    seat_number: null,
    roll_no: null,
    remark: null,
  });
}

export function createStudentTermDetailService(
  yearId: string,
): CrudService<StudentTermDetail, StudentTermDetailInput, StudentTermDetailInput> {
  return {
    queryKey: studentTermDetailsQueryKey(yearId),
    list: () => listStudentTermDetails(yearId),
    create: (data) => createStudentTermDetail(data),
    update: (id, data) => updateStudentTermDetail(id, data),
    remove: (id) => removeStudentTermDetail(id),
  };
}
