import type {
  AddressForm,
  ClassDetailsForm,
  LoginDetailsForm,
  ParentGuardianForm,
  StudentDetailsForm,
  StudentFormData,
  FieldErrors,
} from "@/components/students/wizard/studentFormTypes";

/**
 * Mirrors src/lib/onboarding/validation.ts's shape — one validateStepN per
 * wizard step, each returning a flat FieldErrors keyed "field" (errors are
 * read back by each step component off its own slice, so no "groupName."
 * prefix is needed — unlike onboarding, which maps submission errors back
 * across steps). validate-on-Next / free-Back: StudentWizard.tsx calls the
 * matching validator before advancing and ignores validation entirely on
 * Back. Save Draft is exempt from all of this — partial data is fine.
 */

export function validateClassDetails(data: ClassDetailsForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.school_type_id) errors.school_type_id = "students.wizard.errors.schoolTypeRequired";
  if (!data.class_id) errors.class_id = "students.wizard.errors.classRequired";
  if (!data.class_arm_id) errors.class_arm_id = "students.wizard.errors.classArmRequired";
  if (!data.class_term_id) errors.class_term_id = "students.wizard.errors.classTermRequired";
  if (!data.mode) errors.mode = "students.wizard.errors.modeRequired";
  return errors;
}

export function validateStudentDetails(data: StudentDetailsForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.first_name.trim()) errors.first_name = "students.wizard.errors.firstNameRequired";
  if (!data.last_name.trim()) errors.last_name = "students.wizard.errors.lastNameRequired";
  if (!data.gender) errors.gender = "students.wizard.errors.genderRequired";
  if (!data.religion) {
    errors.religion = "students.wizard.errors.religionRequired";
  } else if (data.religion_is_other && !data.religion_other_text.trim()) {
    errors.religion_other_text = "students.wizard.errors.religionOtherRequired";
  }
  if (!data.nationality.trim()) errors.nationality = "students.wizard.errors.nationalityRequired";
  if (!data.date_of_birth) errors.date_of_birth = "students.wizard.errors.dobRequired";
  return errors;
}

function validatePersonBlock(
  block: { first_name: string; last_name: string; phone: string },
  prefix: "father" | "mother" | "guardian",
): FieldErrors {
  const errors: FieldErrors = {};
  if (!block.first_name.trim() || !block.last_name.trim()) {
    errors[`${prefix}.name`] = "students.wizard.errors.personNameRequired";
  }
  if (!block.phone.trim()) {
    errors[`${prefix}.phone`] = "students.wizard.errors.personPhoneRequired";
  }
  return errors;
}

export function validateParentGuardian(data: ParentGuardianForm): FieldErrors {
  if (data.relationship_type === "guardian") {
    return validatePersonBlock(data.guardian, "guardian");
  }
  return {
    ...validatePersonBlock(data.father, "father"),
    ...validatePersonBlock(data.mother, "mother"),
  };
}

export function validateAddress(data: AddressForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.home.street.trim()) errors["home.street"] = "students.wizard.errors.streetRequired";
  if (!data.home.country_code) errors["home.country_code"] = "students.wizard.errors.countryRequired";
  if (!data.other_same_as_home) {
    if (!data.other.street.trim()) errors["other.street"] = "students.wizard.errors.streetRequired";
    if (!data.other.country_code) errors["other.country_code"] = "students.wizard.errors.countryRequired";
  }
  return errors;
}

export function validateLoginDetails(data: LoginDetailsForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.username.trim()) errors.username = "students.wizard.errors.usernameRequired";
  if (!data.password.trim()) errors.password = "students.wizard.errors.passwordRequired";
  return errors;
}

/** Full-form validation for the final submit — Back is free, so a user could reach step 7 with an earlier step still invalid; this re-checks everything rather than trusting per-step gates alone. */
export function validateAllSteps(data: StudentFormData): FieldErrors {
  return {
    ...validateClassDetails(data.classDetails),
    ...validateStudentDetails(data.studentDetails),
    ...validateParentGuardian(data.parentGuardian),
    ...validateAddress(data.address),
    ...validateLoginDetails(data.loginDetails),
  };
}
