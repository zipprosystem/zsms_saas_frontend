"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { SetupPagination } from "@/components/setup/SetupPagination";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import type { ExportConfig } from "@/lib/export/exportTypes";
import { getClassResults, RESULTS_MAX_LIMIT, resultsQueryKeys } from "@/lib/exam/resultsApi";
import type { ClassResultRow, ClassResults, ResultsArms, ResultsViewer, TraitsStatus } from "@/lib/exam/results/resultsTypes";
import { failureMessage, InfoItem, Notice } from "@/components/exam/examEntryShared";
import { PositionValue, ResultStatusBadge, useResultNumber } from "@/components/exam/results/resultsDisplay";
import { ClassArmSelects, YearTermSelects } from "@/components/exam/results/ArmCardsView";
import { StudentTraitsPanel } from "@/components/exam/results/StudentTraitsPanel";
import { StudentReportViewer } from "@/components/exam/results/StudentReportViewer";
import { generateClassReportPdf, type ClassPdfJob } from "@/lib/exam/report/reportPayload";
import type { ResultsNavigate, ResultsParams } from "@/components/exam/results/ResultsScreen";

const TH = "px-3 py-2.5 text-left text-xs font-semibold text-text-secondary align-bottom";
const TD = "px-3 py-2.5 align-middle";

const TRAITS_CLASSES: Record<TraitsStatus, string> = {
  complete: "bg-category-green-tint text-success",
  partial: "bg-category-amber-tint text-warning",
  none: "border border-dashed border-border text-text-muted",
};

