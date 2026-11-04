import type { ExamScheduleEntry } from "@/lib/exam/examTypes";

/**
 * The exam timetable (wizard Step 2): when each subject's paper is sat —
 * class-wise, one row per subject the class takes. Rules shared by the
 * wizard and the mock (the server re-checks them).
 */

/** Duration (Step 1), in minutes. */
export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 600;
/** A new exam's Duration when Settings has no usable "Default exam duration". */
export const DEFAULT_DURATION_MINUTES = 60;

/** A new exam's Duration: Settings' default exam duration when it's a valid duration, else 60. */
export function defaultDurationMinutes(fromSettings: number | null | undefined): number {
  return typeof fromSettings === "number" && Number.isInteger(fromSettings) && fromSettings >= DURATION_MIN_MINUTES && fromSettings <= DURATION_MAX_MINUTES
    ? fromSettings
    : DEFAULT_DURATION_MINUTES;
}

/** Auto Generate's default daily window. */
export const DEFAULT_WINDOW_START = "09:00";
export const DEFAULT_WINDOW_END = "15:00";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value: string): boolean {
  return TIME.test(value);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The school days (Monday–Friday) from start to end, inclusive. */
export function schoolDaysBetween(start: string, end: string): string[] {
  if (!isValidDate(start) || !isValidDate(end) || end < start) return [];
  const days: string[] = [];
  for (const day = new Date(`${start}T00:00:00Z`); day.toISOString().slice(0, 10) <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

export type AutoGenerateInput = {
  subjectIds: string[];
  durationMinutes: number;
  startDate: string;
  endDate: string;
  windowStart: string;
  windowEnd: string;
};

export type AutoGenerateResult =
  | { ok: true; entries: ExamScheduleEntry[] }
  | { ok: false; reason: "noDuration" | "dates" | "noSchoolDays" | "window" | "windowTooShort" | "tooMany"; capacity?: number };

/**
 * Auto Generate: subjects in order, each a Duration-long slot placed back
 * to back (no gaps) inside the daily window, rolling to the next school
 * day when the window is full. Nothing is assigned unless every subject fits.
 */
export function autoGenerate(input: AutoGenerateInput): AutoGenerateResult {
  const { subjectIds, durationMinutes: duration, startDate, endDate, windowStart, windowEnd } = input;
  if (!Number.isFinite(duration) || duration <= 0) return { ok: false, reason: "noDuration" };
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate < startDate) return { ok: false, reason: "dates" };
  const days = schoolDaysBetween(startDate, endDate);
  if (days.length === 0) return { ok: false, reason: "noSchoolDays" };
  if (!isValidTime(windowStart) || !isValidTime(windowEnd) || toMinutes(windowEnd) <= toMinutes(windowStart)) return { ok: false, reason: "window" };
  const perDay = Math.floor((toMinutes(windowEnd) - toMinutes(windowStart)) / duration);
  if (perDay === 0) return { ok: false, reason: "windowTooShort" };
  const capacity = perDay * days.length;
  if (subjectIds.length > capacity) return { ok: false, reason: "tooMany", capacity };
  const entries = subjectIds.map((subjectId, index) => {
    const start = toMinutes(windowStart) + (index % perDay) * duration;
    return { subject_id: subjectId, date: days[Math.floor(index / perDay)], start_time: fromMinutes(start), end_time: fromMinutes(start + duration) };
  });
  return { ok: true, entries };
}

export type ScheduleRowError = "incomplete" | "dateInvalid" | "dateOutOfRange" | "timeInvalid" | "endBeforeStart";

/**
 * Per-subject checks (keyed by subject id; empty = valid). A row is either
 * blank (not scheduled) or complete: date + start + end. A date outside the
 * exam's start..end (when set) is an error, so changing the Step 1 dates
 * flags the rows that no longer fit.
 */
export function scheduleErrors(entries: ExamScheduleEntry[], start: string | null, end: string | null): Record<string, ScheduleRowError> {
  const errors: Record<string, ScheduleRowError> = {};
  for (const entry of entries) {
    const filled = [entry.date, entry.start_time, entry.end_time].filter(Boolean).length;
    if (filled === 0) continue;
    if (filled < 3 || !entry.date || !entry.start_time || !entry.end_time) errors[entry.subject_id] = "incomplete";
    else if (!isValidDate(entry.date)) errors[entry.subject_id] = "dateInvalid";
    else if ((start && entry.date < start) || (end && entry.date > end)) errors[entry.subject_id] = "dateOutOfRange";
    else if (!isValidTime(entry.start_time) || !isValidTime(entry.end_time)) errors[entry.subject_id] = "timeInvalid";
    else if (toMinutes(entry.end_time) <= toMinutes(entry.start_time)) errors[entry.subject_id] = "endBeforeStart";
  }
  return errors;
}

/** Only the scheduled (complete) rows, blanks -> null, ordered by date then time. */
export function scheduledOnly(entries: ExamScheduleEntry[]): ExamScheduleEntry[] {
  return entries
    .filter((entry) => entry.date || entry.start_time || entry.end_time)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
}
