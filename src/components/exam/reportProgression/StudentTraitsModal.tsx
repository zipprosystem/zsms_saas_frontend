"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { resultsQueryKeys } from "@/lib/exam/resultsApi";
import { reportQueryKeys } from "@/lib/exam/report/reportPayload";
import { reportProgressionQueryKeys } from "@/lib/exam/reportProgression/reportProgressionApi";
import {
  getStudentTraitEntry,
  saveStudentTraitEntry,
  studentTraitsQueryKey,
  type StudentTraitEntry,
  type StudentTraitKind,
} from "@/lib/exam/reportProgression/studentTraitsApi";
import { failureMessage, Notice } from "@/components/exam/examEntryShared";
import { StudentAvatar } from "@/components/exam/reportProgression/progressionShared";

/** item key -> progress_grade_id (null = not rated). */
type Ratings = Record<string, string | null>;

function ratingsOf(entry: StudentTraitEntry): Ratings {
  return Object.fromEntries(entry.items.map((item) => [item.key, item.progress_grade_id]));
}

/**
 * Report Progression › student entry: rate one student's Psychomotor
 * Skills or Affective Domain (Figma 2499:352523 / 2499:352196). Rows = the
 * class's School Type master list; columns = the General Progress Grade
 * scale; one level per row (radio — the Figma draws boxes). Saved as the
 * student's term trait_assessment (only the changed rows are sent).
 */
