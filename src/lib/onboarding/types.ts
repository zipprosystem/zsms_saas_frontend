export type WorkingDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type SchoolMode = "day" | "boarding" | "both";
export type LanguageCode = "en" | "fr";
// "unknown": the availability check failed or timed out. Distinct from
// "idle" (never checked) so the UI can show a soft "couldn't verify" note
// instead of a silent reset — and so validation doesn't block on it, since
// this is a soft UX check only (real enforcement is the 409 on submit).
export type SlugStatus = "idle" | "checking" | "available" | "taken" | "unknown";

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
 * first-class home for (session dates, school mode/types, award bodies).
 *
 * ADJUSTMENT (pending Muntajir's confirmation, Monday): the written contract
 * put `working_days` and `academic_year` at the top level, but the deployed
 * API rejects them there — "Unrecognized key(s) in object: 'working_days',
 * 'academic_year'" — while `additional_data` and `custom_domain` ARE
 * accepted top-level. Since `additional_data` already exists and is
 * accepted, we're inferring `working_days`/`academic_year` belong nested
 * inside it instead. This is an inference from the deployed API's error,
 * not a confirmed contract change — reconcile with Muntajir and update this
 * comment once confirmed.
 */
export type OnboardingContractPayload = {
  school: {
    name: string;
    slug: string;
    email?: string;
    phone?: string;
    website?: string;
    uin?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country_code: string;
    region_code?: string;
    region_name?: string;
    timezone: string;
    currency: string;
    language: LanguageCode;
    additional_languages: LanguageCode[];
  };
  owner: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
  custom_domain?: string;
  // working_days is always sent (no default-empty omission, same as
  // before this change), just nested here instead of top-level now.
  additional_data: {
    academic_year?: string;
    working_days: WorkingDay[];
    academic?: {
      session_start_date: string;
      session_end_date: string;
      school_mode: SchoolMode;
      school_types: string[];
      award_bodies: string[];
    };
  };
};

function combinedPhone(dialCode: string, number: string): string {
  const trimmed = number.trim();
  return trimmed ? `+${dialCode} ${trimmed}` : "";
}

// Optional contract fields are OMITTED when empty, never sent as null.
// WORKAROUND: the deployed API 422s on `null` for optional fields (confirmed
// for school.website and school.uin), even though the contract lists them as
// optional. Reconcile with Muntajir whether the API should accept null or
// only absent keys for optional fields, then drop or keep this accordingly.
function omitEmpty<T extends Record<string, string | undefined>>(fields: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<T>;
}

export function toContractPayload(data: OnboardingData): OnboardingContractPayload {
  const payload: OnboardingContractPayload = {
    school: {
      name: data.school.name.trim(),
      slug: data.school.slug.trim().toLowerCase(),
      ...omitEmpty({
        email: data.school.email.trim(),
        phone: combinedPhone(data.school.phoneDialCode, data.school.phoneNumber),
        website: data.school.website.trim(),
        uin: data.school.uin.trim(),
        address: data.location.street.trim(),
        city: data.location.city.trim(),
        postal_code: data.location.postalCode.trim(),
        region_code: data.location.stateCode,
        region_name: data.location.region.trim(),
      }),
      country_code: data.location.countryCode,
      timezone: data.location.timezone,
      currency: data.location.currency,
      language: data.language.default,
      additional_languages: data.language.additional,
    },
    owner: {
      first_name: data.owner.firstName.trim(),
      last_name: data.owner.lastName.trim(),
      email: data.owner.email.trim(),
      ...omitEmpty({
        phone: combinedPhone(data.owner.phoneDialCode, data.owner.phoneNumber),
      }),
    },
    // working_days nested here, not top-level — see the ADJUSTMENT note on
    // OnboardingContractPayload above.
    additional_data: {
      working_days: data.school.workingDays,
    },
  };

  const customDomain = data.school.customDomain.trim();
  if (customDomain) payload.custom_domain = customDomain;

  const academicYear = data.academic.yearName.trim();
  if (academicYear) payload.additional_data.academic_year = academicYear;

  if (
    data.academic.sessionStartDate ||
    data.academic.sessionEndDate ||
    data.academic.schoolMode ||
    data.academic.schoolTypes.length ||
    data.academic.awardBodies.length
  ) {
    payload.additional_data.academic = {
      session_start_date: data.academic.sessionStartDate,
      session_end_date: data.academic.sessionEndDate,
      school_mode: data.academic.schoolMode || "day",
      school_types: data.academic.schoolTypes,
      award_bodies: data.academic.awardBodies,
    };
  }

  return payload;
}
