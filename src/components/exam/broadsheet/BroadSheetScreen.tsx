"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { SetupPagination } from "@/components/setup/SetupPagination";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { getClassResults, resultsQueryKeys } from "@/lib/exam/resultsApi";
import { ExamEntryFilterBar, failureMessage, filterPreconditionNotice, InfoItem, Notice, useExamEntryFilters } from "@/components/exam/examEntryShared";
import { ResultsTable } from "@/components/exam/results/ResultsTable";
import { StudentResultPanel } from "@/components/exam/results/StudentResultPanel";

/**
 * Academics › Exam › Broad Sheet — the students × subjects matrix, moved
 * here from Results (results reframe, 2026-10-27) as the initial
 * Broadsheet view. Pick year / class / arm / term (scope-aware
 * entry-options + mock "acting as" picker), read the arm's computed
 * results; a student opens their full result in a slide-over. Every number
 * comes from the backend engine (mock today — resultsApi.ts). Pages of 25;
 * positions are over the whole arm.
 *
 * Only relocated for now. The full Broadsheet (per-subject CA / Exam /
 * Total, subject + class averages, above/below colouring, the Cumulative
 * Broadsheet with term columns and trend arrows, arm-card landing,
 * "Analyze with AI") is Stage 2b.
 */
const view = "all" as const;

export function BroadSheetScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.results.${key}`, values);

  const filters = useExamEntryFilters(null, { withExam: false });
  const { armId, termId, actingAs } = filters;
  const [page, setPage] = useState(1);
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [armId, termId, actingAs]);

  const query = useQuery({
    queryKey: [...resultsQueryKeys.classResults(armId, termId, view, page), actingAs],
    queryFn: () => getClassResults(armId, termId, view, page).then(throwIfTransient),
    enabled: !!armId && !!termId,
  });
  const data = query.data?.ok ? query.data.data : null;
  const british = data?.assessment_mode === "grade_based";

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit), data.has_more ? page + 1 : 1) : 1;

  let body: ReactNode = filterPreconditionNotice(filters, t, null);
  if (body) {
    // A filter-level notice wins.
  } else if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!data) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else if (data.items.length === 0) {
    body = <Notice>{k("notices.noStudents")}</Notice>;
  } else {
    body = (
      <>
        <ResultsTable
          data={data}
          firstSerial={(data.page - 1) * data.limit + 1}
          onOpenStudent={(row) => {
            setStudent({ id: row.student_id, name: row.student_name });
            setPanelOpen(true);
          }}
        />
        {totalPages > 1 ? (
          <SetupPagination
            page={page}
            totalPages={totalPages}
            onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
            onNextPage={() => setPage((current) => current + 1)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{t("exam.broadSheet.title")}</h2>
        <p className="text-sm text-text-secondary">{t("exam.broadSheet.subtitle")}</p>
      </div>

      <ExamEntryFilterBar
        filters={filters}
        onSelect={(patch, resetBelow) => filters.applySelection(patch, resetBelow)}
        onActorChange={(id) => filters.applyActor(id)}
      />

      {data ? (
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3 sm:p-5 lg:grid-cols-5">
          <InfoItem label={k("info.classArm")} value={`${data.class_name} · ${data.arm_name}`} />
          <InfoItem label={k("info.term")} value={data.term_name} />
          <InfoItem label={k("info.reporting")} value={k(`modes.${data.assessment_mode}`)} />
          <InfoItem label={k("info.gradeScale")} value={british ? (data.grade_scale_name ?? "—") : k("info.classGrades")} />
          <InfoItem
            label={k("info.students")}
            value={british ? String(data.total) : k("info.studentsRanked", { total: data.total, ranked: data.ranked_count })}
          />
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col gap-3">{body}</div>

      <StudentResultPanel student={student} isOpen={panelOpen} termId={termId} actingAs={actingAs} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
