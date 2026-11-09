import { NAV_PERMISSIONS, type NavPermission } from "@/lib/auth/navPermissions";

/** The Exam area's tabs (Figma: Academics › Exam). List, Results, Broad Sheet and Report Progression are built; the rest render a placeholder. */
export const EXAM_TABS: ReadonlyArray<{ slug: string; labelKey: string; permission?: NavPermission }> = [
  { slug: "list", labelKey: "exam.tabs.list", permission: NAV_PERMISSIONS.examList },
  { slug: "results", labelKey: "exam.tabs.results" },
  { slug: "broad-sheet", labelKey: "exam.tabs.broadSheet" },
  { slug: "reports", labelKey: "exam.tabs.reports" },
  { slug: "report-progression", labelKey: "exam.tabs.reportProgression", permission: NAV_PERMISSIONS.examReportProgression },
  { slug: "cutoff", labelKey: "exam.tabs.cutoff" },
];

/** Exam › List — the per-class exam list (and, next, Create / Edit Exam). */
export const EXAM_LIST_HREF = "/admin/academics/exam/list";

export function examTabHref(slug: string): string {
  return `/admin/academics/exam/${slug}`;
}

/** Report Progression: class cards; a class's students; (Stage 2) a student's entry; Send Result to Parent. */
export const REPORT_PROGRESSION_HREF = "/admin/academics/exam/report-progression";
export function reportProgressionClassHref(classId: string): string {
  return `${REPORT_PROGRESSION_HREF}/${encodeURIComponent(classId)}`;
}

/** The two subject-wise entry screens inside Results: scores (component_based) and the British Academic Report (grade_based). */
export const MANAGE_EXAM_RESULT_HREF = "/admin/academics/exam/results";
export const ACADEMIC_REPORT_HREF = "/admin/academics/exam/results/academic-report";
/** British Grade Book entry — a separate /100 per subject per point (§7.19). */
export const GRADE_BOOK_HREF = "/admin/academics/exam/results/grade-book";
/** Stage 2a — the computed results (All Results / Grades / GPA as ?tab=). */
export const VIEW_RESULTS_HREF = "/admin/academics/exam/results/view";
