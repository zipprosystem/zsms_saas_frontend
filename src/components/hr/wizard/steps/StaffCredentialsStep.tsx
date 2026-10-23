"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import { StaffBackgroundSections } from "@/components/hr/wizard/sections/StaffBackgroundSections";
import { StaffReviewSection } from "@/components/hr/wizard/sections/StaffReviewSection";
import { SCHOOL_TWO_FACTOR_ENABLED } from "@/lib/hr/schoolSecurity";
import { hasUsableEmail } from "@/lib/hr/hrTypes";
import type { HrReferenceData } from "@/components/hr/useHrReferenceData";
import { effectiveUsername, type FieldErrors, type StaffForm, type StaffWizardStep } from "@/components/hr/wizard/staffForm";

/**
 * The backend's default initial password — shown ONLY when the staff has no
 * usable email (no set-password link can reach them), so the admin can
 * hand it over. Never sent, stored or exported by the frontend.
 */
const DEFAULT_PASSWORD = "123456";

type StepProps = {
  form: StaffForm;
  onChange: (patch: Partial<StaffForm>) => void;
  errors: FieldErrors;
  refs: HrReferenceData;
  mode: "create" | "edit";
  /** Edit mode: credentials exist (else they're issued from the profile, not here). */
  credentialsIssued: boolean;
  /** Edit mode: login can only be ON for an active staff. */
  isActiveStaff: boolean;
  /** The review's Edit links jump back to the step that owns a group. */
  onEditStep: (step: StaffWizardStep) => void;
};

/**
 * Step 3 — Credentials & records: Login Details, then the optional
 * Qualifications / References / Experience and the Compensation
 * placeholder, then a read-only review of the whole record before Add
 * Staff / Update. Username follows the email until edited. On edit,
 * credentials aren't re-issued (reset lives on the staff profile).
 *
 * Credentials are HYBRID: with a valid email the backend emails a secure
 * set-password link (no password shown); without one the staff gets the
 * default password 123456, which is shown here to hand over. Forced
 * change at first login is mentioned only when the school has 2FA on.
 */
export function StaffCredentialsStep({ form, onChange, errors, refs, mode, credentialsIssued, isActiveStaff, onEditStep }: StepProps) {
  const t = useTranslations();
  const username = effectiveUsername(form);

  return (
    <div className="flex flex-col gap-6">
      <StaffStepSection title={t("hr.wizard.sections.login.title")} subtitle={t("hr.wizard.sections.login.subtitle")}>
        {mode === "edit" && !credentialsIssued ? (
          <p className="text-sm text-text-muted">{t("hr.wizard.login.notIssued")}</p>
        ) : (
          <LoginFields
            form={form}
            onChange={onChange}
            errors={errors}
            mode={mode}
            isActiveStaff={isActiveStaff}
            username={username}
          />
        )}
      </StaffStepSection>

      <StaffBackgroundSections form={form} onChange={onChange} />

      <StaffStepSection title={t("hr.wizard.sections.compensation.title")}>
        <p className="text-sm text-text-muted">{t("hr.wizard.compensation.placeholder")}</p>
      </StaffStepSection>

      <StaffReviewSection
        form={form}
        refs={refs}
        mode={mode}
        credentialsIssued={credentialsIssued}
        isActiveStaff={isActiveStaff}
        onEditStep={onEditStep}
      />
    </div>
  );
}

function LoginFields({
  form,
  onChange,
  errors,
  mode,
  isActiveStaff,
  username,
}: Pick<StepProps, "form" | "onChange" | "errors" | "mode" | "isActiveStaff"> & { username: string }) {
  const t = useTranslations();
  const loginLocked = mode === "edit" && !isActiveStaff;
  const viaLink = hasUsableEmail(form.email);
  return (
    <>
      <Toggle
        id="staff-login-active"
        label={t("hr.wizard.fields.loginActive.label")}
        helper={t("hr.wizard.fields.loginActive.helper")}
        checked={form.login_active && !loginLocked}
        onChange={(checked) => {
          if (!loginLocked) onChange({ login_active: checked });
        }}
      />
      {loginLocked ? <p className="text-xs text-text-muted">{t("hr.profile.login.offWhileInactive")}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          id="staff-username"
          label={t("hr.wizard.fields.username.label")}
          placeholder={t("hr.wizard.fields.username.placeholder")}
          value={username}
          onChange={(event) => onChange({ username: event.target.value, username_edited: true })}
          hasError={!!errors.username}
          error={errors.username ? t(errors.username) : undefined}
        />
        {mode === "create" && !viaLink ? (
          <InputField
            id="staff-password"
            label={t("hr.wizard.fields.password.label")}
            value={DEFAULT_PASSWORD}
            readOnly
            disabled
          />
        ) : null}
      </div>
      {mode === "edit" ? (
        <p className="text-xs text-text-muted">{t("hr.wizard.login.editNote")}</p>
      ) : (
        <div
          role="note"
          className={`rounded-md border px-3 py-2.5 text-xs ${viaLink ? "border-border text-text-secondary" : "border-border bg-category-amber-tint text-text-primary"}`}
        >
          <p>
            {viaLink
              ? t("hr.credentials.createLink", { email: form.email.trim() })
              : t("hr.credentials.createDefault", { password: DEFAULT_PASSWORD })}
          </p>
          {SCHOOL_TWO_FACTOR_ENABLED ? <p className="mt-1">{t("hr.credentials.forcedChange")}</p> : null}
        </div>
      )}
    </>
  );
}
