import type { AttachedFile } from "@/lib/files/filesApi";
import type {
  Staff,
  StaffAddress,
  StaffExperience,
  StaffGender,
  StaffQualification,
  StaffReference,
  StaffType,
  StaffWriteBody,
} from "@/lib/hr/hrTypes";

/**
 * Add / Edit Staff wizard — form state, wire mapping and per-step
 * validation. Only Staff Details (core) + Staff Post are required; every
 * other step is optional (PO ruling).
 */

export const STAFF_WIZARD_STEPS = [1, 2, 3, 4, 5, 6] as const;
export type StaffWizardStep = (typeof STAFF_WIZARD_STEPS)[number];

export const STAFF_STEP_TITLE_KEYS: Record<StaffWizardStep, string> = {
  1: "hr.wizard.steps.details",
  2: "hr.wizard.steps.post",
  3: "hr.wizard.steps.assignments",
  4: "hr.wizard.steps.address",
  5: "hr.wizard.steps.background",
  6: "hr.wizard.steps.access",
};

export function clampToStaffStep(step: number | null | undefined): StaffWizardStep {
  const n = Math.round(step ?? 1);
  return Math.min(Math.max(n, 1), STAFF_WIZARD_STEPS.length) as StaffWizardStep;
}

export type AddressForm = {
  country_code: string;
  state_code: string;
  city: string;
  postal_code: string;
  mobile: string;
  address_line: string;
};

/** `key` is a local React key for add-many rows — never sent. */
export type SubjectAssignmentRow = { key: string; class_id: string; section_id: string; subject_id: string };
export type ClassTeacherRow = { key: string; class_id: string; section_id: string };
export type QualificationForm = { key: string } & { [K in keyof StaffQualification]: string };
export type ReferenceForm = { key: string } & { [K in keyof StaffReference]: string };
export type ExperienceForm = { key: string } & { [K in keyof StaffExperience]: string };

export type StaffForm = {
  photo: AttachedFile | null;
  signature: AttachedFile | null;
  title: string;
  initials: string;
  first_name: string;
  last_name: string;
  other_name: string;
  email: string;
  national_id: string;
  gender: StaffGender | "";
  date_of_birth: string;
  date_joined: string;

  staff_type: StaffType;
  post_id: string;
  department_ids: string[];

  subject_assignments: SubjectAssignmentRow[];
  class_teacher_assignments: ClassTeacherRow[];

  permission_group_ids: string[];

  present_address: AddressForm;
  permanent_same_as_present: boolean;
  permanent_address: AddressForm;

  qualifications: QualificationForm[];
  references: ReferenceForm[];
  experience: ExperienceForm[];

  username: string;
  /** Once the admin types a username it stops following the email. */
  username_edited: boolean;
  login_active: boolean;
};

export type FieldErrors = Record<string, string>;

export function rowKey(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

const EMPTY_ADDRESS: AddressForm = { country_code: "", state_code: "", city: "", postal_code: "", mobile: "", address_line: "" };

export function emptyStaffForm(): StaffForm {
  return {
    photo: null,
    signature: null,
    title: "",
    initials: "",
    first_name: "",
    last_name: "",
    other_name: "",
    email: "",
    national_id: "",
    gender: "",
    date_of_birth: "",
    date_joined: "",
    staff_type: "teaching",
    post_id: "",
    department_ids: [],
    subject_assignments: [],
    class_teacher_assignments: [],
    permission_group_ids: [],
    present_address: { ...EMPTY_ADDRESS },
    permanent_same_as_present: true,
    permanent_address: { ...EMPTY_ADDRESS },
    qualifications: [],
    references: [],
    experience: [],
    username: "",
    username_edited: false,
    login_active: true,
  };
}

export const EMPTY_QUALIFICATION: Omit<QualificationForm, "key"> = {
  degree: "",
  stream: "",
  board: "",
  institution: "",
  year: "",
  result: "",
  rank: "",
  duration: "",
  remarks: "",
};
export const EMPTY_REFERENCE: Omit<ReferenceForm, "key"> = { name: "", organization: "", designation: "", phone: "", email: "" };
export const EMPTY_EXPERIENCE: Omit<ExperienceForm, "key"> = { organization: "", role: "", tenure_from: "", tenure_to: "" };

// ---------------------------------------------------------------------------
// Staff <-> form
// ---------------------------------------------------------------------------

function attached(fileId: string | null): AttachedFile | null {
  // Only the id is stored; the wizard sends the COMPLETE record, so
  // leaving this null on edit would CLEAR the file.
  return fileId ? { file_id: fileId, name: null, size: null, type: null } : null;
}

function addressToForm(address: StaffAddress | null): AddressForm {
  if (!address) return { ...EMPTY_ADDRESS };
  return {
    country_code: address.country_code ?? "",
    state_code: address.state_code ?? "",
    city: address.city ?? "",
    postal_code: address.postal_code ?? "",
    mobile: address.mobile ?? "",
    address_line: address.address_line ?? "",
  };
}

function stringsOf<T extends Record<string, string | null>>(row: T): { [K in keyof T]: string } {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ""])) as { [K in keyof T]: string };
}

