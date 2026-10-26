"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { getStudentResult, resultsQueryKeys } from "@/lib/exam/resultsApi";
import { failureMessage, InfoItem, Notice } from "@/components/exam/examEntryShared";
import { PositionValue, ResultStatusBadge, useResultNumber, VaValue } from "@/components/exam/results/resultsDisplay";

const TH = "px-3 py-2 text-left text-xs font-semibold text-text-secondary align-bottom";
const TD = "px-3 py-2 align-middle";

type StudentResultPanelProps = {
  /** The student to show (kept while the panel animates closed). `name` titles the panel while the result loads. */
  student: { id: string; name: string } | null;
  isOpen: boolean;
  termId: string;
  actingAs: string;
  onClose: () => void;
};

/**
 * One student's full computed result for the term (GET erp/results/:student_id):
 * each subject's total / grade / position (British: CAG, target, VA), the
 * per-subject cumulative, and the term aggregate. Display only.
 */
export function StudentResultPanel({ student, isOpen, termId, actingAs, onClose }: StudentResultPanelProps) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.results.${key}`, values);
  const n = useResultNumber();

  const query = useQuery({
    queryKey: [...resultsQueryKeys.studentResult(student?.id ?? "", termId), actingAs],
    queryFn: () => getStudentResult(student?.id ?? "", termId).then(throwIfTransient),
    enabled: !!student && !!termId,
  });
  const result = query.data?.ok ? query.data.data : null;
  const british = result?.assessment_mode === "grade_based";

  let body: ReactNode;
  if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!result) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else {
    const { aggregate } = result;
    body = (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-border p-4 sm:grid-cols-3">
          <InfoItem label={k("columns.status")} value={<ResultStatusBadge status={aggregate.status} />} />
          {british ? (
            <>
              <InfoItem label={k("info.gradeScale")} value={result.grade_scale_name ?? "—"} />
              <InfoItem label={k("student.subjectsWithCag")} value={aggregate.subjects_counted} />
            </>
          ) : (
            <>
              <InfoItem label={k("columns.grandTotal")} value={n(aggregate.grand_total)} />
              <InfoItem label={k("columns.average")} value={n(aggregate.average)} />
              <InfoItem label={k("columns.overallGrade")} value={aggregate.overall_grade ?? "—"} />
              <InfoItem label={k("columns.position")} value={<PositionValue position={aggregate.class_position} of={result.ranked_count} />} />
              <InfoItem label={k("columns.overallGpa")} value={n(aggregate.gpa)} />
              <InfoItem label={k("student.cumulativeAverage")} value={n(aggregate.cumulative_average)} />
            </>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-max border-collapse text-sm">
            <caption className="sr-only">{k("student.subjectsCaption", { name: result.student.name })}</caption>
            <thead className="bg-brand-tint">
              {british ? (
                <tr>
                  <th className={TH}>{k("columns.subject")}</th>
                  <th className={TH}>{k("columns.target")}</th>
                  <th className={TH}>{k("columns.cag")}</th>
                  <th className={TH}>{k("columns.va")}</th>
                  <th className={TH}>{k("columns.cumulativeAttainment")}</th>
                  <th className={TH}>{k("columns.status")}</th>
                </tr>
              ) : (
                <tr>
                  <th className={TH}>{k("columns.subject")}</th>
                  <th className={TH}>{k("columns.unit")}</th>
                  <th className={TH}>{k("columns.total")}</th>
                  <th className={TH}>{k("columns.grade")}</th>
                  <th className={TH}>{k("columns.remark")}</th>
                  <th className={TH}>{k("columns.gpa")}</th>
                  <th className={TH}>{k("columns.subjectPosition")}</th>
                  <th className={TH}>{k("columns.cumulativeAverage")}</th>
                  <th className={TH}>{k("columns.status")}</th>
                </tr>
              )}
            </thead>
            <tbody>
              {result.subjects.map((subject) => (
                <tr key={subject.subject_id} className="border-t border-border">
                  <td className={`${TD} font-medium text-text-primary`}>{subject.subject_name}</td>
                  {british ? (
                    <>
                      <td className={TD}>{subject.mtg ?? "—"}</td>
                      <td className={`${TD} font-semibold text-text-primary`}>{subject.cag ?? "—"}</td>
                      <td className={TD}>
                        <VaValue va={subject.va} />
                      </td>
                      <td className={TD}>
                        {subject.cumulative_grade ?? "—"}
                        {subject.cumulative_terms ? (
                          <span className="ml-1 text-xs text-text-muted">{k("student.overTerms", { count: subject.cumulative_terms })}</span>
                        ) : null}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={TD}>{subject.unit !== null ? n(subject.unit) : <span className="text-text-muted">{k("unitDefault")}</span>}</td>
                      <td className={`${TD} font-semibold text-text-primary`}>{n(subject.total)}</td>
                      <td className={TD}>{subject.grade ?? "—"}</td>
                      <td className={TD}>{subject.remark ?? "—"}</td>
                      <td className={TD}>{n(subject.gpa)}</td>
                      <td className={TD}>
                        <PositionValue position={subject.subject_position} of={result.ranked_count} />
                      </td>
                      <td className={TD}>
                        {n(subject.cumulative_average)}
                        {subject.cumulative_average !== null && subject.cumulative_terms ? (
                          <span className="ml-1 text-xs text-text-muted">{k("student.overTerms", { count: subject.cumulative_terms })}</span>
                        ) : null}
                      </td>
                    </>
                  )}
                  <td className={TD}>
                    <ResultStatusBadge status={subject.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-text-muted">{british ? k("student.britishNote") : k("student.generalNote")}</p>
      </div>
    );
  }

  return (
    <SlideOverPanel
      isOpen={isOpen && !!student}
      onClose={onClose}
      size="wide"
      title={result?.student.name ?? student?.name ?? ""}
      subtitle={result ? k("student.subtitle", { admissionNo: result.student.admission_no, className: result.class_name, arm: result.arm_name, term: result.term_name }) : undefined}
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      {body}
    </SlideOverPanel>
  );
}
