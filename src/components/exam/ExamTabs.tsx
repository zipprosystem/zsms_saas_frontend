"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { EXAM_TABS, examTabHref } from "@/components/exam/examTabsConfig";

/** Underlined text tabs (Figma: List / Results / Broad Sheet / …). Each tab is a route, so it survives reloads and deep links. */
export function ExamTabs() {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <nav aria-label={t("exam.tabs.label")} className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-border px-1">
      {EXAM_TABS.map((tab) => {
        const href = examTabHref(tab.slug);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
              active ? "border-accent font-medium text-accent" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
