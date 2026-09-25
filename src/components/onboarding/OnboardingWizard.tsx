"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type ReCAPTCHA from "react-google-recaptcha";
import { Button } from "@/components/ui/Button";
import { StepIndicator } from "./StepIndicator";
import { SchoolIdentityStep } from "./steps/SchoolIdentityStep";
import { AcademicBasicsStep } from "./steps/AcademicBasicsStep";
import { ReviewStep } from "./steps/ReviewStep";
import { SuccessScreen } from "./SuccessScreen";
import { toContractPayload, type OnboardingData, type SlugStatus } from "@/lib/onboarding/types";
import { submitOnboarding } from "@/lib/onboarding/onboardingApi";
import { RECAPTCHA_SITE_KEY } from "@/lib/onboarding/config";
import {
  mapContractFieldErrors,
  stepForFormField,
  validateStep1,
  validateStep2,
  type FieldErrors,
} from "@/lib/onboarding/validation";

const INITIAL_DATA: OnboardingData = {
  school: {
    name: "",
    slug: "",
    customDomain: "",
    email: "",
    phoneDialCode: "234",
    phoneNumber: "",
    website: "",
    uin: "",
    logo: null,
    logoPreviewUrl: null,
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
  },
  owner: { firstName: "", lastName: "", email: "", phoneDialCode: "234", phoneNumber: "" },
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
    schoolTypePairs: [],
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
  const [requestReference, setRequestReference] = useState<string | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaError, setRecaptchaError] = useState<string | null>(null);
  const recaptchaRef = useRef<ReCAPTCHA>(null);

  const handleRecaptchaChange = (token: string | null) => {
    setRecaptchaToken(token);
    if (token) setRecaptchaError(null);
  };

  const updateSchool = (patch: Partial<OnboardingData["school"]>) =>
    setData((current) => ({ ...current, school: { ...current.school, ...patch } }));
  const updateOwner = (patch: Partial<OnboardingData["owner"]>) =>
    setData((current) => ({ ...current, owner: { ...current.owner, ...patch } }));
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

  const resetRecaptcha = () => {
    recaptchaRef.current?.reset();
    setRecaptchaToken(null);
  };

  const handleSubmit = async () => {
    // Only enforce the checkbox when the widget can actually render — a
    // missing site key (see RecaptchaField) means there's nothing for the
    // user to complete, so don't lock the form on a token that can never
    // exist. recaptchaToken stays "" in that case (see submitOnboarding call
    // below), which is expected until Muntajir's server-side check lands.
    if (RECAPTCHA_SITE_KEY && !recaptchaToken) {
      setRecaptchaError(t("onboarding.errors.recaptchaRequired"));
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    const result = await submitOnboarding(toContractPayload(data, t), recaptchaToken ?? "");
    setSubmitting(false);

    if (result.ok) {
      setRequestReference(result.requestReference);
      setStep("success");
      return;
    }

    // A submitted token is single-use and short-lived — whatever the
    // failure reason, force a fresh check before the next attempt.
    resetRecaptcha();

    switch (result.kind) {
      case "field": {
        const { fieldErrors, unmapped } = mapContractFieldErrors(result.errors);
        setErrors(fieldErrors);
        const firstField = Object.keys(fieldErrors)[0];
        if (firstField) setStep(stepForFormField(firstField));
        if (unmapped.length > 0) {
          setSubmitError(unmapped.join(" "));
        } else if (firstField) {
          setSubmitError(t("onboarding.errors.submitField"));
        }
        break;
      }
      case "slugTaken":
        setErrors({ "school.slug": "onboarding.errors.slugTaken" });
        setStep(1);
        break;
      case "badRequest":
        setSubmitError(t("onboarding.errors.submitBadRequest"));
        break;
      case "rateLimited":
        setSubmitError(t("onboarding.errors.submitRateLimited"));
        break;
      case "server":
        setSubmitError(t("onboarding.errors.submitServer"));
        break;
    }
  };

  if (step === "success" && requestReference) {
    return <SuccessScreen ownerEmail={data.owner.email} requestReference={requestReference} />;
  }

  const activeStepNumber = step === "review" ? 3 : (step as 1 | 2);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col lg:flex-row">
      <StepIndicator activeStep={activeStepNumber} />

      <div className="flex-1 px-6 py-8 sm:px-10 lg:py-10">
        {step === 1 && (
          <SchoolIdentityStep
            data={data}
            errors={errors}
            onSchoolChange={updateSchool}
            onOwnerChange={updateOwner}
            onLocationChange={updateLocation}
            onLanguageChange={updateLanguage}
            onSlugStatusChange={setSlugStatus}
          />
        )}
        {step === 2 && (
          <AcademicBasicsStep data={data} errors={errors} onAcademicChange={updateAcademic} />
        )}
        {step === "review" && (
          <ReviewStep
            data={data}
            submitError={submitError}
            recaptchaRef={recaptchaRef}
            onRecaptchaChange={handleRecaptchaChange}
            recaptchaError={recaptchaError}
          />
        )}

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
