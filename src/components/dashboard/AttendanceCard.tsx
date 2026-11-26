"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { UserCheckIcon } from "@/components/dashboard/DashboardIcons";
import { MARK_ATTENDANCE_HREF } from "@/components/dashboard/dashboardLinks";
import { EmptyPrompt, SkeletonBlock, WidgetCard, WidgetError } from "@/components/dashboard/WidgetCard";
import { useAttendanceToday } from "@/components/dashboard/useDashboardData";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, NAV_PERMISSIONS, readUserPermissions } from "@/lib/auth/navPermissions";
import type { AttendanceAudience, AttendanceToday } from "@/lib/dashboard/dashboardTypes";

const SEGMENTS = [
  { key: "present", stroke: "stroke-accent-2", dot: "bg-accent-2" },
  { key: "absent", stroke: "stroke-error", dot: "bg-error" },
  { key: "late", stroke: "stroke-category-amber", dot: "bg-category-amber" },
] as const;

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Tiny gap between segments so adjacent colours stay distinguishable. */
const GAP = 1.2;

function Donut({ data, label }: { data: AttendanceToday; label: string }) {
  const format = useFormatter();
  const total = data.present + data.absent + data.late;
  const presentShare = total > 0 ? data.present / total : 0;
  let offset = 0;
  const visible = SEGMENTS.filter((s) => data[s.key] > 0);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[180px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={label}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-subtle-track" />
        {visible.map((segment) => {
          const length = (data[segment.key] / total) * CIRCUMFERENCE;
          const drawn = visible.length > 1 ? Math.max(length - GAP, 0.5) : length;
          const circle = (
            <circle
              key={segment.key}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="12"
              className={segment.stroke}
              strokeDasharray={`${drawn} ${CIRCUMFERENCE - drawn}`}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-text-primary">
          {format.number(presentShare, { style: "percent", maximumFractionDigits: 0 })}
        </span>
        <span className="text-[11px] text-text-muted">{label}</span>
      </div>
    </div>
  );
}

/** Today's Attendance: donut (present / absent / late) with a Students / Staff toggle. */
export function AttendanceCard() {
  const t = useTranslations("dashboard.attendance");
  const format = useFormatter();
  const { user } = useAuth();
  const canMark = canSeeNavEntry(NAV_PERMISSIONS.quickMarkAttendance, readUserPermissions(user));
  const [audience, setAudience] = useState<AttendanceAudience>("students");
  const query = useAttendanceToday(audience);

  const toggle = (
    <div role="group" aria-label={t("audienceLabel")} className="grid grid-cols-2 gap-2">
      {(["students", "staff"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={audience === value}
          onClick={() => setAudience(value)}
          className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            audience === value ? "bg-category-cyan text-white" : "bg-background text-text-secondary hover:text-text-primary"
          }`}
        >
          {t(`audience.${value}`)}
        </button>
      ))}
    </div>
  );

  let body;
  if (query.isPending) {
    body = (
      <div className="flex flex-1 flex-col items-center gap-4 pt-6">
        <SkeletonBlock className="h-36 w-36 rounded-full" />
        <SkeletonBlock className="h-24 w-full" />
      </div>
    );
  } else if (query.isError) {
    body = <WidgetError onRetry={() => void query.refetch()} />;
  } else if (!query.data.marked) {
    body = (
      <div className="mt-4 flex flex-1 flex-col">
        <EmptyPrompt
          icon={<UserCheckIcon className="h-5 w-5" />}
          title={t("notMarked.title")}
          body={t(`notMarked.body.${audience}`)}
          cta={canMark ? { label: t("notMarked.cta"), href: MARK_ATTENDANCE_HREF } : null}
        />
      </div>
    );
  } else {
    const data = query.data;
    body = (
      <div className="mt-6 flex flex-1 flex-col gap-6">
        <Donut data={data} label={t("presentLabel")} />
        <ul className="flex flex-col gap-2">
          {SEGMENTS.map((segment) => (
            <li key={segment.key} className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-text-secondary">
                <span aria-hidden className={`h-2 w-2 rounded-full ${segment.dot}`} />
                {t(`legend.${segment.key}`)}
              </span>
              <span className="font-semibold tabular-nums text-text-primary">{format.number(data[segment.key])}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <WidgetCard title={t("title")} unbuilt>
      {toggle}
      {body}
    </WidgetCard>
  );
}
