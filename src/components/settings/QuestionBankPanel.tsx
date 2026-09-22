"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { parseNonNegativeInt, toNumberFieldState } from "@/lib/settings/numberField";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { SettingsData, SettingsUpdate } from "@/lib/settings/types";

type QuestionBankUpdate = NonNullable<SettingsUpdate["question_bank"]>;

type FormState = {
  questionsPerPage: string;
  defaultExamDurationMinutes: string;
};

function toFormState(section: SettingsData["question_bank"]): FormState {
  return {
    questionsPerPage: toNumberFieldState(section.questions_per_page),
    defaultExamDurationMinutes: toNumberFieldState(section.default_exam_duration_minutes),
  };
}

function buildUpdate(original: FormState, form: FormState): QuestionBankUpdate {
  const update: QuestionBankUpdate = {};

  const questionsPerPage = parseNonNegativeInt(form.questionsPerPage);
  if (questionsPerPage !== null && form.questionsPerPage !== original.questionsPerPage) {
    update.questions_per_page = questionsPerPage;
  }

  const defaultExamDurationMinutes = parseNonNegativeInt(form.defaultExamDurationMinutes);
  if (
    defaultExamDurationMinutes !== null &&
    form.defaultExamDurationMinutes !== original.defaultExamDurationMinutes
  ) {
    update.default_exam_duration_minutes = defaultExamDurationMinutes;
  }

  return update;
}

type QuestionBankPanelProps = {
  isOpen: boolean;
  section: SettingsData["question_bank"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function QuestionBankPanel({ isOpen, section, onClose, onSaved }: QuestionBankPanelProps) {
  const t = useTranslations();
  const [original, setOriginal] = useState<FormState>(() => toFormState(section));
  const [form, setForm] = useState<FormState>(() => toFormState(section));
  const [touched, setTouched] = useState<
    Partial<Record<"questionsPerPage" | "defaultExamDurationMinutes", boolean>>
  >({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const state = toFormState(section);
      setOriginal(state);
      setForm(state);
      setTouched({});
      setGeneralError(null);
      setIsSaving(false);
    }
  }, [isOpen, section]);

  const questionsPerPageValid = parseNonNegativeInt(form.questionsPerPage) !== null;
  const defaultExamDurationMinutesValid = parseNonNegativeInt(form.defaultExamDurationMinutes) !== null;
  const isValid = questionsPerPageValid && defaultExamDurationMinutesValid;

  const handleSave = async () => {
    setTouched({ questionsPerPage: true, defaultExamDurationMinutes: true });
    setGeneralError(null);
    if (!isValid) return;

    const update = buildUpdate(original, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await updateSchoolSettings({ question_bank: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.questionBankPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.questionBankPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.questionBankPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.questionBankPanel.title")}
      subtitle={t("settings.questionBankPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <InputField
          id="edit-question-bank-questions-per-page"
          inputMode="numeric"
          label={t("settings.questionBankPanel.questionsPerPage.label")}
          value={form.questionsPerPage}
          onChange={(event) => setForm((current) => ({ ...current, questionsPerPage: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, questionsPerPage: true }))}
          hasError={touched.questionsPerPage && !questionsPerPageValid}
          error={
            touched.questionsPerPage && !questionsPerPageValid
              ? t("settings.questionBankPanel.errors.invalidNumber")
              : undefined
          }
        />

        <InputField
          id="edit-question-bank-default-exam-duration"
          inputMode="numeric"
          label={t("settings.questionBankPanel.defaultExamDurationMinutes.label")}
          value={form.defaultExamDurationMinutes}
          onChange={(event) =>
            setForm((current) => ({ ...current, defaultExamDurationMinutes: event.target.value }))
          }
          onBlur={() => setTouched((current) => ({ ...current, defaultExamDurationMinutes: true }))}
          hasError={touched.defaultExamDurationMinutes && !defaultExamDurationMinutesValid}
          error={
            touched.defaultExamDurationMinutes && !defaultExamDurationMinutesValid
              ? t("settings.questionBankPanel.errors.invalidNumber")
              : undefined
          }
        />
      </div>
    </SlideOverPanel>
  );
}
