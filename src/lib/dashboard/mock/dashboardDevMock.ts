import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { isDevEmptyScenario } from "@/lib/dashboard/dashboardApi";
import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { HttpMethod, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import type { ActivityItem, AttendanceToday, EnrollmentTrend } from "@/lib/dashboard/dashboardTypes";

/**
 * Stand-in for the dashboard widgets with no backend yet (attendance,
 * enrollment trend, recent activity). On a REAL tenant it always answers
 * "empty" — those widgets show their empty states, never sample data.
 * Under the local DEV_AUTH_BYPASS there are two scenarios, picked by
 * localStorage["zsms.devMockDashboard.scenario"]:
 *   "seeded" (default) — the Figma's numbers;
 *   "empty"            — a brand-new tenant (nothing marked, no activity).
 * Switch from the browser console:
 *   localStorage.setItem("zsms.devMockDashboard.scenario", "empty"); location.reload()
 */
function scenario(): "seeded" | "empty" {
  if (!DEV_AUTH_BYPASS) return "empty";
  return isDevEmptyScenario() ? "empty" : "seeded";
}

const SEEDED_ATTENDANCE = {
  students: { present: 1180, absent: 45, late: 20 },
  staff: { present: 164, absent: 9, late: 7 },
} as const;

/** New enrolments per month for the last six months (oldest first), Figma's curve. */
const SEEDED_TREND_COUNTS = [250, 680, 310, 880, 650, 1260];

function lastMonths(count: number, now = new Date()): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function seededActivity(): ActivityItem[] {
  return [
    { id: "a1", type: "student_admitted", params: { name: "Ada Okafor" }, title: null, actor_name: "Admin", occurred_at: minutesAgo(5) },
    { id: "a2", type: "grades_submitted", params: { subject: "Mathematics", class: "Year 11" }, title: null, actor_name: "John Doe", occurred_at: minutesAgo(15) },
    { id: "a3", type: "attendance_marked", params: { class: "Y12A" }, title: null, actor_name: "Jane Smith", occurred_at: minutesAgo(32) },
    { id: "a4", type: "parent_meeting_scheduled", params: {}, title: null, actor_name: "Admin", occurred_at: minutesAgo(65) },
    { id: "a5", type: "fee_reminder_sent", params: {}, title: null, actor_name: null, occurred_at: minutesAgo(120) },
    { id: "a6", type: "assignment_extended", params: { subject: "English" }, title: null, actor_name: "Robert Johnson", occurred_at: minutesAgo(180) },
  ];
}

function ok(data: unknown): WireResponse {
  return { status: 200, body: { success: true, data } };
}

export async function dashboardDevMockTransport(method: HttpMethod, path: string): Promise<WireResponse> {
  await mockDelay(250);
  if (method !== "GET") return { status: 405, body: { success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Read-only" } } };

  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  const empty = scenario() === "empty";

  switch (route) {
    case "erp/dashboard/attendance-today": {
      const audience = params.get("audience") === "staff" ? "staff" : "students";
      const date = params.get("date") ?? "";
      const row: AttendanceToday = empty
        ? { date, marked: false, present: 0, absent: 0, late: 0 }
        : { date, marked: true, ...SEEDED_ATTENDANCE[audience] };
      return ok(row);
    }

    case "erp/dashboard/enrollment-trend": {
      const months = lastMonths(Number(params.get("months")) || 6);
      const trend: EnrollmentTrend = empty
        ? { points: months.map((month) => ({ month, count: 0 })), change_pct: null }
        : { points: months.map((month, i) => ({ month, count: SEEDED_TREND_COUNTS[i % SEEDED_TREND_COUNTS.length] })), change_pct: 5.5 };
      return ok(trend);
    }

    case "erp/dashboard/recent-activity": {
      const limit = Number(params.get("limit")) || 6;
      return ok({ items: empty ? [] : seededActivity().slice(0, limit) });
    }

    default:
      return { status: 404, body: { success: false, error: { code: "NOT_FOUND", message: "Unknown dashboard route" } } };
  }
}
