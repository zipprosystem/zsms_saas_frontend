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
import { allLeaves } from "@/lib/exam/markColumns";
import type { ScaleLevel, SubjectMarkRow } from "@/lib/exam/examTypes";
import { attainmentText, useAttainmentDisplay } from "@/lib/exam/settings/examSettingsApi";
import { bandForTotal, getGradeBook, gradeBookColumns, gradeBookQueryKeys, saveGradeBook, type GradeBookSheet } from "@/lib/exam/gradeBook/gradeBookApi";
import { resultsQueryKeys } from "@/lib/exam/resultsApi";
import { broadsheetQueryKeys } from "@/lib/exam/broadsheet/broadsheetApi";
import { MarksGrid } from "@/components/exam/MarksGrid";
import { MANAGE_EXAM_RESULT_HREF } from "@/components/exam/examTabsConfig";
import { isRowDirty, parsedScores, rowErrorCount, toDraft, type Draft, type DraftRow } from "@/components/exam/marksDraft";
import {
  ExamEntryFilterBar,
  ExamSaveBar,
  failureMessage,
  filterPreconditionNotice,
  InfoItem,
  Notice,
  searchRows,
  StudentSearch,
  useExamEntryFilters,
  useUnsavedGuard,
} from "@/components/exam/examEntryShared";

const ASSESSMENT_TYPES_HREF = "/admin/setup/assessment-configuration/assessment-types";
const ATTAINMENT_GRADES_HREF = "/admin/setup/assessment-configuration/attainment-grades";

/** Keeps a chosen id while it's still offered, else the first option. */
function pick(ids: string[], chosen: string): string {
  return ids.includes(chosen) ? chosen : (ids[0] ?? "");
}

/** The marks grid's row shape for a Grade Book row (no Present / Remarks / Completed on this page). */
function asMarkRow(row: GradeBookSheet["items"][number]): SubjectMarkRow {
  return {
    student_id: row.student_id,
    student_name: row.student_name,
    admission_no: row.admission_no,
    seat_no: row.seat_no,
    component_scores: row.component_scores,
    present: null,
    mark_completed: false,
    subject_remark: "",
    entered_by_staff_id: row.entered_by_staff_id,
    updated_at: row.updated_at,
  };
}

/**
 * Academics › Exam › Results › Grade Book (British, spec §7.19) — a
 * separate /100 score per subject per point, apart from Manage Exam Result
 * and the Academic Report. Filters: the shared year / class / arm / term /
 * subject / point (1A, 1B…) bar plus the Grade Book (a Setup › Assessment
 * Types structure ticked "Is Grade Book"). Enter each field's score: the
 * Total sums live to /100 and the Grade is looked up from the class's
 * attainment score ranges (Setup › Attainment Grades). Scope: a subject
 * teacher sees only their own subject/arm pairs (entry-options); admin
 * sees all. Contract: gradeBookApi.ts. MOCK until the backend ships.
 */
