import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type { SchoolTypeInput } from "@/lib/setup/academicStructure/schoolTypesApi";

/**
 * THROWAWAY dev scaffolding — used ONLY when DEV_AUTH_BYPASS is on (see
 * schoolTypesApi.ts), so the School Type template-assignment flow can be
 * exercised locally. Production and staging never touch it. Delete this
 * file (and its four call sites) once the backend ships the assignment
 * fields and SCHOOL_TYPE_ASSIGNMENTS_LIVE flips.
 *
 * Holds the base School Type only (name, award bodies, description) —
 * the assignments still go through the side-store, same as on staging.
 * Award Bodies stay dev-bypassed, so the form can't load award body
 * options locally: edit a seeded row (its award body is pre-filled) to
 * test; a brand-new one can't pass the award-body requirement.
 */
type DevSchoolType = {
  id: string;
  name: string;
  award_body_ids: string[];
  award_bodies: Array<{ id: string; name: string; description: string | null }>;
  description: string | null;
  classes: Array<{ id: string; name: string; is_active: boolean }>;
};

const STORAGE_KEY = "zsms.devMockSchoolTypes";
const WAEC = { id: "dev-award-body-waec", name: "WAEC", description: null };
const CAMBRIDGE = { id: "dev-award-body-cambridge", name: "Cambridge", description: null };

const SEEDS: DevSchoolType[] = [
  { id: "dev-school-type-primary", name: "Primary", award_body_ids: [WAEC.id], award_bodies: [WAEC], description: null, classes: [] },
  { id: "dev-school-type-jss", name: "Junior Secondary", award_body_ids: [WAEC.id], award_bodies: [WAEC], description: null, classes: [] },
  {
    id: "dev-school-type-igcse",
    name: "IGCSE",
    award_body_ids: [CAMBRIDGE.id],
    award_bodies: [CAMBRIDGE],
    description: "British curriculum",
    classes: [],
  },
];

const KNOWN_AWARD_BODIES = [WAEC, CAMBRIDGE];

function load(): DevSchoolType[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed)) return parsed as DevSchoolType[];
  } catch {
    // fall through to the seeds
  }
  return SEEDS.map((row) => ({ ...row }));
}

function save(rows: DevSchoolType[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // best-effort
  }
}

function fromInput(id: string, input: SchoolTypeInput, classes: DevSchoolType["classes"]): DevSchoolType {
  return {
    id,
    name: input.name,
    award_body_ids: input.award_body_ids,
    award_bodies: KNOWN_AWARD_BODIES.filter((body) => input.award_body_ids.includes(body.id)),
    description: input.description,
    classes,
  };
}

export async function devList(): Promise<CrudResult<DevSchoolType[]>> {
  await mockDelay(200);
  return { ok: true, data: load() };
}

export async function devCreate(input: SchoolTypeInput): Promise<CrudResult<DevSchoolType>> {
  await mockDelay(200);
  const created = fromInput(`dev-school-type-${Date.now()}`, input, []);
  save([...load(), created]);
  return { ok: true, data: created };
}

export async function devUpdate(id: string, input: SchoolTypeInput): Promise<CrudResult<DevSchoolType>> {
  await mockDelay(200);
  const rows = load();
  const existing = rows.find((row) => row.id === id);
  if (!existing) return { ok: false, kind: "conflict" };
  const updated = fromInput(id, input, existing.classes);
  save(rows.map((row) => (row.id === id ? updated : row)));
  return { ok: true, data: updated };
}

export async function devRemove(id: string): Promise<CrudResult<void>> {
  await mockDelay(200);
  save(load().filter((row) => row.id !== id));
  return { ok: true, data: undefined };
}
