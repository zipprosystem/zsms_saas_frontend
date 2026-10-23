"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/Toast";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { examQueryKeys, getMarks, saveMarks } from "@/lib/exam/examApi";
import type { GradeMarksSheet, ScaleLevel } from "@/lib/exam/examTypes";
import { AcademicReportGrid } from "@/components/exam/AcademicReportGrid";
import { gradeLeafIds, isGradeRowDirty, toGradeDraft, toGradeInput, type GradeDraft, type GradeDraftRow } from "@/components/exam/gradeDraft";
import { MANAGE_EXAM_RESULT_HREF } from "@/components/exam/examTabsConfig";
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

/**
 * Academics › Exam › Results › Academic Report (Exam Stage 1c) — the
 * British, grade-based counterpart to Manage Exam Result. Same filters,
 * scope and save flow; the grid is driven by the class's resolved
 * grade_based structure (server-authoritative, inline on the marks GET):
 * Current Attainment on the class grade scale, one rating per domain
 * present (Engagement, Learning Behaviour, Boarding Commitment…), the
 * subject comment, Present? and Mark as completed. Target (MTG) and
 * Grade Book are read-only references.
 *
 * Raw entry only — no VA, averages or any other computation (Stage 2);
 * MTG / grade-book / trait management is Stage 3. MOCK until the backend
 * ships (examApi.ts).
 */
export function AcademicReportScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.academicReport.${key}`, values);
  const m = (key: string, values?: Record<string, string | number>) => t(`exam.marks.${key}`, values);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const filters = useExamEntryFilters("grade_based");
  const { examId, subjectId, armId, actingAs } = filters;

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<GradeDraft>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sheetKey = [...examQueryKeys.marks(examId, subjectId, armId), actingAs];
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () => getMarks(examId, subjectId, armId).then(throwIfTransient),
    enabled: !!examId && !!subjectId && !!armId,
    // A background refetch must never wipe unsaved entries.
    refetchOnWindowFocus: false,
  });
  const loaded = sheetQuery.data?.ok ? sheetQuery.data.data : null;
  const scoreBased = loaded?.assessment_mode === "component_based";
  const sheet: GradeMarksSheet | null = loaded?.assessment_mode === "grade_based" ? loaded : null;
  const structure = sheet?.structure ?? null;

  const leafIds = useMemo(() => (structure ? gradeLeafIds(structure) : []), [structure]);
  const gradeScale = structure ? (sheet?.grade_scales.find((scale) => scale.id === structure.attainment.grade_scale_id) ?? null) : null;
  const levelsByLeaf = useMemo(() => {
    const map: Record<string, ScaleLevel[]> = {};
    if (!structure || !sheet) return map;
    map[structure.attainment.id] = sheet.grade_scales.find((scale) => scale.id === structure.attainment.grade_scale_id)?.grades ?? [];
    for (const domain of structure.rating_domains) {
      map[domain.id] = sheet.rating_scales.find((scale) => scale.id === domain.rating_scale_id)?.levels ?? [];
    }
    return map;
  }, [structure, sheet]);
  const baseline = useMemo(() => (sheet ? toGradeDraft(sheet.items, leafIds) : {}), [sheet, leafIds]);

  // A freshly loaded (or just-saved) sheet replaces the draft.
  useEffect(() => {
    setDraft(baseline);
    setSaveError(null);
  }, [baseline]);

  const readOnly = !sheet || !sheet.entry_open || !structure;
  const dirtyIds = sheet
    ? sheet.items.filter((row) => draft[row.student_id] && isGradeRowDirty(draft[row.student_id], baseline[row.student_id], leafIds)).map((row) => row.student_id)
    : [];
  const completedCount = sheet ? sheet.items.filter((row) => draft[row.student_id]?.mark_completed).length : 0;

  const { guarded, dialog } = useUnsavedGuard(dirtyIds.length);

  const updateRow = (studentId: string, patch: Partial<GradeDraftRow>) =>
    setDraft((current) => ({ ...current, [studentId]: { ...current[studentId], ...patch } }));
  const revertRow = (studentId: string) => setDraft((current) => ({ ...current, [studentId]: baseline[studentId] }));
  const clearEntries = (studentId: string) =>
    setDraft((current) => ({
      ...current,
      [studentId]: { ...current[studentId], scores: Object.fromEntries(leafIds.map((id) => [id, ""])) },
    }));

  const handleSave = async () => {
    if (!sheet || dirtyIds.length === 0) return;
    setSaving(true);
    setSaveError(null);
    const result = await saveMarks(sheet.exam.id, {
      subject_id: sheet.subject_id,
      class_arm_id: sheet.class_arm_id,
      rows: dirtyIds.map((id) => toGradeInput(id, draft[id], leafIds)),
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
  } else if (sheetQuery.isPending) {
    body = <Notice>{m("loading")}</Notice>;
  } else if (scoreBased) {
    body = <Notice tone="warning">{otherScreen}</Notice>;
  } else if (!sheet) {
    body = <Notice tone="error">{failureMessage(sheetQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}</Notice>;
  } else if (!structure) {
    body = <Notice tone="warning">{k("notices.noStructure")}</Notice>;
  } else if (sheet.items.length === 0) {
    body = <Notice>{m("empty.noStudents")}</Notice>;
  } else if (visibleRows.length === 0) {
    body = <Notice>{m("empty.noSearchMatches")}</Notice>;
  } else {
    body = (
      <AcademicReportGrid
        structure={structure}
        levelsByLeaf={levelsByLeaf}
        leafIds={leafIds}
        rows={visibleRows}
        draft={draft}
        baseline={baseline}
        readOnly={readOnly}
        onChangeRow={updateRow}
        onRevertRow={revertRow}
        onClearEntries={clearEntries}
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

      {sheet && structure ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h3 className="text-base font-semibold text-text-primary">{subjectName}</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <InfoItem label={m("info.term")} value={termName} />
            <InfoItem label={m("info.exam")} value={sheet.exam.name} />
            <InfoItem label={m("info.structure")} value={structure.name} />
            <InfoItem label={k("info.gradeScale")} value={gradeScale?.name ?? "—"} />
          </div>
          <p className="text-xs text-text-muted">
            {m("info.progress", { done: completedCount, total: sheet.items.length })}
            {sheet.exam.entry_closes_on ? ` · ${m("info.closesOn", { date: sheet.exam.entry_closes_on })}` : ""}
          </p>
          <p className="text-xs text-text-muted">{k("info.referencesNote")}</p>
        </div>
      ) : null}

      {sheet && !sheet.entry_open && structure ? (
        <div role="status" className="rounded-md border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary">
          {m("notices.entryClosed", { date: sheet.exam.entry_closes_on ?? "" })}
        </div>
      ) : null}

      {sheet && structure && sheet.items.length > 0 ? <StudentSearch value={search} onChange={setSearch} /> : null}

      {saveError ? (
        <div role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
          {saveError}
        </div>
      ) : null}

      {body}

      {sheet && !readOnly ? (
        <ExamSaveBar
          dirtyCount={dirtyIds.length}
          canSave
          saving={saving}
          onDiscard={() => setDraft(baseline)}
          onSave={() => void handleSave()}
        />
      ) : null}

      {dialog}
    </div>
  );
}
