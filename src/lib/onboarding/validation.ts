import type { OnboardingData, SlugStatus } from "./types";

export type FieldErrors = Record<string, string>;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const SCHOOL_NAME_MIN_LENGTH = 2;
export const SCHOOL_NAME_MAX_LENGTH = 255;
export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 100;

export function validateStep1(
  data: OnboardingData,
  slugStatus: SlugStatus,
): FieldErrors {
  const errors: FieldErrors = {};

  const name = data.school.name.trim();
  if (!name) {
    errors["school.name"] = "onboarding.errors.required";
  } else if (name.length < SCHOOL_NAME_MIN_LENGTH || name.length > SCHOOL_NAME_MAX_LENGTH) {
    errors["school.name"] = "onboarding.errors.nameLength";
  }

  const slug = data.school.slug.trim();
  if (!slug) {
    errors["school.slug"] = "onboarding.errors.required";
  } else if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    errors["school.slug"] = "onboarding.errors.slugLength";
  } else if (!SLUG_PATTERN.test(slug)) {
    errors["school.slug"] = "onboarding.errors.invalidSlug";
  } else if (slugStatus === "taken") {
    errors["school.slug"] = "onboarding.errors.slugTaken";
  } else if (slugStatus === "checking" || slugStatus === "idle") {
    errors["school.slug"] = "onboarding.errors.slugChecking";
  }

  if (!data.owner.firstName.trim()) {
    errors["owner.firstName"] = "onboarding.errors.required";
  }
  if (!data.owner.lastName.trim()) {
    errors["owner.lastName"] = "onboarding.errors.required";
  }
  if (!data.owner.email.trim()) {
    errors["owner.email"] = "onboarding.errors.required";
  } else if (!EMAIL_PATTERN.test(data.owner.email.trim())) {
    errors["owner.email"] = "onboarding.errors.invalidEmail";
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

// Maps the Public Onboarding API's 422 error field paths (exact contract
// paths, e.g. "school.slug", "owner.email") back to the form's own error
// keys (which follow OnboardingData's shape, e.g. "location.countryCode"
// for "school.country_code" — the two diverge because the form groups
// location fields separately from the rest of `school`). Assumption,
// flagged in the review: the backend's errors[].field values match the
// contract's own dot-paths one-to-one. Adjust this map if that turns out
// not to hold once tested against the real API.
const CONTRACT_FIELD_TO_FORM_FIELD: Record<string, string> = {
  "school.name": "school.name",
  "school.slug": "school.slug",
  "school.email": "school.email",
  "school.phone": "school.phone",
  "school.website": "school.website",
  "school.uin": "school.uin",
  "school.address": "location.street",
  "school.city": "location.city",
  "school.postal_code": "location.postalCode",
  "school.country_code": "location.countryCode",
  "school.region_code": "location.region",
  "school.region_name": "location.region",
  "school.timezone": "location.timezone",
  "school.currency": "location.currency",
  "school.language": "language.default",
  "school.additional_languages": "language.additional",
  "owner.first_name": "owner.firstName",
  "owner.last_name": "owner.lastName",
  "owner.email": "owner.email",
  "owner.phone": "owner.phone",
  custom_domain: "school.customDomain",
  working_days: "school.workingDays",
  academic_year: "academic.yearName",
};

export type MappedFieldErrors = {
  /** Form-field errors that could be routed to a specific input. */
  fieldErrors: FieldErrors;
  /** 422 errors whose field path has no known form field — surfaced as a general banner instead. */
  unmapped: string[];
};

export function mapContractFieldErrors(
  errors: Array<{ field: string; message?: string }>,
): MappedFieldErrors {
  const fieldErrors: FieldErrors = {};
  const unmapped: string[] = [];

  for (const error of errors) {
    const formField = CONTRACT_FIELD_TO_FORM_FIELD[error.field];
    if (formField) {
      // Form components resolve `errors[key]` as an i18n key (see
      // errorText() in each step) — the server's message text isn't one,
      // so it can't be stored here. It's not lost: unmapped-style raw text
      // would only be useful in the general banner, and a field that *did*
      // map already gets a highlighted input, which is the more useful signal.
      fieldErrors[formField] = "onboarding.errors.fieldInvalid";
    } else {
      unmapped.push(error.message || error.field);
    }
  }

  return { fieldErrors, unmapped };
}

/** Which wizard step owns a given form field key, for routing 422 errors back to the right screen. */
export function stepForFormField(formField: string): 1 | 2 {
  return formField.startsWith("academic.") ? 2 : 1;
}
