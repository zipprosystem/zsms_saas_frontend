"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { AWARD_BODIES, SCHOOL_MODES, SCHOOL_TYPES } from "@/lib/onboarding/config";
import type { OnboardingData, SchoolMode } from "@/lib/onboarding/types";
import type { FieldErrors } from "@/lib/onboarding/validation";

type SchoolTypePair = OnboardingData["academic"]["schoolTypePairs"][number];

type AcademicBasicsStepProps = {
  data: OnboardingData;
  errors: FieldErrors;
  onAcademicChange: (patch: Partial<OnboardingData["academic"]>) => void;
};

function generatePairId(): string {
  return `pair-${Math.random().toString(36).slice(2, 10)}`;
}

export function AcademicBasicsStep({
  data,
  errors,
  onAcademicChange,
}: AcademicBasicsStepProps) {
  const t = useTranslations();
  const errorText = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  const pairs = data.academic.schoolTypePairs;

  const updatePair = (id: string, patch: Partial<SchoolTypePair>) => {
    onAcademicChange({
      schoolTypePairs: pairs.map((pair) => (pair.id === id ? { ...pair, ...patch } : pair)),
    });
  };

  const addPair = () => {
    onAcademicChange({
      schoolTypePairs: [...pairs, { id: generatePairId(), schoolType: "", awardBody: "" }],
    });
  };

  const removePair = (id: string) => {
    onAcademicChange({ schoolTypePairs: pairs.filter((pair) => pair.id !== id) });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-xl font-medium text-text-primary sm:text-2xl">
          {t("onboarding.step2.heading")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("onboarding.step2.subheading")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("onboarding.step2.academicYear.sectionTitle")}
        </h3>
        <InputField
          id="academic-year-name"
          label={t("onboarding.step2.academicYear.name.label")}
          placeholder={t("onboarding.step2.academicYear.name.placeholder")}
          value={data.academic.yearName}
          onChange={(event) => onAcademicChange({ yearName: event.target.value })}
          hasError={!!errors["academic.yearName"]}
          error={errorText("academic.yearName")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="session-start-date"
            type="date"
            label={t("onboarding.step2.academicYear.startDate.label")}
            value={data.academic.sessionStartDate}
            onChange={(event) => onAcademicChange({ sessionStartDate: event.target.value })}
            hasError={!!errors["academic.sessionStartDate"]}
            error={errorText("academic.sessionStartDate")}
          />
          <InputField
            id="session-end-date"
            type="date"
            label={t("onboarding.step2.academicYear.endDate.label")}
            value={data.academic.sessionEndDate}
            onChange={(event) => onAcademicChange({ sessionEndDate: event.target.value })}
            hasError={!!errors["academic.sessionEndDate"]}
            error={errorText("academic.sessionEndDate")}
          />
        </div>
      </div>

      <ChipGroup
        label={t("onboarding.step2.schoolMode.label")}
        multiple={false}
        options={SCHOOL_MODES.map((mode) => ({ value: mode.value, label: t(mode.labelKey) }))}
        value={data.academic.schoolMode ? [data.academic.schoolMode] : []}
        onChange={(values) =>
          onAcademicChange({ schoolMode: (values[0] as SchoolMode) ?? "" })
        }
        hasError={!!errors["academic.schoolMode"]}
        error={errorText("academic.schoolMode")}
      />

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {t("onboarding.step2.schoolTypePairs.sectionTitle")}
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            {t("onboarding.step2.schoolTypePairs.sectionSubtitle")}
          </p>
        </div>

        {errors["academic.schoolTypePairs"] ? (
          <p className="text-sm text-error">{t(errors["academic.schoolTypePairs"])}</p>
        ) : null}

        <div className="flex flex-col gap-5">
          {pairs.map((pair, index) => (
            <div
              key={pair.id}
              className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {t("onboarding.step2.schoolTypePairs.rowLabel", { number: index + 1 })}
                </span>
                <button
                  type="button"
                  onClick={() => removePair(pair.id)}
                  aria-label={t("onboarding.step2.schoolTypePairs.removeRow")}
                  className="text-text-muted transition-colors hover:text-error"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <ChipGroup
                label={t("onboarding.step2.schoolType.label")}
                multiple={false}
                options={SCHOOL_TYPES.map((type) => ({ value: type.value, label: t(type.labelKey) }))}
                value={pair.schoolType ? [pair.schoolType] : []}
                onChange={(values) => updatePair(pair.id, { schoolType: values[0] ?? "" })}
                hasError={!!errors[`academic.schoolTypePairs.${index}.schoolType`]}
                error={errorText(`academic.schoolTypePairs.${index}.schoolType`)}
                allowCustom
                addLabel={t("onboarding.step2.addCustom")}
                addPlaceholder={t("onboarding.step2.schoolType.customPlaceholder")}
              />

              <ChipGroup
                label={t("onboarding.step2.awardBody.label")}
                multiple={false}
                options={AWARD_BODIES.map((body) => ({ value: body.value, label: t(body.labelKey) }))}
                value={pair.awardBody ? [pair.awardBody] : []}
                onChange={(values) => updatePair(pair.id, { awardBody: values[0] ?? "" })}
                hasError={!!errors[`academic.schoolTypePairs.${index}.awardBody`]}
                error={errorText(`academic.schoolTypePairs.${index}.awardBody`)}
                allowCustom
                addLabel={t("onboarding.step2.addCustom")}
                addPlaceholder={t("onboarding.step2.awardBody.customPlaceholder")}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addPair}
          className="self-start rounded-full border border-dashed border-border px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
        >
          + {t("onboarding.step2.schoolTypePairs.addPair")}
        </button>
      </div>

      <ChipGroup
        label={t("onboarding.step2.extraAwardBodies.label")}
        options={AWARD_BODIES.map((body) => ({ value: body.value, label: t(body.labelKey) }))}
        value={data.academic.awardBodies}
        onChange={(awardBodies) => onAcademicChange({ awardBodies })}
        allowCustom
        addLabel={t("onboarding.step2.addCustom")}
        addPlaceholder={t("onboarding.step2.awardBody.customPlaceholder")}
      />
    </div>
  );
}
