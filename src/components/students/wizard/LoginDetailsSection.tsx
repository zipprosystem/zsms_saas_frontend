"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { USERNAME_MAX_LENGTH } from "@/lib/students/wizardValidation";
import type { LoginDetailsForm, FieldErrors } from "@/components/students/wizard/studentFormTypes";

/**
 * Username is optional and follows the student's email (lowercased) until
 * edited here — see StudentWizard.tsx's USERNAME AUTO-FILL. Left blank, the
 * backend defaults it to the lowercased email on a final save. There is NO
 * password field: the backend assigns the initial password and forces a
 * change at the student's first login.
 */
export function LoginDetailsSection({
  data,
  errors,
  onChange,
}: {
  data: LoginDetailsForm;
  errors: FieldErrors;
  onChange: (patch: Partial<LoginDetailsForm>) => void;
}) {
  const t = useTranslations();

  return (
    <div className="mt-8 flex flex-col gap-5 border-t border-border pt-6">
      <p className="text-sm font-semibold text-text-primary">{t("students.wizard.login.sectionTitle")}</p>

      <div className="flex flex-col gap-1.5">
        <InputField
          id="wizard-username"
          label={t("students.wizard.login.username.label")}
          value={data.username}
          maxLength={USERNAME_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // Clearing the field hands it back to the email auto-fill.
          onChange={(event) => onChange({ username: event.target.value, usernameTouched: event.target.value !== "" })}
          hasError={!!errors.username}
          error={errors.username ? t(errors.username) : undefined}
        />
        {!errors.username ? <p className="text-xs text-text-muted">{t("students.wizard.login.username.helper")}</p> : null}
      </div>

      <p className="rounded-md border border-border bg-background px-4 py-3 text-xs text-text-secondary">
        {t("students.wizard.login.passwordNote")}
      </p>

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
