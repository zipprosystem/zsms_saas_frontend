import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * MOCK service — no backend endpoint exists yet. In-memory only. Unlike
 * classSubjectsApi.ts, a group IS a single record per create/edit (no
 * fan-out), so this satisfies the ordinary CrudService shape and can go
 * straight through CrudScreen — a year-scoped factory, same pattern as
 * classesApi.ts's createClassesService(yearId). Starts empty, same
 * reasoning as classSubjectsApi.ts (class_ids/class_subject_ids would
 * reference ids this mock can't independently seed).
 */
export type ClassSubjectGroup = {
  id: string;
  academic_year_id: string;
  name: string;
  class_ids: string[];
  class_subject_ids: string[];
  created_at: string;
  updated_at: string;
};

export type ClassSubjectGroupInput = {
  name: string;
  class_ids: string[];
  class_subject_ids: string[];
};

function resolveAfter<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `csg-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

let groups: ClassSubjectGroup[] = [];

export function createClassSubjectGroupService(
  yearId: string,
): CrudService<ClassSubjectGroup, ClassSubjectGroupInput, ClassSubjectGroupInput> {
  async function list(): Promise<CrudResult<ClassSubjectGroup[]>> {
    return resolveAfter({ ok: true, data: groups.filter((group) => group.academic_year_id === yearId) });
  }

  async function create(data: ClassSubjectGroupInput): Promise<CrudResult<ClassSubjectGroup>> {
    const group: ClassSubjectGroup = {
      id: makeId(),
      academic_year_id: yearId,
      ...data,
      created_at: now(),
      updated_at: now(),
    };
    groups = [...groups, group];
    return resolveAfter({ ok: true, data: group });
  }

  async function update(id: string, data: ClassSubjectGroupInput): Promise<CrudResult<ClassSubjectGroup>> {
    const existing = groups.find((group) => group.id === id);
    if (!existing) return resolveAfter({ ok: false, kind: "conflict" });
    const updated: ClassSubjectGroup = { ...existing, ...data, updated_at: now() };
    groups = groups.map((group) => (group.id === id ? updated : group));
    return resolveAfter({ ok: true, data: updated });
  }

  async function remove(id: string): Promise<CrudResult<void>> {
    groups = groups.filter((group) => group.id !== id);
    return resolveAfter({ ok: true, data: undefined });
  }

  return {
    queryKey: ["setup", "classSubjectGroups", yearId],
    list,
    create,
    update,
    remove,
  };
}
