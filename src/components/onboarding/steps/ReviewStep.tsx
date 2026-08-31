"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useCountries } from "@/lib/onboarding/location/hooks";
import { buildPortalUrl } from "@/lib/onboarding/portalUrl";
import {
  AWARD_BODIES,
  LANGUAGES,
  SCHOOL_MODES,
  SCHOOL_TYPES,
  WORKING_DAYS,
  type ConfigOption,
} from "@/lib/onboarding/config";
import type { OnboardingData } from "@/lib/onboarding/types";

type ReviewStepProps = {
  data: OnboardingData;
  submitError: string | null;
};

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-primary sm:text-right">{value}</span>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function ReviewStep({ data, submitError }: ReviewStepProps) {
  const t = useTranslations();
  const { countries } = useCountries();
  const notSet = t("onboarding.review.notSet");
  const none = t("onboarding.review.none");

  const countryName =
    countries.find((country) => country.code === data.location.countryCode)?.name ?? notSet;

  const labelList = (options: ConfigOption[], values: string[]) =>
    values.length
      ? values
          .map((value) => {
            const option = options.find((candidate) => candidate.value === value);
            return option ? t(option.labelKey) : value;
          })
          .join(", ")
      : none;

  const labelOne = (options: ConfigOption[], value: string) => {
    const option = options.find((candidate) => candidate.value === value);
    return option ? t(option.labelKey) : notSet;
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl font-medium text-text-primary sm:text-2xl">
          {t("onboarding.review.heading")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("onboarding.review.subheading")}
        </p>
      </div>

      <ReviewSection title={t("onboarding.review.sections.schoolIdentity")}>
        <ReviewRow label={t("onboarding.step1.schoolName.label")} value={data.school.name || notSet} />
        <ReviewRow
          label={t("onboarding.step1.subdomain.label")}
          value={data.school.slug ? buildPortalUrl(data.school.slug) : "—"}
        />
        <ReviewRow
          label={t("onboarding.step1.customDomain.label")}
          value={data.school.customDomain || none}
        />
        <ReviewRow label={t("onboarding.step1.schoolEmail.label")} value={data.school.email || none} />
        <ReviewRow
          label={t("onboarding.step1.schoolPhone.label")}
          value={
            data.school.phoneNumber
              ? `+${data.school.phoneDialCode} ${data.school.phoneNumber}`
              : none
          }
        />
        <ReviewRow
          label={t("onboarding.step1.workingDays.label")}
          value={labelList(WORKING_DAYS, data.school.workingDays)}
        />
      </ReviewSection>

      <ReviewSection title={t("onboarding.review.sections.location")}>
        <ReviewRow label={t("onboarding.step1.location.country.label")} value={countryName} />
        <ReviewRow label={t("onboarding.step1.location.region.label")} value={data.location.region || none} />
        <ReviewRow label={t("onboarding.step1.location.city.label")} value={data.location.city || none} />
        <ReviewRow label={t("onboarding.step1.location.street.label")} value={data.location.street || none} />
        <ReviewRow
          label={t("onboarding.step1.location.postalCode.label")}
          value={data.location.postalCode || none}
        />
        <ReviewRow
          label={t("onboarding.step1.location.timezone.label")}
          value={data.location.timezone || notSet}
        />
        <ReviewRow
          label={t("onboarding.step1.location.currency.label")}
          value={data.location.currency || notSet}
        />
      </ReviewSection>

      <ReviewSection title={t("onboarding.review.sections.language")}>
        <ReviewRow
          label={t("onboarding.step1.language.default.label")}
          value={labelOne(LANGUAGES, data.language.default)}
        />
        <ReviewRow
          label={t("onboarding.step1.language.additional.label")}
          value={labelList(LANGUAGES, data.language.additional)}
        />
      </ReviewSection>

      <ReviewSection title={t("onboarding.review.sections.administrator")}>
        <ReviewRow
          label={t("onboarding.step1.administrator.firstName.label")}
          value={data.administrator.firstName || notSet}
        />
        <ReviewRow
          label={t("onboarding.step1.administrator.lastName.label")}
          value={data.administrator.lastName || notSet}
        />
        <ReviewRow
          label={t("onboarding.step1.administrator.email.label")}
          value={data.administrator.email || notSet}
        />
      </ReviewSection>

      <ReviewSection title={t("onboarding.review.sections.academicBasics")}>
        <ReviewRow
          label={t("onboarding.step2.academicYear.name.label")}
          value={data.academic.yearName || notSet}
        />
        <ReviewRow
          label={t("onboarding.step2.academicYear.startDate.label")}
          value={data.academic.sessionStartDate || notSet}
        />
        <ReviewRow
          label={t("onboarding.step2.academicYear.endDate.label")}
          value={data.academic.sessionEndDate || notSet}
        />
        <ReviewRow
          label={t("onboarding.step2.schoolMode.label")}
          value={
            data.academic.schoolMode ? labelOne(SCHOOL_MODES, data.academic.schoolMode) : notSet
          }
        />
        <ReviewRow
          label={t("onboarding.step2.schoolType.label")}
          value={labelList(SCHOOL_TYPES, data.academic.schoolTypes)}
        />
        <ReviewRow
          label={t("onboarding.step2.awardBody.label")}
          value={labelList(AWARD_BODIES, data.academic.awardBodies)}
        />
      </ReviewSection>

      <div className="rounded-md bg-brand-tint px-4 py-3 text-sm text-accent">
        {t("onboarding.review.notice")}
      </div>

      {submitError ? (
        <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{submitError}</div>
      ) : null}
    </div>
  );
}
