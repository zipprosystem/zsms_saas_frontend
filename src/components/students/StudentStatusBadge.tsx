"use client";

import { useTranslations } from "next-intl";
import type { StudentStatus } from "@/lib/students/studentTypes";

// Semantic tokens only (dark-mode safe). The CSS-variable colors don't
// support Tailwind's /opacity modifier, so tinted variants use the
// existing *-tint tokens, and the rest an outline.
const STATUS_CLASSES: Partial<Record<StudentStatus, string>> = {
  active: "bg-category-green-tint text-success",
  graduated: "bg-category-green-tint text-success",
  draft: "bg-category-amber-tint text-warning",
  suspended: "bg-category-amber-tint text-warning",
  expelled: "border border-error text-error",
  withdrawn: "border border-border text-text-secondary",
};

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const t = useTranslations();

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        STATUS_CLASSES[status] ?? "border border-border text-text-secondary"
      }`}
    >
      {t(`students.status.${status}`)}
    </span>
  );
}
