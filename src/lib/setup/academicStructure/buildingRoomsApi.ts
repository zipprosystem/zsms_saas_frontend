import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Physical Space — Building Rooms. Muntajir shipped this; REPLACES the old
 * facilitiesApi.ts mock (`classroomsService`) — Class-arms/Sections'
 * optional classroom_id field (ClassArmsScreen.tsx) and Class Subjects'
 * room_id field (ClassSubjectsScreen.tsx) both now read real rooms from
 * here instead.
 *
 *   GET {API_BASE}/erp/building-rooms?page=&limit=
 *     -> { success: true, data: { items: [...], total, page, limit, has_more } }
 *        Paginated, FLAT (not nested under a building) per the confirmed
 *        path — fetched once with limit=200 and filtered/resolved
 *        client-side by building_id from there (same "fetch once, work
 *        client-side" choice as every other simple catalog here).
 *        FLAGGED, UNCONFIRMED: whether a `building_id` query filter is
 *        also supported server-side — not relied on; the client-side
 *        filter works either way.
 *   POST/PUT {API_BASE}/erp/building-rooms[/:id] { building_id, room_type_id?,
 *     name, capacity } -> { success: true, data: <entity> }.
 *     CONFIRMED business rules (for any future create/edit form — none
 *     exists yet, only list() has a consumer so far): room names are
 *     unique PER BUILDING, not globally; capacity defaults to 10 if
 *     omitted; 0 is a valid capacity; negative is rejected.
 *   DELETE {API_BASE}/erp/building-rooms/:id
 *
 * FIELDS beyond building_id/name/capacity are INFERRED (room_type_id) —
 * reconcile on deploy. Error codes GUESSED by analogy to every other
 * catalog here (DUPLICATE_NAME scoped how the backend actually scopes it,
 * BUILDING_ROOM_NOT_FOUND, BUILDING_ROOM_IN_USE on delete).
 */
export type BuildingRoom = {
  id: string;
  building_id: string;
  room_type_id: string | null;
  name: string;
  capacity: number;
};

export type BuildingRoomInput = {
  building_id: string;
  room_type_id: string | null;
  name: string;
  capacity: number;
};

/** Shared by every consumer's useQuery call so they hit the same cache entry — buildingRoomsService isn't year-scoped, one flat key for the whole fetched-once-then-filtered-client-side list. */
export const buildingRoomsQueryKey = ["setup", "buildingRooms"] as const;

const BASE_PATH = "erp/building-rooms";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "BUILDING_ROOM_IN_USE" || code === "BUILDING_ROOM_NOT_FOUND" || code === "BUILDING_NOT_FOUND") {
    return { ok: false, kind: "conflict", message: message ?? undefined };
  }
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return { ok: false, kind: "forbidden", message: message ?? undefined };
  }
  if (code === "VALIDATION_ERROR") {
    return { ok: false, kind: "server", message: message ?? undefined };
  }

  if (response.status === 403) return { ok: false, kind: "forbidden" };
  if (response.status === 409) return { ok: false, kind: "conflict", message: message ?? undefined };
  if (response.status === 422) return { ok: false, kind: "validation", errors: [] };
  return { ok: false, kind: "server", message: message ?? undefined };
}

function extractBuildingRoomList(body: unknown): BuildingRoom[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as BuildingRoom[]) : [];
}

async function list(): Promise<CrudResult<BuildingRoom[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) return { ok: true, data: extractBuildingRoomList(body) };
  return toResult(response, body);
}

async function create(data: BuildingRoomInput): Promise<CrudResult<BuildingRoom>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: BuildingRoom } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: BuildingRoomInput): Promise<CrudResult<BuildingRoom>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const updated = (body as { data?: BuildingRoom } | null)?.data;
    if (updated) return { ok: true, data: updated };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function remove(id: string): Promise<CrudResult<void>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    return { ok: false, kind: "network" };
  }

  if (response.ok) return { ok: true, data: undefined };
  const body = await parseBody(response);
  return toResult(response, body);
}

export const buildingRoomsService: CrudService<BuildingRoom, BuildingRoomInput, BuildingRoomInput> = {
  queryKey: [...buildingRoomsQueryKey],
  list,
  create,
  update,
  remove,
};
