export type WorkingDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type SchoolMode = "day" | "boarding" | "both";
export type LanguageCode = "en" | "fr";
export type SlugStatus = "idle" | "checking" | "available" | "taken";

export type OnboardingData = {
  school: {
    name: string;
    slug: string;
    customDomain: string;
    email: string;
    phoneDialCode: string;
    phoneNumber: string;
    website: string;
    uin: string;
    /**
     * Collected for later use — the Public Onboarding API has no asset
     * upload endpoint (both its endpoints are JSON-only), so there's
     * nowhere to send this yet. Kept in the UI, never included in the
     * submission payload. See toContractPayload().
     */
    logo: File | null;
    logoPreviewUrl: string | null;
    workingDays: WorkingDay[];
  };
  owner: {
    firstName: string;
    lastName: string;
    email: string;
    phoneDialCode: string;
    phoneNumber: string;
  };
  location: {
    countryCode: string;
    /** ISO state/province code — "" when the country has no state dataset and region was free-typed. */
    stateCode: string;
    /** Display name — the selected state's name, or free text when there's no state dataset. */
    region: string;
    city: string;
    street: string;
    postalCode: string;
    timezone: string;
    currency: string;
  };
  language: {
    default: LanguageCode;
    additional: LanguageCode[];
  };
  academic: {
    yearName: string;
    sessionStartDate: string;
    sessionEndDate: string;
    schoolMode: SchoolMode | "";
    schoolTypes: string[];
    awardBodies: string[];
  };
};

/**
 * Exact shape of Muntajir's Public Onboarding API Contract
 * (POST {API_BASE}/public/onboarding). Field paths here are load-bearing —
 * do not rename/invent. `tenant` is intentionally omitted (optional, and
 * this form has no concept distinct from `school`). `additional_data` is
 * the only place for the academic-step fields the contract doesn't have a
 * first-class home for (session dates, school mode/types, award bodies) —
 * everything except `academic_year` (from yearName).
 */
export type OnboardingContractPayload = {
  school: {
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    website: string | null;
    uin: string | null;
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country_code: string;
    region_code: string | null;
    region_name: string | null;
    timezone: string;
    currency: string;
    language: LanguageCode;
    additional_languages: LanguageCode[];
  };
  owner: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  };
  custom_domain?: string;
  working_days: WorkingDay[];
  academic_year?: string;
  additional_data?: {
    academic: {
      session_start_date: string;
      session_end_date: string;
      school_mode: SchoolMode;
      school_types: string[];
      award_bodies: string[];
    };
  };
};

function combinedPhone(dialCode: string, number: string): string | null {
  const trimmed = number.trim();
  return trimmed ? `+${dialCode} ${trimmed}` : null;
}

export function toContractPayload(data: OnboardingData): OnboardingContractPayload {
  const payload: OnboardingContractPayload = {
    school: {
      name: data.school.name.trim(),
      slug: data.school.slug.trim().toLowerCase(),
      email: data.school.email.trim() || null,
      phone: combinedPhone(data.school.phoneDialCode, data.school.phoneNumber),
      website: data.school.website.trim() || null,
      uin: data.school.uin.trim() || null,
      address: data.location.street.trim() || null,
      city: data.location.city.trim() || null,
      postal_code: data.location.postalCode.trim() || null,
      country_code: data.location.countryCode,
      region_code: data.location.stateCode || null,
      region_name: data.location.region.trim() || null,
      timezone: data.location.timezone,
      currency: data.location.currency,
      language: data.language.default,
      additional_languages: data.language.additional,
    },
    owner: {
      first_name: data.owner.firstName.trim(),
      last_name: data.owner.lastName.trim(),
      email: data.owner.email.trim(),
      phone: combinedPhone(data.owner.phoneDialCode, data.owner.phoneNumber),
    },
    working_days: data.school.workingDays,
  };

  const customDomain = data.school.customDomain.trim();
  if (customDomain) payload.custom_domain = customDomain;

  const academicYear = data.academic.yearName.trim();
  if (academicYear) payload.academic_year = academicYear;

  if (
    data.academic.sessionStartDate ||
    data.academic.sessionEndDate ||
    data.academic.schoolMode ||
    data.academic.schoolTypes.length ||
    data.academic.awardBodies.length
  ) {
    payload.additional_data = {
      academic: {
        session_start_date: data.academic.sessionStartDate,
        session_end_date: data.academic.sessionEndDate,
        school_mode: data.academic.schoolMode || "day",
        school_types: data.academic.schoolTypes,
        award_bodies: data.academic.awardBodies,
      },
    };
  }

  return payload;
}
