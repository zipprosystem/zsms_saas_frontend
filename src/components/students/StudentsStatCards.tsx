"use client";

import { useTranslations } from "next-intl";
import type { ComponentType, SVGProps } from "react";
import { PeopleIcon } from "@/components/icons/sidebar/PeopleIcon";
import { UserPlusIcon } from "@/components/icons/students/UserPlusIcon";
import { UserMinusIcon } from "@/components/icons/students/UserMinusIcon";
import { SunIcon } from "@/components/icons/students/SunIcon";
import { MoonIcon } from "@/components/icons/students/MoonIcon";
import { isNewlyEnrolled, isWithdrawnGroup } from "@/lib/students/studentsTableHelpers";
import type { Student } from "@/lib/students/studentTypes";

type StudentsStatCardsProps = {
  students: Student[];
};

/**
 * Counts are derived client-side from the full (unfiltered) loaded list.
 * All/Newly Enrolled/Day/Boarding are scoped to status:"active" — they
 * describe the currently-enrolled population the Student List tab shows,
 * which is itself active-only (see StudentsScreen.tsx). Withdrawn mirrors
 * the Withdrawn tab's own combined definition (withdrawn + suspended +
 * expelled) for consistency, rather than literal status:"withdrawn" alone.
 * Flagged as my interpretation — the brief named the 5 cards but not their
 * exact scoping; easy to adjust once the product owner reviews.
 */
export function StudentsStatCards({ students }: StudentsStatCardsProps) {
  const t = useTranslations();

  const activeStudents = students.filter((student) => student.status === "active");
  const allCount = activeStudents.length;
  const newlyEnrolledCount = activeStudents.filter((student) => isNewlyEnrolled(student)).length;
  const dayCount = activeStudents.filter((student) => student.mode === "day").length;
  const boardingCount = activeStudents.filter((student) => student.mode === "boarding").length;
  const withdrawnCount = students.filter(isWithdrawnGroup).length;

  const cards: Array<{ key: string; label: string; value: number; icon: ComponentType<SVGProps<SVGSVGElement>> }> = [
    { key: "all", label: t("students.stats.all"), value: allCount, icon: PeopleIcon },
    { key: "newlyEnrolled", label: t("students.stats.newlyEnrolled"), value: newlyEnrolledCount, icon: UserPlusIcon },
    { key: "day", label: t("students.stats.day"), value: dayCount, icon: SunIcon },
    { key: "boarding", label: t("students.stats.boarding"), value: boardingCount, icon: MoonIcon },
    { key: "withdrawn", label: t("students.stats.withdrawn"), value: withdrawnCount, icon: UserMinusIcon },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div key={card.key} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-4 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-2 text-accent">
            <card.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-semibold text-text-primary">{card.value}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-text-muted">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
