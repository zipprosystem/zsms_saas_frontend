"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth/AuthProvider";
import { InfoItem } from "@/components/exam/examEntryShared";
import { useResultNumber } from "@/components/exam/results/resultsDisplay";

/** Table pieces shared by the Broad Sheet views (semantic tokens only). */
export const BS_TH = "border-b border-border px-2 py-2 text-center text-xs font-semibold text-text-secondary align-bottom";
export const BS_TD = "px-2 py-2 text-center align-middle tabular-nums";
/** The student column stays put while the subjects scroll sideways (mobile). */
export const BS_STICKY = "sticky left-0 z-10 bg-surface";
export const BS_EDGE = "border-l border-border";

/** The school name for export headers. */
export function useExportSchoolName(): string {
  const { school } = useAuth();
  return typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS";
}

/** A status code in place of a number (RNG / NE …), with its explanation on hover. */
export function StatusCode({ label, help }: { label: string; help: string }) {
  return (
    <span title={help} className="text-xs font-semibold uppercase tracking-wide text-text-muted">
      {label}
    </span>
  );
}

/** The class average + class facts card on top of a broadsheet. */
export function BroadsheetSummary({
  classAverage,
  full,
  armLabel,
  termLabel,
  termValue,
  studentCount,
  rankedCount,
}: {
  classAverage: number | null;
  full: boolean;
  armLabel: string;
  termLabel: string;
  termValue: string;
  studentCount: number;
  rankedCount: number;
}) {
  const t = useTranslations();
  const n = useResultNumber();
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-text-muted">{t("exam.broadSheet.general.summary.classAverage")}</span>
        <span className="text-3xl font-semibold text-text-primary">{n(classAverage)}</span>
        {!full ? <span className="text-xs text-text-muted">{t("exam.broadSheet.general.summary.classAverageHidden")}</span> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
        <InfoItem label={t("exam.results.info.classArm")} value={armLabel} />
        <InfoItem label={termLabel} value={termValue} />
        <InfoItem
          label={t("exam.results.info.students")}
          value={full ? t("exam.results.info.studentsRanked", { total: studentCount, ranked: rankedCount }) : String(studentCount)}
        />
      </div>
    </div>
  );
}

/** One key entry: a glyph (or code) and what it means. */
export function LegendItem({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {marker}
      <span>{children}</span>
    </li>
  );
}

/** The RNG / NE / incomplete entries every broadsheet key carries. */
export function StatusLegendItems() {
  const t = useTranslations();
  return (
    <>
      <LegendItem
        marker={
          <span aria-hidden className="font-semibold text-text-muted">
            *
          </span>
        }
      >
        {t("exam.broadSheet.general.legend.incomplete")}
      </LegendItem>
      <LegendItem marker={<span className="font-semibold uppercase">{t("exam.results.status.rng")}</span>}>— {t("exam.results.statusHelp.rng")}</LegendItem>
      <LegendItem marker={<span className="font-semibold uppercase">{t("exam.results.status.ne")}</span>}>— {t("exam.results.statusHelp.ne")}</LegendItem>
    </>
  );
}

/** Placeholder on every broadsheet view: AI analysis isn't built yet. Disabled but fully visible, with its "Coming soon" tag on the button. */
export function AnalyzeWithAiButton() {
  const t = useTranslations("exam.broadSheet");
  return (
    <button
      type="button"
      disabled
      title={t("analyzeAiSoon")}
      className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md border border-dashed border-accent/60 bg-brand-tint/40 px-4 text-sm font-medium text-accent"
    >
      <span aria-hidden>✦</span>
      {t("analyzeAi")}
      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">{t("analyzeAiSoon")}</span>
    </button>
  );
}