export function GradeBookScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.gradeBook.${key}`, values);
  const m = (key: string, values?: Record<string, string | number>) => t(`exam.marks.${key}`, values);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const display = useAttainmentDisplay();
  const filters = useExamEntryFilters("grade_based");
  const { examId, subjectId, armId, actingAs } = filters;

  const [chosenGradeBook, setChosenGradeBook] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Grade Books (active structures ticked "Is Grade Book") ------------------
  const structuresQuery = useQuery({
    queryKey: assessmentStructuresService.queryKey,
    queryFn: () => assessmentStructuresService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const gradeBooks = useMemo(
    () => (structuresQuery.data?.ok ? structuresQuery.data.data.filter((structure) => structure.is_grade_book && structure.is_active) : []),
    [structuresQuery.data],
  );
  const gradeBookId = pick(
    gradeBooks.map((book) => book.id),
    chosenGradeBook,
  );

  // --- Sheet ----------------------------------------------------------------
  const sheetKey = [...gradeBookQueryKeys.sheet(examId, subjectId, armId, gradeBookId), actingAs];
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () => getGradeBook(examId, subjectId, armId, gradeBookId).then(throwIfTransient),
    enabled: !!examId && !!subjectId && !!armId && !!gradeBookId,
    // A background refetch must never wipe unsaved typing.
    refetchOnWindowFocus: false,
  });
  const sheet = sheetQuery.data?.ok ? sheetQuery.data.data : null;

  const groups = useMemo(() => (sheet ? gradeBookColumns(sheet.grade_book) : []), [sheet]);
  const leaves = useMemo(() => allLeaves(groups), [groups]);
  const markRows = useMemo(() => (sheet ? sheet.items.map(asMarkRow) : []), [sheet]);
  const baseline = useMemo(() => toDraft(markRows, leaves), [markRows, leaves]);
  // The bands as a scale, so the Grade reads like attainment elsewhere (weight or label — the school setting).
  const levels: ScaleLevel[] = useMemo(() => (sheet?.bands ?? []).map((band) => ({ code: band.grade, label: band.label, weight: band.weight ?? undefined })), [sheet]);

  useEffect(() => {
    setDraft(baseline);
    setSaveError(null);
  }, [baseline]);

  const readOnly = !sheet || !sheet.entry_open || groups.length === 0;
  const dirtyIds = markRows.filter((row) => draft[row.student_id] && isRowDirty(draft[row.student_id], baseline[row.student_id], leaves)).map((row) => row.student_id);
  const invalidCount = markRows.reduce((count, row) => count + (draft[row.student_id] ? rowErrorCount(draft[row.student_id], leaves) : 0), 0);
  const enteredCount = markRows.filter((row) => draft[row.student_id] && leaves.some((leaf) => (draft[row.student_id].scores[leaf.id] ?? "").trim() !== "")).length;

  const { guarded, dialog } = useUnsavedGuard(dirtyIds.length);

  const updateRow = (studentId: string, patch: Partial<DraftRow>) => setDraft((current) => ({ ...current, [studentId]: { ...current[studentId], ...patch } }));
  const revertRow = (studentId: string) => setDraft((current) => ({ ...current, [studentId]: baseline[studentId] }));
  const clearScores = (studentId: string) => updateRow(studentId, { scores: Object.fromEntries(leaves.map((leaf) => [leaf.id, ""])) });

  const handleSave = async () => {
    if (!sheet || dirtyIds.length === 0 || invalidCount > 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveGradeBook(sheet.exam.id, {
      subject_id: sheet.subject_id,
      class_arm_id: sheet.class_arm_id,
      grade_book_id: sheet.grade_book.id,
      rows: dirtyIds.map((id) => ({ student_id: id, component_scores: parsedScores(draft[id], leaves) })),
    });
    setSaving(false);
    if (result.ok) {
      queryClient.setQueryData(sheetKey, result);
      // Everything that reads the Grade Book: the Academic Report (GB column, auto-filled attainment),
      // results + report cards (VA, GB per point) and the Progression broadsheet.
      for (const queryKey of [["exam", "marks"], resultsQueryKeys.all, broadsheetQueryKeys.all]) void queryClient.invalidateQueries({ queryKey });
      showToast(k("toast.saved", { count: dirtyIds.length }));
      return;
    }
    const message = failureMessage(result, t) ?? t("setup.crudScreen.errors.saveFailed");
    setSaveError(message);
    showToast(message, "error");
  };

  // --- Rendering ---------------------------------------------------------------
  const visibleRows = searchRows(markRows, search);
  const subjectName = filters.subjects.find((subject) => subject.id === subjectId)?.name ?? "";
  const termName = filters.terms.find((term) => term.id === filters.termId)?.name ?? "";

  const gradeCell = (total: number | null): ReactNode => {
    const band = sheet ? bandForTotal(sheet.bands, total) : null;
    if (!band) return <span className="text-text-muted">—</span>;
    const text = attainmentText(band.grade, levels, display);
    return (
      <span
        className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-sm font-medium text-text-primary"
        title={band.label && band.label !== band.grade ? `${band.grade} · ${band.label}` : band.grade}
      >
        {text}
      </span>
    );
  };

  const otherScreen = (
    <>
      <p>{k("crossLink.toManageExamResult")}</p>
      <Link href={MANAGE_EXAM_RESULT_HREF} className="mt-2 inline-block font-medium text-accent hover:underline">
        {k("crossLink.openManageExamResult")}
      </Link>
    </>
  );

  let body: ReactNode = filterPreconditionNotice(filters, t, otherScreen);
  if (body) {
    // A filter-level notice wins.
  } else if (structuresQuery.isPending) {
    body = <Notice>{m("loading")}</Notice>;
  } else if (gradeBooks.length === 0) {
    body = (
      <Notice tone="warning">
        <p>{k("notices.noGradeBooks")}</p>
        <Link href={ASSESSMENT_TYPES_HREF} className="mt-2 inline-block font-medium text-accent hover:underline">
          {k("notices.goToAssessmentTypes")}
        </Link>
      </Notice>
    );
  } else if (sheetQuery.isPending) {
    body = <Notice>{m("loading")}</Notice>;
  } else if (!sheet) {
    body = <Notice tone="error">{failureMessage(sheetQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}</Notice>;
  } else if (sheet.items.length === 0) {
    body = <Notice>{m("empty.noStudents")}</Notice>;
  } else if (visibleRows.length === 0) {
    body = <Notice>{m("empty.noSearchMatches")}</Notice>;
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
        showPresent={false}
        showRemarks={false}
        showCompleted={false}
        totalExtra={{ header: k("columns.grade"), render: gradeCell }}
      />
    );
  }

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

      {gradeBooks.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SelectField
            id="grade-book-filter"
            label={k("filters.gradeBook")}
            value={gradeBookId}
            onChange={(event) => guarded(() => setChosenGradeBook(event.target.value))}
          >
            {gradeBooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.name}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {sheet && groups.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-base font-semibold text-text-primary">{subjectName}</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <InfoItem label={m("info.term")} value={termName} />
            <InfoItem label={k("info.point")} value={sheet.exam.name} />
            <InfoItem label={k("info.gradeBook")} value={sheet.grade_book.name} />
            <InfoItem label={m("info.totalMarks")} value={m("info.marks", { value: 100 })} />
          </div>
          <p className="text-xs text-text-muted">
            {k("info.progress", { done: enteredCount, total: sheet.items.length })}
            {sheet.exam.entry_closes_on ? ` · ${m("info.closesOn", { date: sheet.exam.entry_closes_on })}` : ""}
          </p>
          <p className="text-xs text-text-muted">{k("info.howGraded")}</p>
        </div>
      ) : null}

      {sheet && sheet.bands.length === 0 ? (
        <div role="status" className="rounded-md border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary">
          {k("notices.noBands")}{" "}
          <Link href={ATTAINMENT_GRADES_HREF} className="font-medium text-accent hover:underline">
            {k("notices.goToAttainmentGrades")}
          </Link>
        </div>
      ) : null}

      {sheet && !sheet.entry_open ? (
        <div role="status" className="rounded-md border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary">
          {m("notices.entryClosed", { date: sheet.exam.entry_closes_on ?? "" })}
        </div>
      ) : null}

      {sheet && sheet.items.length > 0 ? <StudentSearch value={search} onChange={setSearch} /> : null}

      {invalidCount > 0 ? (
        <div role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
          {m("errors.invalidCount", { count: invalidCount })}
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