export function StudentTraitsModal({
  kind,
  studentId,
  termId,
  onClose,
}: {
  /** null = closed. */
  kind: StudentTraitKind | null;
  studentId: string;
  termId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.reportProgression.traits.${key}`, values);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  // Keep the last kind while the close animation runs.
  const [shownKind, setShownKind] = useState<StudentTraitKind>("psychomotor");
  useEffect(() => {
    if (kind) setShownKind(kind);
  }, [kind]);
  const isOpen = kind !== null;

  const query = useQuery({
    queryKey: studentTraitsQueryKey(studentId, termId, shownKind),
    queryFn: () => getStudentTraitEntry(studentId, termId, shownKind).then(throwIfTransient),
    enabled: isOpen && !!studentId && !!termId,
    // A focus refetch would reset the draft mid-edit.
    refetchOnWindowFocus: false,
  });
  const entry = query.data?.ok ? query.data.data : null;
  const baseline = useMemo(() => (entry ? ratingsOf(entry) : {}), [entry]);
  const [draft, setDraft] = useState<Ratings>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A fresh draft each time the modal opens on (re)loaded data.
  useEffect(() => {
    if (isOpen) setDraft(baseline);
    else setSaveError(null);
  }, [isOpen, baseline]);

  const changed = entry ? entry.items.filter((item) => (draft[item.key] ?? null) !== (baseline[item.key] ?? null)).map((item) => item.key) : [];
  const dirty = changed.length > 0;
  const editable = !!entry?.editable;

  const mutation = useMutation({
    mutationFn: () =>
      saveStudentTraitEntry(studentId, { term_id: termId, kind: shownKind, ratings: Object.fromEntries(changed.map((key) => [key, draft[key] ?? null])) }),
    onSuccess: (result) => {
      if (!result.ok) {
        setSaveError(failureMessage(result, t));
        return;
      }
      queryClient.setQueryData(studentTraitsQueryKey(studentId, termId, shownKind), result);
      // Completeness (student + class bars), the report payload and the Results traits status all read these ratings.
      void queryClient.invalidateQueries({ queryKey: reportProgressionQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: reportQueryKeys.all });
      void queryClient.invalidateQueries({ queryKey: resultsQueryKeys.all });
      showToast(k(`saved.${shownKind}`));
      onClose();
    },
    onError: () => setSaveError(t("setup.dataTable.errors.loadFailed")),
  });

  const requestClose = () => {
    if (dirty && !mutation.isPending) setConfirmDiscard(true);
    else onClose();
  };

  /** One level per row; picking the chosen level again clears the row. */
  const pick = (key: string, levelId: string) => setDraft((current) => ({ ...current, [key]: current[key] === levelId ? null : levelId }));

  const loadError = query.data && !query.data.ok ? failureMessage(query.data, t) : query.isError ? t("setup.dataTable.errors.loadFailed") : null;
  const rated = entry ? entry.items.filter((item) => !!draft[item.key]).length : 0;

  return (
    <>
      <WideModal
        isOpen={isOpen}
        onClose={requestClose}
        back={{ label: k("back"), onClick: requestClose }}
        title={k(`title.${shownKind}`)}
        subtitle={k("subtitle")}
        size="2xl"
        footer={
          <>
            <span className="text-xs text-text-muted">{entry ? k("ratedCount", { rated, total: entry.items.length }) : ""}</span>
            {editable ? (
              <Button
                type="button"
                onClick={() => {
                  setSaveError(null);
                  mutation.mutate();
                }}
                disabled={!dirty || mutation.isPending}
                className="h-10 px-5 text-sm"
              >
                {mutation.isPending ? k("saving") : k(`save.${shownKind}`)}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {entry ? (
            <div className="flex flex-wrap items-center gap-2">
              <StudentAvatar name={entry.student.name} photoUrl={entry.student.photo_url} size="sm" />
              <span className="text-sm font-semibold text-text-primary">{entry.student.name}</span>
              <span className="rounded-md bg-category-amber-tint px-2 py-0.5 text-xs font-medium text-text-primary">
                {t("exam.reportProgression.entry.classArm", { class: entry.class_name, arm: entry.arm_name })}
              </span>
            </div>
          ) : null}

          {saveError ? <Notice tone="error">{saveError}</Notice> : null}
          {loadError ? <Notice tone="error">{loadError}</Notice> : null}
          {query.isLoading ? <p className="text-sm text-text-muted">{k("loading")}</p> : null}

          {entry && !editable ? <Notice>{k("readOnly")}</Notice> : null}
          {entry && entry.rating_scale.length === 0 ? <Notice tone="warning">{k("noScale")}</Notice> : null}
          {entry && entry.items.length === 0 ? <Notice tone="warning">{k(`noItems.${shownKind}`)}</Notice> : null}

          {entry && entry.items.length > 0 && entry.rating_scale.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-tint text-left text-text-primary">
                    <th scope="col" className="w-14 px-4 py-3 font-medium">
                      {k("columns.serial")}
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      {k(`columns.item.${shownKind}`)}
                    </th>
                    {entry.rating_scale.map((level) => (
                      <th key={level.id} scope="col" title={level.label} className="w-14 px-2 py-3 text-center font-medium">
                        {level.value}
                        <span className="sr-only"> — {level.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entry.items.map((item, index) => {
                    const chosen = draft[item.key] ?? null;
                    const rowChanged = chosen !== (baseline[item.key] ?? null);
                    return (
                      <tr key={item.key} className={`border-t border-border ${rowChanged ? "bg-background" : ""}`}>
                        <td className="px-4 py-4 text-text-secondary">{index + 1}</td>
                        <th scope="row" className="px-4 py-4 text-left font-normal text-text-primary">
                          {item.label}
                        </th>
                        {entry.rating_scale.map((level) => (
                          <td key={level.id} className="px-2 py-4 text-center">
                            <input
                              type="radio"
                              name={`trait-${item.key}`}
                              checked={chosen === level.id}
                              disabled={!editable}
                              // onClick (not onChange) so re-picking the chosen level clears it.
                              onClick={() => pick(item.key, level.id)}
                              onChange={() => undefined}
                              aria-label={k("aria.rate", { item: item.label, level: `${level.value} — ${level.label}` })}
                              className="h-4 w-4 cursor-pointer accent-accent disabled:cursor-not-allowed"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {entry && editable && entry.items.length > 0 ? <p className="text-xs text-text-muted">{k("hint")}</p> : null}
        </div>
      </WideModal>

      <ConfirmDialog
        isOpen={confirmDiscard}
        title={k("discard.title")}
        message={k("discard.message")}
        confirmLabel={k("discard.confirm")}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}
