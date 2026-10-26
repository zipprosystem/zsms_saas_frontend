"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ClassResultRow, ClassResults, SubjectResult } from "@/lib/exam/results/resultsTypes";
import { PositionValue, ResultStatusBadge, useResultNumber, VaValue } from "@/components/exam/results/resultsDisplay";

const TH = "px-3 py-2.5 text-left text-xs font-semibold text-text-secondary align-bottom";
const TD = "px-3 py-2.5 align-middle";

type ResultsTableProps = {
  data: ClassResults;
  /** S/N of the first row on this page. */
  firstSerial: number;
  onOpenStudent: (row: ClassResultRow) => void;
};

/**
 * The class results grid for one view. Subject columns come from the
 * response (`subjects`), and every value from the engine — nothing is
 * worked out here.
 *   General  all: total + grade per subject, then grand total, average,
 *                 overall grade, position, status
 *            grades: grade per subject + overall grade
 *            gpa: GPA per subject (units in the header) + overall GPA
 *   British  all: CAG per subject with VA and cumulative attainment
 *            grades: CAG per subject
 */
export function ResultsTable({ data, firstSerial, onOpenStudent }: ResultsTableProps) {
  const t = useTranslations("exam.results");
  const n = useResultNumber();
  const british = data.assessment_mode === "grade_based";
  const { view } = data;

  /** NE / RNG are shown as text in place of a value. Incomplete totals get a marked dagger (legend under the table). */
  const subjectCell = (result: SubjectResult | undefined): ReactNode => {
    if (!result) return <span className="text-text-muted">—</span>;
    if (result.status === "ne") return <span className="text-xs font-semibold text-text-muted">{t("status.ne")}</span>;
    if (result.status === "rng") return <span className="text-xs font-semibold text-text-muted">{t("status.rng")}</span>;
    const incomplete =
      result.status === "incomplete" ? (
        <span title={t("statusHelp.incomplete")} className="ml-0.5 text-warning">
          <span aria-hidden>†</span>
          <span className="sr-only">{t("status.incomplete")}</span>
        </span>
      ) : null;
    if (british) {
      if (view === "grades") return <span className="font-semibold text-text-primary">{result.cag ?? "—"}{incomplete}</span>;
      return (
        <span className="flex flex-col">
          <span className="font-semibold text-text-primary">{result.cag ?? "—"}{incomplete}</span>
          <span className="whitespace-nowrap text-xs text-text-muted">
            {t("columns.va")} <VaValue va={result.va} /> · {t("columns.cumulativeShort")} {result.cumulative_grade ?? "—"}
          </span>
        </span>
      );
    }
    if (view === "grades") return <span className="font-semibold text-text-primary">{result.grade ?? "—"}{incomplete}</span>;
    if (view === "gpa") {
      return (
        <span className="flex flex-col">
          <span className="font-semibold text-text-primary">{n(result.gpa)}{incomplete}</span>
          <span className="text-xs text-text-muted">{result.grade ?? "—"}</span>
        </span>
      );
    }
    return (
      <span className="flex flex-col">
        <span className="font-semibold text-text-primary">{n(result.total)}{incomplete}</span>
        <span className="text-xs text-text-muted">{result.grade ?? "—"}</span>
      </span>
    );
  };

  const subjectHeader = (subject: ClassResults["subjects"][number]) => (
    <th key={subject.subject_id} className={TH}>
      <span className="block">{subject.subject_name}</span>
      {!british && view === "gpa" ? (
        <span className="block font-normal text-text-muted">
          {subject.unit !== null ? t("units", { count: subject.unit }) : t("unitDefault")}
        </span>
      ) : null}
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{t(`views.${view}`)}</caption>
          <thead className="bg-brand-tint">
            <tr>
              <th className={TH}>{t("columns.sn")}</th>
              <th className={`${TH} sticky left-0 bg-brand-tint`}>{t("columns.student")}</th>
              {data.subjects.map(subjectHeader)}
              {!british && view === "all" ? (
                <>
                  <th className={TH}>{t("columns.grandTotal")}</th>
                  <th className={TH}>{t("columns.average")}</th>
                  <th className={TH}>{t("columns.overallGrade")}</th>
                  <th className={TH}>{t("columns.position")}</th>
                </>
              ) : null}
              {!british && view === "grades" ? <th className={TH}>{t("columns.overallGrade")}</th> : null}
              {!british && view === "gpa" ? <th className={TH}>{t("columns.overallGpa")}</th> : null}
              <th className={TH}>{t("columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row, index) => (
              <tr key={row.student_id} className="border-t border-border">
                <td className={`${TD} text-text-secondary`}>{firstSerial + index}</td>
                <td className={`${TD} sticky left-0 bg-surface`}>
                  <button
                    type="button"
                    onClick={() => onOpenStudent(row)}
                    aria-label={t("openStudent", { name: row.student_name })}
                    className="flex flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="font-medium text-accent hover:underline">{row.student_name}</span>
                    <span className="text-xs text-text-muted">{row.admission_no}</span>
                  </button>
                </td>
                {data.subjects.map((subject) => (
                  <td key={subject.subject_id} className={TD}>
                    {subjectCell(row.subjects[subject.subject_id])}
                  </td>
                ))}
                {!british && view === "all" ? (
                  <>
                    <td className={`${TD} font-semibold text-text-primary`}>{n(row.aggregate.grand_total)}</td>
                    <td className={`${TD} font-semibold text-text-primary`}>{n(row.aggregate.average)}</td>
                    <td className={`${TD} font-semibold text-text-primary`}>{row.aggregate.overall_grade ?? "—"}</td>
                    <td className={TD}>
                      <PositionValue position={row.aggregate.class_position} of={data.ranked_count} />
                    </td>
                  </>
                ) : null}
                {!british && view === "grades" ? <td className={`${TD} font-semibold text-text-primary`}>{row.aggregate.overall_grade ?? "—"}</td> : null}
                {!british && view === "gpa" ? <td className={`${TD} font-semibold text-text-primary`}>{n(row.aggregate.gpa)}</td> : null}
                <td className={TD}>
                  <ResultStatusBadge status={row.aggregate.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-text-muted">{british ? t("legend.british") : t("legend.general")}</p>
    </div>
  );
}
