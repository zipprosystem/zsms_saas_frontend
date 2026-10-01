import type { Agent, Student, StudentGender, StudentMode, StudentStatus } from "@/lib/students/studentTypes";

/**
 * Illustrative-only reference data for the Students MOCK module's seed
 * rows and table display (Commit 1, before the wizard exists). These are
 * NOT the real academic-structure records — once the Add Student wizard
 * ships (Commit 2+), new students reference real school-types/classes/
 * class-arms ids from src/lib/setup/academicStructure/*Api.ts, scoped to
 * the active academic year. This file's ids never collide with real ones
 * (prefixed "mock-"), so the two can coexist in the mock store without
 * confusion.
 */
export type MockRef = { id: string; name: string };

export const MOCK_SCHOOL_TYPES: MockRef[] = [
  { id: "mock-school-type-primary", name: "Primary" },
  { id: "mock-school-type-secondary", name: "Secondary" },
];

export const MOCK_CLASSES: Array<MockRef & { school_type_id: string }> = [
  { id: "mock-class-primary-5", name: "Primary 5", school_type_id: "mock-school-type-primary" },
  { id: "mock-class-primary-6", name: "Primary 6", school_type_id: "mock-school-type-primary" },
  { id: "mock-class-jss-1", name: "JSS 1", school_type_id: "mock-school-type-secondary" },
  { id: "mock-class-jss-2", name: "JSS 2", school_type_id: "mock-school-type-secondary" },
  { id: "mock-class-sss-1", name: "SSS 1", school_type_id: "mock-school-type-secondary" },
];

export const MOCK_CLASS_ARMS: Array<MockRef & { class_id: string }> = MOCK_CLASSES.flatMap((cls) =>
  ["Gold", "Silver"].map((armName) => ({
    id: `${cls.id}-${armName.toLowerCase()}`,
    name: armName,
    class_id: cls.id,
  })),
);

export const MOCK_HOUSES: MockRef[] = [
  { id: "mock-house-red", name: "Red House" },
  { id: "mock-house-blue", name: "Blue House" },
  { id: "mock-house-green", name: "Green House" },
  { id: "mock-house-yellow", name: "Yellow House" },
];

/** Dormitory/hostel a BOARDING student lives in — distinct from the academic (inter-house competition) houses above. Only assigned to mode:"boarding" students. */
export const MOCK_BOARDING_HOUSES: MockRef[] = [
  { id: "mock-boarding-unity", name: "Unity Hall" },
  { id: "mock-boarding-peace", name: "Peace Hall" },
  { id: "mock-boarding-harmony", name: "Harmony Hall" },
];

export const MOCK_EXTRA_CURRICULAR: MockRef[] = [
  { id: "mock-activity-football", name: "Football" },
  { id: "mock-activity-choir", name: "Choir" },
  { id: "mock-activity-debate", name: "Debate" },
];

export const MOCK_AGENTS: Agent[] = [
  { id: "mock-agent-1", name: "Chidi Okafor", agency: "Bright Futures Agency" },
  { id: "mock-agent-2", name: "Amina Bello", agency: "EduLink Partners" },
  { id: "mock-agent-3", name: "Grace Adeyemi", agency: null },
];

const FIRST_NAMES_M = ["Chidi", "Tunde", "Emeka", "Ifeanyi", "Kunle", "Segun", "Bayo", "Obinna", "Yusuf", "David"];
const FIRST_NAMES_F = ["Ngozi", "Amina", "Funke", "Chioma", "Zainab", "Bisi", "Adaeze", "Fatima", "Grace", "Kemi"];
const OTHER_NAMES = ["Chukwuemeka", "Oluwaseun", "Ibrahim", "Blessing", null, null, "Adaora", null];
const LAST_NAMES = ["Okafor", "Bello", "Adeyemi", "Okonkwo", "Mohammed", "Afolabi", "Eze", "Abubakar", "Nwosu", "Lawal"];
const NATIONALITIES = ["Nigerian", "Ghanaian", "Nigerian", "Nigerian", "Beninese"];

// Mostly active, with graduated/withdrawn/suspended/expelled represented in
// smaller numbers — enough for the Withdrawn/Graduate tabs (Commit 1:
// placeholders) and stat cards to have real counts once built out. No
// "draft" or "inactive" rows seeded — draft only exists via the wizard's
// Save Draft (Commit 3), and "inactive" isn't surfaced by any tab yet.
const STATUS_CYCLE: StudentStatus[] = [
  "active", "active", "active", "active", "active", "active", "active",
  "graduated", "graduated",
  "withdrawn",
  "suspended",
  "expelled",
];
const MODE_CYCLE: StudentMode[] = ["day", "day", "boarding"];

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

