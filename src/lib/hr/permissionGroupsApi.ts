import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";
import {
  asRecord,
  readEntity,
  readListItems,
  realTransport,
  sendHrRequest,
  str,
  stringIds,
  type HrChannel,
} from "@/lib/hr/hrHttp";
import { hrMockTransport } from "@/lib/hr/mock/hrMockBackend";
import { normalizePermissions } from "@/lib/hr/permissionCatalog";
import { staffListQueryKeyRoot } from "@/lib/hr/staffRecordsApi";
import type { PermissionGroup, PermissionGroupInput } from "@/lib/hr/hrTypes";

/**
 * Permission Groups — MOCK until the backend ships it; flip USE_MOCK to
 * swap (nothing else changes, see hrHttp.ts).
 *
 *   GET    erp/permission-groups        -> { items, total, page, limit, has_more }
 *   POST   erp/permission-groups        { name, permissions[], member_staff_ids[] } -> entity
 *   PUT    erp/permission-groups/:id    same body -> entity (members REPLACED)
 *   DELETE erp/permission-groups/:id    ends its memberships
 *
 * A group is name + coarse "module.action" permissions + members — there
 * is no separate role entity, and a one-member group is fine. The group
 * OWNS membership; staff records read it back as permission_group_ids.
 * Nothing enforces these permissions yet (capture only).
 */
const USE_MOCK = true;

const channel: HrChannel = { transport: USE_MOCK ? hrMockTransport : realTransport, isMock: USE_MOCK };

export const permissionGroupsQueryKey = ["hr", "permissionGroups"] as const;

const BASE_PATH = "erp/permission-groups";

export function fromWire(value: unknown): PermissionGroup {
  const r = asRecord(value) ?? {};
  return {
    id: str(r.id),
    name: str(r.name),
    permissions: normalizePermissions(stringIds(r.permissions)),
    member_staff_ids: stringIds(r.member_staff_ids),
  };
}

export function toWire(input: PermissionGroupInput): PermissionGroupInput {
  return {
    name: input.name,
    permissions: normalizePermissions(input.permissions),
    member_staff_ids: Array.from(new Set(input.member_staff_ids)),
  };
}

function entityResult(body: unknown): CrudResult<PermissionGroup> {
  const entity = readEntity(body);
  return entity ? { ok: true, data: fromWire(entity) } : { ok: false, kind: "server" };
}

function groupPath(id: string): string {
  return `${BASE_PATH}/${encodeURIComponent(id)}`;
}

/** Fetched once at limit=200 and handled client-side — a school has a handful of groups. */
async function list(): Promise<CrudResult<PermissionGroup[]>> {
  return sendHrRequest(channel, "GET", `${BASE_PATH}?page=1&limit=200`, undefined, (body) => ({
    ok: true,
    data: readListItems(body).map(fromWire),
  }));
}

async function create(input: PermissionGroupInput): Promise<CrudResult<PermissionGroup>> {
  return sendHrRequest(channel, "POST", BASE_PATH, toWire(input), entityResult);
}

async function update(id: string, input: PermissionGroupInput): Promise<CrudResult<PermissionGroup>> {
  return sendHrRequest(channel, "PUT", groupPath(id), toWire(input), entityResult);
}

async function remove(id: string): Promise<CrudResult<void>> {
  return sendHrRequest(channel, "DELETE", groupPath(id), undefined, () => ({ ok: true, data: undefined }));
}

export const permissionGroupsService: CrudService<PermissionGroup, PermissionGroupInput, PermissionGroupInput> = {
  queryKey: permissionGroupsQueryKey,
  // Membership shows on staff records (permission_group_ids), so any group
  // change refreshes the staff lists too.
  relatedQueryKeys: [staffListQueryKeyRoot],
  list,
  create,
  update,
  remove,
};
