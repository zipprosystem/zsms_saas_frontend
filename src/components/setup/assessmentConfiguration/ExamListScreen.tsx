"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import { Notice, failureMessage, useMockActingAs } from "@/components/exam/examEntryShared";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, isDevBypassUnavailable } from "@/lib/setup/crudTypes";
import { EXAM_USES_MOCK, examQueryKeys, getEntryOptions, listExams, updateExamVisibility, type ExamVisibilityInput } from "@/lib/exam/examApi";
import { MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import type { Exam } from "@/lib/exam/examTypes";

const TH = "px-3 py-2.5 text-left text-xs font-semibold text-text-secondary align-bottom";
const TD = "px-3 py-2.5 align-middle";

/**
 * Setup › Assessment Configuration › Exam List — the British (grade-based)
 * points each term auto-creates (1A, 1B…), with their on-report switches
 * (spec §2.3; contract: PUT erp/exams/:id in examApi.ts):
 *   - Show Grade Book (show_grade_book): off hides that point's GB column
 *     on the report grid, the report's subject-card GB figure (when it's
 *     the report point), the Academic Report GB column, and — when no
 *     point of the term shows it — the term's Progression GB column.
 *   - Show Value Added (show_va): off hides VA (CAG − MTG) and its average
 *     on that point's reports; Progression uses the term's last point.
 * Both default on and only hide — the data and the results are untouched.
 * Minimal first cut: names and entry cutoffs aren't editable here yet.
 * Admin-gated (same mock gate as Grades).
 */
export function ExamListScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string>) => t(`setup.examList.${key}`, values);
  const [actingAs] = useMockActingAs();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [yearPick, setYearPick] = useState("");
  const [termPick, setTermPick] = useState("");

  const optionsQuery = useQuery({
    queryKey: [...examQueryKeys.entryOptions(yearPick || null), actingAs],
    queryFn: () => getEntryOptions(yearPick || null).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const options = optionsQuery.data?.ok ? optionsQuery.data.data : null;
  const yearId = options?.academic_year_id ?? "";
  const terms = options?.terms ?? [];
  const termId = terms.some((term) => term.id === termPick) ? termPick : (terms[0]?.id ?? "");

  const examsQuery = useQuery({
    queryKey: examQueryKeys.exams(yearId, termId, "grade_based"),
    queryFn: () => listExams(yearId, termId, "grade_based").then(throwIfTransient),
    enabled: !!yearId && !!termId,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const exams = examsQuery.data?.ok ? examsQuery.data.data : [];

  const mutation = useMutation({
    mutationFn: ({ exam, input }: { exam: Exam; input: ExamVisibilityInput }) => updateExamVisibility(exam.id, input),
    onSuccess: (result) => {
      if (!result.ok) {
        showToast(failureMessage(result, t) ?? k("saveFailed"), "error");
        return;
      }
      // The flags feed the Academic Report, report cards and Progression — refetch every exam read.
      void queryClient.invalidateQueries({ queryKey: examQueryKeys.all });
      showToast(k("saved", { name: result.data.name }));
    },
    onError: () => showToast(k("saveFailed"), "error"),
  });

  if (EXAM_USES_MOCK && actingAs !== MOCK_ADMIN) return <Notice>{k("adminOnly")}</Notice>;

  /** The value on screen: the pending one while this exam's save is in flight. */
  const flag = (exam: Exam, key: keyof ExamVisibilityInput): boolean => {
    const pending = mutation.isPending && mutation.variables?.exam.id === exam.id ? mutation.variables.input[key] : undefined;
    return pending ?? exam[key];
  };

  const checkbox = (exam: Exam, key: keyof ExamVisibilityInput, label: string) => (
    <label className="inline-flex items-center gap-2 text-sm text-text-primary">
      <input
        type="checkbox"
        checked={flag(exam, key)}
        disabled={mutation.isPending}
        onChange={(event) => mutation.mutate({ exam, input: { [key]: event.target.checked } })}
        aria-label={`${label} — ${exam.name}`}
        className="h-4 w-4 accent-accent disabled:cursor-not-allowed"
      />
      <span className="sm:sr-only">{label}</span>
    </label>
  );

  let body;
  if (optionsQuery.isPending || (examsQuery.isPending && examsQuery.fetchStatus !== "idle")) {
    body = <Notice>{k("loading")}</Notice>;
  } else if (!options || (yearId && termId && !examsQuery.data?.ok)) {
    const failed = options ? examsQuery.data : optionsQuery.data;
    body = <Notice tone={isDevBypassUnavailable(failed) ? "warning" : "error"}>{failureMessage(failed, t) ?? k("loadFailed")}</Notice>;
  } else if (exams.length === 0) {
    body = <Notice>{k("empty")}</Notice>;
  } else {
    body = (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{k("caption")}</caption>
          <thead className="bg-brand-tint">
            <tr>
              <th scope="col" className={TH}>{k("columns.point")}</th>
              <th scope="col" className={TH}>{k("columns.report")}</th>
              <th scope="col" className={`${TH} hidden sm:table-cell`}>{k("columns.closes")}</th>
              <th scope="col" className={`${TH} hidden sm:table-cell`}>{k("columns.showGradeBook")}</th>
              <th scope="col" className={`${TH} hidden sm:table-cell`}>{k("columns.showVa")}</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id} className="border-t border-border">
                <th scope="row" className={`${TD} text-left font-semibold text-text-primary`}>
                  {exam.name}
                  {/* Phone: the switches sit under the name. */}
                  <div className="mt-2 flex flex-col gap-1.5 font-normal sm:hidden">
                    {checkbox(exam, "show_grade_book", k("columns.showGradeBook"))}
                    {checkbox(exam, "show_va", k("columns.showVa"))}
                  </div>
                </th>
                <td className={`${TD} text-text-secondary`}>{exam.report_variant ? t(`exam.marks.variants.${exam.report_variant}`) : "—"}</td>
                <td className={`${TD} hidden text-text-secondary sm:table-cell`}>{exam.entry_closes_on ?? k("noCutoff")}</td>
                <td className={`${TD} hidden sm:table-cell`}>{checkbox(exam, "show_grade_book", k("columns.showGradeBook"))}</td>
                <td className={`${TD} hidden sm:table-cell`}>{checkbox(exam, "show_va", k("columns.showVa"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-primary">{k("title")}</h1>
        <p className="text-sm text-text-secondary">{k("subtitle")}</p>
      </div>
      {options ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <div className="w-full sm:w-56">
            <SelectField
              id="exam-list-year"
              label={k("year")}
              value={yearId}
              onChange={(event) => {
                setYearPick(event.target.value);
                setTermPick("");
              }}
            >
              {options.years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </SelectField>
          </div>
          {terms.length > 0 ? (
            <Segmented label={k("term")} options={terms.map((term) => ({ value: term.id, label: term.name }))} value={termId} onChange={setTermPick} />
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-text-muted">{k("help")}</p>
      {body}
    </div>
  );
}
