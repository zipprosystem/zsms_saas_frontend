/**
 * HR domain types — Staff, Staff Posts, Permission Groups. Field names are
 * the PROPOSED wire contract (snake_case, same as Student Core) the mock
 * implements; the backend owns them once it ships.
 */

export type StaffType = "teaching" | "non_teaching";

/**
 * employment_status. draft = Save Draft before Add Staff. Every other
 * non-active status is a LEAVER category, set through the one Leaver
 * flow (parallel to the students' Withdraw); Reinstate brings any leaver
 * back to active.
 */
export type StaffStatus = "draft" | "active" | "retired" | "terminated" | "resigned" | "absconded" | "suspended";

export const STAFF_STATUSES: readonly StaffStatus[] = [
  "draft",
  "active",
  "retired",
  "terminated",
  "resigned",
  "absconded",
  "suspended",
];

/** The Leaver categories (what the admin picks) and the status each one sets. */
export type StaffLeaverCategory = "retire" | "terminate" | "resign" | "abscond" | "suspend";

export const STAFF_LEAVER_CATEGORIES: readonly StaffLeaverCategory[] = ["retire", "terminate", "resign", "abscond", "suspend"];

export const LEAVER_CATEGORY_STATUS: Record<StaffLeaverCategory, StaffStatus> = {
  retire: "retired",
  terminate: "terminated",
  resign: "resigned",
  abscond: "absconded",
  suspend: "suspended",
};

/** Every leaver status — the Status filter's "Leavers" grouping. */
export const STAFF_LEAVER_STATUSES: readonly StaffStatus[] = STAFF_LEAVER_CATEGORIES.map((category) => LEAVER_CATEGORY_STATUS[category]);

export function isLeaverStatus(status: StaffStatus): boolean {
  return STAFF_LEAVER_STATUSES.includes(status);
}

/** The Staff list's statuses — every employment status except draft. */
export const STAFF_LIST_STATUSES: readonly StaffStatus[] = ["active", ...STAFF_LEAVER_STATUSES];

/** The two status actions: apply a leaver category, or reinstate. Each is recorded as a staff status event. */
export type StaffStatusEventType = "leaver" | "reinstate";

/**
 * One teaching allocation. A staff holds any number; the same subject may
 * repeat across arms/classes. Year-scoped: class/arm ids belong to one
 * academic year, so the whole set is stored PER YEAR (see
 * Staff.assignments_academic_year_id).
 */
export type StaffSubjectAssignment = { class_id: string; section_id: string; subject_id: string };

/** An arm this staff is class teacher (form tutor) of — teaching staff only, year-scoped like subject assignments. */
export type StaffClassTeacherAssignment = { class_id: string; section_id: string };

export type StaffAddress = {
  country_code: string | null;
  state_code: string | null;
  city: string | null;
  postal_code: string | null;
  mobile: string | null;
  address_line: string | null;
};

/** Fields per the Figma Add Staff frame (3347:64541), which supersedes the v1.0 spec's list. */
export type StaffQualification = {
  degree: string | null;
  stream: string | null;
  board: string | null;
  institution: string | null;
  year: string | null;
  result: string | null;
  rank: string | null;
  duration: string | null;
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
  initials: string | null;
  first_name: string;
  last_name: string;
  other_name: string | null;
  email: string | null;
  /** Optional national ID number — free-form string, since formats vary by country (no digit/length rule beyond max 32). */
  national_id: string | null;
  gender: StaffGender | null;
  date_of_birth: string | null;
  date_joined: string | null;

  // Staff Post
  staff_type: StaffType;
  post_id: string | null;

  department_ids: string[];
  /**
   * Year-scoped sets, returned for the academic_year_id the read asked for
   * (assignments_academic_year_id). When that year has none yet, the
   * backend returns the most recent PRIOR year's sets as editable defaults
   * and names it in assignments_carried_forward_from (null otherwise) —
   * nothing is stored for the new year until a save.
   */
  subject_assignments: StaffSubjectAssignment[];
  class_teacher_assignments: StaffClassTeacherAssignment[];
  assignments_academic_year_id: string | null;
  assignments_carried_forward_from: string | null;
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
  /** When credentials were issued — null = never issued (no username yet). */
  credentials_issued_at: string | null;
  /** Last reset to the default password, if any. */
  password_reset_at: string | null;
  last_active_at: string | null;

  // Latest status change (Leaver / Reinstate)
  status_reason: string | null;
  status_effective_date: string | null;

  created_at: string;
  updated_at: string;
};

/**
 * Everything a create/update sends — the complete record, never a partial
 * patch (Student Core's convention). academic_year_id says which year the
 * two assignment sets are written to; other years are untouched. No
 * password field: the backend issues the default (123456) itself.
 */
export type StaffWriteBody = Omit<
  Staff,
  | "id"
  | "staff_no"
  | "status"
  | "draft_last_step"
  | "must_change_password"
  | "last_active_at"
  | "status_reason"
  | "status_effective_date"
  | "credentials_issued_at"
  | "password_reset_at"
  | "assignments_academic_year_id"
  | "assignments_carried_forward_from"
  | "created_at"
  | "updated_at"
> & { academic_year_id: string | null };

/** POST /staff/:id/leaver */
export type StaffLeaverBody = { category: StaffLeaverCategory; effective_date: string; reason: string };

/** POST /staff/:id/reinstate */
export type StaffReinstateBody = { effective_date: string; reason: string };

/** One staff_status_event — the history behind employment_status, oldest first. category: leaver events only. */
export type StaffStatusEvent = {
  type: StaffStatusEventType;
  category: StaffLeaverCategory | null;
  from_status: StaffStatus | null;
  to_status: StaffStatus | null;
  reason: string | null;
  effective_date: string | null;
  created_at: string | null;
};

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
