import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import type { SettingsData, SettingsUpdate } from "./types";

/**
 * Muntajir's SaaS Settings API contract (GET/PATCH {API_BASE}/school/settings),
 * confirmed 2026-09-22. Bearer JWT via the existing authenticated api
 * client (apiFetch) — the JWT resolves school context, so `school_id` is
 * never part of any request here. Responses wrap in { success, data } —
 * no `message` field on success.
 */

export type SettingsResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "forbidden" }
  | { ok: false; kind: "validation"; errors: Array<{ field: string; message?: string }> }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "server" }
  // DEV-ONLY: the local dev-auth-bypass seeds a mock token that must never
  // reach the real API (see authBridge.ts). Returned instead of making any
  // network call at all when DEV_AUTH_BYPASS is active — this endpoint can
  // only be genuinely tested on a deployed tenant with a real login.
  | { ok: false; kind: "devBypassUnavailable" };

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function toResult<T>(response: Response, body: unknown): SettingsResult<T> {
  if (response.status === 403) {
    return { ok: false, kind: "forbidden" };
  }
  if (response.status === 422) {
    const rawErrors = (body as { data?: { errors?: unknown }; errors?: unknown } | null)?.data?.errors
      ?? (body as { errors?: unknown } | null)?.errors;
    return { ok: false, kind: "validation", errors: Array.isArray(rawErrors) ? rawErrors : [] };
  }
  // 401 isn't handled here: apiFetch already retries once via /auth/refresh
  // and force-logs-out + redirects to /login on failure. By the time a 401
  // could reach this layer, that redirect is already in flight.
  return { ok: false, kind: "server" };
}

export async function getSchoolSettings(): Promise<SettingsResult<SettingsData>> {
  if (DEV_AUTH_BYPASS) {
    return { ok: false, kind: "devBypassUnavailable" };
  }

  let response: Response;
  try {
    response = await apiFetch("school/settings", { method: "GET" });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);

  if (response.ok) {
    const data = (body as { data?: SettingsData } | null)?.data;
    if (data) return { ok: true, data };
    return { ok: false, kind: "server" };
  }

  return toResult(response, body);
}

export async function updateSchoolSettings(
  partial: SettingsUpdate,
): Promise<SettingsResult<SettingsData>> {
  if (DEV_AUTH_BYPASS) {
    return { ok: false, kind: "devBypassUnavailable" };
  }

  let response: Response;
  try {
    response = await apiFetch("school/settings", {
      method: "PATCH",
      body: JSON.stringify(partial),
    });
  } catch {
    return { ok: false, kind: "network" };
  }

  const body = await parseBody(response);

  if (response.ok) {
    const data = (body as { data?: SettingsData } | null)?.data;
    if (data) return { ok: true, data };
    return { ok: false, kind: "server" };
  }

  return toResult(response, body);
}
