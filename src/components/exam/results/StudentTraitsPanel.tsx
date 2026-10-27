"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { getStudentTraits, resultsQueryKeys, saveStudentTraits } from "@/lib/exam/resultsApi";
import type { StudentTraits, TraitItem } from "@/lib/exam/results/resultsTypes";
import { failureMessage, Notice } from "@/components/exam/examEntryShared";

const REMARK_MAX = 500;

type Draft = { ratings: Record<string, number | null>; class_teacher_remark: string; head_teacher_remark: string };

function draftOf(traits: StudentTraits): Draft {
  return {
    ratings: Object.fromEntries([...traits.psychomotor, ...traits.affective].map((item) => [item.key, item.rating])),
    class_teacher_remark: traits.class_teacher_remark,
    head_teacher_remark: traits.head_teacher_remark,
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.class_teacher_remark === b.class_teacher_remark &&
    a.head_teacher_remark === b.head_teacher_remark &&
    Object.keys({ ...a.ratings, ...b.ratings }).every((key) => (a.ratings[key] ?? null) === (b.ratings[key] ?? null))
  );
}

/**
 * Class teacher's student-wise entry (results reframe): Psychomotor
 * Skills, Affective Domain, Class Teacher's Remarks and Head Teacher's
 * Remarks for one student and term. Skill lists and the rating key come
 * from the backend (school data, not UI strings). Only opened from the
 * class teacher's list; the backend also refuses anyone else (403).
 */
export function StudentTraitsPanel({
  student,
  termId,
  isOpen,
  onClose,
}: {
  student: { id: string; name: string } | null;
  termId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.viewResults.traits.${key}`, values);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const query = useQuery({
    queryKey: resultsQueryKeys.traits(student?.id ?? "", termId),
    queryFn: () => getStudentTraits(student?.id ?? "", termId).then(throwIfTransient),
    enabled: isOpen && !!student && !!termId,
    // A focus refetch would reset the draft mid-edit.
    refetchOnWindowFocus: false,
  });
  const traits = query.data?.ok ? query.data.data : null;

  // A fresh draft each time the panel opens on (re)loaded data.
  useEffect(() => {
    if (isOpen && traits) setDraft(draftOf(traits));
    if (!isOpen) {
      setDraft(null);
      setSaveError(null);
    }
  }, [isOpen, traits]);

  const mutation = useMutation({
    mutationFn: (value: Draft) => saveStudentTraits(student?.id ?? "", { term_id: termId, ...value }),
    onSuccess: (result) => {
      if (!result.ok) {
        setSaveError(failureMessage(result, t) ?? t("setup.crudScreen.errors.saveFailed"));
        return;
      }
      queryClient.setQueryData(resultsQueryKeys.traits(result.data.student_id, termId), result);
      // The list's traits status column reads from the results query.
      queryClient.invalidateQueries({ queryKey: resultsQueryKeys.all });
      showToast(k("saved", { name: result.data.student_name }));
      onClose();
    },
    onError: () => setSaveError(t("setup.crudScreen.errors.saveFailed")),
  });

  const dirty = !!traits && !!draft && !sameDraft(draft, draftOf(traits));
  const editable = !!traits?.editable;
  const tooLong = !!draft && (draft.class_teacher_remark.length > REMARK_MAX || draft.head_teacher_remark.length > REMARK_MAX);

  const requestClose = () => {
    if (dirty && !mutation.isPending) setConfirmDiscard(true);
    else onClose();
  };

  const ratingSection = (title: string, items: TraitItem[]) =>
    traits && draft ? (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold text-text-primary">{title}</legend>
        {items.map((item) => (
          <div key={item.key} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_12rem] sm:gap-3">
            <span id={`trait-${item.key}-label`} className="text-sm text-text-secondary">
              {item.label}
            </span>
            <SelectField
              id={`trait-${item.key}`}
              value={draft.ratings[item.key] === null || draft.ratings[item.key] === undefined ? "" : String(draft.ratings[item.key])}
              disabled={!editable}
              onChange={(event) => {
                const value = event.target.value === "" ? null : Number(event.target.value);
                setDraft((current) => (current ? { ...current, ratings: { ...current.ratings, [item.key]: value } } : current));
              }}
            >
              <option value="">{k("notRated")}</option>
              {traits.rating_scale.map((level) => (
                <option key={level.value} value={String(level.value)}>
                  {k("level", { value: level.value, label: level.label })}
                </option>
              ))}
            </SelectField>
          </div>
        ))}
      </fieldset>
    ) : null;

  let body;
  if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!traits || !draft) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6">
        {!editable ? <Notice>{k("readOnly")}</Notice> : null}
        {saveError ? (
          <p role="alert" className="rounded-md border border-error px-3 py-2 text-sm text-error">
            {saveError}
          </p>
        ) : null}
        {ratingSection(k("psychomotor"), traits.psychomotor)}
        {ratingSection(k("affective"), traits.affective)}
        {(["class_teacher_remark", "head_teacher_remark"] as const).map((field) => (
          <div key={field} className="flex flex-col gap-1">
            <TextareaField
              id={`traits-${field}`}
              label={k(field === "class_teacher_remark" ? "classTeacherRemark" : "headTeacherRemark")}
              value={draft[field]}
              disabled={!editable}
              rows={3}
              hasError={draft[field].length > REMARK_MAX}
              error={k("remarkTooLong", { max: REMARK_MAX })}
              onChange={(event) => setDraft((current) => (current ? { ...current, [field]: event.target.value } : current))}
            />
            <span className="self-end text-xs text-text-muted">{k("remarkCount", { count: draft[field].length, max: REMARK_MAX })}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <SlideOverPanel
        isOpen={isOpen}
        onClose={requestClose}
        title={k("title")}
        subtitle={student?.name}
        onSave={editable && draft ? () => mutation.mutate(draft) : undefined}
        saveLabel={t("common.save")}
        isSaving={mutation.isPending}
        saveDisabled={!editable || !dirty || tooLong}
      >
        {body}
      </SlideOverPanel>
      <ConfirmDialog
        isOpen={confirmDiscard}
        title={k("discard.title")}
        message={k("discard.message")}
        isDangerous
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
