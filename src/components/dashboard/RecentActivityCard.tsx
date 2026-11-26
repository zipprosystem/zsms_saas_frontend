"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import { AlertCircleIcon, CheckCircleIcon, InfoCircleIcon } from "@/components/dashboard/DashboardIcons";
import { EmptyPrompt, SkeletonBlock, WidgetCard, WidgetError } from "@/components/dashboard/WidgetCard";
import { useRecentActivity } from "@/components/dashboard/useDashboardData";
import { RECENT_ACTIVITY_LIMIT } from "@/lib/dashboard/dashboardApi";
import { ACTIVITY_TYPES, type ActivityItem, type ActivityType } from "@/lib/dashboard/dashboardTypes";

const KNOWN_TYPES: ReadonlySet<string> = new Set(ACTIVITY_TYPES);

/** Icon tone per activity type: completed things green, reminders amber, everything else informational. */
const TONE: Record<ActivityType, "done" | "info" | "alert"> = {
  student_admitted: "done",
  grades_submitted: "done",
  attendance_marked: "info",
  parent_meeting_scheduled: "info",
  fee_reminder_sent: "alert",
  assignment_extended: "info",
  notice_sent: "info",
};

const TONE_CLASSES = {
  done: { chip: "bg-category-green-tint text-success", Icon: CheckCircleIcon },
  info: { chip: "bg-category-blue-tint text-category-blue", Icon: InfoCircleIcon },
  alert: { chip: "bg-category-amber-tint text-category-amber", Icon: AlertCircleIcon },
} as const;

function ActivityRow({ item, now }: { item: ActivityItem; now: Date }) {
  const t = useTranslations("dashboard.activity");
  const format = useFormatter();
  const known = KNOWN_TYPES.has(item.type);
  const tone = known ? TONE[item.type as ActivityType] : "info";
  const { chip, Icon } = TONE_CLASSES[tone];
  // next-intl throws on a missing placeholder value — give every template its params a safe default.
  const params = { name: "", subject: "", class: "", ...item.params };
  const title = known ? t(`types.${item.type}`, params) : item.title ?? t("fallbackTitle");
  const when = new Date(item.occurred_at);
  const validWhen = !Number.isNaN(when.getTime());

  return (
    <li className="flex items-start gap-3 rounded-xl bg-background px-3 py-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${chip}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary [overflow-wrap:anywhere]">{title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-text-muted">
          <span>{item.actor_name ?? t("systemActor")}</span>
          {validWhen ? (
            <>
              <span aria-hidden>•</span>
              <time dateTime={item.occurred_at} title={format.dateTime(when, { dateStyle: "medium", timeStyle: "short" })}>
                {format.relativeTime(when, now)}
              </time>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

/**
 * Recent Activity feed. "View All" stays visibly disabled until the full
 * activity log page exists (second pass, with the tabbed Recent Activities).
 */
export function RecentActivityCard() {
  const t = useTranslations("dashboard.activity");
  const now = useNow({ updateInterval: 60_000 });
  const query = useRecentActivity();

  const viewAll = (
    <span aria-disabled="true" title={t("viewAllSoon")} className="cursor-not-allowed text-xs font-semibold text-text-muted">
      {t("viewAll")}
    </span>
  );

  let body;
  if (query.isPending) {
    body = (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-14" />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = <WidgetError onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = <EmptyPrompt icon={<InfoCircleIcon className="h-5 w-5" />} title={t("empty.title")} body={t("empty.body")} />;
  } else {
    body = (
      <ul className="flex flex-col gap-2">
        {query.data.slice(0, RECENT_ACTIVITY_LIMIT).map((item) => (
          <ActivityRow key={item.id} item={item} now={now} />
        ))}
      </ul>
    );
  }

  return (
    <WidgetCard title={t("title")} unbuilt action={viewAll}>
      {body}
    </WidgetCard>
  );
}
