import type { AttachedFile } from "@/lib/files/filesApi";
import type { RelationshipType, StudentGender, StudentMode } from "@/lib/students/studentTypes";

/**
 * UI-facing form shape — distinct from the Student wire type
 * (studentTypes.ts). Grouped per step, same convention as onboarding's
 * OnboardingData. Form fields are strings even where the wire type is a
 * typed enum/number, since that's what inputs/selects actually hold;
 * wizardValidation.ts and (Commit 3's) studentFormMapping.ts are what
 * narrow/convert these back to the wire shape.
 */

export type ClassDetailsForm = {
  school_type_id: string;
  class_id: string;
  class_arm_id: string;
  class_term_id: string;
  academic_house_id: string;
  mode: StudentMode | "";
  /** Only meaningful/shown when mode is "boarding" — the dormitory a boarder lives in, distinct from academic_house_id (inter-house competitions). */
  boarding_house_id: string;
  extra_curricular_ids: string[];
};

export type StudentDetailsForm = {
  photo: AttachedFile | null;
  first_name: string;
  other_names: string;
  last_name: string;
  admission_number: string;
  email: string;
  gender: StudentGender | "";
  religion: string;
  religion_is_other: boolean;
  religion_other_text: string;
  nationality: string;
  date_of_birth: string;
  height: string;
  weight: string;
  blood_group: string;
  genotype: string;
  allergies: string;
  medical_conditions: string;
  medications: string;
  special_needs_notes: string;
};

export type PersonBlockForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  phone: string;
  email: string;
  occupation: string;
  /** Last Name auto-fill tracking (same "prefill then stop on manual edit" pattern as Subject Master's short-name) — once the admin directly edits this block's Last Name, the student's own Last Name stops overwriting it. See StudentWizard.tsx's handleStudentDetailsChange(). */
  lastNameTouched: boolean;
};

export const EMPTY_PERSON_BLOCK: PersonBlockForm = {
  first_name: "",
  middle_name: "",
  last_name: "",
  phone: "",
  email: "",
  occupation: "",
  lastNameTouched: false,
};

export type ParentGuardianForm = {
  relationship_type: RelationshipType;
  father: PersonBlockForm;
  mother: PersonBlockForm;
  guardian: PersonBlockForm;
  primary_contact: "father" | "mother" | "guardian" | "";
};

export type AddressBlockForm = {
  street: string;
  country_code: string;
  state_code: string;
  city: string;
  postal_code: string;
  lga_or_area: string;
};

export const EMPTY_ADDRESS_BLOCK: AddressBlockForm = {
  street: "",
  country_code: "",
  state_code: "",
  city: "",
  postal_code: "",
  lga_or_area: "",
};

export type EmergencyContactForm = { name: string; phone: string };

export type AddressForm = {
  home: AddressBlockForm;
  other_same_as_home: boolean;
  other: AddressBlockForm;
  emergency_contacts: [EmergencyContactForm, EmergencyContactForm];
};

export type AgentForm = {
  agent_id: string;
  has_agent_commission: boolean;
};

export type SiblingsForm = {
  sibling_student_ids: string[];
};

export type PastRecordEntryForm = {
  /** Local-only React key / delete handle — never sent anywhere. */
  localId: string;
  school: string;
  class: string;
  grade: string;
  rank: string;
  year: string;
  attachment: AttachedFile | null;
};

export type PastRecordsForm = {
  records: PastRecordEntryForm[];
};

export type LoginDetailsForm = {
  username: string;
  password: string;
  two_factor_enabled: boolean;
  login_activated: boolean;
};

export type StudentFormData = {
  classDetails: ClassDetailsForm;
  studentDetails: StudentDetailsForm;
  parentGuardian: ParentGuardianForm;
  address: AddressForm;
  agent: AgentForm;
  siblings: SiblingsForm;
  pastRecords: PastRecordsForm;
  loginDetails: LoginDetailsForm;
};

export function emptyStudentFormData(defaultMode: StudentMode | ""): StudentFormData {
  return {
    classDetails: {
      school_type_id: "",
      class_id: "",
      class_arm_id: "",
      class_term_id: "",
      academic_house_id: "",
      mode: defaultMode,
      boarding_house_id: "",
      extra_curricular_ids: [],
    },
    studentDetails: {
      photo: null,
      first_name: "",
      other_names: "",
      last_name: "",
      admission_number: "",
      email: "",
      gender: "",
      religion: "",
      religion_is_other: false,
      religion_other_text: "",
      nationality: "",
      date_of_birth: "",
      height: "",
      weight: "",
      blood_group: "",
      genotype: "",
      allergies: "",
      medical_conditions: "",
      medications: "",
      special_needs_notes: "",
    },
    parentGuardian: {
      relationship_type: "parent",
      father: { ...EMPTY_PERSON_BLOCK },
      mother: { ...EMPTY_PERSON_BLOCK },
      guardian: { ...EMPTY_PERSON_BLOCK },
      primary_contact: "",
    },
    address: {
      home: { ...EMPTY_ADDRESS_BLOCK },
      other_same_as_home: true,
      other: { ...EMPTY_ADDRESS_BLOCK },
      emergency_contacts: [
        { name: "", phone: "" },
        { name: "", phone: "" },
      ],
    },
    agent: {
      agent_id: "",
      has_agent_commission: false,
    },
    siblings: {
      sibling_student_ids: [],
    },
    pastRecords: {
      records: [],
    },
    loginDetails: {
      username: "",
      password: "",
      two_factor_enabled: false,
      login_activated: true,
    },
  };
}

export type FieldErrors = Record<string, string>;
