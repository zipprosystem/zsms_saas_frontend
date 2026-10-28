"use client";

import { useTranslations } from "next-intl";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { SUBJECT_REMARK_MAX, type GradeBasedStructure, type GradeMarkRow, type ScaleLevel } from "@/lib/exam/examTypes";
import { isGradeRowDirty, type GradeDraft, type GradeDraftRow } from "@/components/exam/gradeDraft";
import { attainmentText, useAttainmentDisplay, weightOf, type AttainmentDisplay } from "@/lib/exam/settings/examSettingsApi";

type AcademicReportGridProps = {
  structure: GradeBasedStructure;
  /** Levels for the attainment leaf (the class grade scale) and for each rating domain leaf, keyed by leaf id. */
  levelsByLeaf: Record<string, ScaleLevel[]>;
  leafIds: string[];
  rows: Array<{ row: GradeMarkRow; serial: number }>;
  draft: GradeDraft;
  baseline: GradeDraft;
  readOnly: boolean;
  onChangeRow: (studentId: string, patch: Partial<GradeDraftRow>) => void;
  onRevertRow: (studentId: string) => void;
  onClearEntries: (studentId: string) => void;
};

const TH = "px-3 py-2.5 text-left text-xs font-semibold text-text-secondary align-bottom";
const TD = "px-3 py-2.5 align-middle";

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-accent">
      {initials}
    </span>
  );
}

/**
 * An attainment grade shown read-only, as the school displays attainment:
 * its weight (default; the code and label on hover) or its code, labelled
 * from the scale when the label differs (e.g. "S · Secure").
 */
function CodeChip({ code, levels, display }: { code: string | null; levels: ScaleLevel[]; display: AttainmentDisplay }) {
  if (!code) return <span className="text-text-muted">—</span>;
  const label = levels.find((level) => level.code === code)?.label;
  const named = label && label !== code ? `${code} · ${label}` : code;
  return (
    <span
      className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-sm font-medium text-text-primary"
      title={display === "weight" ? named : label}
    >
      {attainmentText(code, levels, display)}
      {display === "label" && label && label !== code ? <span className="ml-1 font-normal text-text-muted">· {label}</span> : null}
    </span>
  );
}

/** A select option: weight mode reads "4 · Mastering" (or just "9" when the label is the code); label mode "M · Mastering". */
function optionText(level: ScaleLevel, levels: ScaleLevel[], display: AttainmentDisplay): string {
  const lead = display === "weight" ? String(weightOf(levels, level.code) ?? level.code) : level.code;
  return level.label && level.label !== level.code ? `${lead} · ${level.label}` : lead;
}

function LevelSelect({
  value,
  levels,
  disabled,
  label,
  onChange,
  display = "label",
}: {
  value: string;
  levels: ScaleLevel[];
  disabled: boolean;
  label: string;
  onChange: (code: string) => void;
  /** Attainment selects follow the school's display setting; rating selects keep their codes. */
  display?: AttainmentDisplay;
}) {
  const t = useTranslations("exam.academicReport");
  // A saved code no longer on the scale stays visible (and selected) rather than silently disappearing.
  const unknown = value && !levels.some((level) => level.code === value);
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-10 min-w-[7.5rem] rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="">{t("notEntered")}</option>
      {unknown ? <option value={value}>{t("unknownCode", { code: value })}</option> : null}
      {levels.map((level) => (
        <option key={level.code} value={level.code}>
          {optionText(level, levels, display)}
        </option>
      ))}
    </select>
  );
}

/**
 * The Academic Report entry table (British, grade-based). Columns come
 * from the resolved structure: Current Attainment (class grade scale) and
 * one rating select per domain present. Target (the student's MTG) and Grade Book
 * are read-only references. Codes only — nothing is computed here.
 */