/** A handful of students enrolled "recently" (relative to whenever this module loads) so the "Newly Enrolled" stat card has a non-zero, always-current count — see studentsTableHelpers.ts's isNewlyEnrolled(). */
const RECENTLY_ENROLLED_INDICES = new Set([0, 1, 2, 11]);
const RECENT_ENROLLMENT_DAYS_AGO = [3, 10, 18, 25];

function enrolledAt(index: number): string {
  if (!RECENTLY_ENROLLED_INDICES.has(index)) return "2026-01-15T08:00:00.000Z";
  const daysAgo = RECENT_ENROLLMENT_DAYS_AGO[Array.from(RECENTLY_ENROLLED_INDICES).indexOf(index)] ?? 14;
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function buildStudent(index: number): Student {
  const gender: StudentGender = index % 2 === 0 ? "male" : "female";
  const firstNames = gender === "male" ? FIRST_NAMES_M : FIRST_NAMES_F;
  const firstName = firstNames[index % firstNames.length];
  const lastName = LAST_NAMES[(index * 3) % LAST_NAMES.length];
  const cls = MOCK_CLASSES[index % MOCK_CLASSES.length];
  const arm = MOCK_CLASS_ARMS.find((a) => a.class_id === cls.id) ?? MOCK_CLASS_ARMS[0];
  const house = index % 4 === 3 ? null : MOCK_HOUSES[index % MOCK_HOUSES.length];
  const status = STATUS_CYCLE[index % STATUS_CYCLE.length];
  const mode = MODE_CYCLE[index % MODE_CYCLE.length];
  const boardingHouse = mode === "boarding" ? MOCK_BOARDING_HOUSES[index % MOCK_BOARDING_HOUSES.length] : null;
  const admissionNumber = `ADM${pad4(index + 1)}`;
  const dobYear = 2010 + (index % 10);
  const createdAt = enrolledAt(index);

  return {
    id: `mock-student-${index + 1}`,
    status,
    draft_last_step: null,

    school_type_id: cls.school_type_id,
    class_id: cls.id,
    class_arm_id: arm.id,
    class_term_id: null,
    academic_house_id: house?.id ?? null,
    boarding_house_id: boardingHouse?.id ?? null,
    mode,
    extra_curricular_ids: index % 3 === 0 ? [MOCK_EXTRA_CURRICULAR[index % MOCK_EXTRA_CURRICULAR.length].id] : [],
    fee_display: null,

    photo_file_id: null,
    first_name: firstName,
    other_names: OTHER_NAMES[index % OTHER_NAMES.length],
    last_name: lastName,
    admission_number: admissionNumber,
    email: null,
    gender,
    religion: index % 3 === 0 ? "Christianity" : index % 3 === 1 ? "Islam" : null,
    religion_is_other: false,
    nationality: NATIONALITIES[index % NATIONALITIES.length],
    date_of_birth: `${dobYear}-0${(index % 9) + 1}-1${index % 9}`,
    height: null,
    weight: null,
    blood_group: null,
    genotype: null,
    allergies: null,
    medical_conditions: null,
    medications: null,
    special_needs_notes: null,

    relationship_type: "parent",
    father: { first_name: "Father", middle_name: null, last_name: lastName, phone: "+2348000000000", email: null, occupation: null },
    mother: { first_name: "Mother", middle_name: null, last_name: lastName, phone: "+2348000000001", email: null, occupation: null },
    guardian: null,
    primary_contact: "father",

    home_address: {
      street: "1 Sample Street",
      country_code: "NG",
      state_code: null,
      city: null,
      postal_code: null,
      lga_or_area: null,
    },
    other_address_same_as_home: true,
    other_address: null,
    emergency_contacts: [],

    agent_id: null,
    has_agent_commission: false,

    sibling_student_ids: [],
    past_records: [],

    username: `ZSMS${admissionNumber}`,
    password_is_set: true,
    two_factor_enabled: false,
    login_activated: true,

    created_at: createdAt,
    updated_at: createdAt,
  };
}

const SEED_COUNT = 30;

/** A few sibling pairs wired up after generation (by id, not during buildStudent) so the Siblings column has non-zero counts to demo. */
const SIBLING_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [5, 6],
  [14, 15],
];

/** Deterministic seed set (no randomness) so the mock list is stable across reloads during manual QA. No "draft" rows here — those are only created live via the wizard's Save Draft (Commit 3). */
export function buildSeedStudents(): Student[] {
  const students = Array.from({ length: SEED_COUNT }, (_, i) => buildStudent(i));
  for (const [a, b] of SIBLING_PAIRS) {
    if (a >= students.length || b >= students.length) continue;
    students[a].sibling_student_ids = [students[b].id];
    students[b].sibling_student_ids = [students[a].id];
  }
  return students;
}
