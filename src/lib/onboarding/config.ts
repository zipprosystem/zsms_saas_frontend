export type ConfigOption = { value: string; labelKey: string };

// Editable lists — add/remove entries here to change what's offered in the
// wizard's chip selectors. Values are stable identifiers (used in the
// submission payload); labelKey resolves the display text via i18n.

export const SCHOOL_MODES: ConfigOption[] = [
  { value: "day", labelKey: "onboarding.options.schoolMode.day" },
  { value: "boarding", labelKey: "onboarding.options.schoolMode.boarding" },
  { value: "both", labelKey: "onboarding.options.schoolMode.both" },
];

export const SCHOOL_TYPES: ConfigOption[] = [
  { value: "creche", labelKey: "onboarding.options.schoolType.creche" },
  { value: "playgroup", labelKey: "onboarding.options.schoolType.playgroup" },
  { value: "preNursery", labelKey: "onboarding.options.schoolType.preNursery" },
  { value: "nursery", labelKey: "onboarding.options.schoolType.nursery" },
  { value: "primary", labelKey: "onboarding.options.schoolType.primary" },
  { value: "grade", labelKey: "onboarding.options.schoolType.grade" },
  { value: "secondary", labelKey: "onboarding.options.schoolType.secondary" },
  { value: "juniorSecondary", labelKey: "onboarding.options.schoolType.juniorSecondary" },
  { value: "seniorSecondary", labelKey: "onboarding.options.schoolType.seniorSecondary" },
  { value: "college", labelKey: "onboarding.options.schoolType.college" },
  { value: "keystage3", labelKey: "onboarding.options.schoolType.keystage3" },
  { value: "keystage4", labelKey: "onboarding.options.schoolType.keystage4" },
];

export const AWARD_BODIES: ConfigOption[] = [
  { value: "waec", labelKey: "onboarding.options.awardBody.waec" },
  { value: "neco", labelKey: "onboarding.options.awardBody.neco" },
  { value: "cambridge", labelKey: "onboarding.options.awardBody.cambridge" },
  { value: "ib", labelKey: "onboarding.options.awardBody.ib" },
  { value: "edexcel", labelKey: "onboarding.options.awardBody.edexcel" },
];

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
