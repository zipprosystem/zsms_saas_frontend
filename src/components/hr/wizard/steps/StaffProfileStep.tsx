"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { AvatarUploadField } from "@/components/files/AvatarUploadField";
import { FileAttachmentField } from "@/components/files/FileAttachmentField";
import { validateFile } from "@/lib/files/fileValidation";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import { StaffAddressSections } from "@/components/hr/wizard/sections/StaffAddressSections";
import { NATIONAL_ID_MAX_LENGTH, type FieldErrors, type StaffForm } from "@/components/hr/wizard/staffForm";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Stored as these values; labels are translated. */
export const STAFF_TITLES = ["Mr", "Mrs", "Miss", "Ms", "Dr", "Prof", "Engr", "Rev"] as const;

type StepProps = {
  form: StaffForm;
  onChange: (patch: Partial<StaffForm>) => void;
  errors: FieldErrors;
  staffNo: string | null;
};

/**
 * Step 1 — Profile, in order: photo + name + National ID, contact
 * (email), address, then personal (gender, date of birth, date joined).
 * Required core: first + last name, email, gender (National ID
 * optional). Photo/signature go through the real files service
 * (unavailable under dev-bypass).
 */
export function StaffProfileStep({ form, onChange, errors, staffNo }: StepProps) {
  const t = useTranslations();
  const err = (field: string) => (errors[field] ? t(errors[field]) : undefined);
  const imageValidation = {
    validate: (file: File) => validateFile(file, { allowedTypes: IMAGE_TYPES, maxSizeBytes: MAX_IMAGE_BYTES }),
    validationMessages: {
      unsupportedType: t("hr.wizard.fields.image.unsupportedType"),
      tooLarge: t("hr.wizard.fields.image.tooLarge"),
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <StaffStepSection title={t("hr.wizard.sections.details.title")} subtitle={t("hr.wizard.sections.details.subtitle")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AvatarUploadField
            label={t("hr.wizard.fields.passport.label")}
            purpose="staff_photo"
            {...imageValidation}
            value={form.photo}
            onChange={(photo) => onChange({ photo })}
          />
          <FileAttachmentField
            label={t("hr.wizard.fields.signature.label")}
            chooseLabel={t("hr.wizard.fields.signature.choose")}
            accept="image/jpeg,image/png,image/webp"
            purpose="staff_signature"
            {...imageValidation}
            value={form.signature}
            onChange={(signature) => onChange({ signature })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            id="staff-no"
            label={t("hr.wizard.fields.staffNo.label")}
            value={staffNo ?? t("hr.wizard.fields.staffNo.pending")}
            readOnly
            disabled
          />
          <InputField
            id="staff-initials"
            label={t("hr.wizard.fields.initials.label")}
            placeholder={t("hr.wizard.fields.initials.placeholder")}
            value={form.initials}
            onChange={(event) => onChange({ initials: event.target.value })}
          />
          <SelectField id="staff-title" label={t("hr.wizard.fields.title.label")} value={form.title} onChange={(event) => onChange({ title: event.target.value })}>
            <option value="">{t("hr.wizard.fields.title.placeholder")}</option>
            {STAFF_TITLES.map((title) => (
              <option key={title} value={title}>
                {t(`hr.wizard.titles.${title}`)}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            id="staff-first-name"
            label={t("hr.wizard.fields.firstName.label")}
            placeholder={t("hr.wizard.fields.firstName.placeholder")}
            value={form.first_name}
            onChange={(event) => onChange({ first_name: event.target.value })}
            hasError={!!errors.first_name}
            error={err("first_name")}
          />
          <InputField
            id="staff-last-name"
            label={t("hr.wizard.fields.lastName.label")}
            placeholder={t("hr.wizard.fields.lastName.placeholder")}
            value={form.last_name}
            onChange={(event) => onChange({ last_name: event.target.value })}
            hasError={!!errors.last_name}
            error={err("last_name")}
          />
          <InputField
            id="staff-other-name"
            label={t("hr.wizard.fields.otherName.label")}
            placeholder={t("hr.wizard.fields.otherName.placeholder")}
            value={form.other_name}
            onChange={(event) => onChange({ other_name: event.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            id="staff-national-id"
            label={t("hr.wizard.fields.nationalId.label")}
            placeholder={t("hr.wizard.fields.nationalId.placeholder")}
            value={form.national_id}
            maxLength={NATIONAL_ID_MAX_LENGTH}
            onChange={(event) => onChange({ national_id: event.target.value })}
            hasError={!!errors.national_id}
            error={err("national_id")}
          />
        </div>
      </StaffStepSection>

      <StaffStepSection title={t("hr.wizard.sections.contact.title")} subtitle={t("hr.wizard.sections.contact.subtitle")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InputField
            id="staff-email"
            type="email"
            label={t("hr.wizard.fields.email.label")}
            placeholder={t("hr.wizard.fields.email.placeholder")}
            value={form.email}
            onChange={(event) => onChange({ email: event.target.value })}
            hasError={!!errors.email}
            error={err("email")}
          />
        </div>
      </StaffStepSection>

      <StaffAddressSections form={form} onChange={onChange} />

      <StaffStepSection title={t("hr.wizard.sections.personal.title")} subtitle={t("hr.wizard.sections.personal.subtitle")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SelectField
            id="staff-gender"
            label={t("hr.wizard.fields.gender.label")}
            value={form.gender}
            onChange={(event) => onChange({ gender: event.target.value === "male" || event.target.value === "female" ? event.target.value : "" })}
            hasError={!!errors.gender}
            error={err("gender")}
          >
            <option value="" disabled>
              {t("hr.wizard.fields.gender.placeholder")}
            </option>
            <option value="male">{t("hr.wizard.fields.gender.male")}</option>
            <option value="female">{t("hr.wizard.fields.gender.female")}</option>
          </SelectField>
          <InputField
            id="staff-dob"
            type="date"
            label={t("hr.wizard.fields.dateOfBirth.label")}
            value={form.date_of_birth}
            onChange={(event) => onChange({ date_of_birth: event.target.value })}
          />
          <InputField
            id="staff-date-joined"
            type="date"
            label={t("hr.wizard.fields.dateJoined.label")}
            value={form.date_joined}
            onChange={(event) => onChange({ date_joined: event.target.value })}
          />
        </div>
      </StaffStepSection>
    </div>
  );
}
