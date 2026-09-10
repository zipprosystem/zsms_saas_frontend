import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { WorkingDay } from "@/lib/onboarding/types";
import type { TenantStatus } from "@/types/tenant";

export type SchoolSettings = {
  identity: {
    schoolName: string;
    slug: string;
    customDomain: string;
    email: string;
    phoneDialCode: string;
    phoneNumber: string;
    showWebsiteToVisitors: boolean;
    logoUrl: string | null;
    status: TenantStatus;
  };
  branding: {
    schoolLogoUrl: string | null;
    mobileLogoUrl: string | null;
    principalSignatureUrl: string | null;
    portalLoaderUrl: string | null;
  };
  generalBehaviour: {
    workingDays: WorkingDay[];
    recordsPerPage: number;
    dateFormat: string;
    timeFormat: string;
    absenceEndDelayDays: number;
    notificationChannel: string;
    studentIdPrefix: string;
    staffIdPrefix: string;
  };
  regional: {
    address: string;
    country: string;
    timezone: string;
    currency: string;
    pax: string;
  };
  banking: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    branch: string;
  };
  questionBank: {
    questionsPerPage: number;
    defaultExamDurationMinutes: number;
  };
  socialMedia: {
    facebook: string;
    instagram: string;
    youtube: string;
    twitter: string;
  };
  apiIntegrations: {
    apiKey: string;
    smsSenderName: string;
    clientId: string;
    clientSecret: string;
  };
  notificationRouting: {
    financeAlertEmails: string[];
    disciplinaryAlertEmails: string[];
  };
  helpFeedback: {
    helpCentreUrl: string;
    submitFeedbackUrl: string;
  };
};

export type SchoolIdentityUpdatePayload = {
  schoolName: string;
  customDomain: string;
  email: string;
  phoneDialCode: string;
  phoneNumber: string;
  showWebsiteToVisitors: boolean;
};

// MOCK — realistic seed data standing in for the future settings endpoint
// (something like GET {API_BASE}/settings). Shaped to match SchoolSettings
// so nothing calling getSchoolSettings() needs to change when the real
// endpoint lands.
const MOCK_SETTINGS: SchoolSettings = {
  identity: {
    schoolName: "Zenith Secondary School",
    slug: "zenith-secondary",
    customDomain: "",
    email: "info@zenithsecondary.edu.ng",
    phoneDialCode: "234",
    phoneNumber: "801 234 5678",
    showWebsiteToVisitors: true,
    logoUrl: null,
    status: "active",
  },
  branding: {
    schoolLogoUrl: null,
    mobileLogoUrl: null,
    principalSignatureUrl: null,
    portalLoaderUrl: null,
  },
  generalBehaviour: {
    workingDays: ["mon", "tue", "wed", "thu", "fri"],
    recordsPerPage: 25,
    dateFormat: "DD/MM/YYYY",
    timeFormat: "12-hour",
    absenceEndDelayDays: 3,
    notificationChannel: "Email & SMS",
    studentIdPrefix: "ZSS-STU-",
    staffIdPrefix: "ZSS-STF-",
  },
  regional: {
    address: "12 Allen Avenue, Ikeja, Lagos, Nigeria",
    country: "Nigeria",
    timezone: "Africa/Lagos",
    currency: "NGN",
    pax: "1,200",
  },
  banking: {
    bankName: "Guaranty Trust Bank",
    accountNumber: "0123456789",
    accountName: "Zenith Secondary School",
    branch: "Ikeja Branch",
  },
  questionBank: {
    questionsPerPage: 20,
    defaultExamDurationMinutes: 60,
  },
  socialMedia: {
    facebook: "https://facebook.com/zenithsecondary",
    instagram: "https://instagram.com/zenithsecondary",
    youtube: "",
    twitter: "",
  },
  apiIntegrations: {
    apiKey: "zsms_live_sk_4f8a2c9d1234",
    smsSenderName: "ZENITH",
    clientId: "zsms_client_8891af02",
    clientSecret: "cs_9f2b6e7d4a1c8890",
  },
  notificationRouting: {
    financeAlertEmails: ["bursar@zenithsecondary.edu.ng"],
    disciplinaryAlertEmails: ["viceprincipal@zenithsecondary.edu.ng"],
  },
  helpFeedback: {
    helpCentreUrl: "https://help.zsmsapp.com",
    submitFeedbackUrl: "https://feedback.zsmsapp.com",
  },
};

export async function getSchoolSettings(): Promise<SchoolSettings> {
  await mockDelay(400);
  return structuredClone(MOCK_SETTINGS);
}

// MOCK — simulates the future PATCH {API_BASE}/settings/identity endpoint.
// Keeps the (payload: SchoolIdentityUpdatePayload) => Promise<...> signature
// so the EditSchoolIdentityPanel doesn't need to change when the real
// endpoint lands. Always succeeds — there's nothing real to fail against yet.
export async function updateSchoolIdentity(
  payload: SchoolIdentityUpdatePayload,
): Promise<SchoolSettings["identity"]> {
  await mockDelay(600);
  MOCK_SETTINGS.identity = {
    ...MOCK_SETTINGS.identity,
    ...payload,
  };
  return structuredClone(MOCK_SETTINGS.identity);
}
