"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { KPI_TILES } from "@/components/dashboard/dashboardLinks";
import { SampleDataTag, SkeletonBlock } from "@/components/dashboard/WidgetCard";
import { useKpiCounts, type KpiTileQuery } from "@/components/dashboard/useDashboardData";

function TileValue({ query, emptyHint }: { query: KpiTileQuery; emptyHint: string }) {
  const t = useTranslations("dashboard.kpi");
  const format = useFormatter();
  const state = query.state;

  if (query.isPending) return <SkeletonBlock className="mt-1 h-7 w-16" />;
  if (query.isError || !state) {
    return (
      <>
        <span className="mt-0.5 text-xl font-semibold text-text-muted sm:text-2xl">—</span>
        <span className="mt-1 text-xs text-text-muted">{t("unavailable")}</span>
      </>
    );
  }
  if (state.kind === "forbidden" || state.kind === "notBuilt") {
    return (
      <>
        <span className="mt-0.5 text-xl font-semibold text-text-muted sm:text-2xl">—</span>
        <span className="mt-1 text-xs text-text-muted">{t(state.kind === "forbidden" ? "noAccess" : "comingSoon")}</span>
      </>
    );
  }
  return (
    <>
      <span className="mt-0.5 text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">{format.number(state.value)}</span>
      {state.value === 0 ? <span className="mt-1 text-xs font-medium text-accent group-hover:underline">{emptyHint}</span> : null}
    </>
  );
}

/**
 * Six navigational KPI tiles: 2 columns on phones, 3 from `sm` up (Figma's
 * 3×2). Students / Staff / Departments / Parents are the tenant's REAL
 * counts; Waiting List / House Color have no backend yet.
 */
export function KpiTiles() {
  const t = useTranslations("dashboard.kpi");
  const counts = useKpiCounts();
  const anySample = KPI_TILES.some((tile) => {
    const state = counts[tile.key].state;
    return state?.kind === "count" && state.sample;
  });
  const failed = KPI_TILES.filter((tile) => counts[tile.key].isError);

  return (
    <section aria-label={t("title")} className="flex min-w-0 flex-col gap-2">
      {anySample ? (
        <div className="flex justify-end">
          <SampleDataTag />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {KPI_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.key}
              href={tile.href}
              className="group flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:p-5"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${tile.chip}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="mt-4 truncate text-sm text-text-secondary">{t(`labels.${tile.labelKey}`)}</span>
              <TileValue query={counts[tile.key]} emptyHint={t(`empty.${tile.emptyKey}`)} />
            </Link>
          );
        })}
      </div>
      {failed.length > 0 ? (
        <button
          type="button"
          onClick={() => failed.forEach((tile) => counts[tile.key].refetch())}
          className="self-start rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-brand-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {t("retry")}
        </button>
      ) : null}
    </section>
  );
}
