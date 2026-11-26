"use client";

import { useFormatter, useTranslations } from "next-intl";
import { StudentIcon, TrendDownIcon, TrendUpIcon } from "@/components/dashboard/DashboardIcons";
import { ADD_STUDENT_HREF } from "@/components/dashboard/dashboardLinks";
import { EmptyPrompt, SkeletonBlock, WidgetCard, WidgetError } from "@/components/dashboard/WidgetCard";
import { useEnrollmentTrend } from "@/components/dashboard/useDashboardData";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, NAV_PERMISSIONS, readUserPermissions } from "@/lib/auth/navPermissions";
import type { EnrollmentPoint } from "@/lib/dashboard/dashboardTypes";

const Y_TICKS = 4;

/** Axis maximum = Y_TICKS × a round step (1, 1.5, 2, 2.5 … × 10^n), so every tick reads cleanly (e.g. 0–1400 by 350). */
function niceMax(peak: number): number {
  if (peak <= 0) return Y_TICKS;
  const rawStep = peak / Y_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7.5, 8, 10].find((s) => s * magnitude >= rawStep) ?? 10;
  return Math.max(Y_TICKS, Math.ceil(step * magnitude) * Y_TICKS);
}

function monthDate(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1);
}

/**
 * Line chart drawn in plain SVG (no chart dependency in the app). Axis
 * labels and points are HTML positioned over a stretched SVG, so the text
 * and dots keep their size at any card width.
 */
function TrendChart({ points }: { points: EnrollmentPoint[] }) {
  const t = useTranslations("dashboard.enrollment");
  const format = useFormatter();
  const max = niceMax(Math.max(...points.map((p) => p.count)));
  const ticks = Array.from({ length: Y_TICKS + 1 }, (_, i) => (max / Y_TICKS) * (Y_TICKS - i));
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);
  const y = (count: number) => 100 - (count / max) * 100;
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.count)}`).join(" ");
  const summary = points.map((p) => `${format.dateTime(monthDate(p.month), { month: "long" })}: ${format.number(p.count)}`).join(", ");

  return (
    <figure className="flex min-w-0 flex-1 flex-col" aria-label={t("chartLabel")}>
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="flex min-h-[200px] flex-1 gap-3" aria-hidden>
        <div className="flex flex-col justify-between py-0 text-right text-[11px] tabular-nums text-text-muted">
          {ticks.map((tick) => (
            <span key={tick} className="-my-1.5 leading-3">
              {format.number(tick, tick >= 10_000 ? { notation: "compact" } : { maximumFractionDigits: 0 })}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          {ticks.map((tick, i) => (
            <span key={tick} className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${(i / Y_TICKS) * 100}%` }} />
          ))}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-2 inset-y-0 h-full w-[calc(100%-1rem)] overflow-visible">
            <path d={path} fill="none" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="stroke-accent" />
          </svg>
          <div className="absolute inset-x-2 inset-y-0">
            {points.map((p, i) => (
              <span
                key={p.month}
                title={`${format.dateTime(monthDate(p.month), { month: "long", year: "numeric" })}: ${format.number(p.count)}`}
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent"
                style={{ left: `${x(i)}%`, top: `${y(p.count)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="ml-9 mt-3 flex justify-between px-0 text-[11px] text-text-muted" aria-hidden>
        {points.map((p) => (
          <span key={p.month}>{format.dateTime(monthDate(p.month), { month: "short" })}</span>
        ))}
      </div>
    </figure>
  );
}

function ChangeBadge({ value }: { value: number }) {
  const t = useTranslations("dashboard.enrollment");
  const format = useFormatter();
  const up = value >= 0;
  const Icon = up ? TrendUpIcon : TrendDownIcon;
  return (
    <span
      title={t("changeHint")}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
        up ? "bg-brand-tint text-accent" : "bg-background text-error"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {format.number(value / 100, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" })}
    </span>
  );
}

/** Student Enrollment Trend: last six months, with the server's % change badge. */
export function EnrollmentTrendCard() {
  const t = useTranslations("dashboard.enrollment");
  const { user } = useAuth();
  const canAdd = canSeeNavEntry(NAV_PERMISSIONS.quickAddStudent, readUserPermissions(user));
  const query = useEnrollmentTrend();
  const data = query.data;
  const hasData = !!data && data.points.some((p) => p.count > 0);

  let body;
  if (query.isPending) body = <SkeletonBlock className="min-h-[220px] flex-1" />;
  else if (query.isError) body = <WidgetError onRetry={() => void query.refetch()} />;
  else if (!hasData) {
    body = (
      <EmptyPrompt
        icon={<StudentIcon className="h-5 w-5" />}
        title={t("empty.title")}
        body={t("empty.body")}
        cta={canAdd ? { label: t("empty.cta"), href: ADD_STUDENT_HREF } : null}
      />
    );
  } else body = <TrendChart points={data.points} />;

  return (
    <WidgetCard
      title={t("title")}
      subtitle={t("subtitle")}
      unbuilt
      action={hasData && data.change_pct !== null ? <ChangeBadge value={data.change_pct} /> : null}
    >
      {body}
    </WidgetCard>
  );
}
