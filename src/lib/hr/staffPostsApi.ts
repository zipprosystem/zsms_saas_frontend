import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import { asRecord, hrChannel, readEntity, readListItems, sendHrRequest, str, type HrChannel } from "@/lib/hr/hrHttp";
import type { StaffPost, StaffPostInput } from "@/lib/hr/hrTypes";

/**
 * Staff Posts (designations master) — REAL /api/v1/erp (HR_USE_MOCK in
 * hrHttp.ts switches every HR service back to the mock).
 *
 *   GET    erp/staff-posts         -> { items, total, page, limit, has_more }
 *   POST   erp/staff-posts         { name, is_active } -> entity
 *   PUT    erp/staff-posts/:id     { name, is_active } -> entity
 *   DELETE erp/staff-posts/:id     409 STAFF_POST_IN_USE while held
 *
 * Label only — a post grants nothing; access comes from Permission Groups.
 * staff_count is backend-calculated.
 */
const channel: HrChannel = hrChannel;

export const staffPostsQueryKey = ["hr", "staffPosts"] as const;

const BASE_PATH = "erp/staff-posts";

export function fromWire(value: unknown): StaffPost {
  const r = asRecord(value) ?? {};
  return {
    id: str(r.id),
    name: str(r.name),
    is_active: r.is_active !== false,
    staff_count: typeof r.staff_count === "number" ? r.staff_count : null,
  };
}

export function toWire(input: StaffPostInput): StaffPostInput {
  return { name: input.name, is_active: input.is_active };
}

function entityResult(body: unknown): CrudResult<StaffPost> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
}

function postPath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

/** Fetched once at limit=200 and handled client-side — a school has a handful of posts. */
async function list(): Promise<CrudResult<StaffPost[]>> {
  return sendHrRequest(channel, "GET", `${BASE_PATH}?page=1&limit=200`, undefined, (body) => ({
    ok: true,
    data: readListItems(body).map(fromWire),
  }));
}

async function create(input: StaffPostInput): Promise<CrudResult<StaffPost>> {
  return sendHrRequest(channel, "POST", BASE_PATH, toWire(input), entityResult);
}

async function update(id: string, input: StaffPostInput): Promise<CrudResult<StaffPost>> {
  return sendHrRequest(channel, "PUT", postPath(id), toWire(input), entityResult);
}

async function remove(id: string): Promise<CrudResult<void>> {
  return sendHrRequest(channel, "DELETE", postPath(id), undefined, () => ({ ok: true, data: undefined }));
}

export const staffPostsService: CrudService<StaffPost, StaffPostInput, StaffPostInput> = {
  queryKey: staffPostsQueryKey,
  list,
  create,
  update,
  remove,
};
