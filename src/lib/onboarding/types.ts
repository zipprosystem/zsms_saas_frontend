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
    logo: File | null;
    logoPreviewUrl: string | null;
    workingDays: WorkingDay[];
    showWebsiteToVisitors: boolean;
  };
  administrator: {
    firstName: string;
    lastName: string;
    email: string;
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
 * The shape the future provisioning API needs. Deliberately excludes
 * subscription data and any password field — password is set later via
 * an emailed invite link, not collected on this form.
 */
export type OnboardingSubmissionPayload = {
  school: {
    name: string;
    slug: string;
    customDomain: string | null;
    email: string | null;
    phone: string | null;
    logoFileName: string | null;
    workingDays: WorkingDay[];
    showWebsiteToVisitors: boolean;
  };
  administrator: {
    firstName: string;
    lastName: string;
    email: string;
  };
  location: OnboardingData["location"];
  language: OnboardingData["language"];
  academic: {
    yearName: string;
    sessionStartDate: string;
    sessionEndDate: string;
    schoolMode: SchoolMode;
    schoolTypes: string[];
    awardBodies: string[];
  };
};

export function toSubmissionPayload(
  data: OnboardingData,
): OnboardingSubmissionPayload {
  return {
    school: {
      name: data.school.name.trim(),
      slug: data.school.slug.trim().toLowerCase(),
      customDomain: data.school.customDomain.trim() || null,
      email: data.school.email.trim() || null,
      phone: data.school.phoneNumber.trim()
        ? `+${data.school.phoneDialCode} ${data.school.phoneNumber.trim()}`
        : null,
      logoFileName: data.school.logo?.name ?? null,
      workingDays: data.school.workingDays,
      showWebsiteToVisitors: data.school.showWebsiteToVisitors,
    },
    administrator: {
      firstName: data.administrator.firstName.trim(),
      lastName: data.administrator.lastName.trim(),
      email: data.administrator.email.trim(),
    },
    location: data.location,
    language: data.language,
    academic: {
      yearName: data.academic.yearName.trim(),
      sessionStartDate: data.academic.sessionStartDate,
      sessionEndDate: data.academic.sessionEndDate,
      schoolMode: data.academic.schoolMode || "day",
      schoolTypes: data.academic.schoolTypes,
      awardBodies: data.academic.awardBodies,
    },
  };
}
