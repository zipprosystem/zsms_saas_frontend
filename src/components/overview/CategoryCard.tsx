"use client";

import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { GearIcon } from "@/components/icons/setup/GearIcon";
import { AcademicCapIcon } from "@/components/icons/setup/AcademicCapIcon";
import { ClipboardChartIcon } from "@/components/icons/setup/ClipboardChartIcon";
import { LocationPinIcon } from "@/components/icons/setup/LocationPinIcon";
import { ClockIcon } from "@/components/icons/setup/ClockIcon";
import {
  getCategoryPercent,
  getCategoryProgress,
  type SetupCategory,
  type SetupCategoryIconKey,
} from "@/lib/setup/setupConfig";
import { categoryColorClasses } from "./categoryColors";
import { SetupItemRow } from "./SetupItemRow";

const categoryIcons: Record<SetupCategoryIconKey, typeof GearIcon> = {
  gear: GearIcon,
  academicCap: AcademicCapIcon,
  clipboardChart: ClipboardChartIcon,
  locationPin: LocationPinIcon,
  clock: ClockIcon,
};

type CategoryCardProps = {
  category: SetupCategory;
  isExpanded: boolean;
  onToggle: () => void;
};

export function CategoryCard({
  category,
  isExpanded,
  onToggle,
}: CategoryCardProps) {
  const t = useTranslations();

  const Icon = categoryIcons[category.iconKey];
  const colorClasses = categoryColorClasses[category.colorToken];
  const { configuredCount, totalCount, categoryComplete } =
    getCategoryProgress(category);
  const percent = getCategoryPercent(category);
  const categoryName = t(category.name);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={t("setup.categoryCard.toggleSection", {
          category: categoryName,
        })}
        className="flex w-full items-center gap-4 px-6 py-4 text-left"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${colorClasses.bg}`}
        >
          <Icon className="h-[18px] w-[18px] text-white" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">
              {categoryName}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${colorClasses.tint} ${colorClasses.text}`}
            >
              {t("setup.categoryCard.percentOfSetup", {
                percent: category.weightPercent,
              })}
            </span>
            {category.key === "schoolSettings" && categoryComplete && (
              <span className="flex items-center gap-1 rounded-full bg-category-green-tint px-2 py-0.5 text-[11px] font-semibold text-status-done-text">
                <CheckIcon className="h-3 w-3" />
                {t("setup.categoryCard.complete")}
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs text-text-muted">
            {t("setup.categoryCard.itemsConfigured", {
              configured: configuredCount,
              total: totalCount,
            })}
          </span>
        </span>

        <span className="hidden shrink-0 items-center sm:flex">
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-subtle-track">
            <span
              className={`block h-full rounded-full ${colorClasses.bg}`}
              style={{ width: `${percent}%` }}
            />
          </span>
        </span>

        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        aria-hidden={!isExpanded}
        className={`grid transition-all duration-200 ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border">
            {category.items.map((item, index) => (
              <SetupItemRow
                key={item.key}
                slug={item.slug}
                name={t(item.name)}
                description={item.description ? t(item.description) : undefined}
                done={item.done}
                doneLabel={t("setup.categoryCard.done")}
                isLast={index === category.items.length - 1}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
