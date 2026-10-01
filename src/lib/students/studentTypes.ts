/**
 * Students — MOCK module. The real Students API doesn't exist yet
 * (Muntajir hasn't built it); this type is the wire shape studentsApi.ts
 * mocks against, and doubles as the spec to hand him. snake_case, matches
 * every real ERP service's conventions, so a later swap to the real API
 * only touches studentsApi.ts.
 *
 * Nullability: required-at-validation fields (first_name, gender,
 * date_of_birth, home_address.street, etc.) are typed non-nullable because
 * the Add Student wizard's own validators guarantee them before a record
 * ever leaves status "draft" — a draft legitimately has all of them
 * empty/unset mid-fill. See studentsApi.ts's file header for the OPEN
 * DECISION this creates for the real API.
 */

/**
 * "withdrawn" | "suspended" | "expelled" share one admin flow (a single
 * form: pick the category + reason + date) and all land on the Students
 * list's "Withdrawn" tab, distinguished there by a Status column — see
 * StudentsScreen.tsx. "draft" is wizard-only (Save Draft, not yet a real
 * student). "inactive" exists in the type but isn't surfaced by any tab
 * yet — reserved, not actively used by Student List/Withdrawn/Graduate.
 */
export type StudentStatus = "active" | "graduated" | "withdrawn" | "suspended" | "expelled" | "draft" | "inactive";
export type StudentGender = "male" | "female";
export type StudentMode = "day" | "boarding";
export type RelationshipType = "parent" | "guardian";

export type PersonBlock = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  phone: string;
  email: string | null;
  occupation: string | null;
};

export type AddressBlock = {
  street: string;
  country_code: string | null;
  state_code: string | null;
  city: string | null;
  postal_code: string | null;
  /** Free text, no dataset backs it (no public/data/lga/*.json). Flagged to reconcile with Muntajir — may become a structured per-state dataset later. */
  lga_or_area: string | null;
};

export type EmergencyContact = { name: string | null; phone: string | null };

export type PastRecord = {
  /** Local/mock row id for the repeatable-block React key + delete — not a server id until created. */
  id: string;
  school: string | null;
  class: string | null;
  grade: string | null;
  rank: string | null;
  /** Free text per spec ("Year (text)"), not a date. */
  year: string | null;
  attachment_file_id: string | null;
};

/** Mock referral agent — Step 5. */
export type Agent = { id: string; name: string; agency: string | null };

export type Student = {
  id: string;
  status: StudentStatus;
  /** Draft-resume cursor only (which wizard step to reopen on) — not part of the real spec's student fields, null once status leaves "draft". */
  draft_last_step: number | null;

  // --- Step 1: Class Details ---
  school_type_id: string;
  class_id: string;
  class_arm_id: string;
  /** Nullable: a class may have no terms configured yet. */
  class_term_id: string | null;
  academic_house_id: string | null;
  /** Only meaningful for mode:"boarding" students — null for Day students. Distinct from academic_house_id (inter-house competitions), this is which dormitory/hostel a boarder lives in. */
  boarding_house_id: string | null;
  mode: StudentMode;
  extra_curricular_ids: string[];
  /** Display-only, mocked "—", never user-editable — pending the Fees/Accounts module. */
  fee_display: string | null;

  // --- Step 2: Student Details ---
  photo_file_id: string | null;
  first_name: string;
  /** "Other Names" in the UI — any middle name(s) collectively, same convention as Nigerian school admission forms. */
  other_names: string | null;
  last_name: string;
  admission_number: string | null;
  email: string | null;
  gender: StudentGender;
  /** Dropdown value, or the free-text "Other" value when religion_is_other is true. */
  religion: string | null;
  religion_is_other: boolean;
  nationality: string;
  /** ISO date; age is always computed client-side at render time, never stored. */
  date_of_birth: string;
  height: string | null;
  weight: string | null;
  blood_group: string | null;
  genotype: string | null;
  allergies: string | null;
  medical_conditions: string | null;
  medications: string | null;
  special_needs_notes: string | null;

  // --- Step 3: Parent/Guardian ---
  relationship_type: RelationshipType;
  father: PersonBlock | null; // relationship_type === "parent" only
  mother: PersonBlock | null; // relationship_type === "parent" only
  guardian: PersonBlock | null; // relationship_type === "guardian" only
  /** Which entered block is the primary contact. Flagged to reconcile with Muntajir — frontend-chosen name/enum, unconfirmed with backend. */
  primary_contact: "father" | "mother" | "guardian" | null;

  // --- Step 4: Address ---
  home_address: AddressBlock;
  other_address_same_as_home: boolean;
  /** Null when other_address_same_as_home is true — don't duplicate data. */
  other_address: AddressBlock | null;
  /** 0–2 entries, each optional as a whole. */
  emergency_contacts: EmergencyContact[];

  // --- Step 5: Agent (all optional) ---
  agent_id: string | null;
  has_agent_commission: boolean;

  // --- Step 6: Siblings ---
  sibling_student_ids: string[];

  // --- Step 7: Past Records ---
  past_records: PastRecord[];

  // --- Login Details ---
  username: string;
  /** Mock never stores/returns a plaintext password after creation — modeling this now avoids a bad precedent for the real API. */
  password_is_set: boolean;
  two_factor_enabled: boolean;
  login_activated: boolean;

  created_at: string;
  updated_at: string;
};
