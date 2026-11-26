import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { isDevEmptyScenario } from "@/lib/dashboard/dashboardApi";
import { fetchStaffServerPage, staffListQueryKeyRoot, type StaffListPage } from "@/lib/hr/staffRecordsApi";
import { listParentsPage, parentsQueryKeyRoot, type ParentListPage } from "@/lib/parents/parentsApi";
import { departmentsService, type Department } from "@/lib/setup/academicStructure/departmentsApi";
import { throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import { getStudentsSummary, studentsQueryKey, type StudentsSummary } from "@/lib/students/studentsApi";

/**
 * KPI tile counts — read from the EXISTING module APIs (real per-tenant
 * data), not a dashboard endpoint:
 *
 *   students     GET erp/students/summary?academic_year_id=  -> by_status.active
 *                (the same number as the Students page's "All students" tile)
 *   staff        GET erp/staff?status=active&page=1&limit=1   -> total
 *   parents      GET erp/parents?status=active&page=1&limit=25 -> total   (school_admin only)
 *   departments  GET erp/departments?page=1&limit=200         -> items.length
 *                (no count/total in that client; shares the Departments screen's cache)
 *
 * waiting_list and houses have NO backend module yet: "notBuilt" on a real
 * tenant (tile shows "—" + "Coming soon"), sample numbers only under the
 * local DEV_AUTH_BYPASS.
 *
 * Every query key sits under its module's own key root, so the module's
 * existing invalidations (add a student, a staff member, a parent…)
 * refresh the dashboard tile too.
 */
export type KpiKey = "students" | "staff" | "departments" | "waiting_list" | "parents" | "houses";

export type KpiState =
  | { kind: "count"; value: number; sample: boolean }
  /** The user's role can't read this module (e.g. a teacher and Parents). */
  | { kind: "forbidden" }
  /** No backend for this count yet. */
  | { kind: "notBuilt" };

/** Thrown for a non-transient failure so the tile shows its error/retry state. */
class KpiLoadError extends Error {}

/** Local dev-bypass sample numbers (the Figma's) — never shown on a real tenant. */
const DEV_SAMPLE_COUNTS: Record<KpiKey, number> = {
  students: 2284,
  staff: 180,
  departments: 13,
  waiting_list: 125,
  parents: 180,
  houses: 5,
};

function sample(key: KpiKey): KpiState {
  return { kind: "count", value: isDevEmptyScenario() ? 0 : DEV_SAMPLE_COUNTS[key], sample: true };
}

/** CrudResult (as react-query stores it, after throwIfTransient) -> tile state. */
function toState<T>(key: KpiKey, result: CrudResult<T>, pick: (data: T) => number): KpiState {
  if (result.ok) {
    // Real data — except under the local bypass, where a client with its own dev mock (Parents) answered.
    if (DEV_AUTH_BYPASS) return { kind: "count", value: isDevEmptyScenario() ? 0 : pick(result.data), sample: true };
    return { kind: "count", value: pick(result.data), sample: false };
  }
  if (result.kind === "forbidden") return { kind: "forbidden" };
  // Local dev bypass: the real client refuses to send the dev token — show sample numbers instead.
  if (result.kind === "devBypassUnavailable") return sample(key);
  throw new KpiLoadError(result.kind);
}

/**
 * One react-query definition per tile. queryFn stores the module client's
 * CrudResult exactly as that module's own screen does (throwIfTransient),
 * and `select` turns it into the tile state — so a key shared with a
 * module screen (Departments) holds one shape for both.
 */
export type KpiQuery = {
  key: KpiKey;
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  select: (data: unknown) => KpiState;
  enabled: boolean;
};

const notBuilt = (key: KpiKey): Pick<KpiQuery, "queryFn" | "select"> => ({
  queryFn: async () => null,
  select: () => (DEV_AUTH_BYPASS ? sample(key) : { kind: "notBuilt" }),
});

/** `yearId` scopes Students only (staff/parents/departments aren't per-year). */
export function kpiQueries(yearId: string | null, yearReady: boolean): KpiQuery[] {
  return [
    {
      key: "students",
      queryKey: [...studentsQueryKey(yearId ?? ""), "dashboard-active-count"],
      enabled: yearReady,
      // getStudentsSummary answers zeros WITHOUT a request when no year is selected — correct on a tenant
      // (no year ⇒ no students), but locally it would hide the dev-bypass sample, so short-circuit first.
      queryFn: async () =>
        DEV_AUTH_BYPASS
          ? ({ ok: false, kind: "devBypassUnavailable" } as const)
          : getStudentsSummary(yearId ?? "", {}).then(throwIfTransient),
      select: (data) => toState("students", data as CrudResult<StudentsSummary>, (s) => s.byStatus.active ?? 0),
    },
    {
      key: "staff",
      queryKey: [...staffListQueryKeyRoot, "dashboard-active-count"],
      enabled: true,
      queryFn: () => fetchStaffServerPage({}, ["active"], 1, 1).then(throwIfTransient),
      select: (data) => toState("staff", data as CrudResult<StaffListPage>, (page) => page.total),
    },
    {
      key: "departments",
      // Same key, queryFn and stored shape as the Departments screen (useCrudTable) — one shared cached list.
      queryKey: departmentsService.queryKey,
      enabled: true,
      queryFn: () => departmentsService.list().then(throwIfTransient),
      select: (data) => toState("departments", data as CrudResult<Department[]>, (items) => items.length),
    },
    { key: "waiting_list", queryKey: ["dashboard", "kpi", "waiting_list"], enabled: true, ...notBuilt("waiting_list") },
    {
      key: "parents",
      queryKey: [...parentsQueryKeyRoot, "dashboard-active-count"],
      enabled: true,
      queryFn: () => listParentsPage({ status: "active", page: 1, limit: 25 }).then(throwIfTransient),
      select: (data) => toState("parents", data as CrudResult<ParentListPage>, (page) => page.total),
    },
    { key: "houses", queryKey: ["dashboard", "kpi", "houses"], enabled: true, ...notBuilt("houses") },
  ];
}
