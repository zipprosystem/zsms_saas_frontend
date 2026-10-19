import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import {
  createMockCatalog,
  readEntity,
  readListItems,
  realTransport,
  sendCatalogRequest,
  str,
  strOrNull,
  templateStatusFromWire,
  type MockTemplateRow,
  type TemplateStatus,
} from "@/lib/setup/assessmentConfiguration/templateCatalog";

/**
 * Result Templates catalog — MOCK until the backend ships it; flip
 * USE_MOCK to swap (nothing else changes, see templateCatalog.ts).
 *
 *   GET    erp/result-templates           -> { items, total, page, limit, has_more }
 *   POST   erp/result-templates           body: ResultTemplateWriteBody -> entity
 *   PUT    erp/result-templates/:id       body: ResultTemplateWriteBody -> entity
 *                                         (is_default: true makes it THE default — the
 *                                         backend clears the previous one)
 *   DELETE erp/result-templates/:id       archives (status -> archived)
 *
 * Entity shape is the agreed mock contract: { id, name, description,
 * suited_for_label, status, is_default, preview_path, layout_definition }.
 * layout_definition is opaque for now (the layout editor is out of
 * scope). preview_path is server-owned, never written.
 */
const USE_MOCK = true;

export type ResultTemplate = {
  id: string;
  name: string;
  description: string | null;
  suited_for_label: string | null;
  status: TemplateStatus;
  is_default: boolean;
  preview_path: string | null;
  layout_definition: string | null;
};

export type ResultTemplateInput = {
  name: string;
  description: string | null;
  suited_for_label: string | null;
  status: TemplateStatus;
  is_default: boolean;
  layout_definition: string | null;
};

type ResultTemplateWriteBody = ResultTemplateInput;

export const resultTemplatesQueryKey = ["setup", "resultTemplates"] as const;

const BASE_PATH = "erp/result-templates";
const WRITABLE_FIELDS = ["name", "description", "suited_for_label", "status", "is_default", "layout_definition"] as const;

export function fromWire(value: unknown): ResultTemplate {
  const r = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    id: str(r.id),
    name: str(r.name),
    description: strOrNull(r.description),
    suited_for_label: strOrNull(r.suited_for_label),
    status: templateStatusFromWire(r.status),
    is_default: r.is_default === true,
    preview_path: strOrNull(r.preview_path),
    layout_definition: strOrNull(r.layout_definition),
  };
}

export function toWire(input: ResultTemplateInput): ResultTemplateWriteBody {
  return {
    name: input.name,
    description: input.description,
    suited_for_label: input.suited_for_label,
    status: input.status,
    is_default: input.is_default,
    layout_definition: input.layout_definition,
  };
}

function toInput(template: ResultTemplate): ResultTemplateInput {
  return {
    name: template.name,
    description: template.description,
    suited_for_label: template.suited_for_label,
    status: template.status,
    is_default: template.is_default,
    layout_definition: template.layout_definition,
  };
}

// Fixed UUIDs so seeded rows keep their ids across reloads (and any
// School Type assignment pointing at them stays valid).
const SEEDS: Array<ResultTemplate & MockTemplateRow> = [
  {
    id: "7d2f4c1e-1a0b-4c3d-9e8f-000000000001",
    name: "Nigerian Terminal Report",
    description: "Continuous assessment and exam scores per subject, with affective and psychomotor ratings.",
    suited_for_label: "Nigerian curriculum — CA + Exam",
    status: "available",
    is_default: true,
    preview_path: "/template-previews/result-template-nigerian.html",
    layout_definition: null,
  },
  {
    id: "7d2f4c1e-1a0b-4c3d-9e8f-000000000002",
    name: "British Progress Report",
    description: "Attainment against target grades, with engagement and behaviour levels per subject.",
    suited_for_label: "British / IGCSE 9–1",
    status: "available",
    is_default: false,
    preview_path: "/template-previews/result-template-british.html",
    layout_definition: null,
  },
  {
    id: "7d2f4c1e-1a0b-4c3d-9e8f-000000000003",
    name: "Modern Generic Report",
    description: "A summary band of headline results above a simple subject table.",
    suited_for_label: "General",
    status: "available",
    is_default: false,
    preview_path: "/template-previews/result-template-modern.html",
    layout_definition: null,
  },
];

const transport = USE_MOCK
  ? createMockCatalog({
      basePath: BASE_PATH,
      storageKey: "zsms.mockResultTemplates",
      seeds: SEEDS,
      defaultScope: () => "all",
      writableFields: WRITABLE_FIELDS,
    })
  : realTransport;

const channel = { transport, isMock: USE_MOCK };

function entityResult(body: unknown): CrudResult<ResultTemplate> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
}

function templatePath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

/** Fetched once with limit=200 and handled client-side — a school has a handful of templates. */
async function list(): Promise<CrudResult<ResultTemplate[]>> {
  return sendCatalogRequest(channel, "GET", `${BASE_PATH}?page=1&limit=200`, undefined, (body) => ({
    ok: true,
    data: readListItems(body).map(fromWire),
  }));
}

async function create(input: ResultTemplateInput): Promise<CrudResult<ResultTemplate>> {
  return sendCatalogRequest(channel, "POST", BASE_PATH, toWire(input), entityResult);
}

async function update(id: string, input: ResultTemplateInput): Promise<CrudResult<ResultTemplate>> {
  return sendCatalogRequest(channel, "PUT", templatePath(id), toWire(input), entityResult);
}

/** Archive — the catalog never hard-deletes. */
async function remove(id: string): Promise<CrudResult<void>> {
  return sendCatalogRequest(channel, "DELETE", templatePath(id), undefined, () => ({ ok: true, data: undefined }));
}

/** Make this THE default: a full PUT with is_default: true (the backend clears the previous default). */
async function setDefault(template: ResultTemplate): Promise<CrudResult<ResultTemplate>> {
  return update(template.id, { ...toInput(template), is_default: true });
}

export const resultTemplatesService: CrudService<ResultTemplate, ResultTemplateInput, ResultTemplateInput> & {
  setDefault: typeof setDefault;
} = {
  queryKey: resultTemplatesQueryKey,
  list,
  create,
  update,
  remove,
  setDefault,
};
