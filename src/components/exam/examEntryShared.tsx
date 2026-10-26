"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import type { AssessmentMode } from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { EXAM_USES_MOCK, examQueryKeys, getEntryOptions, listExams } from "@/lib/exam/examApi";
import type { Exam } from "@/lib/exam/examTypes";
import { getMockActingAs, mockActors, MOCK_ADMIN, setMockActingAs } from "@/lib/exam/mock/mockActingAs";

/**
 * Shared by the two subject-wise entry screens — Manage Exam Result
 * (component_based scores, Stage 1b) and Academic Report (grade_based,
 * Stage 1c): the scope-aware filter bar, the mock "acting as" picker, the
 * unsaved-changes guard, the save bar, the notice blocks and the Present /
 * Mark-as-completed auto-ticks. Strings live under exam.marks.* (they're
 * generic to both screens).
 */

type Translate = ReturnType<typeof useTranslations>;

export type Selection = { yearId: string; classId: string; armId: string; termId: string; subjectId: string; examId: string };

const EMPTY_SELECTION: Selection = { yearId: "", classId: "", armId: "", termId: "", subjectId: "", examId: "" };

/** Keeps a chosen id while it's still offered, otherwise falls back to the first option — so a teacher's own subjects are pre-loaded. */
function pick<T extends { id: string }>(options: T[], chosen: string): string {
  return options.some((option) => option.id === chosen) ? chosen : (options[0]?.id ?? "");
}

export function failureMessage(result: CrudResult<unknown> | undefined, t: Translate): string | null {
  if (!result || result.ok) return null;
  if (result.kind === "devBypassUnavailable") return t("setup.crudScreen.errors.devBypassUnavailable");
  if (result.kind === "forbidden") return result.message ?? t("setup.crudScreen.errors.forbidden");
  if ("message" in result && result.message) return result.message;
  return t("setup.dataTable.errors.loadFailed");
}

export function Notice({ tone = "muted", children }: { tone?: "muted" | "warning" | "error"; children: ReactNode }) {
  const toneClass =
    tone === "error"
      ? "border-error text-error"
      : tone === "warning"
        ? "border-border bg-category-amber-tint text-text-primary"
        : "border-border bg-surface text-text-secondary";
  return <div className={`rounded-xl border px-5 py-6 text-center text-sm ${toneClass}`}>{children}</div>;
}

export function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="truncate text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Present / Mark-as-completed auto-ticks (shared by both screens)
// ---------------------------------------------------------------------------

type EntryFlags = { present: boolean | null; mark_completed: boolean };

/**
 * When a row counts as attended (Present) and as complete (Mark as
 * completed). Each screen supplies its own: scores = any score in / every
 * score in; Academic Report = CAG in / the report variant's required fields in.
 */
export type AutoTickRule<R> = { attended: (row: R) => boolean; complete: (row: R) => boolean };

/**
 * Applies the auto-ticks to an entry edit (prev -> next). Edge-triggered,
 * so the boxes stay manually overridable: Present ticks the moment the row
 * becomes attended (untick it afterwards for a genuine absence); Mark as
 * completed ticks the moment the row becomes complete and unticks if a
 * required entry is then cleared. An edit that sets either box itself is
 * left alone — call this only for entry changes.
 */
export function applyAutoTicks<R extends EntryFlags>(prev: R, next: R, rule: AutoTickRule<R>): R {
  let row = next;
  if (!rule.attended(prev) && rule.attended(next) && next.present !== true) row = { ...row, present: true };
  const wasComplete = rule.complete(prev);
  const isComplete = rule.complete(next);
  if (!wasComplete && isComplete && !row.mark_completed) row = { ...row, mark_completed: true };
  else if (wasComplete && !isComplete && row.mark_completed) row = { ...row, mark_completed: false };
  return row;
}

/**
 * Draft-row updater for either screen: merges the patch and, unless the
 * patch sets Present / Mark as completed directly, applies the auto-ticks.
 */
export function patchRowWithAutoTicks<R extends EntryFlags>(current: R, patch: Partial<R>, rule: AutoTickRule<R>): R {
  const next = { ...current, ...patch };
  if ("present" in patch || "mark_completed" in patch) return next;
  return applyAutoTicks(current, next, rule);
}

