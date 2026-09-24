"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import {
  deriveAcademicYearStatus,
  ACADEMIC_YEAR_STATUS_BADGE_STYLES,
} from "@/lib/setup/academicStructure/academicYearStatus";
import type { AcademicYear } from "@/lib/setup/academicStructure/academicYearsApi";

function formatDateRange(locale: string, startDate: string, endDate: string): string {
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  try {
    return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`;
  } catch {
    return "";
  }
}

export function SessionPill() {
  const t = useTranslations();
  const locale = useLocale();
  const { years, selectedYear, setSelectedYear, activeYear, isLoading, error } = useAcademicYear();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (year: AcademicYear) => {
    setSelectedYear(year);
    setIsOpen(false);
  };

  // No years yet (a brand-new school) — the pill becomes a prompt to go
  // create one, not a dead-end label. Loading and error/dev-bypass both
  // stay a plain, non-interactive pill: this is persistent global chrome
  // shown on every page, so a loud error banner here would be more
  // disruptive than useful — dev-bypass in particular is an expected local
  // state, not a real failure. A page-level concern is the right place for
  // louder error messaging, not the header.
  if (!isLoading && !error && years.length === 0) {
    return (
      <Link
        href="/admin/setup/academic-structure/academic-years"
        className="hidden h-14 w-[165px] shrink-0 flex-col justify-center gap-1 rounded-[32px] border border-brand-tint bg-background px-4 py-2 text-left transition-colors hover:bg-brand-tint/40 sm:flex"
      >
        <span className="text-[8px] uppercase tracking-wide text-text-muted">
          {t("header.session")}
        </span>
        <span className="text-sm font-medium text-accent">{t("header.sessionPicker.noYears")}</span>
      </Link>
    );
  }

  if (isLoading || error || !selectedYear) {
    return (
      <div className="hidden h-14 w-[165px] shrink-0 flex-col justify-center gap-1 rounded-[32px] border border-brand-tint bg-background px-4 py-2 sm:flex">
        <span className="text-[8px] uppercase tracking-wide text-text-muted">
          {t("header.session")}
        </span>
        <span className="text-sm text-text-muted">
          {isLoading ? t("header.sessionPicker.loading") : "—"}
        </span>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative hidden shrink-0 sm:block">
      <button
        type="button"
        aria-label={t("header.sessionPicker.openLabel")}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-14 w-[165px] flex-col justify-center gap-1 rounded-[32px] border border-brand-tint bg-background px-4 py-2 text-left transition-colors hover:bg-brand-tint/40"
      >
        <div className="flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-wide text-text-muted">
            {t("header.session")}
          </span>
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[8px] font-medium text-accent">
            {formatDateRange(locale, selectedYear.start_date, selectedYear.end_date)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-text-primary">{selectedYear.name}</span>
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-text-secondary transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("header.sessionPicker.menuTitle")}
          </p>
          <ul role="listbox" className="flex flex-col">
            {years.map((year) => {
              const isSelected = year.id === selectedYear.id;
              const isActive = activeYear?.id === year.id;
              return (
                <li key={year.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => handleSelect(year)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-brand-tint font-semibold text-accent"
                        : "text-text-primary hover:bg-background"
                    }`}
                  >
                    <span className="truncate">{year.name}</span>
                    {isActive ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACADEMIC_YEAR_STATUS_BADGE_STYLES[deriveAcademicYearStatus(year)]}`}
                      >
                        {t("setup.academicYears.status.active")}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
