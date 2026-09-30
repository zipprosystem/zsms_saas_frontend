import { apiFetch } from "@/lib/api/client";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { TransientQueryError } from "@/lib/queryClient";

/**
 * Read-only staff lookup for dropdowns that point at a staff member
 * (currently: Departments' HOD / Senior Manager). Finalized contract per
 * Muntajir:
 *
 *   GET {API_BASE}/erp/staff
 *     -> { success: true, data: ... } rows of { id, full_name, role, role_key }
 *     `id` is users.id — that's what Departments' hod_staff_id /
 *     senior_manager_staff_id store.
 *     FLAGGED, UNCONFIRMED: whether data is paginated ({ items, ... }) like
 *     the other ERP lists or a bare array — extractStaffList() accepts
 *     both, and limit=200 is sent in case it IS paginated (same "fetch
 *     once at the max, filter client-side" approach as Award Bodies).
 *
 * Returns a plain StaffMember[] (not a CrudResult) — consumers only ever
 * need the list for a dropdown. Transient failures (network/5xx) throw a
 * TransientQueryError so react-query's retry+backoff applies; deterministic
 * ones (403, dev-bypass) resolve to an empty list, leaving the dropdown
 * empty rather than erroring a whole form.
 */
export type StaffMember = {
  id: string;
  full_name: string;
  role: string;
  role_key: string;
};

/** Shared by every consumer's useQuery call so they hit the same cache entry. */
export const staffQueryKey = ["staff", "all"] as const;

function extractStaffList(body: unknown): StaffMember[] {
  const data = (body as { data?: unknown } | null)?.data;
  const items = Array.isArray(data) ? data : (data as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as StaffMember[]) : [];
}

export async function listStaff(): Promise<StaffMember[]> {
  if (DEV_AUTH_BYPASS) return [];

  let response: Response;
  try {
    response = await apiFetch("erp/staff?page=1&limit=200", { method: "GET" });
  } catch {
    throw new TransientQueryError();
  }

  if (response.ok) {
    const body = await response.json().catch(() => null);
    return extractStaffList(body);
  }
  if (response.status >= 500) throw new TransientQueryError();
  return [];
}
