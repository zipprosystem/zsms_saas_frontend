"use client";

import { useTranslations } from "next-intl";

export type StudentsTabKey =
  | "list"
  | "admissions"
  | "subjectEnrollment"
  | "classEnrollment"
  | "notes"
  | "withdrawn"
  | "graduate";

const TAB_KEYS: StudentsTabKey[] = [
  "list",
  "admissions",
  "subjectEnrollment",
  "classEnrollment",
  "notes",
  "withdrawn",
  "graduate",
];

type StudentsTabsProps = {
  activeTab: StudentsTabKey;
  onChange: (tab: StudentsTabKey) => void;
};

/** Horizontal sub-nav under the Students banner. Scrolls on mobile rather than wrapping, so it never forces the page wider than the viewport. */
export function StudentsTabs({ activeTab, onChange }: StudentsTabsProps) {
  const t = useTranslations();

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {TAB_KEYS.map((key) => {
        const isActive = key === activeTab;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              isActive
                ? "border-accent text-accent"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(`students.tabs.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
