"use client";

import { useTranslations } from "next-intl";
import type { StaffType } from "@/lib/hr/hrTypes";

const TABS: StaffType[] = ["teaching", "non_teaching"];

type StaffTypeTabsProps = {
  activeTab: StaffType;
  onChange: (tab: StaffType) => void;
};

/** Teaching / Non-Teaching pill tabs (Figma 3347:61729). The tab IS the staff_type param — separate from the Status filter. */
export function StaffTypeTabs({ activeTab, onChange }: StaffTypeTabsProps) {
  const t = useTranslations();

  return (
    <div className="flex gap-2 overflow-x-auto" role="tablist">
      {TABS.map((key) => {
        const isActive = key === activeTab;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "bg-accent text-white" : "text-text-secondary hover:bg-surface hover:text-text-primary"
            }`}
          >
            {t(`hr.staffs.tabs.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
