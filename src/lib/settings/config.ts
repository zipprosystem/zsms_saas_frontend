import type { ConfigOption } from "@/lib/onboarding/config";

// Option lists for the General Behaviour panel's dropdowns. `value` is the
// exact wire string the contract expects (per Muntajir, flagged unsure —
// confirm these are the only accepted values); `labelKey` resolves the
// i18n display text, so the wire value is never shown to the user raw.
export const DATE_FORMATS: ConfigOption[] = [
  { value: "DD/MM/YYYY", labelKey: "settings.options.dateFormat.dmy" },
  { value: "MM/DD/YYYY", labelKey: "settings.options.dateFormat.mdy" },
  { value: "YYYY-MM-DD", labelKey: "settings.options.dateFormat.iso" },
];

export const TIME_FORMATS: ConfigOption[] = [
  { value: "12-hour", labelKey: "settings.options.timeFormat.12h" },
  { value: "24-hour", labelKey: "settings.options.timeFormat.24h" },
];

export const NOTIFICATION_CHANNELS: ConfigOption[] = [
  { value: "Email", labelKey: "settings.options.notificationChannel.email" },
  { value: "SMS", labelKey: "settings.options.notificationChannel.sms" },
  { value: "Email & SMS", labelKey: "settings.options.notificationChannel.emailAndSms" },
];
