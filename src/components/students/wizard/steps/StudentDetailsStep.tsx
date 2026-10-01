"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { AvatarUploadField } from "@/components/files/AvatarUploadField";
import { validateFile } from "@/lib/files/fileValidation";
import type { StudentDetailsForm, FieldErrors } from "@/components/students/wizard/studentFormTypes";

const PHOTO_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PHOTO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"];
const GENOTYPES = ["AA", "AS", "SS", "AC", "SC", "Unknown"];

function computeAge(dateOfBirth: string): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age >= 0 ? age : null;
}

export function StudentDetailsStep({
  data,
  errors,
  onChange,
}: {
  data: StudentDetailsForm;
  errors: FieldErrors;
  onChange: (patch: Partial<StudentDetailsForm>) => void;
}) {
  const t = useTranslations();
  const age = computeAge(data.date_of_birth);

  return (
    <div className="flex flex-col gap-5">
      <AvatarUploadField
        label={t("students.wizard.fields.photo.label")}
        validate={(file) => validateFile(file, { allowedTypes: PHOTO_ALLOWED_TYPES, maxSizeBytes: PHOTO_MAX_SIZE_BYTES })}
        validationMessages={{
          unsupportedType: t("students.wizard.fields.photo.errors.unsupportedType"),
          tooLarge: t("students.wizard.fields.photo.errors.tooLarge"),
        }}
        value={data.photo}
        onChange={(photo) => onChange({ photo })}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <InputField
          id="wizard-first-name"
          label={t("students.wizard.fields.firstName.label")}
          value={data.first_name}
          onChange={(event) => onChange({ first_name: event.target.value })}
          hasError={!!errors.first_name}
          error={errors.first_name ? t(errors.first_name) : undefined}
        />
        <InputField
          id="wizard-other-names"
          label={t("students.wizard.fields.otherNames.label")}
          value={data.other_names}
          onChange={(event) => onChange({ other_names: event.target.value })}
        />
        <InputField
          id="wizard-last-name"
          label={t("students.wizard.fields.lastName.label")}
          value={data.last_name}
          onChange={(event) => onChange({ last_name: event.target.value })}
          hasError={!!errors.last_name}
          error={errors.last_name ? t(errors.last_name) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <InputField
          id="wizard-admission-number"
          label={t("students.wizard.fields.admissionNumber.label")}
          placeholder={t("students.wizard.fields.admissionNumber.placeholder")}
          value={data.admission_number}
          onChange={(event) => onChange({ admission_number: event.target.value })}
        />
        <InputField
          id="wizard-email"
          type="email"
          label={t("students.wizard.fields.email.label")}
          value={data.email}
          onChange={(event) => onChange({ email: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">{t("students.wizard.fields.gender.label")}</span>
        <ChipGroup
          multiple={false}
          options={[
            { value: "male", label: t("students.gender.male") },
            { value: "female", label: t("students.gender.female") },
          ]}
          value={data.gender ? [data.gender] : []}
          onChange={(values) => onChange({ gender: (values[0] as StudentDetailsForm["gender"]) ?? "" })}
          hasError={!!errors.gender}
          error={errors.gender ? t(errors.gender) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField
          id="wizard-religion"
          label={t("students.wizard.fields.religion.label")}
          value={data.religion}
          onChange={(event) => {
            const value = event.target.value;
            onChange({ religion: value, religion_is_other: value === "other" });
          }}
          hasError={!!errors.religion}
          error={errors.religion ? t(errors.religion) : undefined}
        >
          <option value="" disabled>
            {t("students.wizard.fields.religion.placeholder")}
          </option>
          <option value="Christianity">{t("students.wizard.fields.religion.christianity")}</option>
          <option value="Islam">{t("students.wizard.fields.religion.islam")}</option>
          <option value="other">{t("students.wizard.fields.religion.other")}</option>
        </SelectField>
        {data.religion_is_other ? (
          <InputField
            id="wizard-religion-other"
            label={t("students.wizard.fields.religion.otherLabel")}
            value={data.religion_other_text}
            onChange={(event) => onChange({ religion_other_text: event.target.value })}
            hasError={!!errors.religion_other_text}
            error={errors.religion_other_text ? t(errors.religion_other_text) : undefined}
          />
        ) : null}
      </div>

      <InputField
        id="wizard-nationality"
        label={t("students.wizard.fields.nationality.label")}
        value={data.nationality}
        onChange={(event) => onChange({ nationality: event.target.value })}
        hasError={!!errors.nationality}
        error={errors.nationality ? t(errors.nationality) : undefined}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <InputField
          id="wizard-dob"
          type="date"
          label={t("students.wizard.fields.dob.label")}
          value={data.date_of_birth}
          onChange={(event) => onChange({ date_of_birth: event.target.value })}
          hasError={!!errors.date_of_birth}
          error={errors.date_of_birth ? t(errors.date_of_birth) : undefined}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">{t("students.wizard.fields.age.label")}</span>
          <p className="flex h-12 items-center rounded-md border border-border bg-background px-4 text-text-muted">
            {age === null ? "—" : t("students.wizard.fields.age.years", { age })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <InputField
          id="wizard-height"
          label={t("students.wizard.fields.height.label")}
          placeholder={t("students.wizard.fields.height.placeholder")}
          value={data.height}
          onChange={(event) => onChange({ height: event.target.value })}
        />
        <InputField
          id="wizard-weight"
          label={t("students.wizard.fields.weight.label")}
          placeholder={t("students.wizard.fields.weight.placeholder")}
          value={data.weight}
          onChange={(event) => onChange({ weight: event.target.value })}
        />
      </div>

      <p className="text-sm font-semibold text-text-primary">{t("students.wizard.fields.medical.sectionTitle")}</p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <SelectField
          id="wizard-blood-group"
          label={t("students.wizard.fields.bloodGroup.label")}
          value={data.blood_group}
          onChange={(event) => onChange({ blood_group: event.target.value })}
        >
          <option value="">{t("students.wizard.fields.bloodGroup.placeholder")}</option>
          {BLOOD_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="wizard-genotype"
          label={t("students.wizard.fields.genotype.label")}
          value={data.genotype}
          onChange={(event) => onChange({ genotype: event.target.value })}
        >
          <option value="">{t("students.wizard.fields.genotype.placeholder")}</option>
          {GENOTYPES.map((genotype) => (
            <option key={genotype} value={genotype}>
              {genotype}
            </option>
          ))}
        </SelectField>
      </div>

      <TextareaField
        id="wizard-allergies"
        label={t("students.wizard.fields.allergies.label")}
        value={data.allergies}
        onChange={(event) => onChange({ allergies: event.target.value })}
      />
      <TextareaField
        id="wizard-medical-conditions"
        label={t("students.wizard.fields.medicalConditions.label")}
        value={data.medical_conditions}
        onChange={(event) => onChange({ medical_conditions: event.target.value })}
      />
      <TextareaField
        id="wizard-medications"
        label={t("students.wizard.fields.medications.label")}
        value={data.medications}
        onChange={(event) => onChange({ medications: event.target.value })}
      />
      <TextareaField
        id="wizard-special-needs"
        label={t("students.wizard.fields.specialNeeds.label")}
        value={data.special_needs_notes}
        onChange={(event) => onChange({ special_needs_notes: event.target.value })}
      />
    </div>
  );
}
