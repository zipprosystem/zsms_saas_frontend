"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import { allLeaves, buildMarkColumns, shownTotal } from "@/lib/exam/markColumns";
import { EXAM_USES_MOCK, examQueryKeys, getEntryOptions, getMarks, listExams, saveMarks } from "@/lib/exam/examApi";
import type { SubjectMarksSheet } from "@/lib/exam/examTypes";
import { getMockActingAs, mockActors, MOCK_ADMIN, setMockActingAs } from "@/lib/exam/mock/mockActingAs";
import { MarksGrid } from "@/components/exam/MarksGrid";
import { isRowDirty, rowErrorCount, toDraft, toMarkInput, type Draft, type DraftRow } from "@/components/exam/marksDraft";

type Selection = { yearId: string; classId: string; armId: string; termId: string; subjectId: string; examId: string };

const EMPTY_SELECTION: Selection = { yearId: "", classId: "", armId: "", termId: "", subjectId: "", examId: "" };

/** Keeps a chosen id while it's still offered, otherwise falls back to the first option — so a teacher's own subjects are pre-loaded. */
function pick<T extends { id: string }>(options: T[], chosen: string): string {
  return options.some((option) => option.id === chosen) ? chosen : (options[0]?.id ?? "");
}

function failureMessage(result: CrudResult<unknown> | undefined, t: ReturnType<typeof useTranslations>): string | null {
  if (!result || result.ok) return null;
  if (result.kind === "devBypassUnavailable") return t("setup.crudScreen.errors.devBypassUnavailable");
  if (result.kind === "forbidden") return result.message ?? t("setup.crudScreen.errors.forbidden");
  if ("message" in result && result.message) return result.message;
  return t("setup.dataTable.errors.loadFailed");
}

