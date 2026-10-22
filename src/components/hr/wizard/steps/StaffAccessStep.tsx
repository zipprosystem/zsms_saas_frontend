"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { MultiSearchableSelect } from "@/components/ui/MultiSearchableSelect";
import { Toggle } from "@/components/ui/Toggle";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import { SCHOOL_TWO_FACTOR_ENABLED } from "@/lib/hr/schoolSecurity";
import type { HrReferenceData } from "@/components/hr/useHrReferenceData";
import { effectiveUsername, type FieldErrors, type StaffForm } from "@/components/hr/wizard/staffForm";

/** The backend's default initial password — shown so the admin can hand it over; never sent, stored or exported by the frontend. */
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
};

/**
 * Step 6 — Permission Group(s), the Compensation placeholder, and Login
 * Details. Groups own membership; picking them here sends
 * permission_group_ids and the backend updates the groups. Username
 * follows the email until edited. On edit, credentials aren't re-issued
 * (reset lives on the staff profile).
 */
export function StaffAccessStep({ form, onChange, errors, refs, mode, credentialsIssued, isActiveStaff }: StepProps) {
  const t = useTranslations();
  const username = effectiveUsername(form);

  return (
    <div className="flex flex-col gap-6">
      <StaffStepSection title={t("hr.wizard.sections.groups.title")} subtitle={t("hr.wizard.sections.groups.subtitle")}>
        <MultiSearchableSelect
          id="staff-permission-groups"
          label={t("hr.wizard.fields.groups.label")}
          placeholder={refs.isLoadingGroups ? t("hr.common.loading") : t("hr.wizard.fields.groups.placeholder")}
          options={refs.groups.map((group) => ({ value: group.id, label: group.name }))}
          value={form.permission_group_ids}
          onChange={(permission_group_ids) => onChange({ permission_group_ids })}
          disabled={refs.isLoadingGroups}
          noOptionsLabel={t("hr.wizard.fields.groups.noOptions")}
        />
      </StaffStepSection>

      <StaffStepSection title={t("hr.wizard.sections.compensation.title")}>
        <p className="text-sm text-text-muted">{t("hr.wizard.compensation.placeholder")}</p>
      </StaffStepSection>

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
        {mode === "create" ? (
          <InputField
            id="staff-password"
            label={t("hr.wizard.fields.password.label")}
            value={DEFAULT_PASSWORD}
            readOnly
            disabled
          />
        ) : null}
      </div>
      <p className="text-xs text-text-muted">
        {mode === "edit"
          ? t("hr.wizard.login.editNote")
          : SCHOOL_TWO_FACTOR_ENABLED
            ? t("hr.wizard.login.forcedChange")
            : t("hr.wizard.login.noForcedChange")}
      </p>
    </>
  );
}
