"use client";

import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";

// Static/stub for now — real session switching isn't wired up yet.
export function SessionPill() {
  const t = useTranslations();

  return (
    <button
      type="button"
      className="hidden h-14 w-[165px] shrink-0 flex-col justify-center gap-1 rounded-[32px] border border-brand-tint bg-background px-4 py-2 text-left sm:flex"
    >
      <div className="flex items-center justify-between">
        <span className="text-[8px] uppercase tracking-wide text-text-muted">
          {t("header.session")}
        </span>
        <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[8px] font-medium text-accent">
          Dec 12 - Mar 24
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-text-primary">2025/2026</span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-text-secondary" />
      </div>
    </button>
  );
}
