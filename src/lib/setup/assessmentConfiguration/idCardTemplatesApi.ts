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
 * ID Card Templates catalog — MOCK until the backend ships it; flip
 * USE_MOCK to swap (nothing else changes, see templateCatalog.ts).
 *
 *   GET    erp/id-card-templates?kind=student|staff -> { items, total, page, limit, has_more }
 *   POST   erp/id-card-templates           body: IdCardTemplateWriteBody -> entity
 *   PUT    erp/id-card-templates/:id       body: IdCardTemplateWriteBody -> entity
 *                                          (is_default: true makes it the default FOR ITS KIND)
 *   DELETE erp/id-card-templates/:id       archives (status -> archived)
 *
 * Entity: { id, name, description, suited_for_label, kind, status,
 * is_default (one per kind), preview_path }. preview_path is
 * server-owned, never written. Both seeds preview from the same design
 * file; the preview frame shows the student or staff card by `kind`.
 */
const USE_MOCK = true;

export type IdCardKind = "student" | "staff";

export const ID_CARD_KINDS: readonly IdCardKind[] = ["student", "staff"];

export type IdCardTemplate = {
  id: string;
  name: string;
  description: string | null;
  suited_for_label: string | null;
  kind: IdCardKind;
  status: TemplateStatus;
  is_default: boolean;
  preview_path: string | null;
};

export type IdCardTemplateInput = {
  name: string;
  description: string | null;
  suited_for_label: string | null;
  kind: IdCardKind;
  status: TemplateStatus;
  is_default: boolean;
};

type IdCardTemplateWriteBody = IdCardTemplateInput;

export function idCardTemplatesQueryKey(kind: IdCardKind): readonly unknown[] {
  return ["setup", "idCardTemplates", kind];
}

const BASE_PATH = "erp/id-card-templates";
const WRITABLE_FIELDS = ["name", "description", "suited_for_label", "kind", "status", "is_default"] as const;

export function fromWire(value: unknown): IdCardTemplate {
  const r = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    id: str(r.id),
    name: str(r.name),
    description: strOrNull(r.description),
    suited_for_label: strOrNull(r.suited_for_label),
    kind: r.kind === "staff" ? "staff" : "student",
    status: templateStatusFromWire(r.status),
    is_default: r.is_default === true,
    preview_path: strOrNull(r.preview_path),
  };
}

export function toWire(input: IdCardTemplateInput): IdCardTemplateWriteBody {
  return {
    name: input.name,
    description: input.description,
    suited_for_label: input.suited_for_label,
    kind: input.kind,
    status: input.status,
    is_default: input.is_default,
  };
}

function toInput(template: IdCardTemplate): IdCardTemplateInput {
  return {
    name: template.name,
    description: template.description,
    suited_for_label: template.suited_for_label,
    kind: template.kind,
    status: template.status,
    is_default: template.is_default,
  };
}

const SEEDS: Array<IdCardTemplate & MockTemplateRow> = [
  {
    id: "3b8e6a2d-5c4f-4e1a-8b7d-000000000001",
    name: "Default Student ID Card",
    description: "Landscape CR80 card: crest, photo, name, level and date of birth, with a QR code on the back.",
    suited_for_label: "All students",
    kind: "student",
    status: "available",
    is_default: true,
    preview_path: "/template-previews/id-card-templates.html",
  },
  {
    id: "3b8e6a2d-5c4f-4e1a-8b7d-000000000002",
    name: "Default Staff ID Card",
    description: "Portrait CR80 card: crest, photo, name, role and staff ID, with a QR code on the back.",
    suited_for_label: "All staff",
    kind: "staff",
    status: "available",
    is_default: true,
    preview_path: "/template-previews/id-card-templates.html",
  },
];

const transport = USE_MOCK
  ? createMockCatalog({
      basePath: BASE_PATH,
      storageKey: "zsms.mockIdCardTemplates",
      seeds: SEEDS,
      // One default per kind (BACKEND-OWNED rule).
      defaultScope: (row) => str(row.kind),
      matchesQuery: (row, query) => !query.get("kind") || row.kind === query.get("kind"),
      writableFields: WRITABLE_FIELDS,
    })
  : realTransport;

const channel = { transport, isMock: USE_MOCK };

function entityResult(body: unknown): CrudResult<IdCardTemplate> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
}

function templatePath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

/**
 * One service per kind — the list is always fetched with ?kind=, so each
 * kind has its own cache entry (the Student/Staff tabs and the School
 * Type form's two dropdowns share them).
 */
function createIdCardTemplatesService(
  kind: IdCardKind,
): CrudService<IdCardTemplate, IdCardTemplateInput, IdCardTemplateInput> & {
  setDefault: (template: IdCardTemplate) => Promise<CrudResult<IdCardTemplate>>;
} {
  const update = (id: string, input: IdCardTemplateInput) =>
    sendCatalogRequest(channel, "PUT", templatePath(id), toWire(input), entityResult);

  return {
    queryKey: idCardTemplatesQueryKey(kind),
    list: () =>
      sendCatalogRequest(channel, "GET", `${BASE_PATH}?kind=${kind}&page=1&limit=200`, undefined, (body) => ({
        ok: true,
        data: readListItems(body).map(fromWire),
      })),
    create: (input) => sendCatalogRequest(channel, "POST", BASE_PATH, toWire({ ...input, kind }), entityResult),
    update,
    /** Archive — the catalog never hard-deletes. */
    remove: (id) => sendCatalogRequest(channel, "DELETE", templatePath(id), undefined, () => ({ ok: true, data: undefined })),
    /** Default for its kind: a full PUT with is_default: true (the backend clears that kind's previous default). */
    setDefault: (template) => update(template.id, { ...toInput(template), is_default: true }),
  };
}

/** Module-level singletons, one per kind. */
export const idCardTemplatesServices: Record<IdCardKind, ReturnType<typeof createIdCardTemplatesService>> = {
  student: createIdCardTemplatesService("student"),
  staff: createIdCardTemplatesService("staff"),
};
