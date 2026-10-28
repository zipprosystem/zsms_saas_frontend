"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import type { ExportConfig } from "@/lib/export/exportTypes";
import {
  broadsheetQueryKeys,
  getCumulativeBroadsheet,
  type CumulativeBroadsheet as CumulativeData,
  type CumulativeRow,
  type CumulativeSubjectCell,
  type CumulativeTermCell,
} from "@/lib/exam/broadsheet/broadsheetApi";
import { failureMessage, Notice } from "@/components/exam/examEntryShared";
import { PositionValue, useResultNumber } from "@/components/exam/results/resultsDisplay";
import {
  BroadsheetSummary,
  BS_EDGE,
  BS_STICKY,
  BS_TD,
  BS_TH,
  LegendItem,
  StatusCode,
  StatusLegendItems,
  AnalyzeWithAiButton,
  useExportSchoolName,
} from "@/components/exam/broadsheet/broadsheetShared";

type Term = CumulativeData["terms"][number];

/**
 * Broad Sheet › Cumulative Broadsheet (General): each subject's term
 * totals side by side plus its enrolment-aware cumulative AVG, and each
 * student's cumulative score, overall average and rank — all as of the
 * selected term. Each term carries a trend against the previous term:
 * ↑ higher (green), ↓ lower (amber — deliberately not red), nothing when
 * equal or when there's no previous total. A term before a late joiner
 * enrolled shows NE and isn't in the divisor. Every number comes from the
 * backend (broadsheetApi.ts).
 */
