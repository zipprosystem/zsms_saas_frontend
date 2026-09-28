import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * MOCK service — no backend endpoint exists yet for Departments; flagged
 * for Muntajir. In-memory only (resets on page reload). Deliberately
 * satisfies the exact same CrudService<T, CreateInput, UpdateInput> shape
 * every real Setup service uses (see e.g. schoolTypesApi.ts) — every
 * consumer (DepartmentsScreen, Subject Master's department dropdown, the
 * subjects-count derivation, setupProgress.ts, search) reads through the
 * `departmentsService` export below, so swapping this file for a real
 * apiFetch-backed implementation later never touches a caller.
 */
export type Department = {
  id: string;
  name: string;
  hod_staff_id: string;
  senior_manager_staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DepartmentInput = {
  name: string;
  hod_staff_id: string;
  senior_manager_staff_id: string | null;
};

function resolveAfter<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dept-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

let departments: Department[] = [
  {
    id: "dept-sciences",
    name: "Sciences",
    hod_staff_id: "staff-3",
    senior_manager_staff_id: "staff-2",
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "dept-languages",
    name: "Languages",
    hod_staff_id: "staff-4",
    senior_manager_staff_id: null,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "dept-humanities",
    name: "Humanities",
    hod_staff_id: "staff-5",
    senior_manager_staff_id: "staff-2",
    created_at: now(),
    updated_at: now(),
  },
];

async function list(): Promise<CrudResult<Department[]>> {
  return resolveAfter({ ok: true, data: [...departments] });
}

async function create(data: DepartmentInput): Promise<CrudResult<Department>> {
  const department: Department = { id: makeId(), ...data, created_at: now(), updated_at: now() };
  departments = [...departments, department];
  return resolveAfter({ ok: true, data: department });
}

async function update(id: string, data: DepartmentInput): Promise<CrudResult<Department>> {
  const existing = departments.find((department) => department.id === id);
  if (!existing) return resolveAfter({ ok: false, kind: "conflict" });
  const updated: Department = { ...existing, ...data, updated_at: now() };
  departments = departments.map((department) => (department.id === id ? updated : department));
  return resolveAfter({ ok: true, data: updated });
}

// The "can't delete a department that still has subjects" rule is enforced
// client-side by DepartmentsScreen's rowActions (disabling the action
// entirely, see disabledReason there) — this mock has no way to check
// Subject Master's data itself, and a real backend would enforce it
// server-side with a 409 anyway. Flagged as a frontend-only guard until
// Muntajir's real API exists.
async function remove(id: string): Promise<CrudResult<void>> {
  departments = departments.filter((department) => department.id !== id);
  return resolveAfter({ ok: true, data: undefined });
}

export const departmentsService: CrudService<Department, DepartmentInput, DepartmentInput> = {
  queryKey: ["setup", "departments"],
  list,
  create,
  update,
  remove,
};
