"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { componentMark, shownTotal, type MarkColumnGroup, type MarkLeaf } from "@/lib/exam/markColumns";
import type { SubjectMarkRow } from "@/lib/exam/examTypes";
import { SUBJECT_REMARK_MAX } from "@/lib/exam/examTypes";
import {
  isRowDirty,
  isScoreTextValid,
  parsedScores,
  type Draft,
  type DraftRow,
} from "@/components/exam/marksDraft";

type MarksGridProps = {
  groups: MarkColumnGroup[];
  leaves: MarkLeaf[];
  /** Already search-filtered; `serial` keeps each student's S/N from the full roster. */
  rows: Array<{ row: SubjectMarkRow; serial: number }>;
  draft: Draft;
  baseline: Draft;
  readOnly: boolean;
  onChangeRow: (studentId: string, patch: Partial<DraftRow>) => void;
  onRevertRow: (studentId: string) => void;
  onClearScores: (studentId: string) => void;
  /** Column switches for screens that reuse the grid (the Grade Book has no Present / Remarks / Completed). Default all on. */
  showPresent?: boolean;
  showRemarks?: boolean;
  showCompleted?: boolean;
  /** An extra read-only column after Total, derived from the row's live total (the Grade Book's Grade). */
  totalExtra?: { header: ReactNode; render: (total: number | null) => ReactNode };
};

/** Derived numbers: integers as-is, otherwise up to 2 decimals. */
function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

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
 * The marks entry table. Score columns come from the exam's structure
 * (markColumns.ts): a plain component is one input; a broken-down one is
 * an input per sub-field plus its read-only computed total. Every total
 * shown is a live display sum — nothing here is stored.
 */
export function MarksGrid({
  groups,
  leaves,
  rows,
  draft,
  baseline,
  readOnly,
  onChangeRow,
  onRevertRow,
  onClearScores,
  showPresent = true,
  showRemarks = true,
  showCompleted = true,
  totalExtra,
}: MarksGridProps) {
  const t = useTranslations("exam.marks");
  const hasSecondHeaderRow = groups.some((group) => group.hasTotal);
  const outOf = shownTotal(groups, {}).outOf;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead className="bg-brand-tint">
          <tr>
            <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={TH}>{t("columns.sn")}</th>
            <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={TH}>{t("columns.student", { count: rows.length })}</th>
            <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={TH}>{t("columns.seatNo")}</th>
            {showPresent ? <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={`${TH} text-center`}>{t("columns.present")}</th> : null}
            {groups.map((group) =>
              group.hasTotal ? (
                <th key={group.component.id} colSpan={group.leaves.length + 1} scope="colgroup" className={`${TH} border-b border-border text-center`}>
                  {group.component.name}
                  <span className="ml-1 font-normal text-text-muted">/ {fmt(group.component.max)}</span>
                </th>
              ) : (
                <th key={group.component.id} rowSpan={hasSecondHeaderRow ? 2 : 1} className={`${TH} text-center`}>
                  {group.component.name}
                  <span className="block font-normal text-text-muted">/ {fmt(group.component.max)}</span>
                </th>
              ),
            )}
            <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={`${TH} text-center`}>
              {t("columns.total")}
              <span className="block font-normal text-text-muted">/ {fmt(outOf)}</span>
            </th>
            {totalExtra ? (
              <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={`${TH} text-center`}>
                {totalExtra.header}
              </th>
            ) : null}
            {showRemarks ? <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={TH}>{t("columns.remarks")}</th> : null}
            {showCompleted ? <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={`${TH} text-center`}>{t("columns.completed")}</th> : null}
            <th rowSpan={hasSecondHeaderRow ? 2 : 1} className={TH}>
              <span className="sr-only">{t("columns.actions")}</span>
            </th>
          </tr>
          {hasSecondHeaderRow ? (
            <tr>
              {groups
                .filter((group) => group.hasTotal)
                .flatMap((group) => [
                  ...group.leaves.map((leaf) => (
                    <th key={leaf.id} scope="col" className={`${TH} text-center`}>
                      {leaf.name}
                      <span className="block font-normal text-text-muted">/ {fmt(leaf.max)}</span>
                    </th>
                  )),
                  <th key={`${group.component.id}-total`} scope="col" className={`${TH} text-center text-text-muted`}>
                    {t("columns.componentTotal")}
                  </th>,
                ])}
            </tr>
          ) : null}
        </thead>
        <tbody>
          {rows.map(({ row, serial }) => {
            const current = draft[row.student_id];
            const saved = baseline[row.student_id];
            if (!current || !saved) return null;
            const scores = parsedScores(current, leaves);
            const total = shownTotal(groups, scores);
            const dirty = isRowDirty(current, saved, leaves);
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
                {showPresent ? (
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
                ) : null}
                {groups.map((group) => {
                  const cells = group.leaves.map((leaf) => {
                    const text = current.scores[leaf.id] ?? "";
                    const valid = isScoreTextValid(text, leaf.max);
                    return (
                      <td key={leaf.id} className={`${TD} text-center`}>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={leaf.max}
                          step="any"
                          value={text}
                          disabled={readOnly}
                          onChange={(event) =>
                            onChangeRow(row.student_id, { scores: { ...current.scores, [leaf.id]: event.target.value } })
                          }
                          aria-label={t("aria.score", { field: leaf.name, name: row.student_name, max: fmt(leaf.max) })}
                          aria-invalid={!valid || undefined}
                          title={valid ? undefined : t("errors.scoreRange", { max: fmt(leaf.max) })}
                          className={`h-10 w-20 rounded-md border bg-surface px-2 text-center text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                            valid ? "border-border" : "border-error text-error"
                          }`}
                        />
                      </td>
                    );
                  });
                  if (!group.hasTotal) return cells;
                  const mark = componentMark(group, scores);
                  return [
                    ...cells,
                    <td key={`${group.component.id}-total`} className={`${TD} text-center font-medium text-text-secondary`}>
                      {mark === null || Number.isNaN(mark) ? "—" : fmt(mark)}
                    </td>,
                  ];
                })}
                <td className={`${TD} text-center font-semibold text-text-primary`}>
                  {total.value === null || Number.isNaN(total.value) ? "—" : fmt(total.value)}
                </td>
                {totalExtra ? (
                  <td className={`${TD} text-center`}>{totalExtra.render(total.value === null || Number.isNaN(total.value) ? null : total.value)}</td>
                ) : null}
                {showRemarks ? (
                  <td className={TD}>
                    <input
                      type="text"
                      value={current.subject_remark}
                      maxLength={SUBJECT_REMARK_MAX}
                      disabled={readOnly}
                      placeholder={t("remarkPlaceholder")}
                      onChange={(event) => onChangeRow(row.student_id, { subject_remark: event.target.value })}
                      aria-label={t("aria.remark", { name: row.student_name })}
                      className="h-10 w-48 rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </td>
                ) : null}
                {showCompleted ? (
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
                ) : null}
                <td className={TD}>
                  <ActionsMenu
                    menuLabel={t("aria.rowActions", { name: row.student_name })}
                    items={[
                      { key: "clear", label: t("actions.clearScores"), onClick: () => onClearScores(row.student_id), disabled: readOnly },
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