/** Level 2 of View Results: one arm's students, with rank, total average and the per-student actions. */
export function ClassResultList({
  arms,
  params,
  navigate,
  actingAs,
}: {
  arms: ResultsArms;
  params: ResultsParams;
  navigate: ResultsNavigate;
  actingAs: string;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.viewResults.${key}`, values);
  const pathname = usePathname();
  const { school } = useAuth();
  const n = useResultNumber();

  const current = arms.items.find((item) => item.class_arm_id === params.arm) ?? null;
  const termId = arms.term_id;

  const [page, setPage] = useState(1);
  const [traitsFor, setTraitsFor] = useState<{ id: string; name: string } | null>(null);
  const [traitsOpen, setTraitsOpen] = useState(false);
  const [reportFor, setReportFor] = useState<{ id: string; name: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [classPdf, setClassPdf] = useState<{ job: ClassPdfJob | null; error: string | null } | null>(null);

  useEffect(() => {
    setPage(1);
    setClassPdf(null);
  }, [params.arm, termId, actingAs]);

  // Class PDF = the backend's batch job (async, cached); this asks for it and shows where it stands.
  const classPdfMutation = useMutation({
    mutationFn: () => generateClassReportPdf(params.arm, termId),
    onSuccess: (result) => setClassPdf(result.ok ? { job: result.data, error: null } : { job: null, error: failureMessage(result, t) }),
    onError: () => setClassPdf({ job: null, error: t("setup.dataTable.errors.loadFailed") }),
  });

  const query = useQuery({
    queryKey: [...resultsQueryKeys.classResults(params.arm, termId, "all", page), "list", actingAs],
    queryFn: () => getClassResults(params.arm, termId, "all", page, RESULTS_MAX_LIMIT).then(throwIfTransient),
    enabled: !!current && !!termId,
  });
  const data = query.data?.ok ? query.data.data : null;
  const british = data?.assessment_mode === "grade_based";
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit), data.has_more ? page + 1 : 1) : 1;

  const backHref = `${pathname}?${new URLSearchParams({ year: arms.academic_year_id, term: termId })}`;
  const back = (
    <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
      <span aria-hidden>←</span> {k("list.backToClasses")}
    </Link>
  );

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Notice>{k("list.armNotInScope")}</Notice>
      </div>
    );
  }

  const armLabel = k("armName", { class: current.class_name, arm: current.arm_name });

  let body: ReactNode;
  if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!data) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else if (data.items.length === 0) {
    body = <Notice>{t("exam.results.notices.noStudents")}</Notice>;
  } else {
    body = (
      <>
        <StudentTable
          data={data}
          firstSerial={(data.page - 1) * data.limit + 1}
          onEnterTraits={(row) => {
            setTraitsFor({ id: row.student_id, name: row.student_name });
            setTraitsOpen(true);
          }}
          onViewReport={(row) => {
            setReportFor({ id: row.student_id, name: row.student_name });
            setReportOpen(true);
          }}
        />
        {totalPages > 1 ? (
          <SetupPagination
            page={page}
            totalPages={totalPages}
            onPreviousPage={() => setPage((value) => Math.max(1, value - 1))}
            onNextPage={() => setPage((value) => value + 1)}
          />
        ) : null}
      </>
    );
  }

  const exportConfig: ExportConfig<ClassResultRow> | null = data
    ? {
        filteredRows: data.items,
        allRows: data.items,
        title: k("list.exportTitle", { arm: armLabel, term: data.term_name }),
        filenamePrefix: "class-results",
        schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
        periodLabel: british ? data.term_name : `${data.term_name} · ${k("list.classAverage")}: ${n(data.class_average)}`,
        columns: [
          { header: k("columns.sn"), value: (row) => data.items.indexOf(row) + 1 + (data.page - 1) * data.limit },
          { header: k("columns.student"), value: (row) => row.student_name },
          { header: k("columns.id"), value: (row) => row.admission_no },
          ...(british
            ? [{ header: k("columns.subjectsGraded"), value: (row: ClassResultRow) => `${row.aggregate.subjects_counted}/${data.subjects.length}` }]
            : [
                { header: k("columns.rank"), value: (row: ClassResultRow) => row.aggregate.class_position ?? "" },
                { header: k("columns.totalAverage"), value: (row: ClassResultRow) => row.aggregate.average ?? "" },
                { header: k("columns.grandTotal"), value: (row: ClassResultRow) => row.aggregate.grand_total ?? "" },
                { header: k("columns.subjectsCounted"), value: (row: ClassResultRow) => row.aggregate.subjects_counted },
              ]),
          { header: k("columns.status"), value: (row) => t(`exam.results.status.${row.aggregate.status}`) },
        ],
      }
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {back}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <YearTermSelects arms={arms} navigate={(patch) => navigate({ ...patch })} />
        <ClassArmSelects arms={arms} current={current} navigate={navigate} />
      </div>

      {data ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-text-muted">{k("list.classAverage")}</span>
            <span className="text-3xl font-semibold text-text-primary">{british ? "—" : n(data.class_average)}</span>
            {british ? <span className="text-xs text-text-muted">{k("card.gradeBased")}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <InfoItem label={t("exam.results.info.classArm")} value={armLabel} />
            <InfoItem label={t("exam.results.info.term")} value={data.term_name} />
            <InfoItem
              label={t("exam.results.info.students")}
              value={british ? String(data.total) : t("exam.results.info.studentsRanked", { total: data.total, ranked: data.ranked_count })}
            />
            <InfoItem label={k("list.yourView")} value={<ViewerLabel viewer={data.viewer} data={data} />} />
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap justify-end gap-2">
            {data.viewer.report_scope === "full" ? (
              <Button
                type="button"
                variant="secondary"
                disabled={classPdfMutation.isPending || data.items.length === 0}
                onClick={() => classPdfMutation.mutate()}
                className="h-10 px-4 text-sm"
              >
                {classPdfMutation.isPending ? k("classPdf.requesting") : k("list.generateClassPdf")}
              </Button>
            ) : null}
            {exportConfig ? <ExportMenu config={exportConfig} /> : null}
          </div>
          {classPdf ? <ClassPdfNotice state={classPdf} /> : null}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">{body}</div>

      <StudentTraitsPanel student={traitsFor} termId={termId} isOpen={traitsOpen} onClose={() => setTraitsOpen(false)} />
      <StudentReportViewer student={reportFor} termId={termId} isOpen={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}

/** Where the class PDF request stands (the mock always answers "runs on the server, not here"). */
function ClassPdfNotice({ state }: { state: { job: ClassPdfJob | null; error: string | null } }) {
  const t = useTranslations("exam.viewResults.classPdf");
  if (state.error || !state.job) {
    return (
      <p role="alert" className="rounded-md border border-error px-3 py-2 text-sm text-error">
        {state.error ?? t("failed")}
      </p>
    );
  }
  const { job } = state;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary sm:flex-row sm:items-center sm:justify-between">
      <span>{job.message ?? t(job.status)}</span>
      {job.status === "ready" && job.download_url ? (
        <a href={job.download_url} className="shrink-0 font-medium text-accent hover:underline" target="_blank" rel="noopener noreferrer">
          {t("download")}
        </a>
      ) : null}
    </div>
  );
}

/** "Full report" / "Your subjects only: Mathematics" — the report scope the role gives. */
function ViewerLabel({ viewer, data }: { viewer: ResultsViewer; data: ClassResults }) {
  const t = useTranslations("exam.viewResults");
  const role = t(`roles.${viewer.role}`);
  if (viewer.report_scope === "full") return <span title={t("scope.fullHelp")}>{t("scope.full", { role })}</span>;
  const names = (viewer.visible_subject_ids ?? [])
    .map((id) => data.subjects.find((subject) => subject.subject_id === id)?.subject_name)
    .filter(Boolean)
    .join(", ");
  return <span title={t("scope.ownHelp")}>{t("scope.own", { role, subjects: names || "—" })}</span>;
}

function StudentTable({
  data,
  firstSerial,
  onEnterTraits,
  onViewReport,
}: {
  data: ClassResults;
  firstSerial: number;
  onEnterTraits: (row: ClassResultRow) => void;
  onViewReport: (row: ClassResultRow) => void;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.viewResults.${key}`, values);
  const n = useResultNumber();
  const british = data.assessment_mode === "grade_based";
  const showTraits = data.viewer.can_enter_traits;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        <caption className="sr-only">{k("list.caption")}</caption>
        <thead className="bg-brand-tint">
          <tr>
            <th className={TH}>{k("columns.sn")}</th>
            <th className={TH}>{k("columns.student")}</th>
            <th className={TH}>{k("columns.id")}</th>
            {british ? (
              <th className={TH}>{k("columns.subjectsGraded")}</th>
            ) : (
              <>
                <th className={TH}>{k("columns.rank")}</th>
                <th className={TH}>{k("columns.totalAverage")}</th>
              </>
            )}
            <th className={TH}>{k("columns.status")}</th>
            {showTraits ? <th className={TH}>{k("columns.traits")}</th> : null}
            <th className={`${TH} text-right`}>{k("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((row, index) => (
            <tr key={row.student_id} className="border-t border-border">
              <td className={`${TD} text-text-secondary`}>{firstSerial + index}</td>
              <td className={`${TD} font-medium text-text-primary`}>{row.student_name}</td>
              <td className={`${TD} text-text-secondary`}>{row.admission_no}</td>
              {british ? (
                <td className={TD}>{k("list.subjectsGraded", { graded: row.aggregate.subjects_counted, total: data.subjects.length })}</td>
              ) : (
                <>
                  <td className={TD}>
                    <PositionValue position={row.aggregate.class_position} of={data.ranked_count} />
                  </td>
                  <td className={TD}>
                    {row.aggregate.average === null ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <span className="flex flex-col">
                        <span className="font-semibold text-text-primary">{n(row.aggregate.average)}</span>
                        <span className="whitespace-nowrap text-xs text-text-muted">
                          {k("list.averageDetail", {
                            total: n(row.aggregate.grand_total),
                            count: row.aggregate.subjects_counted,
                            percent: n(row.aggregate.average),
                          })}
                        </span>
                      </span>
                    )}
                  </td>
                </>
              )}
              <td className={TD}>
                <ResultStatusBadge status={row.aggregate.status} />
              </td>
              {showTraits ? (
                <td className={TD}>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TRAITS_CLASSES[row.traits_status]}`}
                    >
                      {k(`traits.status.${row.traits_status}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEnterTraits(row)}
                      aria-label={k("traits.openFor", { name: row.student_name })}
                      className="whitespace-nowrap text-sm font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {row.traits_status === "none" ? k("traits.enter") : k("traits.edit")}
                    </button>
                  </div>
                </td>
              ) : null}
              <td className={`${TD} text-right`}>
                <button
                  type="button"
                  onClick={() => onViewReport(row)}
                  aria-label={k("list.viewReportFor", { name: row.student_name })}
                  className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-brand-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {k("list.viewReport")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
