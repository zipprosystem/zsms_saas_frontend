"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import {
  broadsheetQueryKeys,
  getProgressionBroadsheet,
  GLSAS_SUBJECTS,
  type ProgressionBroadsheet as ProgressionData,
  type ProgressionRow,
  type ProgressionSubjectCell,
  type ProgressionTerm,
  type ProgressionTermCell,
} from "@/lib/exam/broadsheet/broadsheetApi";
import { failureMessage, InfoItem, Notice } from "@/components/exam/examEntryShared";
import { useResultNumber } from "@/components/exam/results/resultsDisplay";
import { Segmented } from "@/components/ui/Segmented";
import { attainmentText, useAttainmentDisplay, type AttainmentDisplay } from "@/lib/exam/settings/examSettingsApi";
import { AnalyzeWithAiButton, BS_EDGE, BS_STICKY, BS_TD, BS_TH, LegendItem, StatusCode, useExportSchoolName } from "@/components/exam/broadsheet/broadsheetShared";

type Layout = "perTerm" | "allTerm";
type Level = ProgressionData["levels"][number];

/** VA bands, diverging from the target: well below → below → on target → above. Always shown with the signed number. */
type VaBand = "wellBelow" | "below" | "onTarget" | "above";
const VA_CLASSES: Record<VaBand, string> = {
  wellBelow: "text-error",
  below: "text-warning",
  onTarget: "text-success",
  above: "text-category-blue",
};

function vaBand(va: number): VaBand {
  if (va <= -2) return "wellBelow";
  if (va < 0) return "below";
  return va === 0 ? "onTarget" : "above";
}

function vaText(va: number): string {
  return va > 0 ? `+${va}` : va < 0 ? `−${Math.abs(va)}` : "0";
}

/**
 * Broad Sheet › Progression (British / grade-based classes — their
 * broadsheet). Two views of one payload:
 *   Per/Term — one term's group: per subject the attainment entered at
 *              each of the term's points (1A, 1B…), then GB (Grade Book
 *              /100) · MTG · CAG · VA.
 *   All Term — per subject GB1…GBn · AVG, T1…Tn (the term CAGs) · AVG.
 * Both views carry the student-level baselines beside the identity
 * columns, once per student (not per subject): CEM, and GL SAS ENG · Grade
 * · MAT · Grade.
 * Attainment grades (points, MTG, CAG, T1…Tn, T AVG) read as the grade's
 * weight or its label per the school's attainment_display setting
 * (default weight); VA is always CAG weight − MTG weight.
 * Empty boxes show "—". VA is coloured on a diverging scale AND shown as
 * a signed number with a spoken label. Every value comes from the backend
 * (broadsheetApi.ts).
 */
