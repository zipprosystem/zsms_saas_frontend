import type { ReportVariant } from "@/lib/exam/report/reportPayload";
import type { ProgressionPoint } from "@/lib/exam/reportProgression/reportProgressionApi";
import type { Attendance, CommentGradeRole, CommentRole, RemarkKey, Remarks } from "@/lib/exam/reportProgression/studentEntryApi";
import { REMARK_KEYS } from "@/lib/exam/reportProgression/studentEntryApi";
import { resultTemplatesService } from "@/lib/setup/assessmentConfiguration/resultTemplatesApi";
import { SEED_TERM_CLOSURES, SEED_TERM_DATES } from "@/lib/exam/mock/examMockSeeds";
import { armRole, isGradeClass, readStore, writeStore } from "@/lib/exam/mock/examMockStore";
import { getMockActingAs, MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import { getSchoolSettings } from "@/lib/settings/settingsApi";
import { DEFAULT_ATTENDANCE_SESSIONS_PER_DAY, type AttendanceSessionsPerDay } from "@/lib/settings/generalBehaviourExtras";
import type { WorkingDay } from "@/lib/onboarding/types";

/**
 * MOCK report-only fields (Report Progression Stage 2): what each result
 * template prints besides the marks — the comments and the attendance box
 * — and their stores. Contract: studentEntryApi.ts. BACKEND-OWNED rules:
 *
 *   - TEMPLATE-DRIVEN: the template declares the fields it prints per
 *     variant (progress = the CA / A point, full = the Exam / B point); the
 *     report prints exactly those. The declarations below mirror the
 *     built-in template files in public/template-previews (FLAGGED: the
 *     real backend reads them from the template's manifest).
 *   - ENTRY (PO rule, General only): the heads' comments — class teacher
 *     and head teacher / principal — are entered at BOTH points (a
 *     separate instance per point) whenever the template has them at
 *     either point. British stays point-specific: Progress = boarding
 *     house, Full = form tutor. The rest (attendance) follow the point's
 *     own declaration.
 *   - term_remark: one row per student × term × point with a column per
 *     role (class_teacher — also the British Form Tutor, who IS the arm's
 *     class teacher — head_teacher, principal, boarding_house).
 *   - Attendance: one present-count per student × term (FLAGGED: per
 *     term, shown on both points' reports). Total = open days (term dates
 *     on the school's Settings › General Behaviour Working Days − holidays
 *     − breaks) × Settings › General Behaviour
 *     attendance mapping (1:1 = 1, 1:2 = 2 sessions a day); absent =
 *     total − present. Both derived on read.
 *   - Who writes (DEC-009): the class-teacher / form-tutor comment and
 *     attendance — the DIRECTLY-assigned class teacher of the arm, or an
 *     admin (a sectional head can't). Head teacher / principal comment —
 *     the exam.report_progression.head_comment credential (mock: admin).
 *     Boarding-house comment — FLAGGED: boarding staff aren't modelled
 *     (mock: admin).
 */

/** One declared report-only field. */
export type FieldDecl = { kind: "attendance" } | { kind: "comment"; key: RemarkKey; role: CommentRole };

const ATT: FieldDecl = { kind: "attendance" };
const CLASS_TEACHER: FieldDecl = { kind: "comment", key: "class_teacher", role: "class_teacher" };
const HEAD_TEACHER: FieldDecl = { kind: "comment", key: "head_teacher", role: "head_teacher" };
/** Nigerian terminal prints the head teacher's remark as the Principal's. */
const HEAD_AS_PRINCIPAL: FieldDecl = { kind: "comment", key: "head_teacher", role: "principal" };
const FORM_TUTOR: FieldDecl = { kind: "comment", key: "class_teacher", role: "form_tutor" };
const BOARDING: FieldDecl = { kind: "comment", key: "boarding_house", role: "boarding_house" };

/**
 * What each built-in template prints, per variant, in print order. British
 * principal = signature only: its principal comment column exists but no
 * built-in template opts in, so it is never shown.
 */
const TEMPLATE_REPORT_FIELDS: Record<string, Record<ReportVariant, FieldDecl[]>> = {
  lela_blossom: { progress: [ATT, CLASS_TEACHER, HEAD_TEACHER], full: [ATT, CLASS_TEACHER, HEAD_TEACHER] },
  nigerian_terminal: { progress: [ATT, CLASS_TEACHER], full: [ATT, CLASS_TEACHER, HEAD_AS_PRINCIPAL] },
  modern_generic: { progress: [ATT, CLASS_TEACHER], full: [ATT, CLASS_TEACHER, HEAD_TEACHER] },
  nigerian_primary: { progress: [ATT, CLASS_TEACHER, HEAD_TEACHER], full: [ATT, CLASS_TEACHER, HEAD_TEACHER] },
  white_pearl: { progress: [CLASS_TEACHER, HEAD_TEACHER], full: [CLASS_TEACHER, HEAD_TEACHER] },
  british_progress: { progress: [BOARDING], full: [FORM_TUTOR] },
};

/** A template without declarations (a school's custom one): the class-teacher + head-teacher comments (General) / the form tutor's (British). */
function fallbackFields(classId: string): FieldDecl[] {
  return isGradeClass(classId) ? [FORM_TUTOR] : [CLASS_TEACHER, HEAD_TEACHER];
}

/**
 * The result template each mock class reports in (template_key in the
 * Result Templates catalog). Stands in for "the School Type's selected
 * template" — the Exam mock's classes aren't linked to School Types.
 */
const CLASS_TEMPLATE_KEY: Record<string, string> = {
  "cls-jss1": "lela_blossom",
  "cls-ss1": "nigerian_terminal",
  "cls-y9": "british_progress",
  "cls-y11": "british_progress",
};

/** The class's result template: its mapped one, else the catalog default (archived never). */
export async function classTemplate(classId: string): Promise<{ id: string; template_key: string | null } | null> {
  const result = await resultTemplatesService.list();
  const templates = result.ok ? result.data.filter((template) => template.status !== "archived") : [];
  const key = CLASS_TEMPLATE_KEY[classId];
  const chosen = templates.find((template) => template.template_key === key) ?? templates.find((template) => template.is_default) ?? null;
  return chosen ? { id: chosen.id, template_key: chosen.template_key } : null;
}

export function variantOf(point: ProgressionPoint): ReportVariant {
  return point === "ca" ? "progress" : "full";
}

/** Heads' comments: the class teacher / form tutor and the head teacher / principal. */
function isHeadComment(decl: FieldDecl): boolean {
  return decl.kind === "comment" && (decl.key === "class_teacher" || decl.key === "head_teacher");
}

const ORDER: Record<string, number> = { attendance: 0, class_teacher: 1, head_teacher: 2, principal: 3, boarding_house: 4 };
const orderOf = (decl: FieldDecl) => ORDER[decl.kind === "attendance" ? "attendance" : decl.key];

/**
 * The report-only fields entered at this point, in print order: the
 * point's own declaration, plus (General only) any heads' comment the
 * template declares only at the other point (PO rule — heads on both
 * points; label taken from where it's declared). British comments stay
 * point-specific. The report still prints per the template.
 */
export async function reportFieldDecls(classId: string, point: ProgressionPoint): Promise<FieldDecl[]> {
  const template = await classTemplate(classId);
  const declared = template?.template_key ? TEMPLATE_REPORT_FIELDS[template.template_key] : undefined;
  if (!declared) return fallbackFields(classId);
  const own = declared[variantOf(point)];
  if (isGradeClass(classId)) return own;
  const other = declared[variantOf(point === "ca" ? "exam" : "ca")];
  const has = (decl: FieldDecl) => own.some((item) => item.kind === "comment" && decl.kind === "comment" && item.key === decl.key);
  return [...own, ...other.filter((decl) => isHeadComment(decl) && !has(decl))].sort((a, b) => orderOf(a) - orderOf(b));
}

/** Whether the caller may write this field for a student of the arm (see the header). */
export function canWriteField(armId: string, decl: FieldDecl): boolean {
  const role = armRole(armId);
  if (role === "admin") return true;
  if (decl.kind === "attendance" || decl.key === "class_teacher") return role === "class_teacher";
  return false;
}

/**
 * British comment grades (§7.26 Grade table): the Form Tutor / Boarding
 * House grade for a point lives in the student's term trait_assessment
 * (examResultsMock's traits store) under `<role>:<point>` — one per
 * comment per point, a British Progress Grade by id.
 */
export function commentGradeKey(role: CommentGradeRole, point: ProgressionPoint): string {
  return `${role}:${point}`;
}

// ---------------------------------------------------------------------------
// term_remark (per student × term × point)
// ---------------------------------------------------------------------------

const REMARKS_KEY = "zsms.mockExam.termRemarks.v1";
/** The Results traits panel's store — its remarks were per term; they seed the Exam point's term_remark until one is saved. */
const LEGACY_TRAITS_KEY = "zsms.mockExam.traits.v1";

export const REMARK_MAX = 500;

type StoredRemarks = Remarks & { updated_at: string; by: string | null };

const EMPTY_REMARKS: Remarks = { class_teacher: "", head_teacher: "", principal: "", boarding_house: "" };

function remarksKey(termId: string, point: ProgressionPoint, studentId: string): string {
  return `${termId}|${point}|${studentId}`;
}

export function readRemarks(termId: string, point: ProgressionPoint, studentId: string): Remarks & { updated_at: string | null } {
  const stored = readStore<StoredRemarks>(REMARKS_KEY)[remarksKey(termId, point, studentId)];
  if (stored) return { ...EMPTY_REMARKS, ...stored };
  if (point === "exam") {
    const legacy = readStore<{ class_teacher_remark?: string; head_teacher_remark?: string; updated_at?: string }>(LEGACY_TRAITS_KEY)[`${termId}|${studentId}`];
    if (legacy) return { ...EMPTY_REMARKS, class_teacher: legacy.class_teacher_remark ?? "", head_teacher: legacy.head_teacher_remark ?? "", updated_at: legacy.updated_at ?? null };
  }
  return { ...EMPTY_REMARKS, updated_at: null };
}

/** Merges the given columns into the student's term_remark for the point. */
export function writeRemarks(termId: string, point: ProgressionPoint, studentId: string, patch: Partial<Remarks>): void {
  const store = { ...readStore<StoredRemarks>(REMARKS_KEY) };
  const current = readRemarks(termId, point, studentId);
  const next: StoredRemarks = { ...EMPTY_REMARKS, updated_at: new Date().toISOString(), by: actorId() };
  for (const key of REMARK_KEYS) next[key] = (patch[key] ?? current[key]).trim();
  store[remarksKey(termId, point, studentId)] = next;
  writeStore(REMARKS_KEY, store);
}

function actorId(): string | null {
  const id = getMockActingAs();
  return id === MOCK_ADMIN ? null : id;
}

// ---------------------------------------------------------------------------
// Attendance (per student × term)
// ---------------------------------------------------------------------------

const ATTENDANCE_KEY = "zsms.mockExam.attendance.v1";

type StoredAttendance = { present: number | null; updated_at: string; by: string | null };

function isoDays(from: string, to: string): string[] {
  const days: string[] = [];
  const end = new Date(`${to}T00:00:00Z`);
  for (const day = new Date(`${from}T00:00:00Z`); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

/** The school week the attendance total is counted on. */
export type SchoolWeek = { workingDays: WorkingDay[]; sessions: AttendanceSessionsPerDay };

/** Mon–Fri: used only when Settings can't be read (or Working Days is empty). */
const DEFAULT_WORKING_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri"];
/** getUTCDay() index → Settings day code. */
const DAY_CODES: WorkingDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Settings › General Behaviour Working Days + attendance mapping (via its API — the dev mock under the dev bypass); unreadable → defaults. */
export async function schoolWeek(): Promise<SchoolWeek> {
  const result = await getSchoolSettings().catch(() => null);
  const general = result?.ok ? result.data.general_behaviour : null;
  return {
    workingDays: general && general.working_days.length > 0 ? general.working_days : DEFAULT_WORKING_DAYS,
    sessions: general ? general.attendance_sessions_per_day : DEFAULT_ATTENDANCE_SESSIONS_PER_DAY,
  };
}

/** Open days = the term's days that fall on a working day, minus its holidays / breaks; total sessions = open days × sessions per day. */
export function termCalendar(termId: string, { workingDays, sessions }: SchoolWeek): { open_days: number; sessions_per_day: AttendanceSessionsPerDay; total_sessions: number } {
  const dates = SEED_TERM_DATES[termId];
  if (!dates) return { open_days: 0, sessions_per_day: sessions, total_sessions: 0 };
  const closed = new Set((SEED_TERM_CLOSURES[termId] ?? []).flatMap((closure) => isoDays(closure.from, closure.to)));
  const working = new Set(workingDays);
  const open = isoDays(dates[0], dates[1]).filter((day) => working.has(DAY_CODES[new Date(`${day}T00:00:00Z`).getUTCDay()]) && !closed.has(day)).length;
  return { open_days: open, sessions_per_day: sessions, total_sessions: open * sessions };
}

/** The stored present count (no totals) — enough for completeness / activity. */
export function readAttendance(termId: string, studentId: string): { present: number | null; updated_at: string | null } {
  const stored = readStore<StoredAttendance>(ATTENDANCE_KEY)[`${termId}|${studentId}`];
  return { present: typeof stored?.present === "number" ? stored.present : null, updated_at: stored?.updated_at ?? null };
}

/** The full attendance box: present + the derived totals at the school's current mapping. */
export async function attendanceOf(termId: string, studentId: string): Promise<Attendance & { updated_at: string | null }> {
  const calendar = termCalendar(termId, await schoolWeek());
  const { present, updated_at } = readAttendance(termId, studentId);
  return { ...calendar, present, absent: present === null ? null : Math.max(0, calendar.total_sessions - present), updated_at };
}

export function writeAttendance(termId: string, studentId: string, present: number | null): void {
  const store = { ...readStore<StoredAttendance>(ATTENDANCE_KEY) };
  store[`${termId}|${studentId}`] = { present, updated_at: new Date().toISOString(), by: actorId() };
  writeStore(ATTENDANCE_KEY, store);
}
