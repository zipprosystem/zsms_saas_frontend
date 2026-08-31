"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { AWARD_BODIES, SCHOOL_MODES, SCHOOL_TYPES } from "@/lib/onboarding/config";
import type { OnboardingData, SchoolMode } from "@/lib/onboarding/types";
import type { FieldErrors } from "@/lib/onboarding/validation";

type AcademicBasicsStepProps = {
  data: OnboardingData;
  errors: FieldErrors;
  onAcademicChange: (patch: Partial<OnboardingData["academic"]>) => void;
};

export function AcademicBasicsStep({
  data,
  errors,
  onAcademicChange,
}: AcademicBasicsStepProps) {
  const t = useTranslations();
  const errorText = (key: string) => (errors[key] ? t(errors[key]) : undefined);

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

      <ChipGroup
        label={t("onboarding.step2.schoolType.label")}
        options={SCHOOL_TYPES.map((type) => ({ value: type.value, label: t(type.labelKey) }))}
        value={data.academic.schoolTypes}
        onChange={(schoolTypes) => onAcademicChange({ schoolTypes })}
        hasError={!!errors["academic.schoolTypes"]}
        error={errorText("academic.schoolTypes")}
        allowCustom
        addLabel={t("onboarding.step2.addCustom")}
        addPlaceholder={t("onboarding.step2.schoolType.customPlaceholder")}
      />

      <ChipGroup
        label={t("onboarding.step2.awardBody.label")}
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
