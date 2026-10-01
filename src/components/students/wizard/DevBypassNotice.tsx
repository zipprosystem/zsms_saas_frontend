"use client";

import { useTranslations } from "next-intl";

/** Shown instead of (or alongside) an empty-state hint wherever a field depends on a real API that DEV_AUTH_BYPASS short-circuited — see isDevBypassUnavailable() in crudTypes.ts. Distinguishes "can't check locally" from "genuinely empty". */
export function DevBypassNotice() {
  const t = useTranslations();
  return <p className="text-xs text-text-muted">{t("students.wizard.devBypassNotice")}</p>;
}
