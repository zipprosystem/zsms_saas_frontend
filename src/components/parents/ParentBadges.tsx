"use client";

import { useTranslations } from "next-intl";
import { StarburstIcon } from "@/components/icons/StarburstIcon";
import { initialsOf } from "@/lib/parents/parentLinks";
import type { ParentRelationship, ParentStatus } from "@/lib/parents/parentTypes";

// Semantic tokens only (dark-mode safe) — same palette as StaffStatusBadge.
const PILL = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

/** Same banner treatment as StaffsHeader / StudentsHeader. */
export function ParentsHeader() {
  const t = useTranslations("parents.header");
  return (
    <div className="relative flex min-w-0 items-center overflow-hidden rounded-[20px] bg-accent-2 px-5 py-6 sm:px-8 lg:min-h-[157px] lg:px-10">
      <StarburstIcon className="pointer-events-none absolute -right-4 -top-6 h-auto w-28 text-white/70 sm:w-40 lg:w-48" />
      <div className="relative min-w-0 max-w-full lg:max-w-none">
        <h1 className="break-words text-2xl font-semibold leading-tight text-white sm:text-3xl lg:whitespace-nowrap lg:text-[40px]">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/90">{t("subtitle")}</p>
      </div>
    </div>
  );
}

export function ParentStatusBadge({ status }: { status: ParentStatus }) {
  const t = useTranslations("parents");
  const tone = status === "active" ? "bg-category-green-tint text-success" : "border border-border text-text-secondary";
  return <span className={`${PILL} ${tone}`}>{t(`status.${status}`)}</span>;
}

export function RelationshipBadge({ relationship }: { relationship: ParentRelationship }) {
  const t = useTranslations("parents");
  const tone = relationship === "parent" ? "bg-category-blue-tint text-category-blue" : "bg-category-purple-tint text-category-purple";
  return <span className={`${PILL} ${tone}`}>{t(`relationship.${relationship}`)}</span>;
}

/** The parent other parents' links point at for THIS student (the student profile's primary contact). */
export function PrimaryBadge() {
  const t = useTranslations("parents");
  return (
    <span className={`${PILL} bg-category-amber-tint text-category-amber`} title={t("primary.hint")}>
      {t("primary.label")}
    </span>
  );
}

/**
 * Spec §4/§5: only email_active parents receive mail — show who can be
 * mailed. A dummy/placeholder email reads "Not mailable".
 */
export function EmailActiveIndicator({ email, emailActive }: { email: string | null; emailActive: boolean }) {
  const t = useTranslations("parents.emailActive");
  if (!email) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${emailActive ? "text-success" : "text-text-muted"}`}
      title={emailActive ? t("activeHint") : t("inactiveHint")}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${emailActive ? "bg-success" : "bg-text-muted"}`} />
      {emailActive ? t("active") : t("inactive")}
    </span>
  );
}

export function ParentAvatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-category-purple-tint text-xs font-semibold text-accent">
      {initialsOf(name) || "—"}
    </span>
  );
}

export function SourceLabel({ createdFrom }: { createdFrom: "student_registration" | "manual" }) {
  const t = useTranslations("parents.source");
  return <span className="text-[11px] text-text-muted">{t(createdFrom)}</span>;
}