export function staffToForm(staff: Staff): StaffForm {
  return {
    photo: attached(staff.photo_file_id),
    signature: attached(staff.signature_file_id),
    title: staff.title ?? "",
    initials: staff.initials ?? "",
    first_name: staff.first_name,
    last_name: staff.last_name,
    other_name: staff.other_name ?? "",
    email: staff.email ?? "",
    national_id: staff.national_id ?? "",
    gender: staff.gender ?? "",
    date_of_birth: staff.date_of_birth ?? "",
    date_joined: staff.date_joined ?? "",
    staff_type: staff.staff_type,
    post_id: staff.post_id ?? "",
    department_ids: staff.department_ids,
    subject_assignments: staff.subject_assignments.map((row) => ({ key: rowKey("subject"), ...row })),
    class_teacher_assignments: staff.class_teacher_assignments.map((row) => ({ key: rowKey("class-teacher"), ...row })),
    permission_group_ids: staff.permission_group_ids,
    present_address: addressToForm(staff.present_address),
    permanent_same_as_present: staff.permanent_same_as_present,
    permanent_address: addressToForm(staff.permanent_address),
    qualifications: staff.qualifications.map((row) => ({ key: rowKey("qualification"), ...stringsOf(row) })),
    references: staff.references.map((row) => ({ key: rowKey("reference"), ...stringsOf(row) })),
    experience: staff.experience.map((row) => ({ key: rowKey("experience"), ...stringsOf(row) })),
    username: staff.username ?? "",
    // An existing username is the admin's (or the backend's) — don't overwrite it from the email.
    username_edited: !!staff.username,
    login_active: staff.login_active,
  };
}

function orNull(value: string): string | null {
  return value.trim() || null;
}

function addressToWire(address: AddressForm): StaffAddress | null {
  const wire: StaffAddress = {
    country_code: orNull(address.country_code),
    state_code: orNull(address.state_code),
    city: orNull(address.city),
    postal_code: orNull(address.postal_code),
    mobile: orNull(address.mobile),
    address_line: orNull(address.address_line),
  };
  return Object.values(wire).some(Boolean) ? wire : null;
}

function nullsOf<T extends { key: string }>(row: T): Record<string, string | null> {
  const { key: _key, ...rest } = row;
  void _key;
  return Object.fromEntries(Object.entries(rest).map(([field, value]) => [field, orNull(String(value))]));
}

/** Rows with nothing filled in are dropped rather than sent as all-null records. */
function filledRows<T extends { key: string }>(rows: T[]): T[] {
  return rows.filter((row) => Object.entries(row).some(([field, value]) => field !== "key" && String(value).trim()));
}

/** Username shown/sent: follows the email until the admin edits it. */
export function effectiveUsername(form: StaffForm): string {
  return form.username_edited ? form.username : form.email.trim().toLowerCase();
}