export function CumulativeBroadsheet({ armId, termId, armLabel, actingAs }: { armId: string; termId: string; armLabel: string; actingAs: string }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.broadSheet.cumulative.${key}`, values);
  const g = (key: string, values?: Record<string, string | number>) => t(`exam.broadSheet.general.${key}`, values);
  const n = useResultNumber();
  const schoolName = useExportSchoolName();

  const query = useQuery({
    queryKey: [...broadsheetQueryKeys.cumulative(armId, termId), actingAs],
    queryFn: () => getCumulativeBroadsheet(armId, termId).then(throwIfTransient),
    enabled: !!armId && !!termId,
  });
  const data = query.data?.ok ? query.data.data : null;

  if (query.isPending) return <Notice>{t("exam.marks.loading")}</Notice>;
  if (!data) {
    return (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  }

  const full = data.viewer.report_scope === "full";
  const span = data.terms.length + 1;

  /** Export text for one term cell (codes, not numbers, where there's no score). */
  const termExport = (cell: CumulativeSubjectCell, term: Term): string | number => {
    if (cell.status === "ne") return t("exam.results.status.ne");
    if (!term.included) return "";
    const value = cell.terms[term.id];
    if (!value || !value.enrolled) return t("exam.results.status.ne");
    if (value.status === "rng") return t("exam.results.status.rng");
    return value.total ?? "";
  };
  const exportConfig: ExportConfig<CumulativeRow> = {
    filteredRows: data.items,
    allRows: data.items,
    title: k("exportTitle", { arm: armLabel, term: data.term_name }),
    filenamePrefix: "cumulative-broadsheet",
    schoolName,
    periodLabel: full ? `${k("asOf", { term: data.term_name })} · ${g("summary.classAverage")}: ${n(data.class_average)}` : k("asOf", { term: data.term_name }),
    columns: [
      { header: g("columns.sn"), value: (row) => data.items.indexOf(row) + 1 },
      { header: g("columns.student"), value: (row) => row.student_name },
      { header: g("columns.id"), value: (row) => row.admission_no },
      ...data.subjects.flatMap((subject) => [
        ...data.terms.map((term) => ({
          header: `${subject.subject_name} · ${term.name}`,
          value: (row: CumulativeRow) => termExport(row.subjects[subject.subject_id], term),
        })),
        {
          header: `${subject.subject_name} · ${k("columns.avg")}`,
          value: (row: CumulativeRow) => {
            const cell = row.subjects[subject.subject_id];
            return cell.status === "ne" ? t("exam.results.status.ne") : (cell.average ?? "");
          },
        },
      ]),
      ...(full
        ? [
            { header: g("columns.cumulativeScore"), value: (row: CumulativeRow) => row.cumulative_score ?? "" },
            { header: k("columns.overallAverage"), value: (row: CumulativeRow) => row.average ?? "" },
            { header: g("columns.rank"), value: (row: CumulativeRow) => row.class_position ?? "" },
          ]
        : []),
    ],
  };

  let table: ReactNode;
  if (data.items.length === 0) {
    table = <Notice>{t("exam.results.notices.noStudents")}</Notice>;
  } else if (data.subjects.length === 0) {
    table = <Notice>{g("noSubjects")}</Notice>;
  } else {
    table = (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{k("caption", { arm: armLabel, term: data.term_name })}</caption>
          <thead className="bg-brand-tint">
            <tr>
              <th rowSpan={2} scope="col" className={`${BS_TH} text-left`}>
                {g("columns.sn")}
              </th>
              <th rowSpan={2} scope="col" className={`${BS_TH} ${BS_STICKY} bg-brand-tint text-left`}>
                {g("columns.student")}
              </th>
              {data.subjects.map((subject) => (
                <th key={subject.subject_id} colSpan={span} scope="colgroup" className={`${BS_TH} ${BS_EDGE} text-text-primary`}>
                  {subject.subject_name}
                </th>
              ))}
              {full ? (
                <>
                  <th rowSpan={2} scope="col" className={`${BS_TH} ${BS_EDGE}`}>
                    {g("columns.cumulativeScore")}
                  </th>
                  <th rowSpan={2} scope="col" className={BS_TH}>
                    {k("columns.overallAverage")}
                  </th>
                  <th rowSpan={2} scope="col" className={BS_TH}>
                    {g("columns.rank")}
                  </th>
                </>
              ) : null}
            </tr>
            <tr>
              {data.subjects.map((subject) => (
                <SubjectTermHeaders key={subject.subject_id} terms={data.terms} avg={k("columns.avg")} avgHelp={k("columns.avgHelp")} notYet={k("futureTerm")} />
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((row, index) => (
              <tr key={row.student_id} className="border-t border-border">
                <td className={`${BS_TD} text-left text-text-secondary`}>{index + 1}</td>
                <th scope="row" className={`${BS_STICKY} px-3 py-2 text-left font-normal`}>
                  <span className="block whitespace-nowrap font-medium text-text-primary">{row.student_name}</span>
                  <span className="block text-xs text-text-muted">{row.admission_no}</span>
                </th>
                {data.subjects.map((subject) => {
                  const cell = row.subjects[subject.subject_id];
                  if (cell.status === "ne") {
                    return (
                      <td key={subject.subject_id} colSpan={span} className={`${BS_TD} ${BS_EDGE}`}>
                        <StatusCode label={t("exam.results.status.ne")} help={t("exam.results.statusHelp.ne")} />
                      </td>
                    );
                  }
                  return <SubjectTermCells key={subject.subject_id} cell={cell} terms={data.terms} />;
                })}
                {full ? (
                  <>
                    <td className={`${BS_TD} ${BS_EDGE} font-semibold text-text-primary`}>{n(row.cumulative_score)}</td>
                    <td className={`${BS_TD} font-semibold text-text-primary`}>{n(row.average)}</td>
                    <td className={BS_TD}>
                      <PositionValue position={row.class_position} of={data.ranked_count} />
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <BroadsheetSummary
        classAverage={data.class_average}
        full={full}
        armLabel={armLabel}
        termLabel={k("asOfLabel")}
        termValue={data.term_name}
        studentCount={data.student_count}
        rankedCount={data.ranked_count}
      />

      {!full ? <Notice tone="warning">{g("ownScope")}</Notice> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ul aria-label={g("legend.label")} className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-secondary">
          <LegendItem
            marker={
              <span aria-hidden className="font-semibold text-success">
                ↑
              </span>
            }
          >
            {k("legend.up")}
          </LegendItem>
          <LegendItem
            marker={
              <span aria-hidden className="font-semibold text-warning">
                ↓
              </span>
            }
          >
            {k("legend.down")}
          </LegendItem>
          <LegendItem marker={<span className="font-semibold">{k("columns.avg")}</span>}>— {k("columns.avgHelp")}</LegendItem>
          <StatusLegendItems />
          <LegendItem marker={<span className="font-semibold uppercase">{t("exam.results.status.ne")}</span>}>— {k("legend.lateEnrolment")}</LegendItem>
        </ul>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <AnalyzeWithAiButton />
          {data.items.length > 0 ? <ExportMenu config={exportConfig} /> : null}
        </div>
      </div>

      {table}
    </div>
  );
}

function SubjectTermHeaders({ terms, avg, avgHelp, notYet }: { terms: Term[]; avg: string; avgHelp: string; notYet: string }) {
  return (
    <>
      {terms.map((term, index) => (
        <th
          key={term.id}
          scope="col"
          title={term.included ? undefined : notYet}
          className={`${BS_TH} ${index === 0 ? BS_EDGE : ""} whitespace-nowrap font-medium ${term.included ? "" : "text-text-muted"}`}
        >
          {term.name}
        </th>
      ))}
      <th scope="col" title={avgHelp} className={`${BS_TH} whitespace-nowrap`}>
        {avg}
      </th>
    </>
  );
}

/** One subject's term totals (with trend) and its cumulative AVG. */
function SubjectTermCells({ cell, terms }: { cell: CumulativeSubjectCell; terms: Term[] }) {
  const t = useTranslations();
  const n = useResultNumber();
  return (
    <>
      {terms.map((term, index) => (
        <td key={term.id} className={`${BS_TD} ${index === 0 ? BS_EDGE : ""}`}>
          <TermValue cell={term.included ? (cell.terms[term.id] ?? null) : null} included={term.included} />
        </td>
      ))}
      <td
        className={`${BS_TD} font-semibold text-text-primary`}
        title={t("exam.broadSheet.cumulative.avgDivisor", { count: cell.terms_enrolled })}
      >
        {n(cell.average)}
      </td>
    </>
  );
}

function TermValue({ cell, included }: { cell: CumulativeTermCell | null; included: boolean }) {
  const t = useTranslations();
  const k = (key: string) => t(`exam.broadSheet.cumulative.${key}`);
  const n = useResultNumber();
  if (!included) {
    return (
      <span title={k("futureTerm")} className="text-text-muted">
        —
      </span>
    );
  }
  if (!cell || !cell.enrolled) return <StatusCode label={t("exam.results.status.ne")} help={k("legend.lateEnrolment")} />;
  if (cell.status === "rng" || cell.status === null) return <StatusCode label={t("exam.results.status.rng")} help={t("exam.results.statusHelp.rng")} />;
  const incomplete = cell.status === "incomplete";
  const trend = cell.trend === "up" || cell.trend === "down" ? cell.trend : null;
  const spoken = [trend ? k(`trend.${trend}`) : null, incomplete ? t("exam.results.status.incomplete") : null].filter(Boolean).join(", ");
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-text-primary" title={spoken || undefined}>
      {n(cell.total)}
      {incomplete ? (
        <span aria-hidden className="text-text-muted">
          *
        </span>
      ) : null}
      {trend ? (
        <span aria-hidden className={`font-semibold ${trend === "up" ? "text-success" : "text-warning"}`}>
          {trend === "up" ? "↑" : "↓"}
        </span>
      ) : null}
      {spoken ? <span className="sr-only">{spoken}</span> : null}
    </span>
  );
}
