import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { SettingsData, SettingsUpdate } from "./types";

/**
 * THROWAWAY dev scaffolding — used ONLY when DEV_AUTH_BYPASS is on (see
 * settingsApi.ts), so Settings can be edited locally and the report
 * header / British cover pick the values up (exam mock). Production and
 * staging never touch it; they use the real school/settings API.
 * Generic sample values — no real school.
 */
const STORAGE_KEY = "zsms.devMockSettings";

const SEED: SettingsData = {
  identity: {
    school_name: "ZSMS Demo School",
    slug: "demo",
    status: "active",
    email: "info@zsms-demo.example",
    phone: "+234 800 000 0000",
    website: "https://www.zsms-demo.example",
    uin: null,
    client_name: null,
    show_website_to_visitors: true,
    logo_url: null,
    // Filled from the identity-extras side-store (schoolIdentityExtras.ts), like on staging.
    motto: null,
    mission_statement: null,
  },
  branding: { school_logo_url: null, mobile_logo_url: null, principal_signature_url: null, portal_loader_url: null },
  general_behaviour: {
    working_days: ["mon", "tue", "wed", "thu", "fri"],
    records_per_page: 25,
    date_format: null,
    time_format: null,
    absence_end_delay_days: 0,
    notification_channel: null,
    student_id_prefix: null,
    staff_id_prefix: null,
  },
  regional: {
    address: "1 Example Road, Lagos",
    city: null,
    postal_code: null,
    country_code: "NG",
    region_code: null,
    region_name: null,
    timezone: "Africa/Lagos",
    currency: "NGN",
    language: "en",
    additional_languages: [],
    pax: null,
  },
  banking: { bank_name: null, account_number: null, account_name: null, branch: null },
  question_bank: { questions_per_page: 10, default_exam_duration_minutes: 60 },
  social_media: { facebook: null, instagram: null, youtube: null, twitter: null },
  api_integrations: { api_key: null, sms_sender_name: null, client_id: null, client_secret: null, configured: false },
  notification_routing: { finance_alert_emails: [], disciplinary_alert_emails: [] },
  help_feedback: {},
  academic_year: null,
  profile_version: 1,
};

function load(): SettingsData {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as SettingsData | null;
    if (parsed && typeof parsed === "object" && parsed.identity) return parsed;
  } catch {
    // fall through to the seed
  }
  return structuredClone(SEED);
}

function save(data: SettingsData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // best-effort (a large logo may not fit)
  }
}

export async function devGetSettings(): Promise<SettingsData> {
  await mockDelay(150);
  return load();
}

/** A true partial merge, section by section — same as the real PATCH. */
export async function devPatchSettings(update: SettingsUpdate): Promise<SettingsData> {
  await mockDelay(200);
  const data = load() as unknown as Record<string, Record<string, unknown>>;
  for (const [section, fields] of Object.entries(update)) {
    if (fields && typeof fields === "object") data[section] = { ...data[section], ...(fields as Record<string, unknown>) };
  }
  const next = data as unknown as SettingsData;
  next.profile_version = Number(next.profile_version) + 1;
  save(next);
  return next;
}

/** The uploaded logo kept as a data URL (this browser only). */
export async function devUploadLogo(payload: { content_base64: string; mime_type: string }): Promise<{ logo_url: string; profile_version: number | string }> {
  await mockDelay(200);
  const data = load();
  const url = `data:${payload.mime_type};base64,${payload.content_base64}`;
  data.identity.logo_url = url;
  data.branding.school_logo_url = url;
  data.profile_version = Number(data.profile_version) + 1;
  save(data);
  return { logo_url: url, profile_version: data.profile_version };
}