export function formToWire(form: StaffForm, academicYearId: string | null): StaffWriteBody {
  const isTeaching = form.staff_type === "teaching";
  return {
    photo_file_id: form.photo?.file_id ?? null,
    signature_file_id: form.signature?.file_id ?? null,
    title: orNull(form.title),
    initials: orNull(form.initials),
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    other_name: orNull(form.other_name),
    email: orNull(form.email)?.toLowerCase() ?? null,
    national_id: orNull(form.national_id),
    gender: form.gender || null,
    date_of_birth: orNull(form.date_of_birth),
    date_joined: orNull(form.date_joined),
    staff_type: form.staff_type,
    post_id: orNull(form.post_id),
    department_ids: form.department_ids,
    academic_year_id: academicYearId,
    // Only complete rows; non-teaching staff hold no subject assignments.
    subject_assignments: isTeaching
      ? form.subject_assignments
          .filter((row) => row.class_id && row.section_id && row.subject_id)
          .map(({ class_id, section_id, subject_id }) => ({ class_id, section_id, subject_id }))
      : [],
    // Class-teacher (form tutor) is teaching staff only, like subjects.
    class_teacher_assignments: isTeaching
      ? form.class_teacher_assignments
          .filter((row) => row.class_id && row.section_id)
          .map(({ class_id, section_id }) => ({ class_id, section_id }))
      : [],
    permission_group_ids: form.permission_group_ids,
    present_address: addressToWire(form.present_address),
    permanent_same_as_present: form.permanent_same_as_present,
    permanent_address: form.permanent_same_as_present ? null : addressToWire(form.permanent_address),
    qualifications: filledRows(form.qualifications).map((row) => nullsOf(row) as StaffQualification),
    references: filledRows(form.references).map((row) => nullsOf(row) as StaffReference),
    experience: filledRows(form.experience).map((row) => nullsOf(row) as StaffExperience),
    username: orNull(effectiveUsername(form))?.toLowerCase() ?? null,
    login_active: form.login_active,
  };
}

// ---------------------------------------------------------------------------
// Validation — error values are i18n keys
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NATIONAL_ID_MAX_LENGTH = 32;

/** Enough to identify a draft in the Drafts list — drafts may be saved with nothing else. */
export function isDraftEligible(form: StaffForm): boolean {
  return !!form.first_name.trim() && !!form.last_name.trim();
}

function validateDetails(form: StaffForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.first_name.trim()) errors.first_name = "hr.wizard.errors.firstNameRequired";
  if (!form.last_name.trim()) errors.last_name = "hr.wizard.errors.lastNameRequired";
  if (!form.email.trim()) errors.email = "hr.wizard.errors.emailRequired";
  else if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "hr.wizard.errors.emailInvalid";
  if (!form.gender) errors.gender = "hr.wizard.errors.genderRequired";
  // Country-agnostic: no format rule, just a length cap (trimmed on save).
  if (form.national_id.trim().length > NATIONAL_ID_MAX_LENGTH) errors.national_id = "hr.wizard.errors.nationalIdTooLong";
  return errors;
}

function validatePost(form: StaffForm): FieldErrors {
  return form.post_id ? {} : { post_id: "hr.wizard.errors.postRequired" };
}

/** Optional step, but a half-filled row would be silently dropped — make the admin finish or remove it. Non-teaching staff have no rows to check (none are sent). */
function validateAssignments(form: StaffForm): FieldErrors {
  const errors: FieldErrors = {};
  if (form.staff_type !== "teaching") return errors;
  form.subject_assignments.forEach((row) => {
    const filled = [row.class_id, row.section_id, row.subject_id].filter(Boolean).length;
    if (filled > 0 && filled < 3) errors[`subject_assignments.${row.key}`] = "hr.wizard.errors.incompleteRow";
  });
  form.class_teacher_assignments.forEach((row) => {
    if (!!row.class_id !== !!row.section_id) errors[`class_teacher_assignments.${row.key}`] = "hr.wizard.errors.incompleteRow";
  });
  return errors;
}

function validateAccess(form: StaffForm): FieldErrors {
  const username = effectiveUsername(form);
  if (form.login_active && !username.trim()) return { username: "hr.wizard.errors.usernameRequired" };
  if (/\s/.test(username)) return { username: "hr.wizard.errors.usernameSpaces" };
  return {};
}

export const STAFF_STEP_VALIDATORS: Record<StaffWizardStep, (form: StaffForm) => FieldErrors> = {
  1: validateDetails,
  2: validatePost,
  3: validateAssignments,
  4: () => ({}),
  5: () => ({}),
  6: validateAccess,
};

/** Which step owns a (client or server) error field, so a failed save can jump there. */
export function stepForField(field: string): StaffWizardStep {
  if (["post_id", "staff_type", "department_ids"].includes(field)) return 2;
  if (field.startsWith("subject_assignments") || field.startsWith("class_teacher_assignments") || field === "academic_year_id") {
    return 3;
  }
  if (field === "username" || field === "permission_group_ids") return 6;
  return 1;
}