export function ProgressionBroadsheet({ armId, termId, armLabel, actingAs }: { armId: string; termId: string; armLabel: string; actingAs: string }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.broadSheet.progression.${key}`, values);
  const n = useResultNumber();
  const schoolName = useExportSchoolName();
  const display = useAttainmentDisplay();
  const [layout, setLayout] = useState<Layout>("perTerm");
  /** Per/Term: which term's group is shown ("" = the selected term). */
  const [shownTermId, setShownTermId] = useState("");

  const query = useQuery({
    queryKey: [...broadsheetQueryKeys.progression(armId, termId), actingAs],
    queryFn: () => getProgressionBroadsheet(armId, termId).then(throwIfTransient),
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

  const included = data.terms.filter((term) => term.included);
  const shownTerm = included.find((term) => term.id === shownTermId) ?? included.find((term) => term.id === data.term_id) ?? included[included.length - 1];
  const dash = "—";
  const ne = t("exam.results.status.ne");
  const full = data.viewer.report_scope === "full";

  // ----- Export (the layout on screen) -----
  const shown = (code: string | null): string | null => (code === null ? null : attainmentText(code, data.levels, display));
  const termCell = (cell: ProgressionSubjectCell, term: ProgressionTerm): ProgressionTermCell | null => (term.included ? (cell.terms[term.id] ?? null) : null);
  const exportText = (cell: ProgressionSubjectCell, term: ProgressionTerm | null, pick: (value: ProgressionTermCell) => string | number | null): string | number => {
    if (cell.status === "ne") return ne;
    if (!term) return "";
    const value = termCell(cell, term);
    if (!term.included) return "";
    if (!value || !value.enrolled) return ne;
    return pick(value) ?? "";
  };
  const subjectColumns: ExportColumn<ProgressionRow>[] = data.subjects.flatMap((subject): ExportColumn<ProgressionRow>[] => {
    const cellOf = (row: ProgressionRow) => row.subjects[subject.subject_id];
    const head = (label: string) => `${subject.subject_name} · ${label}`;
    if (layout === "perTerm" && shownTerm) {
      return [
        ...shownTerm.points.map((point) => ({ header: head(point.name), value: (row: ProgressionRow) => exportText(cellOf(row), shownTerm, (v) => shown(v.points[point.id] ?? null)) })),
        { header: head(k("columns.gb")), value: (row) => exportText(cellOf(row), shownTerm, (v) => v.gb) },
        { header: head(k("columns.mtg")), value: (row) => (cellOf(row).status === "ne" ? ne : (shown(cellOf(row).mtg) ?? "")) },
        { header: head(k("columns.cag")), value: (row) => exportText(cellOf(row), shownTerm, (v) => shown(v.cag)) },
        { header: head(k("columns.va")), value: (row) => exportText(cellOf(row), shownTerm, (v) => (v.va === null ? null : vaText(v.va))) },
      ];
    }
    const gbAverage = (row: ProgressionRow) => (cellOf(row).status === "ne" ? ne : (cellOf(row).gb_average ?? ""));
    const cagAverage = (row: ProgressionRow) => (cellOf(row).status === "ne" ? ne : (shown(cellOf(row).cag_average) ?? ""));
    return [
      ...data.terms.map((term) => ({ header: head(k("columns.gbN", { n: term.number })), value: (row: ProgressionRow) => exportText(cellOf(row), term, (v) => v.gb) })),
      { header: head(k("columns.gbAvg")), value: gbAverage },
      ...data.terms.map((term) => ({ header: head(k("columns.tN", { n: term.number })), value: (row: ProgressionRow) => exportText(cellOf(row), term, (v) => shown(v.cag)) })),
      { header: head(k("columns.tAvg")), value: cagAverage },
    ];
  });
  const exportConfig: ExportConfig<ProgressionRow> = {
    filteredRows: data.items,
    allRows: data.items,
    title: k("exportTitle", { arm: armLabel, view: k(`layout.${layout}`), term: layout === "perTerm" && shownTerm ? shownTerm.name : data.term_name }),
    filenamePrefix: "progression",
    schoolName,
    periodLabel: data.grade_scale_name ? `${data.term_name} · ${data.grade_scale_name}` : data.term_name,
    columns: [
      { header: t("exam.broadSheet.general.columns.sn"), value: (row) => data.items.indexOf(row) + 1 },
      { header: t("exam.broadSheet.general.columns.student"), value: (row) => row.student_name },
      { header: t("exam.broadSheet.general.columns.id"), value: (row) => row.admission_no },
      { header: k("columns.cem"), value: (row) => row.baselines.cem ?? "" },
      ...GLSAS_SUBJECTS.flatMap((key): ExportColumn<ProgressionRow>[] => [
        { header: `${k("columns.glsas")} · ${glsasLabel(key)}`, value: (row) => row.baselines.glsas[key].score ?? "" },
        { header: `${k("columns.glsas")} · ${glsasLabel(key)} ${k("columns.glsasGrade")}`, value: (row) => row.baselines.glsas[key].grade ?? "" },
      ]),
      ...subjectColumns,
    ],
  };

  // ----- Table -----
  const perTermSpan = (shownTerm?.points.length ?? 0) + 4;
  const allTermSpan = (data.terms.length + 1) * 2;
  const span = layout === "perTerm" ? perTermSpan : allTermSpan;

  let table: ReactNode;
  if (data.items.length === 0) {
    table = <Notice>{t("exam.results.notices.noStudents")}</Notice>;
  } else if (data.subjects.length === 0 || !shownTerm) {
    table = <Notice>{t("exam.broadSheet.general.noSubjects")}</Notice>;
  } else {
    const headerRows = layout === "perTerm" ? 3 : 2;
    table = (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{k("caption", { arm: armLabel, view: k(`layout.${layout}`) })}</caption>
          <thead className="bg-brand-tint">
            {layout === "perTerm" ? (
              <tr>
                <th rowSpan={headerRows} scope="col" className={`${BS_TH} text-left`}>
                  {t("exam.broadSheet.general.columns.sn")}
                </th>
                <th rowSpan={headerRows} scope="col" className={`${BS_TH} ${BS_STICKY} bg-brand-tint text-left`}>
                  {t("exam.broadSheet.general.columns.student")}
                </th>
                {baselineGroupHeaders(headerRows)}
                <th colSpan={span * data.subjects.length} scope="colgroup" className={`${BS_TH} ${BS_EDGE} text-text-primary`}>
                  {shownTerm.name}
                </th>
              </tr>
            ) : null}
            <tr>
              {layout === "allTerm" ? (
                <>
                  <th rowSpan={headerRows} scope="col" className={`${BS_TH} text-left`}>
                    {t("exam.broadSheet.general.columns.sn")}
                  </th>
                  <th rowSpan={headerRows} scope="col" className={`${BS_TH} ${BS_STICKY} bg-brand-tint text-left`}>
                    {t("exam.broadSheet.general.columns.student")}
                  </th>
                  {baselineGroupHeaders(headerRows)}
                </>
              ) : null}
              {data.subjects.map((subject) => (
                <th key={subject.subject_id} colSpan={span} scope="colgroup" className={`${BS_TH} ${BS_EDGE} text-text-primary`}>
                  {subject.subject_name}
                </th>
              ))}
            </tr>
            <tr>
              {baselineSubHeaders()}
              {data.subjects.map((subject) =>
                <Fragment key={subject.subject_id}>{layout === "perTerm" ? perTermHeaders(shownTerm) : allTermHeaders(data.terms)}</Fragment>,
              )}
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
                {baselineCells(row)}
                {data.subjects.map((subject) => {
                  const cell = row.subjects[subject.subject_id];
                  if (cell.status === "ne") {
                    return (
                      <td key={subject.subject_id} colSpan={span} className={`${BS_TD} ${BS_EDGE}`}>
                        <StatusCode label={ne} help={t("exam.results.statusHelp.ne")} />
                      </td>
                    );
                  }
                  if (layout === "perTerm") {
                    const value = termCell(cell, shownTerm);
                    if (!value || !value.enrolled) {
                      return (
                        <td key={subject.subject_id} colSpan={span} className={`${BS_TD} ${BS_EDGE}`}>
                          <StatusCode label={ne} help={t("exam.broadSheet.cumulative.legend.lateEnrolment")} />
                        </td>
                      );
                    }
                    return <Fragment key={subject.subject_id}>{perTermCells(shownTerm, value, cell.mtg, data.levels)}</Fragment>;
                  }
                  return <Fragment key={subject.subject_id}>{allTermCells(cell, data.terms, data.levels)}</Fragment>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-4 sm:p-5">
        <InfoItem label={t("exam.results.info.classArm")} value={armLabel} />
        <InfoItem label={t("exam.broadSheet.cumulative.asOfLabel")} value={data.term_name} />
        <InfoItem label={t("exam.results.info.students")} value={String(data.student_count)} />
        <InfoItem label={t("exam.results.info.gradeScale")} value={data.grade_scale_name ?? dash} />
      </div>

      {!full ? <Notice tone="warning">{k("ownScope")}</Notice> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <Segmented
            label={k("layout.label")}
            options={(["perTerm", "allTerm"] as const).map((value) => ({ value, label: k(`layout.${value}`) }))}
            value={layout}
            onChange={setLayout}
          />
          {layout === "perTerm" && included.length > 1 && shownTerm ? (
            <Segmented label={k("termPicker")} options={included.map((term) => ({ value: term.id, label: term.name }))} value={shownTerm.id} onChange={setShownTermId} />
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <AnalyzeWithAiButton />
          {data.items.length > 0 ? <ExportMenu config={exportConfig} /> : null}
        </div>
      </div>

      <ul aria-label={t("exam.broadSheet.general.legend.label")} className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-text-secondary">
        {(["wellBelow", "below", "onTarget", "above"] as const).map((band) => (
          <LegendItem
            key={band}
            marker={
              <span aria-hidden className={`font-semibold ${VA_CLASSES[band]}`}>
                {band === "wellBelow" ? "−2" : band === "below" ? "−1" : band === "onTarget" ? "0" : "+1"}
              </span>
            }
          >
            {k(`vaBands.${band}`)}
          </LegendItem>
        ))}
        <LegendItem marker={<span className="font-semibold">{k("columns.gb")}</span>}>— {k("help.gb")}</LegendItem>
        {data.levels.length > 0 ? (
          <LegendItem marker={<span className="font-semibold">{data.grade_scale_name ?? k("scale")}</span>}>
            {display === "weight" ? `${k("weights")}: ` : "— "}
            {data.levels
              .map((level) => {
                const name = level.label && level.label !== level.code ? `${level.code} ${level.label}` : level.code;
                return display === "weight" ? `${level.weight} = ${name}` : name;
              })
              .join(" · ")}
          </LegendItem>
        ) : null}
        <LegendItem marker={<span className="font-semibold uppercase">{ne}</span>}>— {t("exam.broadSheet.cumulative.legend.lateEnrolment")}</LegendItem>
        <LegendItem marker={<span className="font-semibold">{dash}</span>}>{k("noData")}</LegendItem>
      </ul>

      {table}
    </div>
  );

  function perTermHeaders(term: ProgressionTerm) {
    return (
      <>
        {term.points.map((point, index) => (
          <th key={point.id} scope="col" className={`${BS_TH} ${index === 0 ? BS_EDGE : ""} whitespace-nowrap font-medium`}>
            {point.name}
          </th>
        ))}
        <th scope="col" title={k("help.gb")} className={`${BS_TH} ${term.points.length === 0 ? BS_EDGE : ""} whitespace-nowrap`}>
          {k("columns.gb")}
        </th>
        <th scope="col" title={k("help.mtg")} className={`${BS_TH} whitespace-nowrap`}>
          {k("columns.mtg")}
        </th>
        <th scope="col" title={k("help.cag")} className={`${BS_TH} whitespace-nowrap`}>
          {k("columns.cag")}
        </th>
        <th scope="col" title={k("help.va")} className={`${BS_TH} whitespace-nowrap`}>
          {k("columns.va")}
        </th>
      </>
    );
  }

  function allTermHeaders(terms: ProgressionTerm[]) {
    const termHeader = (term: ProgressionTerm, label: string, first: boolean) => (
      <th
        key={`${label}-${term.id}`}
        scope="col"
        title={term.included ? term.name : t("exam.broadSheet.cumulative.futureTerm")}
        className={`${BS_TH} ${first ? BS_EDGE : ""} whitespace-nowrap font-medium ${term.included ? "" : "text-text-muted"}`}
      >
        {label}
      </th>
    );
    return (
      <>
        {terms.map((term, index) => termHeader(term, k("columns.gbN", { n: term.number }), index === 0))}
        <th scope="col" title={k("help.gbAvg")} className={`${BS_TH} whitespace-nowrap`}>
          {k("columns.gbAvg")}
        </th>
        {terms.map((term) => termHeader(term, k("columns.tN", { n: term.number }), false))}
        <th scope="col" title={k("help.tAvg")} className={`${BS_TH} whitespace-nowrap`}>
          {k("columns.tAvg")}
        </th>
      </>
    );
  }

  function perTermCells(term: ProgressionTerm, value: ProgressionTermCell, mtg: string | null, levels: Level[]) {
    return (
      <>
        {term.points.map((point, index) => (
          <td key={point.id} className={`${BS_TD} ${index === 0 ? BS_EDGE : ""}`}>
            <Grade code={value.points[point.id] ?? null} levels={levels} display={display} />
          </td>
        ))}
        <td className={`${BS_TD} ${term.points.length === 0 ? BS_EDGE : ""} text-text-primary`}>{value.gb === null ? <Empty /> : n(value.gb)}</td>
        <td className={BS_TD}>
          <Grade code={mtg} levels={levels} display={display} />
        </td>
        <td className={`${BS_TD} font-semibold`}>
          <Grade code={value.cag} levels={levels} display={display} />
        </td>
        <td className={BS_TD}>
          <Va va={value.va} />
        </td>
      </>
    );
  }

  function allTermCells(cell: ProgressionSubjectCell, terms: ProgressionTerm[], levels: Level[]) {
    const termValue = (term: ProgressionTerm, render: (value: ProgressionTermCell) => ReactNode, first: boolean) => {
      const value = termCell(cell, term);
      let content: ReactNode;
      if (!term.included) content = <Empty title={t("exam.broadSheet.cumulative.futureTerm")} />;
      else if (!value || !value.enrolled) content = <StatusCode label={ne} help={t("exam.broadSheet.cumulative.legend.lateEnrolment")} />;
      else content = render(value);
      return (
        <td key={term.id} className={`${BS_TD} ${first ? BS_EDGE : ""}`}>
          {content}
        </td>
      );
    };
    return (
      <>
        {terms.map((term, index) => termValue(term, (value) => (value.gb === null ? <Empty /> : <span className="text-text-primary">{n(value.gb)}</span>), index === 0))}
        <td className={`${BS_TD} font-semibold text-text-primary`}>{cell.gb_average === null ? <Empty /> : n(cell.gb_average)}</td>
        {terms.map((term) => termValue(term, (value) => <Grade code={value.cag} levels={levels} display={display} />, false))}
        <td className={`${BS_TD} font-semibold`}>
          <Grade code={cell.cag_average} levels={levels} display={display} />
        </td>
      </>
    );
  }

  // ----- Student-level baselines (once per student, beside the identity) -----
  function glsasLabel(key: (typeof GLSAS_SUBJECTS)[number]) {
    return k(key === "eng" ? "columns.glsasEng" : "columns.glsasMat");
  }

  /** CEM spans every header row; GL SAS's group label spans all but the last (its sub-columns sit there). */
  function baselineGroupHeaders(rows: number) {
    return (
      <>
        <th rowSpan={rows} scope="col" title={k("help.cem")} className={`${BS_TH} ${BS_EDGE} whitespace-nowrap`}>
          {k("columns.cem")}
        </th>
        <th rowSpan={rows - 1} colSpan={GLSAS_SUBJECTS.length * 2} scope="colgroup" title={k("help.glsas")} className={`${BS_TH} ${BS_EDGE} whitespace-nowrap`}>
          {k("columns.glsas")}
        </th>
      </>
    );
  }

  function baselineSubHeaders() {
    return GLSAS_SUBJECTS.map((key, index) => (
      <Fragment key={key}>
        <th scope="col" title={k("help.glsas")} className={`${BS_TH} ${index === 0 ? BS_EDGE : ""} whitespace-nowrap font-medium`}>
          {glsasLabel(key)}
        </th>
        <th scope="col" title={k("help.glsasGrade")} className={`${BS_TH} whitespace-nowrap font-medium`}>
          {k("columns.glsasGrade")}
        </th>
      </Fragment>
    ));
  }

  function baselineCells(row: ProgressionRow) {
    const { cem, glsas } = row.baselines;
    return (
      <>
        <td className={`${BS_TD} ${BS_EDGE} text-text-primary`}>{cem === null ? <Empty /> : cem}</td>
        {GLSAS_SUBJECTS.map((key, index) => (
          <Fragment key={key}>
            <td className={`${BS_TD} ${index === 0 ? BS_EDGE : ""} text-text-primary`}>{glsas[key].score === null ? <Empty /> : glsas[key].score}</td>
            <td className={`${BS_TD} text-text-primary`}>{glsas[key].grade ?? <Empty />}</td>
          </Fragment>
        ))}
      </>
    );
  }

}

/** VA as a signed number on the diverging colour scale, with the band + a spoken label (never colour alone). */
function Va({ va }: { va: number | null }) {
  const t = useTranslations();
  if (va === null) return <Empty />;
  const band = vaBand(va);
  const spoken = va > 0 ? t("exam.results.va.above", { count: va }) : va < 0 ? t("exam.results.va.below", { count: Math.abs(va) }) : t("exam.results.va.onTarget");
  return (
    <span title={`${t(`exam.broadSheet.progression.vaBands.${band}`)} — ${spoken}`} className={`font-semibold ${VA_CLASSES[band]}`}>
      <span aria-hidden>{vaText(va)}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

function Empty({ title }: { title?: string }) {
  return (
    <span title={title} className="text-text-muted">
      —
    </span>
  );
}

/**
 * An attainment grade as the school shows it — its weight (default) or its
 * label — with the other form on hover ("4 = S — Secure").
 */
function Grade({ code, levels, display }: { code: string | null; levels: Level[]; display: AttainmentDisplay }) {
  if (!code) return <Empty />;
  const level = levels.find((item) => item.code === code);
  const name = level && level.label !== code ? `${code} — ${level.label}` : code;
  const title = level ? (display === "weight" ? `${level.weight} = ${name}` : level.label !== code ? name : undefined) : undefined;
  return (
    <span title={title} className="text-text-primary">
      {attainmentText(code, levels, display)}
    </span>
  );
}
