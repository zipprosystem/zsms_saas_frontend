"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import type { ExportConfig } from "@/lib/export/exportTypes";
import { broadsheetQueryKeys, getBroadsheet, type Broadsheet, type BroadsheetCell, type BroadsheetSubject } from "@/lib/exam/broadsheet/broadsheetApi";
import { failureMessage, Notice } from "@/components/exam/examEntryShared";
import { PositionValue, useResultNumber } from "@/components/exam/results/resultsDisplay";
import {
  BroadsheetSummary,
  BS_EDGE as SUBJECT_EDGE,
  BS_STICKY as STICKY,
  BS_TD as TD,
  BS_TH as TH,
  LegendItem,
  StatusCode,
  StatusLegendItems,
  AnalyzeWithAiButton,
  useExportSchoolName,
} from "@/components/exam/broadsheet/broadsheetShared";

/** One export row: a student, or one of the foot stats (subject average / highest / lowest). */
type ExportRow = { kind: "student"; index: number; row: Broadsheet["items"][number] } | { kind: "stat"; stat: "average" | "highest" | "lowest" };

/**
 * Broad Sheet › Broadsheet (General, one term): students × subjects with
 * each subject's CA · Exam · Total, the subject average / highest / lowest
 * at the foot, and each student's cumulative score, average and rank.
 * A total is marked above / below its subject average by colour AND a
 * glyph + spoken text. RNG / NE show as the code. Every number comes from
 * the backend (broadsheetApi.ts) — nothing is computed here.
 */
