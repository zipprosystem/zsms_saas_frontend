/** The Exam area's tabs (Figma: Academics › Exam). Only Results is built (Stage 1b); the rest render a placeholder. */
export const EXAM_TABS = [
  { slug: "list", labelKey: "exam.tabs.list" },
  { slug: "results", labelKey: "exam.tabs.results" },
  { slug: "broad-sheet", labelKey: "exam.tabs.broadSheet" },
  { slug: "reports", labelKey: "exam.tabs.reports" },
  { slug: "report-progression", labelKey: "exam.tabs.reportProgression" },
  { slug: "cutoff", labelKey: "exam.tabs.cutoff" },
] as const;

export function examTabHref(slug: string): string {
  return `/admin/academics/exam/${slug}`;
}

/** The two subject-wise entry screens inside Results: scores (component_based) and the British Academic Report (grade_based). */
export const MANAGE_EXAM_RESULT_HREF = "/admin/academics/exam/results";
export const ACADEMIC_REPORT_HREF = "/admin/academics/exam/results/academic-report";
/** British Grade Book entry — a separate /100 per subject per point (§7.19). */
export const GRADE_BOOK_HREF = "/admin/academics/exam/results/grade-book";
/** Stage 2a — the computed results (All Results / Grades / GPA as ?tab=). */
export const VIEW_RESULTS_HREF = "/admin/academics/exam/results/view";
