import type { WorkingDay } from "@/lib/onboarding/types";
import type { TenantStatus } from "@/types/tenant";

/**
 * Exact shape of Muntajir's SaaS Settings API contract
 * (GET/PATCH {API_BASE}/school/settings). Field names are load-bearing —
 * do not rename/invent. Snake_case throughout, matching the wire format.
 *
 * NULLABILITY (updated 2026-09-22, superseding the documented contract):
 * the real API returns null for far more fields than Muntajir's contract
 * documented as always-present strings — confirmed directly against the
 * 'app' tenant, which currently has null for every one of identity's
 * optional-looking fields, all of regional's string fields, and
 * academic_year entirely. Chasing these one crash at a time (phone, then
 * email) isn't sustainable, so the policy going forward is: every string
 * field is `string | null` unless it's structurally guaranteed to be
 * present — school_name, slug, status, and enums/arrays/numbers/booleans.
 * general_behaviour's and api_integrations' string fields are widened on
 * that same policy, not yet independently observed null — flag to
 * Muntajir either way, since the documented contract undersells
 * nullability across the board and should be corrected at the source.
 *
 * `banking`, `social_media`, and `help_feedback` currently come back as `{}`
 * from the deployed API — no fields defined for them yet. Left untyped
 * (empty object) until Muntajir specifies their shape; do not guess fields
 * for these three.
 */
export type SettingsData = {
  identity: {
    school_name: string;
    slug: string;
    status: TenantStatus;
    email: string | null;
    phone: string | null;
    website: string | null;
    uin: string | null;
    client_name: string | null;
    show_website_to_visitors: boolean;
    logo_url: string | null;
  };
  branding: {
    school_logo_url: string | null;
    mobile_logo_url: string | null;
    principal_signature_url: string | null;
    portal_loader_url: string | null;
  };
  general_behaviour: {
    // Assumes the same day-code set as onboarding's WorkingDay
    // ("mon".."sun") — unconfirmed against this specific endpoint, flag if
    // the real payload uses different codes.
    working_days: WorkingDay[];
    records_per_page: number;
    date_format: string | null;
    time_format: string | null;
    absence_end_delay_days: number;
    notification_channel: string | null;
    student_id_prefix: string | null;
    staff_id_prefix: string | null;
  };
  regional: {
    address: string | null;
    city: string | null;
    postal_code: string | null;
    country_code: string | null;
    region_code: string | null;
    region_name: string | null;
    timezone: string | null;
    currency: string | null;
    language: string;
    additional_languages: string[];
    pax: string | null;
  };
  banking: Record<string, never>;
  question_bank: {
    questions_per_page: number;
    default_exam_duration_minutes: number;
  };
  social_media: Record<string, never>;
  api_integrations: {
    api_key: string | null;
    sms_sender_name: string | null;
    client_id: string | null;
    client_secret: string | null;
    configured: boolean;
  };
  notification_routing: {
    finance_alert_emails: string[];
    disciplinary_alert_emails: string[];
  };
  help_feedback: Record<string, never>;
  // No confirmed shape, and can be entirely null (confirmed on the 'app'
  // tenant) — not rendered or edited in this increment, kept as `unknown`
  // so it round-trips without being inspected.
  academic_year: unknown | null;
  // Optimistic-concurrency style version stamp — read-only, never sent back
  // on PATCH (contract forbids it).
  profile_version: number | string;
};

/**
 * PATCH body shape. Only include the sections/fields actually changed —
 * a true partial update. `identity.slug`, `identity.status`, `school_id`,
 * `academic_year`, and `profile_version` are never sent (contract forbids
 * slug/status/school_id/academic_year/profile_version on write; the JWT
 * resolves school context, so school_id has no place in this payload at all).
 */
export type IdentityUpdate = Partial<
  Pick<
    SettingsData["identity"],
    | "school_name"
    | "email"
    | "phone"
    | "website"
    | "uin"
    | "client_name"
    | "show_website_to_visitors"
    | "logo_url"
  >
>;

// General Behaviour, Regional, Question Bank, and Notification Routing have
// no forbidden fields within themselves (unlike identity's slug/status), so
// their update shapes are just Partial<...the whole section...> — no Pick
// subset needed.
export type SettingsUpdate = {
  identity?: IdentityUpdate;
  general_behaviour?: Partial<SettingsData["general_behaviour"]>;
  regional?: Partial<SettingsData["regional"]>;
  question_bank?: Partial<SettingsData["question_bank"]>;
  notification_routing?: Partial<SettingsData["notification_routing"]>;
  // Branding, Banking, Social Media, and API & Integrations' update shapes
  // are added here as their own edit panels are wired in future increments.
};
