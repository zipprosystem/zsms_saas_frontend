"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import { allLeaves, buildMarkColumns, shownTotal } from "@/lib/exam/markColumns";
import { examQueryKeys, getMarks, saveMarks } from "@/lib/exam/examApi";
import type { SubjectMarksSheet } from "@/lib/exam/examTypes";
import { MarksGrid } from "@/components/exam/MarksGrid";
import { ACADEMIC_REPORT_HREF } from "@/components/exam/examTabsConfig";
import { isRowDirty, rowErrorCount, scoreAutoTickRule, toDraft, toMarkInput, type Draft, type DraftRow } from "@/components/exam/marksDraft";
import {
  ExamEntryFilterBar,
  ExamSaveBar,
  failureMessage,
  filterPreconditionNotice,
  InfoItem,
  Notice,
  patchRowWithAutoTicks,
  searchRows,
  StudentSearch,
  useExamEntryFilters,
  useUnsavedGuard,
} from "@/components/exam/examEntryShared";

/**
 * Academics › Exam › Results — Manage Exam Result (Exam Stage 1b). Raw,
 * subject-wise marks entry for component_based (score) classes: pick year
 * / class / arm / term / subject / exam, then enter each enrolled
 * student's scores into columns generated from the exam's assessment
 * structure (Stage 1a). No grades, stored totals or positions — Stage 2.
 * Grade-based (British) classes use the Academic Report instead (1c).
 *
 * Scope: the filter options come back already cut to the caller's
 * effective_scope (admin = everything; a teacher = their assigned
 * subject/arm pairs), and the first option at each level is pre-selected.
 * MOCK until the backend ships — see examApi.ts.
 */