export function AcademicReportGrid({
  structure,
  levelsByLeaf,
  leafIds,
  rows,
  draft,
  baseline,
  readOnly,
  onChangeRow,
  onRevertRow,
  onClearEntries,
}: AcademicReportGridProps) {
  const t = useTranslations("exam.academicReport");
  const display = useAttainmentDisplay();
  const gradeLevels = levelsByLeaf[structure.attainment.id] ?? [];

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-brand-tint">
          <tr>
            <th className={TH}>{t("columns.sn")}</th>
            <th className={TH}>{t("columns.student", { count: rows.length })}</th>
            <th className={TH}>{t("columns.seatNo")}</th>
            <th className={TH}>{t("columns.target")}</th>
            <th className={TH}>{t("columns.gradeBook")}</th>
            <th className={`${TH} text-center`}>{t("columns.present")}</th>
            <th className={TH}>{structure.attainment.name}</th>
            {structure.rating_domains.map((domain) => (
              <th key={domain.id} className={TH}>
                {domain.name}
              </th>
            ))}
            <th className={TH}>{t("columns.comment")}</th>
            <th className={`${TH} text-center`}>{t("columns.completed")}</th>
            <th className={TH}>
              <span className="sr-only">{t("columns.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, serial }) => {
            const current = draft[row.student_id];
            const saved = baseline[row.student_id];
            if (!current || !saved) return null;
            const dirty = isGradeRowDirty(current, saved, leafIds);
            const setScore = (leafId: string, code: string) =>
              onChangeRow(row.student_id, { scores: { ...current.scores, [leafId]: code } });
            return (
              <tr key={row.student_id} className="border-t border-border">
                <td className={`${TD} text-text-secondary`}>
                  <span className="flex items-center gap-1.5">
                    {serial}
                    {dirty ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" title={t("unsavedRow")}>
                        <span className="sr-only">{t("unsavedRow")}</span>
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className={TD}>
                  <span className="flex items-center gap-2.5">
                    <Initials name={row.student_name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-text-primary">{row.student_name}</span>
                      <span className="text-xs text-text-muted">{row.admission_no}</span>
                    </span>
                  </span>
                </td>
                <td className={`${TD} text-text-secondary`}>{row.seat_no || "—"}</td>
                <td className={TD}>
                  <CodeChip code={row.mtg} levels={gradeLevels} display={display} />
                </td>
                <td className={TD}>
                  <CodeChip code={row.grade_book} levels={gradeLevels} display={display} />
                </td>
                <td className={`${TD} text-center`}>
                  <input
                    type="checkbox"
                    checked={current.present === true}
                    disabled={readOnly}
                    onChange={(event) => onChangeRow(row.student_id, { present: event.target.checked })}
                    aria-label={t("aria.present", { name: row.student_name })}
                    className="h-4 w-4 accent-success disabled:cursor-not-allowed"
                  />
                </td>
                <td className={TD}>
                  <LevelSelect
                    value={current.scores[structure.attainment.id] ?? ""}
                    levels={gradeLevels}
                    disabled={readOnly}
                    label={t("aria.field", { field: structure.attainment.name, name: row.student_name })}
                    onChange={(code) => setScore(structure.attainment.id, code)}
                    display={display}
                  />
                </td>
                {structure.rating_domains.map((domain) => (
                  <td key={domain.id} className={TD}>
                    <LevelSelect
                      value={current.scores[domain.id] ?? ""}
                      levels={levelsByLeaf[domain.id] ?? []}
                      disabled={readOnly}
                      label={t("aria.field", { field: domain.name, name: row.student_name })}
                      onChange={(code) => setScore(domain.id, code)}
                    />
                  </td>
                ))}
                <td className={TD}>
                  <input
                    type="text"
                    value={current.subject_remark}
                    maxLength={SUBJECT_REMARK_MAX}
                    disabled={readOnly}
                    placeholder={t("commentPlaceholder")}
                    onChange={(event) => onChangeRow(row.student_id, { subject_remark: event.target.value })}
                    aria-label={t("aria.comment", { name: row.student_name })}
                    className="h-10 w-56 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </td>
                <td className={`${TD} text-center`}>
                  <input
                    type="checkbox"
                    checked={current.mark_completed}
                    disabled={readOnly}
                    onChange={(event) => onChangeRow(row.student_id, { mark_completed: event.target.checked })}
                    aria-label={t("aria.completed", { name: row.student_name })}
                    className="h-4 w-4 accent-accent disabled:cursor-not-allowed"
                  />
                </td>
                <td className={TD}>
                  <ActionsMenu
                    menuLabel={t("aria.rowActions", { name: row.student_name })}
                    items={[
                      { key: "clear", label: t("actions.clearEntries"), onClick: () => onClearEntries(row.student_id), disabled: readOnly },
                      { key: "revert", label: t("actions.undoChanges"), onClick: () => onRevertRow(row.student_id), disabled: !dirty },
                    ]}
                    trigger={({ isOpen, toggle }) => (
                      <button
                        type="button"
                        onClick={toggle}
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        aria-label={t("aria.rowActions", { name: row.student_name })}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <MoreVerticalIcon className="h-4 w-4" />
                      </button>
                    )}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
