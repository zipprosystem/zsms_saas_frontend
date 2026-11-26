import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { asArray, asRecord, readData, str, strOrNull } from "@/lib/hr/hrHttp";
import { realTransport, type Transport } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type { ActivityItem, AttendanceAudience, AttendanceToday, EnrollmentTrend } from "@/lib/dashboard/dashboardTypes";

/**
 * Overview dashboard — the three widgets with NO backend yet. (The KPI
 * tiles read the existing module APIs instead: see kpiCounts.ts.)
 *
 * Each widget has its own flag in DASHBOARD_LIVE: false = not built yet,
 * true = the real endpoint below. Flip one widget at a time as the backend
 * ships. While a flag is false:
 *   - on a real tenant the widget shows its EMPTY state (never sample data);
 *   - under DEV_AUTH_BYPASS (local only) the dev mock answers with sample
 *     data, tagged "Sample data" on the card.
 *
 * PROPOSED endpoints (school_admin and any staff role; read-only):
 *   GET erp/dashboard/attendance-today?audience=students|staff&date=YYYY-MM-DD
 *       -> { date, marked, present, absent, late }
 *   GET erp/dashboard/enrollment-trend?months=6&academic_year_id=
 *       -> { points: [{ month: "YYYY-MM", count }], change_pct }
 *   GET erp/dashboard/recent-activity?limit=6
 *       -> { items: [{ id, type, params, title, actor_name, occurred_at }] }
 *
 * Under DEV_AUTH_BYPASS the mock always answers (the bypass token must
 * never reach a real endpoint), whatever the flags say.
 */
export const DASHBOARD_LIVE = {
  attendanceToday: false,
  enrollmentTrend: false,
  recentActivity: false,
} as const;

export type DashboardWidget = keyof typeof DASHBOARD_LIVE;

/**
 * True only for local dev-bypass sample data — the card shows a "Sample
 * data" tag. A real tenant never sees sample data (unbuilt widgets are
 * empty there), so it never sees the tag.
 */
export function showsSampleData(): boolean {
  return DEV_AUTH_BYPASS;
}

/** localStorage switch for the local dev-bypass preview: "empty" previews a brand-new tenant. */
export const DASHBOARD_MOCK_SCENARIO_KEY = "zsms.devMockDashboard.scenario";

/** True only under DEV_AUTH_BYPASS with the "empty" scenario chosen (see dashboardDevMock.ts). */
export function isDevEmptyScenario(): boolean {
  if (!DEV_AUTH_BYPASS || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DASHBOARD_MOCK_SCENARIO_KEY) === "empty";
  } catch {
    return false;
  }
}

const lazyMockTransport: Transport = async (method, path) => {
  const { dashboardDevMockTransport } = await import("@/lib/dashboard/mock/dashboardDevMock");
  return dashboardDevMockTransport(method, path);
};

function transportFor(widget: DashboardWidget): Transport {
  return DEV_AUTH_BYPASS || !DASHBOARD_LIVE[widget] ? lazyMockTransport : realTransport;
}

const BASE = "erp/dashboard";

export const dashboardQueryKeyRoot = ["dashboard"] as const;
export const attendanceTodayQueryKey = (audience: AttendanceAudience, date: string) =>
  [...dashboardQueryKeyRoot, "attendance", audience, date] as const;
export const enrollmentTrendQueryKey = (yearId: string | null) => [...dashboardQueryKeyRoot, "trend", yearId ?? ""] as const;
export const recentActivityQueryKey = [...dashboardQueryKeyRoot, "activity"] as const;

/** How many items the Recent Activity card shows. */
export const RECENT_ACTIVITY_LIMIT = 6;
export const ENROLLMENT_TREND_MONTHS = 6;

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function get<T>(widget: DashboardWidget, path: string, parse: (data: unknown) => T | null): Promise<CrudResult<T>> {
  let status: number;
  let body: unknown;
  try {
    ({ status, body } = await transportFor(widget)("GET", path));
  } catch {
    return { ok: false, kind: "network" };
  }
  if (status === 401 || status === 403) return { ok: false, kind: "forbidden" };
  if (status < 200 || status >= 300) return { ok: false, kind: "server", status };
  const parsed = parse(readData(body));
  return parsed ? { ok: true, data: parsed } : { ok: false, kind: "server", status };
}

function yearQuery(yearId: string | null): string {
  return yearId ? `academic_year_id=${encodeURIComponent(yearId)}` : "";
}

export function getAttendanceToday(audience: AttendanceAudience, date: string): Promise<CrudResult<AttendanceToday>> {
  const query = `audience=${audience}&date=${encodeURIComponent(date)}`;
  return get("attendanceToday", `${BASE}/attendance-today?${query}`, (data) => {
    const r = asRecord(data);
    if (!r) return null;
    const present = num(r.present);
    const absent = num(r.absent);
    const late = num(r.late);
    return {
      date: str(r.date) || date,
      // An absent `marked` falls back to "any register entries exist".
      marked: typeof r.marked === "boolean" ? r.marked : present + absent + late > 0,
      present,
      absent,
      late,
    };
  });
}

export function getEnrollmentTrend(yearId: string | null): Promise<CrudResult<EnrollmentTrend>> {
  const query = [`months=${ENROLLMENT_TREND_MONTHS}`, yearQuery(yearId)].filter(Boolean).join("&");
  return get("enrollmentTrend", `${BASE}/enrollment-trend?${query}`, (data) => {
    const r = asRecord(data);
    if (!r) return null;
    const points = asArray(r.points)
      .map(asRecord)
      .filter((p): p is Record<string, unknown> => !!p && /^\d{4}-\d{2}$/.test(str(p.month)))
      .map((p) => ({ month: str(p.month), count: num(p.count) }));
    const change = r.change_pct;
    return { points, change_pct: typeof change === "number" && Number.isFinite(change) ? change : null };
  });
}

export function getRecentActivity(): Promise<CrudResult<ActivityItem[]>> {
  return get("recentActivity", `${BASE}/recent-activity?limit=${RECENT_ACTIVITY_LIMIT}`, (data) => {
    const r = asRecord(data);
    const rows = Array.isArray(data) ? data : asArray(r?.items);
    return rows
      .map(asRecord)
      .filter((row): row is Record<string, unknown> => !!row && !!str(row.id) && !!str(row.occurred_at))
      .map((row) => {
        const rawParams = asRecord(row.params) ?? {};
        const params: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawParams)) {
          if (typeof value === "string" || typeof value === "number") params[key] = String(value);
        }
        return {
          id: str(row.id),
          type: str(row.type),
          params,
          title: strOrNull(row.title),
          actor_name: strOrNull(row.actor_name),
          occurred_at: str(row.occurred_at),
        };
      });
  });
}

/** Today as YYYY-MM-DD in the browser's local time (the school's day, not UTC's). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
