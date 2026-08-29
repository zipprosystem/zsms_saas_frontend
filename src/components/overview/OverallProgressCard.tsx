import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/Button";
import { PieChartIcon } from "@/components/icons/PieChartIcon";
import {
  setupCategories,
  getTotalItems,
  getConfiguredItems,
  getOverallPercent,
  getCategoryProgress,
} from "@/lib/setup/setupConfig";
import { categoryColorClasses } from "./categoryColors";

export async function OverallProgressCard() {
  const t = await getTranslations();

  const totalItems = getTotalItems(setupCategories);
  const configuredItems = getConfiguredItems(setupCategories);
  const overallPercent = getOverallPercent(setupCategories);

  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("setup.overallProgress.title")}
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {t("setup.overallProgress.itemsConfigured", {
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
            {overallPercent}%
          </span>
        </div>
      </div>

      <div className="mt-5 flex h-2.5 min-w-0 gap-0.5 overflow-hidden rounded-full bg-subtle-track">
        {setupCategories.map((category) => {
          const { categoryComplete } = getCategoryProgress(category);
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
