import { throwIfTransient } from "@/lib/setup/crudTypes";
import { listAllStaff, staffFullName, staffListQueryKeyRoot } from "@/lib/hr/staffRecordsApi";
import { STAFF_LIST_STATUSES, type StaffStatus } from "@/lib/hr/hrTypes";

/**
 * Light staff NAME LOOKUP for screens outside HR — Departments' Head /
 * Senior line manager selects and the "who did this" line on status
 * histories. Built on the real GET erp/staff list (staffRecordsApi), not a
 * separate endpoint.
 *
 * IDENTITY (Option B, Muntajir 2026-10-23) — don't conflate the two ids:
 *   id      = staff.id  -> what every record references and submits
 *                          (department hod_staff_id / senior_manager_staff_id,
 *                          assignments, group members). Legacy department
 *                          values that held users.id are remapped by backend
 *                          migration 036.
 *   user_id = users.id  -> ONLY for resolving a status-event actor
 *                          (acted_by_user_id) to a name. Null for staff
 *                          without a login account.
 *
 * Every non-draft status is fetched, so a department whose head has since
 * left still shows their name; pickers offer only active staff. Under the
 * dev-auth bypass this resolves to [] (empty dropdowns, no names).
 * Transient failures throw (react-query retries); others resolve to [].
 */
export type StaffMember = {
  id: string;
  user_id: string | null;
  full_name: string;
  staff_no: string | null;
  status: StaffStatus;
};

/** Under the HR staff root, so any staff change refreshes the names too. */
export const staffQueryKey = [...staffListQueryKeyRoot, "lookup"] as const;

export async function listStaff(): Promise<StaffMember[]> {
  const result = throwIfTransient(await listAllStaff({}, [...STAFF_LIST_STATUSES]));
  if (!result.ok) return [];
  return result.data.map((staff) => ({
    id: staff.id,
    user_id: staff.user_id,
    full_name: staffFullName(staff) || staff.staff_no || "—",
    staff_no: staff.staff_no,
    status: staff.status,
  }));
}

/** users.id -> name, for status-history "by" lines. Staff without a login account simply aren't in it. */
export function actorNamesByUserId(staff: readonly StaffMember[]): Map<string, string> {
  return new Map(staff.filter((member) => member.user_id).map((member) => [member.user_id as string, member.full_name]));
}
