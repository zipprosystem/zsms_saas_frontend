"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { StarburstIcon } from "@/components/icons/StarburstIcon";
import { AttendanceCard } from "@/components/dashboard/AttendanceCard";
import { EnrollmentTrendCard } from "@/components/dashboard/EnrollmentTrendCard";
import { KpiTiles } from "@/components/dashboard/KpiTiles";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { SETUP_HREF } from "@/components/dashboard/dashboardLinks";
import { useKpiCounts } from "@/components/dashboard/useDashboardData";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AuthUser } from "@/lib/auth/AuthProvider";

/** First name from whatever the auth payload carries: first_name, else the first word of name. */
function firstNameOf(user: AuthUser | null): string | null {
  const first = user?.first_name;
  if (typeof first === "string" && first.trim()) return first.trim();
  const name = user?.name ?? user?.full_name;
  if (typeof name === "string" && name.trim()) return name.trim().split(/\s+/)[0];
  return null;
}

function Hero() {
  const t = useTranslations("dashboard.hero");
  const { user, school } = useAuth();
  const firstName = firstNameOf(user);
  const schoolName = typeof school?.name === "string" && school.name.trim() ? school.name.trim() : null;

  return (
    <div className="relative flex min-w-0 items-center overflow-hidden rounded-[20px] bg-accent-2 px-5 py-6 sm:px-8 lg:min-h-[157px] lg:px-10">
      <StarburstIcon className="pointer-events-none absolute -right-4 -top-6 h-auto w-28 text-white/70 sm:w-40 lg:w-48" />
      <div className="relative min-w-0 max-w-full">
        <h1 className="break-words text-2xl font-semibold leading-tight text-white sm:text-3xl lg:text-[40px]">
          {firstName ? t("greeting", { name: firstName }) : t("greetingNoName")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/90">
          {schoolName ? t("welcome", { school: schoolName }) : t("welcomeNoSchool")}
        </p>
      </div>
    </div>
  );
}

/** Brand-new tenant (no students, no staff yet): one friendly pointer to Setup instead of a wall of zeros. */
function FirstRunNotice() {
  const t = useTranslations("dashboard.firstRun");
  const { students, staff } = useKpiCounts();
  // Only when BOTH real counts are known to be zero — never while loading, failed or forbidden.
  const isZero = (s: typeof students.state) => s?.kind === "count" && s.value === 0;
  if (!isZero(students.state) || !isZero(staff.state)) return null;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-accent bg-brand-tint px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-primary">{t("title")}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{t("body")}</p>
      </div>
      <Link
        href={SETUP_HREF}
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {t("cta")}
      </Link>
    </div>
  );
}

/**
 * Overview — the post-login landing. Core pass: hero, KPI tiles, Quick
 * Actions, Today's Attendance, Enrollment Trend, Recent Activity.
 *
 * Layout: a main column + a 320px side column from `xl`; below that the
 * side column (Quick Actions, Recent Activity) drops under the main one.
 * Open to any logged-in user — only the quick actions are gated.
 */
export function DashboardScreen() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Hero />
      <FirstRunNotice />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <KpiTiles />
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <AttendanceCard />
            <EnrollmentTrendCard />
          </div>
          {/* Second pass (Figma 4796:919672): Department Distribution beside the trend, then
              Staff Timetable, Upcoming Events + tabbed Recent Activities, Exam Toppers. */}
        </div>
        <aside className="grid min-w-0 content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
          <QuickActions />
          <RecentActivityCard />
        </aside>
      </div>
    </div>
  );
}
