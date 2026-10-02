import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { extractErpError } from "@/lib/setup/erpError";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * Physical Space — Room Types (e.g. "Classroom", "Lab", "Office") — shared
 * across every building, not per-building. Muntajir shipped this. Same
 * conventions as Buildings/Award Bodies: { success, data }, Bearer auth via
 * apiFetch, ERP error shape (erpError.ts).
 *
 *   GET {API_BASE}/erp/room-types?page=&limit= -> { success: true, data: { items, total, page, limit, has_more } }
 *   POST/PUT {API_BASE}/erp/room-types[/:id] { name } -> { success: true, data: <entity> }
 *   DELETE {API_BASE}/erp/room-types/:id
 *
 * No current UI consumer — building ahead of the Building Rooms create
 * form this would feed (not built in this increment; only the room
 * dropdowns in Sections/Class Subjects are being swapped off the mock,
 * see buildingRoomsApi.ts). FIELDS UNCONFIRMED beyond `name` — reconcile
 * on deploy once a consumer exists. Error codes GUESSED by analogy to
 * every other simple catalog here.
 */
export type RoomType = {
  id: string;
  name: string;
};

export type RoomTypeInput = {
  name: string;
};

const BASE_PATH = "erp/room-types";

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): CrudResult<T> {
  const { code, message } = extractErpError(body);

  if (code === "DUPLICATE_NAME") {
    return { ok: false, kind: "validation", errors: [{ field: "name", message: message ?? undefined }] };
  }
  if (code === "ROOM_TYPE_IN_USE" || code === "ROOM_TYPE_NOT_FOUND") {
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

function extractRoomTypeList(body: unknown): RoomType[] {
  const items = (body as { data?: { items?: unknown } } | null)?.data?.items;
  return Array.isArray(items) ? (items as RoomType[]) : [];
}

async function list(): Promise<CrudResult<RoomType[]>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}?page=1&limit=200`, { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) return { ok: true, data: extractRoomTypeList(body) };
  return toResult(response, body);
}

async function create(data: RoomTypeInput): Promise<CrudResult<RoomType>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(BASE_PATH, { method: "POST", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const created = (body as { data?: RoomType } | null)?.data;
    if (created) return { ok: true, data: created };
    return { ok: false, kind: "server" };
  }
  return toResult(response, body);
}

async function update(id: string, data: RoomTypeInput): Promise<CrudResult<RoomType>> {
  if (DEV_AUTH_BYPASS) return { ok: false, kind: "devBypassUnavailable" };

  let response: Response;
  try {
    response = await apiFetch(`${BASE_PATH}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);
  if (response.ok) {
    const updated = (body as { data?: RoomType } | null)?.data;
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

export const roomTypesService: CrudService<RoomType, RoomTypeInput, RoomTypeInput> = {
  queryKey: ["setup", "roomTypes"],
  list,
  create,
  update,
  remove,
};
