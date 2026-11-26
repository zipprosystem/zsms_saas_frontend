"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { showsSampleData } from "@/lib/dashboard/dashboardApi";

/** The white card every Overview widget sits in. */
export function WidgetCard({
  title,
  subtitle,
  unbuilt = false,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  /** True for a widget with no backend yet: shows the "Sample data" tag under the local dev bypass. */
  unbuilt?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6 ${className}`}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            {unbuilt && showsSampleData() ? <SampleDataTag /> : null}
          </div>
          {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="mt-4 flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function SampleDataTag() {
  const t = useTranslations("dashboard");
  return (
    <span
      title={t("sampleDataHint")}
      className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted"
    >
      {t("sampleData")}
    </span>
  );
}

/** Friendly first-run / nothing-yet panel: an icon, one line, and (optionally) the next step. */
export function EmptyPrompt({
  icon,
  title,
  body,
  cta,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  cta?: { label: string; href: string } | null;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-tint text-accent">{icon}</span>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {body ? <p className="max-w-xs text-xs text-text-muted">{body}</p> : null}
      {cta ? (
        <Link
          href={cta.href}
          className="mt-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-accent hover:bg-brand-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Shown when a widget's request failed (the rest of the page keeps working). */
export function WidgetError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("dashboard");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="text-sm text-text-secondary">{t("loadFailed")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-accent hover:bg-brand-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("retry")}
      </button>
    </div>
  );
}

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-subtle-track ${className}`} />;
}