export function GeneralBroadsheet({ armId, termId, armLabel, actingAs }: { armId: string; termId: string; armLabel: string; actingAs: string }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.broadSheet.general.${key}`, values);
  const n = useResultNumber();
  const schoolName = useExportSchoolName();

  const query = useQuery({
    queryKey: [...broadsheetQueryKeys.general(armId, termId), actingAs],
    queryFn: () => getBroadsheet(armId, termId).then(throwIfTransient),
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
  const caHeader = data.ca_out_of !== null ? k("columns.caOutOf", { max: n(data.ca_out_of) }) : k("columns.ca");
  const examHeader = data.exam_out_of !== null ? k("columns.examOutOf", { max: n(data.exam_out_of) }) : k("columns.exam");
  const code = (cell: BroadsheetCell) => t(`exam.results.status.${cell.status}`);
  const hasNumbers = (cell: BroadsheetCell) => cell.status !== "rng" && cell.status !== "ne";

  const exportRows: ExportRow[] = [
    ...data.items.map((row, index): ExportRow => ({ kind: "student", index, row })),
    { kind: "stat", stat: "average" },
    { kind: "stat", stat: "highest" },
    { kind: "stat", stat: "lowest" },
  ];
  const statValue = (subject: BroadsheetSubject, stat: "average" | "highest" | "lowest") => subject[stat] ?? "";
  const exportConfig: ExportConfig<ExportRow> = {
    filteredRows: exportRows,
    allRows: exportRows,
    title: k("exportTitle", { arm: armLabel, term: data.term_name }),
    filenamePrefix: "broadsheet",
    schoolName,
    periodLabel: full ? `${data.term_name} · ${k("summary.classAverage")}: ${n(data.class_average)}` : data.term_name,
    columns: [
      { header: k("columns.sn"), value: (x) => (x.kind === "student" ? x.index + 1 : "") },
      { header: k("columns.student"), value: (x) => (x.kind === "student" ? x.row.student_name : k(`foot.${x.stat}`)) },
      { header: k("columns.id"), value: (x) => (x.kind === "student" ? x.row.admission_no : "") },
      ...data.subjects.flatMap((subject) => [
        {
          header: `${subject.subject_name} · ${caHeader}`,
          value: (x: ExportRow) => (x.kind === "student" ? cellExport(x.row.subjects[subject.subject_id], "ca", code) : ""),
        },
        {
          header: `${subject.subject_name} · ${examHeader}`,
          value: (x: ExportRow) => (x.kind === "student" ? cellExport(x.row.subjects[subject.subject_id], "exam", code) : ""),
        },
        {
          header: `${subject.subject_name} · ${k("columns.total")}`,
          value: (x: ExportRow) => (x.kind === "student" ? cellExport(x.row.subjects[subject.subject_id], "total", code) : statValue(subject, x.stat)),
        },
      ]),
      ...(full
        ? [
            { header: k("columns.cumulativeScore"), value: (x: ExportRow) => (x.kind === "student" ? (x.row.cumulative_score ?? "") : "") },
            { header: k("columns.average"), value: (x: ExportRow) => (x.kind === "student" ? (x.row.average ?? "") : "") },
            { header: k("columns.rank"), value: (x: ExportRow) => (x.kind === "student" ? (x.row.class_position ?? "") : "") },
          ]
        : []),
    ],
  };

  const footRow = (stat: "average" | "highest" | "lowest") => (
    <tr className="border-t border-border bg-background">
      <th scope="row" colSpan={2} className={`${STICKY} bg-background px-3 py-2 text-left text-xs font-semibold text-text-secondary`}>
        {k(`foot.${stat}`)}
      </th>
      {data.subjects.map((subject) => (
        <td key={subject.subject_id} colSpan={3} className={`${TD} ${SUBJECT_EDGE} font-semibold text-text-primary`}>
          {n(subject[stat])}
          {stat === "average" ? <span className="block text-[10px] font-normal text-text-muted">{k("foot.enrolled", { count: subject.enrolled_count })}</span> : null}
        </td>
      ))}
      {full ? <td colSpan={3} className={`${TD} ${SUBJECT_EDGE}`} /> : null}
    </tr>
  );

  let table: ReactNode;
  if (data.items.length === 0) {
    table = <Notice>{t("exam.results.notices.noStudents")}</Notice>;
  } else if (data.subjects.length === 0) {
    table = <Notice>{k("noSubjects")}</Notice>;
  } else {
    table = (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{k("caption", { arm: armLabel, term: data.term_name })}</caption>
          <thead className="bg-brand-tint">
            <tr>
              <th rowSpan={2} scope="col" className={`${TH} text-left`}>
                {k("columns.sn")}
              </th>
              <th rowSpan={2} scope="col" className={`${TH} ${STICKY} bg-brand-tint text-left`}>
                {k("columns.student")}
              </th>
              {data.subjects.map((subject) => (
                <th key={subject.subject_id} colSpan={3} scope="colgroup" className={`${TH} ${SUBJECT_EDGE} text-text-primary`}>
                  {subject.subject_name}
                </th>
              ))}
              {full ? (
                <>
                  <th rowSpan={2} scope="col" className={`${TH} ${SUBJECT_EDGE}`}>
                    {k("columns.cumulativeScore")}
                  </th>
                  <th rowSpan={2} scope="col" className={TH}>
                    {k("columns.average")}
                  </th>
                  <th rowSpan={2} scope="col" className={TH}>
                    {k("columns.rank")}
                  </th>
                </>
              ) : null}
            </tr>
            <tr>
              {data.subjects.map((subject) => (
                <SubjectSubHeaders key={subject.subject_id} ca={caHeader} exam={examHeader} total={k("columns.total")} />
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((row, index) => (
              <tr key={row.student_id} className="border-t border-border">
                <td className={`${TD} text-left text-text-secondary`}>{index + 1}</td>
                <th scope="row" className={`${STICKY} px-3 py-2 text-left font-normal`}>
                  <span className="block whitespace-nowrap font-medium text-text-primary">{row.student_name}</span>
                  <span className="block text-xs text-text-muted">{row.admission_no}</span>
                </th>
                {data.subjects.map((subject) => {
                  const cell = row.subjects[subject.subject_id];
                  if (!hasNumbers(cell)) {
                    return (
                      <td key={subject.subject_id} colSpan={3} className={`${TD} ${SUBJECT_EDGE}`}>
                        <StatusCode label={code(cell)} help={t(`exam.results.statusHelp.${cell.status}`)} />
                      </td>
                    );
                  }
                  return (
                    <SubjectCells
                      key={subject.subject_id}
                      cell={cell}
                      average={subject.average}
                      incompleteLabel={t("exam.results.status.incomplete")}
                    />
                  );
                })}
                {full ? (
                  <>
                    <td className={`${TD} ${SUBJECT_EDGE} font-semibold text-text-primary`}>{n(row.cumulative_score)}</td>
                    <td className={`${TD} font-semibold text-text-primary`}>{n(row.average)}</td>
                    <td className={TD}>
                      <PositionValue position={row.class_position} of={data.ranked_count} />
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {footRow("average")}
            {footRow("highest")}
            {footRow("lowest")}
          </tfoot>
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
        termLabel={t("exam.results.info.term")}
        termValue={data.term_name}
        studentCount={data.student_count}
        rankedCount={data.ranked_count}
      />

      {!full ? <Notice tone="warning">{k("ownScope")}</Notice> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ul aria-label={k("legend.label")} className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-secondary">
          <LegendItem
            marker={
              <span aria-hidden className="font-semibold text-success">
                ▲
              </span>
            }
          >
            {k("legend.above")}
          </LegendItem>
          <LegendItem
            marker={
              <span aria-hidden className="font-semibold text-error">
                ▼
              </span>
            }
          >
            {k("legend.below")}
          </LegendItem>
          <StatusLegendItems />
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

function SubjectSubHeaders({ ca, exam, total }: { ca: string; exam: string; total: string }) {
  return (
    <>
      <th scope="col" className={`${TH} ${SUBJECT_EDGE} whitespace-nowrap font-medium`}>
        {ca}
      </th>
      <th scope="col" className={`${TH} whitespace-nowrap font-medium`}>
        {exam}
      </th>
      <th scope="col" className={`${TH} whitespace-nowrap`}>
        {total}
      </th>
    </>
  );
}

/** CA · Exam · Total for one student × subject. The total carries the above / below-average cue (colour + glyph + spoken text). */
function SubjectCells({ cell, average, incompleteLabel }: { cell: BroadsheetCell; average: number | null; incompleteLabel: string }) {
  const t = useTranslations("exam.broadSheet.general");
  const n = useResultNumber();
  const tone = cell.vs_average === "above" ? "text-success" : cell.vs_average === "below" ? "text-error" : "text-text-primary";
  const glyph = cell.vs_average === "above" ? "▲" : cell.vs_average === "below" ? "▼" : null;
  const spoken = cell.vs_average ? t(`vsAverage.${cell.vs_average}`, { average: n(average) }) : null;
  const incomplete = cell.status === "incomplete";
  return (
    <>
      <td className={`${TD} ${SUBJECT_EDGE} text-text-secondary`}>{n(cell.ca)}</td>
      <td className={`${TD} text-text-secondary`}>{n(cell.exam)}</td>
      <td className={`${TD} font-semibold ${tone}`} title={[spoken, incomplete ? incompleteLabel : null].filter(Boolean).join(" · ") || undefined}>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          {n(cell.total)}
          {incomplete ? (
            <span aria-hidden className="text-text-muted">
              *
            </span>
          ) : null}
          {glyph ? (
            <span aria-hidden className="text-[10px]">
              {glyph}
            </span>
          ) : null}
        </span>
        {spoken || incomplete ? <span className="sr-only">{[spoken, incomplete ? incompleteLabel : null].filter(Boolean).join(", ")}</span> : null}
      </td>
    </>
  );
}

function cellExport(cell: BroadsheetCell | undefined, field: "ca" | "exam" | "total", code: (cell: BroadsheetCell) => string): string | number {
  if (!cell) return "";
  if (cell.status === "rng" || cell.status === "ne") return code(cell);
  return cell[field] ?? "";
}
