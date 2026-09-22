"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { WORKING_DAYS } from "@/lib/onboarding/config";
import type { WorkingDay } from "@/lib/onboarding/types";
import { DATE_FORMATS, TIME_FORMATS, NOTIFICATION_CHANNELS } from "@/lib/settings/config";
import { parseNonNegativeInt, toNumberFieldState } from "@/lib/settings/numberField";
import { sameStringSet } from "@/lib/settings/arrayDiff";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { SettingsData, SettingsUpdate } from "@/lib/settings/types";

type GeneralBehaviourUpdate = NonNullable<SettingsUpdate["general_behaviour"]>;

type FormState = {
  workingDays: WorkingDay[];
  recordsPerPage: string;
  dateFormat: string;
  timeFormat: string;
  absenceEndDelayDays: string;
  notificationChannel: string;
  studentIdPrefix: string;
  staffIdPrefix: string;
};

function toFormState(section: SettingsData["general_behaviour"]): FormState {
  return {
    workingDays: section.working_days,
    recordsPerPage: toNumberFieldState(section.records_per_page),
    dateFormat: section.date_format ?? "",
    timeFormat: section.time_format ?? "",
    absenceEndDelayDays: toNumberFieldState(section.absence_end_delay_days),
    notificationChannel: section.notification_channel ?? "",
    studentIdPrefix: section.student_id_prefix ?? "",
    staffIdPrefix: section.staff_id_prefix ?? "",
  };
}

function buildUpdate(original: FormState, form: FormState): GeneralBehaviourUpdate {
  const update: GeneralBehaviourUpdate = {};

  if (!sameStringSet(form.workingDays, original.workingDays)) {
    update.working_days = form.workingDays;
  }

  const recordsPerPage = parseNonNegativeInt(form.recordsPerPage);
  if (recordsPerPage !== null && form.recordsPerPage !== original.recordsPerPage) {
    update.records_per_page = recordsPerPage;
  }

  const dateFormat = form.dateFormat.trim();
  if (dateFormat !== original.dateFormat.trim()) update.date_format = dateFormat || null;

  const timeFormat = form.timeFormat.trim();
  if (timeFormat !== original.timeFormat.trim()) update.time_format = timeFormat || null;

  const absenceEndDelayDays = parseNonNegativeInt(form.absenceEndDelayDays);
  if (absenceEndDelayDays !== null && form.absenceEndDelayDays !== original.absenceEndDelayDays) {
    update.absence_end_delay_days = absenceEndDelayDays;
  }

  const notificationChannel = form.notificationChannel.trim();
  if (notificationChannel !== original.notificationChannel.trim()) {
    update.notification_channel = notificationChannel || null;
  }

  const studentIdPrefix = form.studentIdPrefix.trim();
  if (studentIdPrefix !== original.studentIdPrefix.trim()) update.student_id_prefix = studentIdPrefix || null;

  const staffIdPrefix = form.staffIdPrefix.trim();
  if (staffIdPrefix !== original.staffIdPrefix.trim()) update.staff_id_prefix = staffIdPrefix || null;

  return update;
}

type GeneralBehaviourPanelProps = {
  isOpen: boolean;
  section: SettingsData["general_behaviour"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function GeneralBehaviourPanel({
  isOpen,
  section,
  onClose,
  onSaved,
}: GeneralBehaviourPanelProps) {
  const t = useTranslations();
  const [original, setOriginal] = useState<FormState>(() => toFormState(section));
  const [form, setForm] = useState<FormState>(() => toFormState(section));
  const [touched, setTouched] = useState<Partial<Record<"recordsPerPage" | "absenceEndDelayDays", boolean>>>({});
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

  const recordsPerPageValid = parseNonNegativeInt(form.recordsPerPage) !== null;
  const absenceEndDelayDaysValid = parseNonNegativeInt(form.absenceEndDelayDays) !== null;
  const isValid = recordsPerPageValid && absenceEndDelayDaysValid;

  const handleSave = async () => {
    setTouched({ recordsPerPage: true, absenceEndDelayDays: true });
    setGeneralError(null);
    if (!isValid) return;

    const update = buildUpdate(original, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await updateSchoolSettings({ general_behaviour: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.generalBehaviourPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.generalBehaviourPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.generalBehaviourPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.generalBehaviourPanel.title")}
      subtitle={t("settings.generalBehaviourPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <ChipGroup
          label={t("settings.generalBehaviourPanel.workingDays.label")}
          options={WORKING_DAYS.map((day) => ({ value: day.value, label: t(day.labelKey) }))}
          value={form.workingDays}
          onChange={(values) => setForm((current) => ({ ...current, workingDays: values as WorkingDay[] }))}
        />

        <InputField
          id="edit-general-records-per-page"
          inputMode="numeric"
          label={t("settings.generalBehaviourPanel.recordsPerPage.label")}
          value={form.recordsPerPage}
          onChange={(event) => setForm((current) => ({ ...current, recordsPerPage: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, recordsPerPage: true }))}
          hasError={touched.recordsPerPage && !recordsPerPageValid}
          error={
            touched.recordsPerPage && !recordsPerPageValid
              ? t("settings.generalBehaviourPanel.errors.invalidNumber")
              : undefined
          }
        />

        <SelectField
          id="edit-general-date-format"
          label={t("settings.generalBehaviourPanel.dateFormat.label")}
          value={form.dateFormat}
          onChange={(event) => setForm((current) => ({ ...current, dateFormat: event.target.value }))}
        >
          <option value="">{t("common.selectPlaceholder")}</option>
          {DATE_FORMATS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </SelectField>

        <SelectField
          id="edit-general-time-format"
          label={t("settings.generalBehaviourPanel.timeFormat.label")}
          value={form.timeFormat}
          onChange={(event) => setForm((current) => ({ ...current, timeFormat: event.target.value }))}
        >
          <option value="">{t("common.selectPlaceholder")}</option>
          {TIME_FORMATS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </SelectField>

        <InputField
          id="edit-general-absence-end-delay"
          inputMode="numeric"
          label={t("settings.generalBehaviourPanel.absenceEndDelayDays.label")}
          value={form.absenceEndDelayDays}
          onChange={(event) =>
            setForm((current) => ({ ...current, absenceEndDelayDays: event.target.value }))
          }
          onBlur={() => setTouched((current) => ({ ...current, absenceEndDelayDays: true }))}
          hasError={touched.absenceEndDelayDays && !absenceEndDelayDaysValid}
          error={
            touched.absenceEndDelayDays && !absenceEndDelayDaysValid
              ? t("settings.generalBehaviourPanel.errors.invalidNumber")
              : undefined
          }
        />

        <SelectField
          id="edit-general-notification-channel"
          label={t("settings.generalBehaviourPanel.notificationChannel.label")}
          value={form.notificationChannel}
          onChange={(event) =>
            setForm((current) => ({ ...current, notificationChannel: event.target.value }))
          }
        >
          <option value="">{t("common.selectPlaceholder")}</option>
          {NOTIFICATION_CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </SelectField>

        <InputField
          id="edit-general-student-id-prefix"
          label={t("settings.generalBehaviourPanel.studentIdPrefix.label")}
          value={form.studentIdPrefix}
          onChange={(event) => setForm((current) => ({ ...current, studentIdPrefix: event.target.value }))}
        />

        <InputField
          id="edit-general-staff-id-prefix"
          label={t("settings.generalBehaviourPanel.staffIdPrefix.label")}
          value={form.staffIdPrefix}
          onChange={(event) => setForm((current) => ({ ...current, staffIdPrefix: event.target.value }))}
        />
      </div>
    </SlideOverPanel>
  );
}
