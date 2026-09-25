/**
 * The single source of truth for which Settings sections exist and their
 * i18n title key — extracted out of admin/settings/page.tsx (which
 * previously defined this tuple inline, just to derive its own
 * EditableSection type) so the global search index can read the exact
 * same list instead of hand-maintaining a second copy. page.tsx now
 * imports this instead of defining it itself.
 */
export const SETTINGS_SECTION_KEYS = [
  "identity",
  "branding",
  "generalBehaviour",
  "regional",
  "banking",
  "questionBank",
  "socialMedia",
  "apiIntegrations",
  "notificationRouting",
] as const;

export type SettingsSectionKey = (typeof SETTINGS_SECTION_KEYS)[number];

export function settingsSectionTitleKey(key: SettingsSectionKey): string {
  return `settings.sections.${key}.title`;
}

/** Every section deep-links here — `/admin/settings` reads `?edit=` on mount to open that section's panel. */
export function settingsSectionHref(key: SettingsSectionKey): string {
  return `/admin/settings?edit=${key}`;
}
