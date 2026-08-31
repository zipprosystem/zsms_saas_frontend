"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/actions/set-locale";
import { useTheme } from "@/hooks/useTheme";
import type { Locale } from "@/i18n/request";

/**
 * Compact theme + language toggles for the public onboarding header.
 * Reuses the same useTheme()/setLocale() logic as the dashboard's
 * UserMenu, just without the dropdown chrome — a global signup page
 * needs language switching before anyone is signed in.
 */
export function OnboardingHeaderControls() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { theme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  const handleSetLocale = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      window.location.reload();
    });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex overflow-hidden rounded-full border border-border bg-surface text-xs font-semibold">
        <button
          type="button"
          onClick={() => setTheme("light")}
          aria-pressed={theme === "light"}
          className={`px-3 py-1.5 transition-colors ${
            theme === "light" ? "bg-accent text-on-accent" : "text-text-secondary hover:bg-background"
          }`}
        >
          {t("header.lightMode")}
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          aria-pressed={theme === "dark"}
          className={`px-3 py-1.5 transition-colors ${
            theme === "dark" ? "bg-accent text-on-accent" : "text-text-secondary hover:bg-background"
          }`}
        >
          {t("header.darkMode")}
        </button>
      </div>

      <div className="flex overflow-hidden rounded-full border border-border bg-surface text-xs font-semibold">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSetLocale("en")}
          aria-pressed={locale === "en"}
          className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
            locale === "en" ? "bg-accent text-on-accent" : "text-text-secondary hover:bg-background"
          }`}
        >
          EN
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleSetLocale("fr")}
          aria-pressed={locale === "fr"}
          className={`px-3 py-1.5 transition-colors disabled:opacity-50 ${
            locale === "fr" ? "bg-accent text-on-accent" : "text-text-secondary hover:bg-background"
          }`}
        >
          FR
        </button>
      </div>
    </div>
  );
}
