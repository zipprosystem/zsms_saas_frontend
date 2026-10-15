"use client";

import { useTranslations } from "next-intl";

/**
 * A wizard field kept visible for layout/discoverability but not yet
 * backed by the API — same boxed look as the Fee field's "pending" note.
 * Used for fields the Student Core API rejects (Academic House, Boarding
 * House, Extra-curricular, Agent): nothing here is ever sent.
 */
export function ComingSoonField({ label }: { label: string }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <p className="rounded-md border border-border bg-background px-4 py-3 text-sm text-text-muted">{t("common.comingSoon")}</p>
    </div>
  );
}
