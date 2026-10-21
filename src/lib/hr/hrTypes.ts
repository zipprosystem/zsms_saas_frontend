/**
 * HR domain types — Staff, Staff Posts, Permission Groups. Field names are
 * the PROPOSED wire contract (snake_case, same as Student Core) the mock
 * implements; the backend owns them once it ships.
 */

export type StaffType = "teaching" | "non_teaching";

/**
 * employment_status. draft = Save Draft before Add Staff. Retire /
 * Terminate are the ONE leaving mechanism (no separate Resignation);
 * suspended is a status the list can filter on.
 */
export type StaffStatus = "draft" | "active" | "suspended" | "retired" | "terminated";

export const STAFF_STATUSES: readonly StaffStatus[] = ["draft", "active", "suspended", "retired", "terminated"];

/** The Staffs list's Status filter choices — every employment status except draft. */
export const STAFF_LIST_STATUSES: readonly StaffStatus[] = ["active", "suspended", "retired", "terminated"];

export type StaffStatusAction = "retire" | "terminate";

/** One teaching allocation. A staff holds any number; the same subject may repeat across arms/classes. */
export type StaffSubjectAssignment = { class_id: string; section_id: string; subject_id: string };

/** An arm this staff is class teacher (form tutor) of. */
export type StaffClassTeacherAssignment = { class_id: string; section_id: string };

export type StaffAddress = {
  country_code: string | null;
  state_code: string | null;
  city: string | null;
  postal_code: string | null;
  mobile: string | null;
  address_line: string | null;
};

export type StaffQualification = {
  degree: string | null;
  grade: string | null;
  result: string | null;
  year: string | null;
  institution: string | null;
  status: string | null;
  session: string | null;
  remarks: string | null;
};

export type StaffReference = {
  name: string | null;
  organization: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
};

export type StaffExperience = {
  organization: string | null;
  role: string | null;
  tenure_from: string | null;
  tenure_to: string | null;
};

export type StaffGender = "male" | "female";

export type Staff = {
  id: string;
  /** Backend-assigned display id — read-only, never generated here. Null on a draft. */
  staff_no: string | null;
  status: StaffStatus;
  /** Wizard resume cursor for a draft (same idea as Student Core's draft_last_step). */
  draft_last_step: number | null;

  // Staff Details
  photo_file_id: string | null;
  signature_file_id: string | null;
  title: string | null;
  first_name: string;
  last_name: string;
  other_name: string | null;
  email: string | null;
  gender: StaffGender | null;
  date_of_birth: string | null;
  date_joined: string | null;

  // Staff Post
  staff_type: StaffType;
  post_id: string | null;

  department_ids: string[];
  subject_assignments: StaffSubjectAssignment[];
  class_teacher_assignments: StaffClassTeacherAssignment[];
  /**
   * DERIVED on read from Permission Group membership (the group is the
   * source of truth for members). Sending it on a staff save replaces this
   * staff's memberships — the backend applies it to the groups.
   */
  permission_group_ids: string[];

  present_address: StaffAddress | null;
  permanent_same_as_present: boolean;
  permanent_address: StaffAddress | null;

  qualifications: StaffQualification[];
  references: StaffReference[];
  experience: StaffExperience[];

  // Login — the password itself is never returned on a read.
  username: string | null;
  login_active: boolean;
  /** Set when credentials are issued/reset AND the school has 2FA on — otherwise no forced change. */
  must_change_password: boolean;
  last_active_at: string | null;

  // Latest status change (Retire / Terminate)
  status_reason: string | null;
  status_effective_on: string | null;

  created_at: string;
  updated_at: string;
};

/** Everything a create/update sends — the complete record, never a partial patch (Student Core's convention). */
export type StaffWriteBody = Omit<
  Staff,
  | "id"
  | "staff_no"
  | "status"
  | "draft_last_step"
  | "must_change_password"
  | "last_active_at"
  | "status_reason"
  | "status_effective_on"
  | "created_at"
  | "updated_at"
>;

export type StaffStatusBody = { reason: string; effective_on: string };

export type StaffPost = {
  id: string;
  name: string;
  is_active: boolean;
  /** Backend-calculated: staff holding this post. Null if the backend doesn't send it. */
  staff_count: number | null;
};

export type StaffPostInput = { name: string; is_active: boolean };

export type PermissionGroup = {
  id: string;
  name: string;
  /** "module.action" keys from PERMISSION_MODULES / PERMISSION_ACTIONS (permissionCatalog.ts). */
  permissions: string[];
  member_staff_ids: string[];
};

export type PermissionGroupInput = { name: string; permissions: string[]; member_staff_ids: string[] };