/** "First Term CA (CA)" / "1A (Progress report)" — the CA/Exam framing for score points, the report variant for British ones. */
export function examOptionLabel(exam: Exam, t: Translate): string {
  if (exam.assessment_mode === "grade_based") {
    return exam.report_variant ? `${exam.name} (${t(`exam.marks.variants.${exam.report_variant}`)})` : exam.name;
  }
  return exam.kind ? `${exam.name} (${t(`exam.marks.kinds.${exam.kind}`)})` : exam.name;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/**
 * Filter state over the scoped entry-options. `mode` keeps only the
 * classes this screen handles (classes without an assessment_mode show on
 * both). The first option at each level is pre-selected.
 */
export function useExamEntryFilters(mode: AssessmentMode) {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [actingAs, setActingAs] = useState<string>(MOCK_ADMIN);

  // localStorage isn't readable during SSR — sync the mock caller after mount.
  useEffect(() => {
    if (EXAM_USES_MOCK) setActingAs(getMockActingAs());
  }, []);

  const optionsQuery = useQuery({
    queryKey: [...examQueryKeys.entryOptions(selection.yearId || null), actingAs],
    queryFn: () => getEntryOptions(selection.yearId || null).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const options = optionsQuery.data?.ok ? optionsQuery.data.data : null;

  const yearId = options?.academic_year_id ?? "";
  const allClasses = options?.classes ?? [];
  const classes = allClasses.filter((cls) => !cls.assessment_mode || cls.assessment_mode === mode);
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
    queryKey: examQueryKeys.exams(yearId, termId, mode),
    queryFn: () => listExams(yearId, termId, mode).then(throwIfTransient),
    enabled: !!yearId && !!termId,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const exams = examsQuery.data?.ok ? examsQuery.data.data : [];
  const examId = pick(exams, selection.examId);

  const applySelection = (patch: Partial<Selection>, resetBelow: Array<keyof Selection>) =>
    setSelection((current) => {
      const next = { ...current, ...patch };
      for (const key of resetBelow) next[key] = "";
      return next;
    });

  const applyActor = (id: string) => {
    setMockActingAs(id);
    setActingAs(id);
    setSelection((current) => ({ ...EMPTY_SELECTION, yearId: current.yearId }));
  };

  return {
    actingAs,
    optionsQuery,
    options,
    examsQuery,
    /** Classes in scope that belong to the OTHER screen (so an empty list can point there). */
    otherModeClassCount: allClasses.length - classes.length,
    yearId,
    classes,
    classId,
    arms,
    armId,
    terms,
    termId,
    subjects,
    subjectId,
    exams,
    examId,
    applySelection,
    applyActor,
  };
}

export type ExamEntryFilters = ReturnType<typeof useExamEntryFilters>;

/** Notice for anything that stops a sheet loading before a sheet is even requested; null when the sheet can load. */
export function filterPreconditionNotice(filters: ExamEntryFilters, t: Translate, otherScreen: ReactNode): ReactNode | null {
  const k = (key: string) => t(`exam.marks.${key}`);
  const { optionsQuery, options, examsQuery } = filters;
  const optionsFailure = failureMessage(optionsQuery.data, t);
  if (optionsQuery.isPending) return <Notice>{k("loading")}</Notice>;
  if (optionsQuery.isError || optionsFailure) {
    return (
      <Notice tone={isDevBypassUnavailable(optionsQuery.data) ? "warning" : "error"}>
        <p>{optionsFailure ?? t("setup.dataTable.errors.loadFailed")}</p>
        {optionsQuery.isError ? (
          <Button type="button" variant="secondary" onClick={() => optionsQuery.refetch()} className="mx-auto mt-3 h-9 px-4 text-sm">
            {t("common.retry")}
          </Button>
        ) : null}
      </Notice>
    );
  }
  if (filters.classes.length === 0) {
    if (filters.otherModeClassCount > 0) return <Notice>{otherScreen}</Notice>;
    return <Notice>{options?.full_scope ? k("empty.noClasses") : k("empty.noAssignments")}</Notice>;
  }
  if (examsQuery.isPending && !!filters.termId) return <Notice>{k("loading")}</Notice>;
  if (filters.exams.length === 0) return <Notice>{failureMessage(examsQuery.data, t) ?? k("empty.noExams")}</Notice>;
  if (filters.subjects.length === 0) return <Notice>{k("empty.noSubjects")}</Notice>;
  return null;
}

/** The mock "acting as" picker (mock only) + the six scope-aware filters. */
export function ExamEntryFilterBar({
  filters,
  onSelect,
  onActorChange,
}: {
  filters: ExamEntryFilters;
  onSelect: (patch: Partial<Selection>, resetBelow: Array<keyof Selection>) => void;
  onActorChange: (id: string) => void;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.marks.${key}`, values);
  const { options, classes, arms, terms, subjects, exams } = filters;

  return (
    <>
      {EXAM_USES_MOCK ? (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface p-4 sm:flex-row sm:items-end sm:gap-4">
          <div className="w-full sm:max-w-xs">
            <SelectField id="exam-acting-as" label={k("mock.actingAs")} value={filters.actingAs} onChange={(event) => onActorChange(event.target.value)}>
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
          value={filters.yearId}
          disabled={!options}
          onChange={(event) => onSelect({ yearId: event.target.value }, ["termId", "examId"])}
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
          value={filters.classId}
          disabled={classes.length === 0}
          onChange={(event) => onSelect({ classId: event.target.value }, ["armId", "subjectId"])}
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
          value={filters.armId}
          disabled={arms.length === 0}
          onChange={(event) => onSelect({ armId: event.target.value }, ["subjectId"])}
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
          value={filters.termId}
          disabled={terms.length === 0}
          onChange={(event) => onSelect({ termId: event.target.value }, ["examId"])}
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
          value={filters.subjectId}
          disabled={subjects.length === 0}
          onChange={(event) => onSelect({ subjectId: event.target.value }, [])}
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
          value={filters.examId}
          disabled={exams.length === 0}
          onChange={(event) => onSelect({ examId: event.target.value }, [])}
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {examOptionLabel(exam, t)}
            </option>
          ))}
        </SelectField>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Unsaved-changes guard + save bar
// ---------------------------------------------------------------------------

/** Any change that would throw away the grid asks first when there are unsaved edits. Render `dialog` once. */
export function useUnsavedGuard(dirtyCount: number) {
  const t = useTranslations();
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);

  const guarded = (change: () => void) => {
    if (dirtyCount > 0) setPendingChange(() => change);
    else change();
  };

  const dialog = (
    <ConfirmDialog
      isOpen={pendingChange !== null}
      title={t("exam.marks.discardConfirm.title")}
      message={t("exam.marks.discardConfirm.message", { count: dirtyCount })}
      isDangerous
      onCancel={() => setPendingChange(null)}
      onConfirm={() => {
        const change = pendingChange;
        setPendingChange(null);
        change?.();
      }}
    />
  );

  return { guarded, dialog };
}

export function ExamSaveBar({
  dirtyCount,
  canSave,
  saving,
  onDiscard,
  onSave,
}: {
  dirtyCount: number;
  canSave: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-text-secondary">
        {dirtyCount > 0 ? t("exam.marks.saveBar.unsaved", { count: dirtyCount }) : t("exam.marks.saveBar.allSaved")}
      </p>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={onDiscard} disabled={dirtyCount === 0 || saving} className="h-10 px-4 text-sm">
          {t("exam.marks.saveBar.discard")}
        </Button>
        <Button type="button" onClick={onSave} disabled={dirtyCount === 0 || !canSave || saving} className="h-10 px-4 text-sm">
          {saving ? t("common.saving") : t("exam.marks.saveBar.save")}
        </Button>
      </div>
    </div>
  );
}

export function StudentSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const t = useTranslations();
  return (
    <div className="flex w-full max-w-sm">
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("exam.marks.searchPlaceholder")}
        aria-label={t("exam.marks.searchPlaceholder")}
        className="h-11 w-full rounded-md border border-border bg-surface px-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );
}

/** Rows matching the student search, each keeping its S/N from the full roster. */
export function searchRows<T extends { student_name: string; admission_no: string; seat_no: string }>(
  rows: T[],
  search: string,
): Array<{ row: T; serial: number }> {
  const q = search.trim().toLowerCase();
  return rows
    .map((row, index) => ({ row, serial: index + 1 }))
    .filter(({ row }) => !q || [row.student_name, row.admission_no, row.seat_no].some((value) => value.toLowerCase().includes(q)));
}
