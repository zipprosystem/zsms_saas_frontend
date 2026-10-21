"use client";

import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";
import { PeopleIcon } from "@/components/icons/sidebar/PeopleIcon";
import { Profile2UserIcon } from "@/components/icons/sidebar/Profile2UserIcon";
import { BookSavedIcon } from "@/components/icons/sidebar/BookSavedIcon";
import { UserPlusIcon } from "@/components/icons/students/UserPlusIcon";
import { UserMinusIcon } from "@/components/icons/students/UserMinusIcon";
import { SunIcon } from "@/components/icons/students/SunIcon";
import { MoonIcon } from "@/components/icons/students/MoonIcon";
import type { StudentsSummary } from "@/lib/students/studentsApi";

type StudentsStatCardsProps = {
  /** null while loading or on error — tiles show "—" rather than a misleading 0. */
  summary: StudentsSummary | null;
};

/**
 * Rendered straight from GET erp/students/summary — counted server-side
 * over the selected year + the list's current class/arm/mode/search
 * filters. No client-side tallying: the list is paged, so the browser
 * never holds the whole year to count from. All = by_status.active (the
 * enrolled population the Student List tab shows — not the all-status total),
 * Withdrawn = withdrawn + suspended + expelled from by_status (same
 * grouping as the Withdrawn tab), Graduated = by_status.graduated.
 */
export function StudentsStatCards({ summary }: StudentsStatCardsProps) {
  const t = useTranslations();
  const byStatus = summary?.byStatus ?? {};
  const withdrawnCount = (byStatus.withdrawn ?? 0) + (byStatus.suspended ?? 0) + (byStatus.expelled ?? 0);

  const cards: Array<{ key: string; label: string; value: number | undefined; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
    { key: "all", label: t("students.stats.all"), value: summary ? (byStatus.active ?? 0) : undefined, icon: PeopleIcon },
    { key: "newlyEnrolled", label: t("students.stats.newlyEnrolled"), value: summary?.newlyEnrolled30d, icon: UserPlusIcon },
    { key: "day", label: t("students.stats.day"), value: summary?.byMode.day, icon: SunIcon },
    { key: "boarding", label: t("students.stats.boarding"), value: summary?.byMode.boarding, icon: MoonIcon },
    { key: "male", label: t("students.stats.male"), value: summary?.byGender.male, icon: Profile2UserIcon },
    { key: "female", label: t("students.stats.female"), value: summary?.byGender.female, icon: Profile2UserIcon },
    { key: "withdrawn", label: t("students.stats.withdrawn"), value: summary ? withdrawnCount : undefined, icon: UserMinusIcon },
    { key: "graduated", label: t("students.stats.graduated"), value: summary ? (byStatus.graduated ?? 0) : undefined, icon: BookSavedIcon },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
      {cards.map((card) => (
        <div key={card.key} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-4 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-2 text-accent">
            <card.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-semibold text-text-primary">{card.value ?? "—"}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-text-muted">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