function Notice({ tone = "muted", children }: { tone?: "muted" | "warning" | "error"; children: ReactNode }) {
  const toneClass =
    tone === "error"
      ? "border-error text-error"
      : tone === "warning"
        ? "border-border bg-category-amber-tint text-text-primary"
        : "border-border bg-surface text-text-secondary";
  return <div className={`rounded-xl border px-5 py-6 text-center text-sm ${toneClass}`}>{children}</div>;
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="truncate text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

/**
 * Academics › Exam › Results — Manage Exam Result (Exam Stage 1b). Raw,
 * subject-wise marks entry: pick year / class / arm / term / subject /
 * exam, then enter each enrolled student's scores into columns generated
 * from the exam's assessment structure (Stage 1a). No grades, stored
 * totals or positions — that's Stage 2.
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

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [actingAs, setActingAs] = useState<string>(MOCK_ADMIN);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);

  // localStorage isn't readable during SSR — sync the mock caller after mount.
  useEffect(() => {
    if (EXAM_USES_MOCK) setActingAs(getMockActingAs());
  }, []);

  // --- Filter options -------------------------------------------------------
  const optionsQuery = useQuery({
    queryKey: [...examQueryKeys.entryOptions(selection.yearId || null), actingAs],
    queryFn: () => getEntryOptions(selection.yearId || null).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const options = optionsQuery.data?.ok ? optionsQuery.data.data : null;

  const yearId = options?.academic_year_id ?? "";
  const classes = options?.classes ?? [];
  const classId = pick(classes, selection.classId);
  const arms = classes.find((cls) => cls.id === classId)?.arms ?? [];
  const armId = pick(arms, selection.armId);
  const terms = options?.terms ?? [];
  const termId = pick(terms, selection.termId);
  const subjects = (options?.subjects ?? [])
    .filter((subject) => subject.class_arm_id === armId)
    .map((subject) => ({ id: subject.subject_id, name: subject.subject_name }));
  const subjectId = pick(subjects, selection.subjectId);

  const examsQuery = useQuery({
    queryKey: examQueryKeys.exams(yearId, termId),
    queryFn: () => listExams(yearId, termId).then(throwIfTransient),
    enabled: !!yearId && !!termId,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const exams = examsQuery.data?.ok ? examsQuery.data.data : [];
  const examId = pick(exams, selection.examId);

  // --- Structure + marks ----------------------------------------------------
  const structuresQuery = useQuery({
    queryKey: assessmentStructuresService.queryKey,
    queryFn: () => assessmentStructuresService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });

  const sheetQuery = useQuery({
    queryKey: [...examQueryKeys.marks(examId, subjectId, armId), actingAs],
    queryFn: () => getMarks(examId, subjectId, armId).then(throwIfTransient),
    enabled: !!examId && !!subjectId && !!armId,
    // A background refetch must never wipe unsaved typing.
    refetchOnWindowFocus: false,
  });
  const sheet: SubjectMarksSheet | null = sheetQuery.data?.ok ? sheetQuery.data.data : null;

  const structure =
    sheet?.assessment_structure_id && structuresQuery.data?.ok
      ? (structuresQuery.data.data.find((item) => item.id === sheet.assessment_structure_id) ?? null)
      : null;
  const groups = useMemo(() => (structure && sheet ? buildMarkColumns(structure, sheet.exam.kind) : []), [structure, sheet]);
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

  // --- Changes ---------------------------------------------------------------
  /** Any change that would throw away the grid asks first when there are unsaved edits. */
  const guarded = (change: () => void) => {
    if (dirtyIds.length > 0) setPendingChange(() => change);
    else change();
  };

  const select = (patch: Partial<Selection>, resetBelow: Array<keyof Selection>) =>
    guarded(() =>
      setSelection((current) => {
        const next = { ...current, ...patch };
        for (const key of resetBelow) next[key] = "";
        return next;
      }),
    );

  const changeActor = (id: string) =>
    guarded(() => {
      setMockActingAs(id);
      setActingAs(id);
      setSelection((current) => ({ ...EMPTY_SELECTION, yearId: current.yearId }));
    });

  const updateRow = (studentId: string, patch: Partial<DraftRow>) =>
    setDraft((current) => ({ ...current, [studentId]: { ...current[studentId], ...patch } }));

  const revertRow = (studentId: string) =>
    setDraft((current) => ({ ...current, [studentId]: baseline[studentId] }));

  const clearScores = (studentId: string) =>
    setDraft((current) => ({
      ...current,
      [studentId]: { ...current[studentId], scores: Object.fromEntries(leaves.map((leaf) => [leaf.id, ""])) },
    }));

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
      queryClient.setQueryData([...examQueryKeys.marks(examId, subjectId, armId), actingAs], result);
      showToast(k("toast.saved", { count: dirtyIds.length }));
      return;
    }
    const message = failureMessage(result, t) ?? t("setup.crudScreen.errors.saveFailed");
    setSaveError(message);
    showToast(message, "error");
  };

  // --- Rendering ---------------------------------------------------------------
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = (sheet?.items ?? [])
    .map((row, index) => ({ row, serial: index + 1 }))
    .filter(
      ({ row }) =>
        !normalizedSearch ||
        [row.student_name, row.admission_no, row.seat_no].some((value) => value.toLowerCase().includes(normalizedSearch)),
    );

  const subjectName = subjects.find((subject) => subject.id === subjectId)?.name ?? "";
  const termName = terms.find((term) => term.id === termId)?.name ?? "";
  const kindLabel = sheet ? k(`kinds.${sheet.exam.kind}`) : "";

  let body: ReactNode;
  const optionsFailure = failureMessage(optionsQuery.data, t);
  if (optionsQuery.isPending) {
    body = <Notice>{k("loading")}</Notice>;
  } else if (optionsQuery.isError || optionsFailure) {
    body = (
      <Notice tone={isDevBypassUnavailable(optionsQuery.data) ? "warning" : "error"}>
        <p>{optionsFailure ?? t("setup.dataTable.errors.loadFailed")}</p>
        {optionsQuery.isError ? (
          <Button type="button" variant="secondary" onClick={() => optionsQuery.refetch()} className="mx-auto mt-3 h-9 px-4 text-sm">
            {t("common.retry")}
          </Button>
        ) : null}
      </Notice>
    );
  } else if (classes.length === 0) {
    body = <Notice>{options?.full_scope ? k("empty.noClasses") : k("empty.noAssignments")}</Notice>;
  } else if (examsQuery.isPending && !!termId) {
    body = <Notice>{k("loading")}</Notice>;
  } else if (exams.length === 0) {
    body = <Notice>{failureMessage(examsQuery.data, t) ?? k("empty.noExams")}</Notice>;
  } else if (subjects.length === 0) {
    body = <Notice>{k("empty.noSubjects")}</Notice>;
  } else if (sheetQuery.isPending || structuresQuery.isPending) {
    body = <Notice>{k("loading")}</Notice>;
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
  } else {
    body = (
      <>
        {visibleRows.length === 0 ? (
          <Notice>{k("empty.noSearchMatches")}</Notice>
        ) : (
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
        )}
      </>
    );
  }

  const outOf = groups.length > 0 ? shownTotal(groups, {}).outOf : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{k("title")}</h2>
        <p className="text-sm text-text-secondary">{k("subtitle")}</p>
      </div>

      {EXAM_USES_MOCK ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="w-full sm:max-w-xs">
            <SelectField id="exam-acting-as" label={k("mock.actingAs")} value={actingAs} onChange={(event) => changeActor(event.target.value)}>
              {mockActors().map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name ? k("mock.teacher", { name: actor.name }) : k("mock.admin")}
                </option>
              ))}
            </SelectField>
          </div>
          <p className="text-xs text-text-muted sm:pb-3">{k("mock.hint")}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SelectField
          id="exam-filter-year"
          label={k("filters.year")}
          value={yearId}
          disabled={!options}
          onChange={(event) => select({ yearId: event.target.value }, ["termId", "examId"])}
        >
          {(options?.years ?? []).map((year) => (
            <option key={year.id} value={year.id}>
              {year.is_current ? k("filters.currentYear", { name: year.name }) : year.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="exam-filter-class"
          label={k("filters.class")}
          value={classId}
          disabled={classes.length === 0}
          onChange={(event) => select({ classId: event.target.value }, ["armId", "subjectId"])}
        >
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="exam-filter-arm"
          label={k("filters.arm")}
          value={armId}
          disabled={arms.length === 0}
          onChange={(event) => select({ armId: event.target.value }, ["subjectId"])}
        >
          {arms.map((arm) => (
            <option key={arm.id} value={arm.id}>
              {arm.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="exam-filter-term"
          label={k("filters.term")}
          value={termId}
          disabled={terms.length === 0}
          onChange={(event) => select({ termId: event.target.value }, ["examId"])}
        >
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="exam-filter-subject"
          label={k("filters.subject")}
          value={subjectId}
          disabled={subjects.length === 0}
          onChange={(event) => select({ subjectId: event.target.value }, [])}
        >
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="exam-filter-exam"
          label={k("filters.exam")}
          value={examId}
          disabled={exams.length === 0}
          onChange={(event) => select({ examId: event.target.value }, [])}
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {`${exam.name} (${k(`kinds.${exam.kind}`)})`}
            </option>
          ))}
        </SelectField>
      </div>

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

      {sheet && groups.length > 0 && sheet.items.length > 0 ? (
        <div className="flex w-full max-w-sm">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={k("searchPlaceholder")}
            aria-label={k("searchPlaceholder")}
            className="h-11 w-full rounded-md border border-border bg-surface px-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      ) : null}

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
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            {dirtyIds.length > 0 ? k("saveBar.unsaved", { count: dirtyIds.length }) : k("saveBar.allSaved")}
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft(baseline)}
              disabled={dirtyIds.length === 0 || saving}
              className="h-10 px-4 text-sm"
            >
              {k("saveBar.discard")}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={dirtyIds.length === 0 || invalidCount > 0 || saving}
              className="h-10 px-4 text-sm"
            >
              {saving ? t("common.saving") : k("saveBar.save")}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={pendingChange !== null}
        title={k("discardConfirm.title")}
        message={k("discardConfirm.message", { count: dirtyIds.length })}
        isDangerous
        onCancel={() => setPendingChange(null)}
        onConfirm={() => {
          const change = pendingChange;
          setPendingChange(null);
          change?.();
        }}
      />
    </div>
  );
}
