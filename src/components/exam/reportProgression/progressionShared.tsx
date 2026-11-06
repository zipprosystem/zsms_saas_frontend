"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, readUserPermissions, type NavPermission } from "@/lib/auth/navPermissions";
import { SelectField } from "@/components/ui/Select";
import { PROGRESSION_POINTS, type MissingItem, type ProgressionPoint } from "@/lib/exam/reportProgression/reportProgressionApi";

/** Sub-menu permission check (group credential); shown when the user carries no permission list yet. */
export function useCanSee(permission: NavPermission): boolean {
  const { user } = useAuth();
  return canSeeNavEntry(permission, readUserPermissions(user));
}

/** Bar tone: below 40 % red, below 70 % amber, else green (Figma). */
function toneOf(percent: number): string {
  if (percent < 40) return "bg-error";
  if (percent < 70) return "bg-warning";
  return "bg-success";
}

/** Progression % bar + figure. A 0 % bar keeps a small stub so the tone still reads. */
export function ProgressionBar({ percent, label }: { percent: number; label: string }) {
  const t = useTranslations("exam.reportProgression");
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        className="h-2 min-w-[80px] flex-1 overflow-hidden rounded-full bg-background"
      >
        <div className={`h-full rounded-full ${toneOf(clamped)}`} style={{ width: `${Math.max(clamped, 2)}%` }} />
      </div>
      <span className="w-11 shrink-0 text-right text-sm font-medium text-text-primary">{t("percent", { percent: clamped })}</span>
    </div>
  );
}

export function PointSelect({ id, value, onChange }: { id: string; value: ProgressionPoint; onChange: (point: ProgressionPoint) => void }) {
  const t = useTranslations("exam.reportProgression");
  return (
    <SelectField id={id} label={t("filters.point")} value={value} onChange={(event) => onChange(event.target.value as ProgressionPoint)}>
      {PROGRESSION_POINTS.map((point) => (
        <option key={point} value={point}>
          {t(`points.${point}`)}
        </option>
      ))}
    </SelectField>
  );
}

export function SearchBox({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-md border border-border bg-surface px-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}

/** One unpopulated item, worded for the publish warning. */
export function useMissingLabel(): (item: MissingItem) => string {
  const t = useTranslations("exam.reportProgression.missing");
  return (item) => {
    if (item.kind === "subject") return t("subject", { subject: item.label });
    if (item.kind === "psychomotor" || item.kind === "affective") return t(item.kind, { count: item.count });
    if (item.kind === "remark") return t(`remark.${item.role}`);
    if (item.kind === "grade") return t(`grade.${item.role}`);
    return t("attendance");
  };
}

/** Back link + a "coming in a later stage" body (Stage 4 Send-to-Parent). */
export function StagePlaceholder({ backHref, backLabel, title, body }: { backHref: string; backLabel: string; title: string; body: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
        <span aria-hidden>←</span> {backLabel}
      </Link>
      <div className="flex min-w-0 flex-col items-center rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="mt-2 max-w-md text-sm text-text-muted">{body}</p>
      </div>
    </div>
  );
}

/** The student's photo, else their initials. sm = the rating modals' header. */
export function StudentAvatar({ name, photoUrl, size = "md" }: { name: string; photoUrl: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-8 w-8 text-xs" : "h-12 w-12 text-sm";
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL / signed photo URL, not an optimizable static asset
    return <img src={photoUrl} alt="" className={`${box} shrink-0 rounded-full object-cover`} />;
  }
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2);
  return (
    <span aria-hidden className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-brand-tint font-semibold text-accent`}>
      {initials}
    </span>
  );
}

/**
 * Phase 5 hook on a teacher comment: "Generate with AI" will draft the
 * comment (saved as term_remark.source = ai_draft) for the teacher to edit.
 * Disabled until then, in the same visual language as the broadsheets'
 * "Analyze with AI".
 */
export function GenerateWithAiButton() {
  const t = useTranslations("exam.reportProgression.entry.ai");
  return (
    <button
      type="button"
      disabled
      title={t("soon")}
      className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-accent/60 px-2.5 text-xs font-medium text-accent"
    >
      <span aria-hidden>✦</span>
      {t("generate")}
      <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">{t("soon")}</span>
    </button>
  );
}
