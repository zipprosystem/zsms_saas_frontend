import type { PermissionGroup, Staff, StaffPost, StaffStatus, StaffType } from "@/lib/hr/hrTypes";

/**
 * Deterministic mock seed data — fixed ids so rows keep their identity
 * across reloads (and group memberships pointing at them stay valid).
 * Seeded staff carry NO academic references (department / class / arm /
 * subject ids): those come from the real Academic APIs, which are empty
 * under dev-bypass, so any id invented here would just render "—". Staff
 * created through the wizard on staging get real ones.
 */

function seedId(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const SEED_STAFF_POSTS: StaffPost[] = [
  "Principal",
  "Vice Principal (Academics)",
  "Vice Principal (Admin)",
  "Head Teacher",
  "Teacher",
  "Bursar",
  "Registrar",
  "Librarian",
  "School Nurse",
  "Administrative Officer",
  "Security Officer",
].map((name, index) => ({ id: seedId("5a7f0001", index + 1), name, is_active: true, staff_count: null }));

const FIRST_NAMES = [
  "Adaeze", "Babatunde", "Chinedu", "Damilola", "Emeka", "Folake", "Gbenga", "Halima", "Ifeoma", "Jide",
  "Kemi", "Lanre", "Musa", "Ngozi", "Obinna", "Patience", "Rasheed", "Sade", "Tunde", "Uche",
  "Victoria", "Wale", "Yemisi", "Zainab", "Aisha", "Bola", "Chioma", "Dayo", "Efe", "Funmi",
  "Garba",
];
const LAST_NAMES = [
  "Okafor", "Adeyemi", "Bello", "Eze", "Ogunleye", "Nwosu", "Ibrahim", "Afolabi", "Okeke", "Salami",
  "Abubakar", "Onyeka", "Balogun", "Uzor", "Lawal", "Chukwu", "Oladipo", "Danjuma", "Ekwueme", "Fashola",
  "Garba", "Hassan", "Idowu", "Jacobs", "Kalu", "Lucas", "Mohammed", "Nnamdi", "Obi", "Popoola",
  "Quadri", "Raji", "Sanni",
];
const TITLES = ["Mr", "Mrs", "Miss", "Dr", "Mr", "Mrs"];

const TEACHER_POST = SEED_STAFF_POSTS[4].id;
const NON_TEACHING_POSTS = [5, 6, 7, 8, 9, 10].map((index) => SEED_STAFF_POSTS[index].id);
const BASE_DATE = Date.UTC(2026, 9, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysBefore(days: number): string {
  return new Date(BASE_DATE - days * DAY_MS).toISOString();
}

const SEED_LEAVER_REASONS: Partial<Record<StaffStatus, string>> = {
  retired: "Reached retirement age",
  terminated: "Contract ended",
  resigned: "Relocating to another city",
  absconded: "Absent without notice since mid-term",
  suspended: "Pending disciplinary review",
};

/** 64 staff: enough to page past the default 50. ~60% teaching; one or more of each leaver category plus drafts, to exercise the Status filter. */
export const SEED_STAFF: Staff[] = Array.from({ length: 64 }, (_unused, index): Staff => {
  const n = index + 1;
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(index * 7) % LAST_NAMES.length];
  const staffType: StaffType = index % 5 < 3 ? "teaching" : "non_teaching";
  const status: StaffStatus =
    n % 23 === 0
      ? "retired"
      : n % 29 === 0
        ? "terminated"
        : n % 31 === 0
          ? "draft"
          : n % 19 === 0
            ? "suspended"
            : n % 37 === 0
              ? "resigned"
              : n % 41 === 0
                ? "absconded"
                : "active";
  const postId =
    index === 0 ? SEED_STAFF_POSTS[0].id : staffType === "teaching" ? TEACHER_POST : NON_TEACHING_POSTS[index % NON_TEACHING_POSTS.length];
  const email = `${firstName}.${lastName}${n}@example.school`.toLowerCase();
  const joined = isoDaysBefore(200 + index * 37);
  // Every 7th active staff has never had credentials issued — exercises the profile's "Issue credentials".
  const hasCredentials = status !== "draft" && !(status === "active" && n % 7 === 0);
  return {
    id: seedId("5a7f0002", n),
    user_id: status === "draft" ? null : seedId("5a7f0009", n),
    password_setup: null,
    staff_no: status === "draft" ? null : `STF/${String(1000 + n)}`,
    status,
    draft_last_step: status === "draft" ? 1 : null,
    photo_file_id: null,
    signature_file_id: null,
    title: TITLES[index % TITLES.length],
    initials: `${firstName[0]}.${lastName[0]}`,
    first_name: firstName,
    last_name: lastName,
    other_name: null,
    email,
    national_id: null,
    gender: index % 2 === 0 ? "female" : "male",
    date_of_birth: `19${70 + (index % 25)}-0${1 + (index % 9)}-1${index % 9}`,
    date_joined: joined.slice(0, 10),
    staff_type: staffType,
    post_id: postId,
    department_ids: [],
    subject_assignments: [],
    class_teacher_assignments: [],
    assignments_academic_year_id: null,
    assignments_carried_forward_from: null,
    permission_group_ids: [],
    present_address: null,
    permanent_same_as_present: true,
    permanent_address: null,
    qualifications: [],
    references: [],
    experience: [],
    username: hasCredentials ? email : null,
    login_active: hasCredentials && status === "active",
    must_change_password: false,
    credentials_issued_at: hasCredentials ? joined : null,
    password_reset_at: null,
    last_active_at: hasCredentials && status === "active" && n % 4 !== 0 ? isoDaysBefore(n % 9) : null,
    status_reason: SEED_LEAVER_REASONS[status] ?? null,
    status_effective_date: SEED_LEAVER_REASONS[status] ? isoDaysBefore(30).slice(0, 10) : null,
    created_at: joined,
    updated_at: joined,
  };
});

const ALL_MODULE_KEYS = (actions: string[], modules: string[]) =>
  modules.flatMap((module) => actions.map((action) => `${module}.${action}`));

export const SEED_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: seedId("5a7f0003", 1),
    name: "School Administrators",
    permissions: ALL_MODULE_KEYS(
      ["view", "create", "edit", "delete"],
      ["students", "staff", "academics", "attendance", "assessments", "finance", "communications", "reports", "setup", "settings"],
    ),
    member_staff_ids: [SEED_STAFF[0].id],
  },
  {
    id: seedId("5a7f0003", 2),
    name: "Teachers",
    permissions: [
      ...ALL_MODULE_KEYS(["view"], ["students", "academics", "reports"]),
      ...ALL_MODULE_KEYS(["view", "create", "edit"], ["attendance", "assessments"]),
    ],
    member_staff_ids: SEED_STAFF.filter((staff) => staff.staff_type === "teaching" && staff.status === "active")
      .slice(0, 12)
      .map((staff) => staff.id),
  },
  {
    id: seedId("5a7f0003", 3),
    name: "Bursary",
    permissions: [...ALL_MODULE_KEYS(["view", "create", "edit"], ["finance"]), ...ALL_MODULE_KEYS(["view"], ["students", "reports"])],
    member_staff_ids: SEED_STAFF.filter((staff) => staff.post_id === NON_TEACHING_POSTS[0]).map((staff) => staff.id),
  },
];
