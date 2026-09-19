"use client";

import type { RefObject } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { RECAPTCHA_SITE_KEY } from "@/lib/onboarding/config";
import type { Locale } from "@/i18n/request";

type RecaptchaFieldProps = {
  recaptchaRef: RefObject<ReCAPTCHA>;
  onChange: (token: string | null) => void;
  error?: string | null;
};

/**
 * reCAPTCHA v2 checkbox for the onboarding review step. Frontend-only: this
 * renders the widget and hands the completed token up to the caller, which
 * sends it with submit. Verification happens server-side (Muntajir) — never
 * attempt to validate the token here.
 */
export function RecaptchaField({ recaptchaRef, onChange, error }: RecaptchaFieldProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { theme } = useTheme();

  if (!RECAPTCHA_SITE_KEY) {
    // Misconfiguration fallback (missing env var) — never expected in a
    // real deployment, so this stays a quiet muted note rather than an
    // error banner. Submission isn't blocked on a token that can't exist.
    return (
      <p className="text-xs text-text-muted">{t("onboarding.recaptcha.unavailable")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="w-fit max-w-full overflow-x-auto">
        <ReCAPTCHA
          ref={recaptchaRef}
          sitekey={RECAPTCHA_SITE_KEY}
          onChange={onChange}
          onExpired={() => onChange(null)}
          onErrored={() => onChange(null)}
          theme={theme}
          hl={locale}
        />
      </div>
      {error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}
