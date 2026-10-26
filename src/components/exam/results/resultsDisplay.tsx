"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { ResultStatus } from "@/lib/exam/results/resultsTypes";

/**
 * Small display pieces shared by the Results table and the per-student
 * panel. Every value shown is computed by the backend engine — these only
 * format it. Status and VA always carry text (never colour alone).
 */

// Semantic tokens only (dark-mode safe) — same palette as the other status badges.
const STATUS_CLASSES: Record<ResultStatus, string> = {
  ready: "bg-category-green-tint text-success",
  incomplete: "bg-category-amber-tint text-warning",
  rng: "border border-border text-text-secondary",
  ne: "border border-dashed border-border text-text-muted",
};

export function ResultStatusBadge({ status }: { status: ResultStatus }) {
  const t = useTranslations("exam.results");
  return (
    <span
      title={t(`statusHelp.${status}`)}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}

/** Formats a computed number for the current locale (up to 2 dp); "—" when not computed. */
export function useResultNumber() {
  const format = useFormatter();
  return (value: number | null, digits = 2) => (value === null ? "—" : format.number(value, { maximumFractionDigits: digits }));
}

/** VA in grade steps: "+2", "−1", "0" — with a spoken label (above / below / on target). */
export function VaValue({ va }: { va: number | null }) {
  const t = useTranslations("exam.results");
  if (va === null) return <span className="text-text-muted">—</span>;
  const text = va > 0 ? `+${va}` : va < 0 ? `−${Math.abs(va)}` : "0";
  const label = va > 0 ? t("va.above", { count: va }) : va < 0 ? t("va.below", { count: Math.abs(va) }) : t("va.onTarget");
  return (
    <span title={label} className={va > 0 ? "font-semibold text-success" : va < 0 ? "font-semibold text-error" : "font-semibold text-text-primary"}>
      <span aria-hidden>{text}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** "4 of 10" — ties are visible as equal positions (competition ranking). */
export function PositionValue({ position, of }: { position: number | null; of: number }) {
  const t = useTranslations("exam.results");
  if (position === null) return <span className="text-text-muted">—</span>;
  return <span className="whitespace-nowrap">{t("positionOf", { position, count: of })}</span>;
}
