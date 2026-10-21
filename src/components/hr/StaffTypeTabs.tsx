"use client";

import { useTranslations } from "next-intl";
import type { StaffType } from "@/lib/hr/hrTypes";

/** The list's three views: the two staff_type tabs, plus Drafts — its own view (status=draft), deliberately NOT a type tab. */
export type StaffListView = StaffType | "drafts";

const TYPE_TABS: StaffType[] = ["teaching", "non_teaching"];

type StaffTypeTabsProps = {
  activeView: StaffListView;
  onChange: (view: StaffListView) => void;
};

/**
 * Teaching / Non-Teaching pill tabs (Figma 3347:61729) — the tab IS the
 * staff_type param, separate from the Status filter. Drafts sits apart
 * (outlined, after a divider): unfinished records of either type, queried
 * by status=draft rather than by type.
 */
export function StaffTypeTabs({ activeView, onChange }: StaffTypeTabsProps) {
  const t = useTranslations();
  const pill = (isActive: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
      isActive ? "bg-accent text-white" : "text-text-secondary hover:bg-surface hover:text-text-primary"
    }`;

  return (
    <div className="flex items-center gap-2 overflow-x-auto" role="tablist">
      {TYPE_TABS.map((key) => (
        <button key={key} type="button" role="tab" aria-selected={activeView === key} onClick={() => onChange(key)} className={pill(activeView === key)}>
          {t(`hr.staffs.tabs.${key}`)}
        </button>
      ))}
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
      <button
        type="button"
        role="tab"
        aria-selected={activeView === "drafts"}
        onClick={() => onChange("drafts")}
        className={`${pill(activeView === "drafts")} ${activeView === "drafts" ? "" : "border border-dashed border-border"}`}
      >
        {t("hr.staffs.tabs.drafts")}
      </button>
    </div>
  );
}