export function ManageExamResultScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.marks.${key}`, values);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const filters = useExamEntryFilters("component_based");
  const { examId, subjectId, armId, actingAs } = filters;

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Structure + marks ----------------------------------------------------
  const structuresQuery = useQuery({
    queryKey: assessmentStructuresService.queryKey,
    queryFn: () => assessmentStructuresService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });

  const sheetKey = [...examQueryKeys.marks(examId, subjectId, armId), actingAs];
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () => getMarks(examId, subjectId, armId).then(throwIfTransient),
    enabled: !!examId && !!subjectId && !!armId,
    // A background refetch must never wipe unsaved typing.
    refetchOnWindowFocus: false,
  });
  const loaded = sheetQuery.data?.ok ? sheetQuery.data.data : null;
  const gradeBased = loaded?.assessment_mode === "grade_based";
  const sheet: SubjectMarksSheet | null = loaded?.assessment_mode === "component_based" ? loaded : null;

  const structure =
    sheet?.assessment_structure_id && structuresQuery.data?.ok
      ? (structuresQuery.data.data.find((item) => item.id === sheet.assessment_structure_id) ?? null)
      : null;
  const groups = useMemo(
    () => (structure && sheet?.exam.kind ? buildMarkColumns(structure, sheet.exam.kind) : []),
    [structure, sheet],
  );
  const leaves = useMemo(() => allLeaves(groups), [groups]);
  const baseline = useMemo(() => (sheet ? toDraft(sheet.items, leaves) : {}), [sheet, leaves]);

  // A freshly loaded (or just-saved) sheet replaces the draft.
  useEffect(() => {
    setDraft(baseline);
    setSaveError(null);
  }, [baseline]);

  const readOnly = !sheet || !sheet.entry_open || groups.length === 0;
  const dirtyIds = sheet
    ? sheet.items.filter((row) => draft[row.student_id] && isRowDirty(draft[row.student_id], baseline[row.student_id], leaves)).map((row) => row.student_id)
    : [];
  const invalidCount = sheet
    ? sheet.items.reduce((count, row) => count + (draft[row.student_id] ? rowErrorCount(draft[row.student_id], leaves) : 0), 0)
    : 0;
  const completedCount = sheet ? sheet.items.filter((row) => draft[row.student_id]?.mark_completed).length : 0;

  const { guarded, dialog } = useUnsavedGuard(dirtyIds.length);

  // --- Changes ---------------------------------------------------------------
  // Present / Mark as completed auto-tick as scores go in (shared rule — examEntryShared).
  const autoTickRule = useMemo(() => scoreAutoTickRule(leaves), [leaves]);
  const updateRow = (studentId: string, patch: Partial<DraftRow>) =>
    setDraft((current) => ({ ...current, [studentId]: patchRowWithAutoTicks(current[studentId], patch, autoTickRule) }));

  const revertRow = (studentId: string) =>
    setDraft((current) => ({ ...current, [studentId]: baseline[studentId] }));

  const clearScores = (studentId: string) => updateRow(studentId, { scores: Object.fromEntries(leaves.map((leaf) => [leaf.id, ""])) });

  const handleSave = async () => {
    if (!sheet || dirtyIds.length === 0 || invalidCount > 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveMarks(sheet.exam.id, {
      subject_id: sheet.subject_id,
      class_arm_id: sheet.class_arm_id,
      rows: dirtyIds.map((id) => toMarkInput(id, draft[id], leaves)),
    });
    setSaving(false);
    if (result.ok) {
      queryClient.setQueryData(sheetKey, result);
      showToast(k("toast.saved", { count: dirtyIds.length }));
      return;
    }
    const message = failureMessage(result, t) ?? t("setup.crudScreen.errors.saveFailed");
    setSaveError(message);
    showToast(message, "error");
  };

  // --- Rendering ---------------------------------------------------------------
  const visibleRows = searchRows(sheet?.items ?? [], search);
  const subjectName = filters.subjects.find((subject) => subject.id === subjectId)?.name ?? "";
  const termName = filters.terms.find((term) => term.id === filters.termId)?.name ?? "";
  const kindLabel = sheet?.exam.kind ? k(`kinds.${sheet.exam.kind}`) : "";

  const otherScreen = (
    <>
      <p>{k("crossLink.toAcademicReport")}</p>
      <Link href={ACADEMIC_REPORT_HREF} className="mt-2 inline-block font-medium text-accent hover:underline">
        {k("crossLink.openAcademicReport")}
      </Link>
    </>
  );

  let body: ReactNode = filterPreconditionNotice(filters, t, otherScreen);
  if (body) {
    // A filter-level notice wins.
  } else if (sheetQuery.isPending || structuresQuery.isPending) {
    body = <Notice>{k("loading")}</Notice>;
  } else if (gradeBased) {
    body = <Notice tone="warning">{otherScreen}</Notice>;
  } else if (!sheet) {
    body = <Notice tone="error">{failureMessage(sheetQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}</Notice>;
  } else if (!structure) {
    body = (
      <Notice tone="warning">
        <p>{k("notices.noStructure")}</p>
        <Link href="/admin/setup/assessment-configuration/assessment-types" className="mt-2 inline-block font-medium text-accent hover:underline">
          {k("notices.goToAssessmentTypes")}
        </Link>
      </Notice>
    );
  } else if (groups.length === 0) {
    body = <Notice tone="warning">{k("notices.noComponentsForKind", { structure: structure.name, kind: kindLabel })}</Notice>;
  } else if (sheet.items.length === 0) {
    body = <Notice>{k("empty.noStudents")}</Notice>;
  } else if (visibleRows.length === 0) {
    body = <Notice>{k("empty.noSearchMatches")}</Notice>;
  } else {
    body = (
      <MarksGrid
        groups={groups}
        leaves={leaves}
        rows={visibleRows}
        draft={draft}
        baseline={baseline}
        readOnly={readOnly}
        onChangeRow={updateRow}
        onRevertRow={revertRow}
        onClearScores={clearScores}
      />
    );
  }

  const outOf = groups.length > 0 ? shownTotal(groups, {}).outOf : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{k("title")}</h2>
        <p className="text-sm text-text-secondary">{k("subtitle")}</p>
      </div>

      <ExamEntryFilterBar
        filters={filters}
        onSelect={(patch, resetBelow) => guarded(() => filters.applySelection(patch, resetBelow))}
        onActorChange={(id) => guarded(() => filters.applyActor(id))}
      />

      {sheet && structure && groups.length > 0 ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-base font-semibold text-text-primary">{subjectName}</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              <InfoItem label={k("info.term")} value={termName} />
              <InfoItem label={k("info.exam")} value={`${sheet.exam.name} · ${kindLabel}`} />
              <InfoItem label={k("info.structure")} value={structure.name} />
              <InfoItem label={k("info.totalMarks")} value={k("info.marks", { value: outOf ?? 0 })} />
            </div>
            <p className="text-xs text-text-muted">
              {k("info.progress", { done: completedCount, total: sheet.items.length })}
              {sheet.exam.entry_closes_on ? ` · ${k("info.closesOn", { date: sheet.exam.entry_closes_on })}` : ""}
            </p>
            <p className="text-xs text-text-muted">{k("info.autoTick")}</p>
          </div>
          <div className="w-full lg:max-w-xs">
            {/* CBT is deferred — the control is shown so the layout matches Figma, but does nothing yet. */}
            <SelectField id="exam-fill-cbt" label={k("cbt.label")} value="" disabled onChange={() => undefined}>
              <option value="">{k("cbt.placeholder")}</option>
            </SelectField>
            <p className="mt-1 text-xs text-text-muted">{k("cbt.comingLater")}</p>
          </div>
        </div>
      ) : null}

      {sheet && !sheet.entry_open && structure ? (
        <div role="status" className="rounded-md border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary">
          {k("notices.entryClosed", { date: sheet.exam.entry_closes_on ?? "" })}
        </div>
      ) : null}

      {sheet && groups.length > 0 && sheet.items.length > 0 ? <StudentSearch value={search} onChange={setSearch} /> : null}

      {invalidCount > 0 ? (
        <div role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
          {k("errors.invalidCount", { count: invalidCount })}
        </div>
      ) : null}
      {saveError ? (
        <div role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
          {saveError}
        </div>
      ) : null}

      {body}

      {sheet && !readOnly ? (
        <ExamSaveBar
          dirtyCount={dirtyIds.length}
          canSave={invalidCount === 0}
          saving={saving}
          onDiscard={() => setDraft(baseline)}
          onSave={() => void handleSave()}
        />
      ) : null}

      {dialog}
    </div>
  );
}
