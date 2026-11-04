import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { allStaffQueryKey, listAllStaff, staffFullName } from "@/lib/hr/staffRecordsApi";
import { seedStaffRoster } from "@/lib/exam/mock/examMockSeeds";

/** A staff member the School Type's Head Teacher / Principal pickers can select. */
export type SignatoryOption = { id: string; name: string };

/**
 * The staff the School Type report signatories are picked from: HR's
 * active staff (the real HR list). Under the dev bypass HR is unreachable,
 * so the pickers list the exam mock's staff roster instead — the same
 * people the mock reports resolve names and signatures for. FLAGGED:
 * goes away with the dev bypass.
 */
export async function listSignatoryOptions(): Promise<CrudResult<SignatoryOption[]>> {
  if (DEV_AUTH_BYPASS) {
    return { ok: true, data: seedStaffRoster().map(({ id, name }) => ({ id, name })) };
  }
  const result = await listAllStaff({}, ["active"]);
  if (!result.ok) return result;
  const options = result.data.map((staff) => ({ id: staff.id, name: staffFullName(staff) }));
  return { ok: true, data: options.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Shares the HR picker cache key root (active staff), suffixed so the mock list never mixes with HR's. */
export const signatoryOptionsQueryKey = [...allStaffQueryKey, "active", "signatories"] as const;
