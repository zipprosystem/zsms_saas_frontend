export type ConfigOption = { value: string; labelKey: string };

// reCAPTCHA v2 checkbox site key for the review step's verification widget.
// Empty (not undefined) when unset so callers can do a simple truthiness
// check — RecaptchaField renders nothing (dev-only misconfiguration
// fallback, never a real-user path) rather than crashing when this is "".
export const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

// Editable lists — add/remove entries here to change what's offered in the
// wizard's chip selectors. Values are stable identifiers (used in the
// submission payload); labelKey resolves the display text via i18n.

export const SCHOOL_MODES: ConfigOption[] = [
  { value: "day", labelKey: "onboarding.options.schoolMode.day" },
  { value: "boarding", labelKey: "onboarding.options.schoolMode.boarding" },
  { value: "both", labelKey: "onboarding.options.schoolMode.both" },
];

// SCHOOL_TYPES/AWARD_BODIES config removed — Onboarding Option 2 drops
// School Type + Award Body collection from the public onboarding form
// entirely (that's now purely a post-approval Setup-screen concern; see
// src/lib/setup/academicStructure/{schoolTypesApi,awardBodiesApi}.ts).

export const WORKING_DAYS: ConfigOption[] = [
  { value: "mon", labelKey: "onboarding.options.workingDays.mon" },
  { value: "tue", labelKey: "onboarding.options.workingDays.tue" },
  { value: "wed", labelKey: "onboarding.options.workingDays.wed" },
  { value: "thu", labelKey: "onboarding.options.workingDays.thu" },
  { value: "fri", labelKey: "onboarding.options.workingDays.fri" },
  { value: "sat", labelKey: "onboarding.options.workingDays.sat" },
  { value: "sun", labelKey: "onboarding.options.workingDays.sun" },
];

export const LANGUAGES: ConfigOption[] = [
  { value: "en", labelKey: "onboarding.options.language.en" },
  { value: "fr", labelKey: "onboarding.options.language.fr" },
];
