/**
 * HR domain types — Staff, Staff Posts, Permission Groups. Field names
 * follow our mock contract plus the names Muntajir documented for the
 * shipped backend (2026-10-23: staff.id + user_id, permission catalog,
 * carry-forward review). Anything still unconfirmed is marked FLAGGED —
 * reconcile against the live API on the deployed tenant.
 *
 * IDENTITY (Option B): every staff reference — the staff record, a
 * department's HOD / senior manager, class-teacher and subject
 * assignments, permission-group members — is staff.id. user_id (the login
 * account, may be null) is used for ONE thing only: resolving who
 * performed a status event (acted_by_user_id -> name).
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
  /** staff.id — the id every other record references. */
  id: string;
  /** The staff's login account (users.id), null until one exists. ONLY used to resolve status-event actors — never to reference the staff. */
  user_id: string | null;
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
  /**
   * How the staff gets a password (hybrid): "email_link" = a secure
   * set-password link is emailed (valid email on file); "default_password"
   * = the school default (123456) is handed over in person. FLAGGED: field
   * name proposed; when absent the UI derives it from whether an email
   * exists (passwordSetupFor()).
   */
  password_setup: PasswordSetup | null;
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
  | "password_setup"
  | "user_id"
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
  /** users.id of whoever recorded the event — resolved to a name via the staff lookup's user_id (never staff.id). */
  acted_by_user_id: string | null;
  /** FLAGGED: the backend may send the actor's name directly; preferred over the lookup when present. */
  acted_by_name: string | null;
};

export type PasswordSetup = "email_link" | "default_password";

/** Loose email check — enough to decide link vs default password; the backend validates properly. */
export function hasUsableEmail(email: string | null | undefined): boolean {
  return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** The backend's answer when it sends one, otherwise derived from the email on file. */
export function passwordSetupFor(staff: Pick<Staff, "password_setup" | "email">): PasswordSetup {
  return staff.password_setup ?? (hasUsableEmail(staff.email) ? "email_link" : "default_password");
}

/**
 * A carried-forward assignment the backend couldn't match into the new
 * year (e.g. the arm or class subject doesn't exist there) — kept for an
 * admin to remap or discard. FLAGGED: shape proposed; names follow the
 * staff assignment fields.
 */
export type AssignmentReviewKind = "subject" | "class_teacher";

export type AssignmentReviewItem = {
  id: string;
  staff_id: string;
  staff_name: string;
  kind: AssignmentReviewKind;
  /** The year the assignment came from, and the year it should be remapped into. */
  from_academic_year_id: string | null;
  academic_year_id: string;
  /** The old year's ids + names (names sent by the backend — the old year's classes aren't loaded here). */
  class_id: string | null;
  class_name: string | null;
  section_id: string | null;
  section_name: string | null;
  subject_id: string | null;
  subject_name: string | null;
  /** Backend's reason code, e.g. ARM_NOT_FOUND / CLASS_NOT_FOUND / SUBJECT_NOT_OFFERED. */
  reason: string | null;
};

export type AssignmentRemapBody = { class_id: string; section_id: string; subject_id?: string };

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
  /** Permission keys ("module.action") from the backend's permission catalog (GET erp/permission-catalog). */
  permissions: string[];
  /** staff.id of each member. */
  member_staff_ids: string[];
};

/** The backend permission catalog, normalized (permissionCatalog.ts reads its wire shape tolerantly). */
export type PermissionCatalogEntry = { key: string; action: string; label: string | null };
export type PermissionCatalogModule = { key: string; label: string | null; permissions: PermissionCatalogEntry[] };
export type PermissionCatalog = { modules: PermissionCatalogModule[] };

export type PermissionGroupInput = { name: string; permissions: string[]; member_staff_ids: string[] };
