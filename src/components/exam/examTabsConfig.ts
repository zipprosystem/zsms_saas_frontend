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
