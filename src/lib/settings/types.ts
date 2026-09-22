import type { WorkingDay } from "@/lib/onboarding/types";
import type { TenantStatus } from "@/types/tenant";

/**
 * Exact shape of Muntajir's SaaS Settings API contract
 * (GET/PATCH {API_BASE}/school/settings). Field names are load-bearing —
 * do not rename/invent. Snake_case throughout, matching the wire format.
 *
 * `banking`, `social_media`, and `help_feedback` currently come back as `{}`
 * from the deployed API — no fields defined for them yet. Left untyped
 * (empty object) until Muntajir specifies their shape; do not guess fields
 * for these three.
 *
 * `academic_year` has no confirmed shape and isn't rendered or edited in
 * this increment — kept as `unknown` so it round-trips without being
 * inspected.
 */
export type SettingsData = {
  identity: {
    school_name: string;
    slug: string;
    status: TenantStatus;
    email: string;
    // Confirmed nullable against real tenant data (this tenant had no
    // phone on file) — was wrongly typed as always-present `string`,
    // which let a raw `.trim()` on it crash the read/edit paths.
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
    date_format: string;
    time_format: string;
    absence_end_delay_days: number;
    notification_channel: string;
    student_id_prefix: string;
    staff_id_prefix: string;
  };
  regional: {
    address: string;
    city: string;
    postal_code: string;
    country_code: string;
    region_code: string;
    region_name: string;
    timezone: string;
    currency: string;
    language: string;
    additional_languages: string[];
    pax: string;
  };
  banking: Record<string, never>;
  question_bank: {
    questions_per_page: number;
    default_exam_duration_minutes: number;
  };
  social_media: Record<string, never>;
  api_integrations: {
    api_key: string;
    sms_sender_name: string;
    client_id: string;
    client_secret: string;
    configured: boolean;
  };
  notification_routing: {
    finance_alert_emails: string[];
    disciplinary_alert_emails: string[];
  };
  help_feedback: Record<string, never>;
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

export type SettingsUpdate = {
  identity?: IdentityUpdate;
  // Other sections' update shapes are added here as their own edit panels
  // are wired in future increments.
};
