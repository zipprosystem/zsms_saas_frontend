/**
 * Overview dashboard — wire shapes for the widgets with no backend yet.
 * PROPOSED contracts: see dashboardApi.ts for the endpoint each widget will
 * call once its flag flips. (KPI counts come from module APIs: kpiCounts.ts.)
 */

export type AttendanceAudience = "students" | "staff";

/**
 * Today's attendance for one audience. `marked` = false means no register
 * has been taken yet today (shown as a prompt, not as 0% present).
 */
export type AttendanceToday = {
  date: string;
  marked: boolean;
  present: number;
  absent: number;
  late: number;
};

/** One month of the enrollment trend: `month` is "YYYY-MM". */
export type EnrollmentPoint = { month: string; count: number };

export type EnrollmentTrend = {
  points: EnrollmentPoint[];
  /** % change over the period, computed server-side; null when there's no baseline. */
  change_pct: number | null;
};

/**
 * Activity types the frontend knows how to phrase (EN/FR templates in
 * dashboard.activity.types.*). Anything else falls back to the server's
 * `title` text verbatim.
 */
export const ACTIVITY_TYPES = [
  "student_admitted",
  "grades_submitted",
  "attendance_marked",
  "parent_meeting_scheduled",
  "fee_reminder_sent",
  "assignment_extended",
  "notice_sent",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ActivityItem = {
  id: string;
  type: string;
  /** Values for the type's template, e.g. { name: "Ada Okafor" } or { class: "Y12A" }. */
  params: Record<string, string>;
  /** Server-rendered fallback for unknown types. */
  title: string | null;
  /** null = done by the system (a scheduled job, an import). */
  actor_name: string | null;
  occurred_at: string;
};
