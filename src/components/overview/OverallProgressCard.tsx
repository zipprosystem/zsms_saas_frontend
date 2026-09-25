"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { PieChartIcon } from "@/components/icons/PieChartIcon";
import {
  setupCategories,
  getTotalItems,
  getConfiguredItems,
  getOverallPercent,
  getCategoryProgress,
  type SetupItem,
} from "@/lib/setup/setupConfig";
import { isSetupItemComplete, type SetupProgressState } from "@/lib/setup/setupProgress";
import { categoryColorClasses } from "./categoryColors";

// Was an async Server Component reading only static `item.done` flags —
// now needs the live existence-check results (setupProgress.ts), which can
// only run client-side (they go through apiFetch/the in-memory access
// token), so this becomes a client component receiving that result as a
// prop from SetupProgressBoard instead of fetching translations itself.
export function OverallProgressCard({ progress }: { progress: SetupProgressState }) {
  const t = useTranslations();
  const isComplete = (item: SetupItem) => isSetupItemComplete(item, progress);

  const totalItems = getTotalItems(setupCategories);
  const configuredItems = getConfiguredItems(setupCategories, isComplete);
  const overallPercent = getOverallPercent(setupCategories, isComplete);
  const isLoading = progress.status === "loading";

  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("setup.overallProgress.title")}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {isLoading
              ? t("setup.overallProgress.checking")
              : t("setup.overallProgress.itemsConfigured", {
                  configured: configuredItems,
                  total: totalItems,
                })}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Button
            type="button"
            disabled
            title={t("setup.overallProgress.goToOverview")}
            icon={<PieChartIcon className="h-4 w-4" />}
            className="h-10 px-4 text-sm"
          >
            {t("setup.overallProgress.goToOverview")}
          </Button>
          <span className="text-xl font-bold text-text-primary">
            {isLoading ? "—" : `${overallPercent}%`}
          </span>
        </div>
      </div>

      <div className="mt-5 flex h-2.5 min-w-0 gap-0.5 overflow-hidden rounded-full bg-subtle-track">
        {setupCategories.map((category) => {
          const { categoryComplete } = getCategoryProgress(category, isComplete);
          const colorClasses = categoryColorClasses[category.colorToken];
          return (
            <div
              key={category.key}
              style={{ flexGrow: category.weightPercent }}
              className={`h-full rounded-full ${
                categoryComplete ? colorClasses.bg : "bg-transparent"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 sm:gap-x-5">
        {setupCategories.map((category) => {
          const colorClasses = categoryColorClasses[category.colorToken];
          return (
            <div key={category.key} className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${colorClasses.dot}`}
              />
              <span className="text-[11px] text-text-muted">
                {t(category.name)}{" "}
                <span className={`font-semibold ${colorClasses.text}`}>
                  {category.weightPercent}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
