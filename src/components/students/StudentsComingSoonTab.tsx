"use client";

import { useTranslations } from "next-intl";

/** Uniform placeholder body for the 6 non-"Student List" tabs — Admissions, Subject/Class Enrollment, Student Notes, Withdrawn, Graduate are all later increments. */
export function StudentsComingSoonTab({ titleKey }: { titleKey: string }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-16 text-center">
      <p className="text-sm font-semibold text-text-primary">{t(titleKey)}</p>
      <p className="text-sm text-text-muted">{t("students.tabComingSoon")}</p>
    </div>
  );
}
