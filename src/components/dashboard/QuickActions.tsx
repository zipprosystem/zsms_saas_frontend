"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { QUICK_ACTIONS } from "@/components/dashboard/dashboardLinks";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, readUserPermissions } from "@/lib/auth/navPermissions";

/** The purple Quick Actions panel. Each action is permission-gated; the panel hides when none is left. */
export function QuickActions() {
  const t = useTranslations("dashboard.quickActions");
  const { user } = useAuth();
  const granted = readUserPermissions(user);
  const actions = QUICK_ACTIONS.filter((action) => canSeeNavEntry(action.permission, granted));
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby="dashboard-quick-actions" className="rounded-2xl bg-accent p-5 shadow-sm dark:bg-accent-hover sm:p-6">
      <h2 id="dashboard-quick-actions" className="text-lg font-semibold text-white">
        {t("title")}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.key}>
              <Link
                href={action.href}
                className="flex min-h-[56px] items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white ${action.chip}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 truncate">{t(`actions.${action.key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
