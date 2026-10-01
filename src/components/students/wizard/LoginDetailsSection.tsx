"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { getSchoolSettings, throwIfTransientSettings } from "@/lib/settings/settingsApi";
import { isDevBypassUnavailable } from "@/lib/setup/crudTypes";
import { generatePassword, generateUsername } from "@/lib/students/credentialsGenerator";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import type { LoginDetailsForm, FieldErrors } from "@/components/students/wizard/studentFormTypes";

/** Same ["settings"] query key app/admin/settings/page.tsx uses — shares its cache entry rather than re-fetching. */
const SETTINGS_QUERY_KEY = ["settings"];

export function LoginDetailsSection({
  data,
  errors,
  admissionNumber,
  onChange,
}: {
  data: LoginDetailsForm;
  errors: FieldErrors;
  admissionNumber: string;
  onChange: (patch: Partial<LoginDetailsForm>) => void;
}) {
  const t = useTranslations();

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => getSchoolSettings().then(throwIfTransientSettings),
    staleTime: 5 * 60 * 1000,
  });
  const studentIdPrefix = settingsQuery.data?.ok ? settingsQuery.data.data.general_behaviour.student_id_prefix : null;
  // Falls back to "STU" (credentialsGenerator.ts) either way, so this never
  // breaks the field — just surfaced so a "STU0001"-looking username isn't
  // mistaken for the real configured prefix while testing locally.
  const settingsDevBypass = isDevBypassUnavailable(settingsQuery.data);

  // Auto-fill once, the first time this section has enough info and is
  // still untouched — not live-synced on every admission-number keystroke,
  // so a manual edit here is never silently clobbered. The Regenerate
  // buttons below are the explicit, user-initiated way to recompute.
  useEffect(() => {
    if (data.username || settingsQuery.isPending) return;
    onChange({ username: generateUsername(studentIdPrefix, admissionNumber) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.username, settingsQuery.isPending, studentIdPrefix, admissionNumber]);

  useEffect(() => {
    if (data.password) return;
    onChange({ password: generatePassword() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.password]);

  return (
    <div className="mt-8 flex flex-col gap-5 border-t border-border pt-6">
      <p className="text-sm font-semibold text-text-primary">{t("students.wizard.login.sectionTitle")}</p>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <InputField
            id="wizard-username"
            label={t("students.wizard.login.username.label")}
            value={data.username}
            onChange={(event) => onChange({ username: event.target.value })}
            hasError={!!errors.username}
            error={errors.username ? t(errors.username) : undefined}
          />
        </div>
        <button
          type="button"
          onClick={() => onChange({ username: generateUsername(studentIdPrefix, admissionNumber) })}
          className="h-12 shrink-0 text-sm font-semibold text-accent hover:underline"
        >
          {t("students.wizard.login.regenerate")}
        </button>
      </div>
      {settingsDevBypass ? <DevBypassNotice /> : null}

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <InputField
            id="wizard-password"
            label={t("students.wizard.login.password.label")}
            value={data.password}
            onChange={(event) => onChange({ password: event.target.value })}
            hasError={!!errors.password}
            error={errors.password ? t(errors.password) : undefined}
          />
        </div>
        <button
          type="button"
          onClick={() => onChange({ password: generatePassword() })}
          className="h-12 shrink-0 text-sm font-semibold text-accent hover:underline"
        >
          {t("students.wizard.login.regenerate")}
        </button>
      </div>

      <Toggle
        id="wizard-2fa"
        label={t("students.wizard.login.twoFactor.label")}
        helper={t("students.wizard.login.twoFactor.helper")}
        checked={data.two_factor_enabled}
        onChange={(checked) => onChange({ two_factor_enabled: checked })}
      />

      <Toggle
        id="wizard-login-activated"
        label={t("students.wizard.login.activate.label")}
        helper={t("students.wizard.login.activate.helper")}
        checked={data.login_activated}
        onChange={(checked) => onChange({ login_activated: checked })}
      />
    </div>
  );
}
