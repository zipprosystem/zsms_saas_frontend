"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ACADEMIC_REPORT_HREF, MANAGE_EXAM_RESULT_HREF, VIEW_RESULTS_HREF } from "@/components/exam/examTabsConfig";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, NAV_PERMISSIONS, readUserPermissions, type NavPermission } from "@/lib/auth/navPermissions";

const SUB_TABS: Array<{ href: string; labelKey: string; permission?: NavPermission }> = [
  { href: MANAGE_EXAM_RESULT_HREF, labelKey: "exam.resultsTabs.manageExamResult" },
  { href: ACADEMIC_REPORT_HREF, labelKey: "exam.resultsTabs.academicReport" },
  { href: VIEW_RESULTS_HREF, labelKey: "exam.resultsTabs.viewResults", permission: NAV_PERMISSIONS.examViewResults },
];

/** Pill sub-tabs inside Results (Figma's Results pills) — score entry, British grade entry, and the computed results. Each is its own route. */
export function ResultsSubTabs() {
  const t = useTranslations();
  const pathname = usePathname();
  const { user } = useAuth();
  const granted = readUserPermissions(user);

  return (
    <nav aria-label={t("exam.resultsTabs.label")} className="flex items-center gap-2 overflow-x-auto">
      {SUB_TABS.filter((tab) => canSeeNavEntry(tab.permission, granted)).map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-accent text-white" : "text-text-secondary hover:bg-surface hover:text-text-primary"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
