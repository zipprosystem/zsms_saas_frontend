"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { ChipGroup } from "@/components/ui/ChipGroup";
import type { ParentGuardianForm, PersonBlockForm, FieldErrors } from "@/components/students/wizard/studentFormTypes";

function PersonBlockFields({
  idPrefix,
  title,
  value,
  errorPrefix,
  errors,
  onChange,
}: {
  idPrefix: string;
  title: string;
  value: PersonBlockForm;
  errorPrefix: "father" | "mother" | "guardian";
  errors: FieldErrors;
  onChange: (patch: Partial<PersonBlockForm>) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          id={`${idPrefix}-first-name`}
          label={t("students.wizard.fields.personFirstName.label")}
          value={value.first_name}
          onChange={(event) => onChange({ first_name: event.target.value })}
          hasError={!!errors[`${errorPrefix}.name`]}
        />
        <InputField
          id={`${idPrefix}-middle-name`}
          label={t("students.wizard.fields.personMiddleName.label")}
          value={value.middle_name}
          onChange={(event) => onChange({ middle_name: event.target.value })}
        />
        <InputField
          id={`${idPrefix}-last-name`}
          label={t("students.wizard.fields.personLastName.label")}
          value={value.last_name}
          onChange={(event) => onChange({ last_name: event.target.value, lastNameTouched: true })}
          hasError={!!errors[`${errorPrefix}.name`]}
          error={errors[`${errorPrefix}.name`] ? t(errors[`${errorPrefix}.name`]) : undefined}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          id={`${idPrefix}-phone`}
          type="tel"
          label={t("students.wizard.fields.personPhone.label")}
          value={value.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          hasError={!!errors[`${errorPrefix}.phone`]}
          error={errors[`${errorPrefix}.phone`] ? t(errors[`${errorPrefix}.phone`]) : undefined}
        />
        <InputField
          id={`${idPrefix}-email`}
          type="email"
          label={t("students.wizard.fields.personEmail.label")}
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
        />
        <InputField
          id={`${idPrefix}-occupation`}
          label={t("students.wizard.fields.personOccupation.label")}
          value={value.occupation}
          onChange={(event) => onChange({ occupation: event.target.value })}
        />
      </div>
    </div>
  );
}

export function ParentGuardianStep({
  data,
  errors,
  onChange,
}: {
  data: ParentGuardianForm;
  errors: FieldErrors;
  onChange: (patch: Partial<ParentGuardianForm>) => void;
}) {
  const t = useTranslations();
  const isGuardian = data.relationship_type === "guardian";

  // Guardian path has only one possible primary contact — commit it
  // automatically rather than making the user pick a 1-option select.
  useEffect(() => {
    if (isGuardian && data.primary_contact !== "guardian") onChange({ primary_contact: "guardian" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuardian, data.primary_contact]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">{t("students.wizard.fields.relationshipType.label")}</span>
        <ChipGroup
          multiple={false}
          options={[
            { value: "parent", label: t("students.wizard.fields.relationshipType.parent") },
            { value: "guardian", label: t("students.wizard.fields.relationshipType.guardian") },
          ]}
          value={[data.relationship_type]}
          onChange={(values) => {
            const next = values[0] as ParentGuardianForm["relationship_type"];
            // Reset primary_contact across the switch — "mother" isn't a
            // valid choice once the Guardian path hides that block.
            onChange({ relationship_type: next, primary_contact: next === "guardian" ? "guardian" : "" });
          }}
        />
      </div>

      {isGuardian ? (
        <PersonBlockFields
          idPrefix="wizard-guardian"
          title={t("students.wizard.fields.guardianBlock.title")}
          value={data.guardian}
          errorPrefix="guardian"
          errors={errors}
          onChange={(patch) => onChange({ guardian: { ...data.guardian, ...patch } })}
        />
      ) : (
        <>
          <PersonBlockFields
            idPrefix="wizard-father"
            title={t("students.wizard.fields.fatherBlock.title")}
            value={data.father}
            errorPrefix="father"
            errors={errors}
            onChange={(patch) => onChange({ father: { ...data.father, ...patch } })}
          />
          <PersonBlockFields
            idPrefix="wizard-mother"
            title={t("students.wizard.fields.motherBlock.title")}
            value={data.mother}
            errorPrefix="mother"
            errors={errors}
            onChange={(patch) => onChange({ mother: { ...data.mother, ...patch } })}
          />

          <SelectField
            id="wizard-primary-contact"
            label={t("students.wizard.fields.primaryContact.label")}
            value={data.primary_contact}
            onChange={(event) => onChange({ primary_contact: event.target.value as ParentGuardianForm["primary_contact"] })}
          >
            <option value="">{t("students.wizard.fields.primaryContact.placeholder")}</option>
            <option value="father">{t("students.wizard.fields.fatherBlock.title")}</option>
            <option value="mother">{t("students.wizard.fields.motherBlock.title")}</option>
          </SelectField>
        </>
      )}
    </div>
  );
}
