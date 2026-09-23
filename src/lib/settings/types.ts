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
 * `banking` and `social_media` fields confirmed by Muntajir 2026-09-23 (were
 * `{}`/unconfirmed before then — do not revert). `help_feedback` still comes
 * back as `{}` with no fields defined yet; left untyped until confirmed.
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
  banking: {
    bank_name: string | null;
    account_number: string | null;
    account_name: string | null;
    branch: string | null;
  };
  question_bank: {
    questions_per_page: number;
    default_exam_duration_minutes: number;
  };
  social_media: {
    // Exact names per Muntajir — no `_url` suffix.
    facebook: string | null;
    instagram: string | null;
    youtube: string | null;
    twitter: string | null;
  };
  api_integrations: {
    // api_key/client_secret come back masked (e.g. "••••••1234") on GET,
    // never the real secret — see ApiIntegrationsPanel for why they're
    // never seeded into an editable field from this value.
    api_key: string | null;
    sms_sender_name: string | null;
    client_id: string | null;
    client_secret: string | null;
    // Response-only — never sent in a PATCH (excluded from
    // ApiIntegrationsUpdate below, not just by convention).
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

// api_integrations is the one section with a forbidden field within itself:
// `configured` is response-only. Excluding it from the Pick (not just
// leaving it out of the panel's form) makes sending it a compile error,
// not just a discipline.
export type ApiIntegrationsUpdate = Partial<
  Pick<SettingsData["api_integrations"], "api_key" | "sms_sender_name" | "client_id" | "client_secret">
>;

// General Behaviour, Regional, Question Bank, Notification Routing, Banking,
// and Social Media have no forbidden fields within themselves (unlike
// identity's slug/status or api_integrations' configured), so their update
// shapes are just Partial<...the whole section...> — no Pick subset needed.
export type SettingsUpdate = {
  identity?: IdentityUpdate;
  general_behaviour?: Partial<SettingsData["general_behaviour"]>;
  regional?: Partial<SettingsData["regional"]>;
  question_bank?: Partial<SettingsData["question_bank"]>;
  notification_routing?: Partial<SettingsData["notification_routing"]>;
  banking?: Partial<SettingsData["banking"]>;
  social_media?: Partial<SettingsData["social_media"]>;
  api_integrations?: ApiIntegrationsUpdate;
  // Branding's update shape is added here as its own edit panel is wired
  // in a future increment.
};
