import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import type { SubjectFile } from "@/lib/setup/academicStructure/subjectFileUpload";

/**
 * MOCK service — Muntajir confirmed the existing year-scoped Subjects API
 * is NOT this Subject Master; this is a new school-level subject catalog
 * entity needing its own API (flagged for him). In-memory only (resets on
 * page reload). Same CrudService shape as every real Setup service — see
 * departmentsApi.ts's header comment for the one-file-swap reasoning.
 *
 * AI-READINESS (standing principle, not a Phase-5 feature being built
 * now): `description_json` — TipTap's ProseMirror JSON — is the CANONICAL
 * value; `description_html` is the rendered semantic HTML kept alongside
 * purely for cheap direct display without re-hydrating TipTap. Structured
 * JSON (rather than messy inline-styled HTML) is what a future subject
 * chatbot/RAG or lesson-summariser feature would need to ingest as clean
 * text. Same reasoning applies to `file`: a retrievable URL + metadata,
 * not an opaque blob, so it's fetchable by an AI feature later too.
 */
export type SubjectMaster = {
  id: string;
  name: string;
  short_name: string;
  color: string;
  department_id: string;
  file: SubjectFile | null;
  description_json: Record<string, unknown> | null;
  description_html: string | null;
  show_on_frontend: boolean;
  created_at: string;
  updated_at: string;
};

export type SubjectMasterInput = {
  name: string;
  short_name: string;
  color: string;
  department_id: string;
  file: SubjectFile | null;
  description_json: Record<string, unknown> | null;
  description_html: string | null;
  show_on_frontend: boolean;
};

function resolveAfter<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `subj-${Math.random().toString(36).slice(2)}`;
}

const now = () => new Date().toISOString();

let subjects: SubjectMaster[] = [
  {
    id: "subj-mathematics",
    name: "Mathematics",
    short_name: "MATH",
    color: "#852B99",
    department_id: "dept-sciences",
    file: null,
    description_json: null,
    description_html: null,
    show_on_frontend: false,
    created_at: now(),
    updated_at: now(),
  },
  {
    id: "subj-english",
    name: "English Language",
    short_name: "ENGL",
    color: "#2563EB",
    department_id: "dept-languages",
    file: null,
    description_json: null,
    description_html: null,
    show_on_frontend: true,
    created_at: now(),
    updated_at: now(),
  },
];

async function list(): Promise<CrudResult<SubjectMaster[]>> {
  return resolveAfter({ ok: true, data: [...subjects] });
}

async function create(data: SubjectMasterInput): Promise<CrudResult<SubjectMaster>> {
  const subject: SubjectMaster = { id: makeId(), ...data, created_at: now(), updated_at: now() };
  subjects = [...subjects, subject];
  return resolveAfter({ ok: true, data: subject });
}

async function update(id: string, data: SubjectMasterInput): Promise<CrudResult<SubjectMaster>> {
  const existing = subjects.find((subject) => subject.id === id);
  if (!existing) return resolveAfter({ ok: false, kind: "conflict" });
  const updated: SubjectMaster = { ...existing, ...data, updated_at: now() };
  subjects = subjects.map((subject) => (subject.id === id ? updated : subject));
  return resolveAfter({ ok: true, data: updated });
}

async function remove(id: string): Promise<CrudResult<void>> {
  subjects = subjects.filter((subject) => subject.id !== id);
  return resolveAfter({ ok: true, data: undefined });
}

export const subjectsMasterService: CrudService<SubjectMaster, SubjectMasterInput, SubjectMasterInput> = {
  queryKey: ["setup", "subjectsMaster"],
  list,
  create,
  update,
  remove,
};
