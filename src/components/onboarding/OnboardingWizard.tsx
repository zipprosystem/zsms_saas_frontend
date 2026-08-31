"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { StepIndicator } from "./StepIndicator";
import { SchoolIdentityStep } from "./steps/SchoolIdentityStep";
import { AcademicBasicsStep } from "./steps/AcademicBasicsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SuccessScreen } from "./SuccessScreen";
import { toSubmissionPayload, type OnboardingData, type SlugStatus } from "@/lib/onboarding/types";
import { submitOnboarding } from "@/lib/onboarding/submitOnboarding";
import { buildPortalUrl } from "@/lib/onboarding/portalUrl";
import { validateStep1, validateStep2, type FieldErrors } from "@/lib/onboarding/validation";

const INITIAL_DATA: OnboardingData = {
  school: {
    name: "",
    slug: "",
    customDomain: "",
    email: "",
    phoneDialCode: "234",
    phoneNumber: "",
    logo: null,
    logoPreviewUrl: null,
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
    showWebsiteToVisitors: false,
  },
  administrator: { firstName: "", lastName: "", email: "" },
  location: {
    countryCode: "",
    stateCode: "",
    region: "",
    city: "",
    street: "",
    postalCode: "",
    timezone: "",
    currency: "",
  },
  language: { default: "en", additional: [] },
  academic: {
    yearName: "",
    sessionStartDate: "",
    sessionEndDate: "",
    schoolMode: "",
    schoolTypes: [],
    awardBodies: [],
  },
};

type WizardStep = 1 | 2 | "review" | "success";

export function OnboardingWizard() {
  const t = useTranslations();
  const [step, setStep] = useState<WizardStep>(1);
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  const updateSchool = (patch: Partial<OnboardingData["school"]>) =>
    setData((current) => ({ ...current, school: { ...current.school, ...patch } }));
  const updateAdministrator = (patch: Partial<OnboardingData["administrator"]>) =>
    setData((current) => ({ ...current, administrator: { ...current.administrator, ...patch } }));
  const updateLocation = (patch: Partial<OnboardingData["location"]>) =>
    setData((current) => ({ ...current, location: { ...current.location, ...patch } }));
  const updateLanguage = (patch: Partial<OnboardingData["language"]>) =>
    setData((current) => ({ ...current, language: { ...current.language, ...patch } }));
  const updateAcademic = (patch: Partial<OnboardingData["academic"]>) =>
    setData((current) => ({ ...current, academic: { ...current.academic, ...patch } }));

  const handleNextFromStep1 = () => {
    const stepErrors = validateStep1(data, slugStatus);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep(2);
  };

  const handleNextFromStep2 = () => {
    const stepErrors = validateStep2(data);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep("review");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const result = await submitOnboarding(toSubmissionPayload(data));
    setSubmitting(false);

    if (result.ok) {
      setPortalUrl(result.portalUrl);
      setStep("success");
      return;
    }

    setSubmitError(t(result.error.messageKey));
    // Our mock only ever fails on the slug — route the error back to the
    // field that owns it, on step 1, so the user can fix it in place.
    if (result.error.field) {
      setErrors({ [result.error.field]: result.error.messageKey });
      setStep(1);
    }
  };

  if (step === "success") {
    return (
      <SuccessScreen
        adminEmail={data.administrator.email}
        portalUrl={portalUrl ?? buildPortalUrl(data.school.slug)}
      />
    );
  }

  const activeStepNumber = step === "review" ? 3 : step;

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col lg:flex-row">
      <StepIndicator activeStep={activeStepNumber} />

      <div className="flex-1 px-6 py-8 sm:px-10 lg:py-10">
        {step === 1 && (
          <SchoolIdentityStep
            data={data}
            errors={errors}
            onSchoolChange={updateSchool}
            onAdministratorChange={updateAdministrator}
            onLocationChange={updateLocation}
            onLanguageChange={updateLanguage}
            onSlugStatusChange={setSlugStatus}
          />
        )}
        {step === 2 && (
          <AcademicBasicsStep data={data} errors={errors} onAcademicChange={updateAcademic} />
        )}
        {step === "review" && <ReviewStep data={data} submitError={submitError} />}

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-6">
          {step !== 1 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStep(step === "review" ? 2 : 1)}
              disabled={submitting}
            >
              {t("onboarding.nav.previous")}
            </Button>
          ) : (
            <span />
          )}

          {step === 1 && (
            <Button type="button" onClick={handleNextFromStep1}>
              {t("onboarding.nav.saveAndContinue")}
            </Button>
          )}
          {step === 2 && (
            <Button type="button" onClick={handleNextFromStep2}>
              {t("onboarding.nav.saveAndContinue")}
            </Button>
          )}
          {step === "review" && (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? t("onboarding.nav.creating") : t("onboarding.nav.confirmAndCreate")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
