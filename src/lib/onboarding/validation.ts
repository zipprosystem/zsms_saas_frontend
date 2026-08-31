import type { OnboardingData, SlugStatus } from "./types";

export type FieldErrors = Record<string, string>;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStep1(
  data: OnboardingData,
  slugStatus: SlugStatus,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!data.school.name.trim()) {
    errors["school.name"] = "onboarding.errors.required";
  }

  const slug = data.school.slug.trim();
  if (!slug) {
    errors["school.slug"] = "onboarding.errors.required";
  } else if (!SLUG_PATTERN.test(slug)) {
    errors["school.slug"] = "onboarding.errors.invalidSlug";
  } else if (slugStatus === "taken") {
    errors["school.slug"] = "onboarding.errors.slugTaken";
  } else if (slugStatus === "checking" || slugStatus === "idle") {
    errors["school.slug"] = "onboarding.errors.slugChecking";
  }

  if (!data.administrator.firstName.trim()) {
    errors["administrator.firstName"] = "onboarding.errors.required";
  }
  if (!data.administrator.lastName.trim()) {
    errors["administrator.lastName"] = "onboarding.errors.required";
  }
  if (!data.administrator.email.trim()) {
    errors["administrator.email"] = "onboarding.errors.required";
  } else if (!EMAIL_PATTERN.test(data.administrator.email.trim())) {
    errors["administrator.email"] = "onboarding.errors.invalidEmail";
  }

  if (!data.location.countryCode) {
    errors["location.countryCode"] = "onboarding.errors.required";
  }

  if (!data.language.default) {
    errors["language.default"] = "onboarding.errors.required";
  }

  return errors;
}

export function validateStep2(data: OnboardingData): FieldErrors {
  const errors: FieldErrors = {};

  if (!data.academic.yearName.trim()) {
    errors["academic.yearName"] = "onboarding.errors.required";
  }
  if (!data.academic.sessionStartDate) {
    errors["academic.sessionStartDate"] = "onboarding.errors.required";
  }
  if (!data.academic.sessionEndDate) {
    errors["academic.sessionEndDate"] = "onboarding.errors.required";
  } else if (
    data.academic.sessionStartDate &&
    data.academic.sessionEndDate <= data.academic.sessionStartDate
  ) {
    errors["academic.sessionEndDate"] = "onboarding.errors.endBeforeStart";
  }

  if (!data.academic.schoolMode) {
    errors["academic.schoolMode"] = "onboarding.errors.required";
  }
  if (data.academic.schoolTypes.length === 0) {
    errors["academic.schoolTypes"] = "onboarding.errors.selectAtLeastOne";
  }
  // Award Body is intentionally optional — a school with no external
  // examining body must still be able to proceed.

  return errors;
}
