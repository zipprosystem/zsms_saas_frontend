import type { Exam, ExamClassOption, ExamTermOption, ExamYearOption } from "@/lib/exam/examTypes";

/**
 * Self-contained seed data for the Exam mock (Matthew, 2026-10-23: the
 * marks screen must be testable under the local dev-auth bypass, where the
 * real Classes / Arms / Terms services return nothing). None of these ids
 * exist in the real backend — they never leave the mock.
 */

export const SEED_YEARS: ExamYearOption[] = [
  { id: "y-2026", name: "2026/2027", is_current: true },
  { id: "y-2025", name: "2025/2026", is_current: false },
];

const TERM_NAMES = ["First Term", "Second Term", "Third Term"];

export function seedTerms(yearId: string): ExamTermOption[] {
  return TERM_NAMES.map((name, index) => ({ id: `${yearId}-t${index + 1}`, name }));
}

export const SEED_CLASSES: ExamClassOption[] = [
  { id: "cls-jss1", name: "JSS 1", arms: [{ id: "arm-jss1-a", name: "A" }, { id: "arm-jss1-b", name: "B" }] },
  { id: "cls-ss1", name: "SS 1", arms: [{ id: "arm-ss1-sci", name: "Science" }, { id: "arm-ss1-art", name: "Arts" }] },
  { id: "cls-y11", name: "Year 11", arms: [{ id: "arm-y11-a", name: "A" }] },
];

export const SEED_SUBJECTS: Record<string, string> = {
  "sub-math": "Mathematics",
  "sub-eng": "English Language",
  "sub-bsc": "Basic Science",
  "sub-phy": "Physics",
  "sub-chem": "Chemistry",
  "sub-fmath": "Further Mathematics",
  "sub-lit": "Literature in English",
  "sub-gov": "Government",
  "sub-bio": "Biology",
};

/** Subjects offered per class-arm. `elective` = only some students take it (see enrolledIn). */
export const SEED_ARM_SUBJECTS: Record<string, Array<{ subject_id: string; elective?: boolean }>> = {
  "arm-jss1-a": [{ subject_id: "sub-math" }, { subject_id: "sub-eng" }, { subject_id: "sub-bsc" }],
  "arm-jss1-b": [{ subject_id: "sub-math" }, { subject_id: "sub-eng" }, { subject_id: "sub-bsc" }],
  "arm-ss1-sci": [
    { subject_id: "sub-math" },
    { subject_id: "sub-eng" },
    { subject_id: "sub-phy" },
    { subject_id: "sub-chem" },
    { subject_id: "sub-fmath", elective: true },
  ],
  "arm-ss1-art": [{ subject_id: "sub-math" }, { subject_id: "sub-eng" }, { subject_id: "sub-lit" }, { subject_id: "sub-gov" }],
  "arm-y11-a": [{ subject_id: "sub-math" }, { subject_id: "sub-eng" }, { subject_id: "sub-bio" }],
};

/**
 * Structure in force per class — MOCK mapping onto the Stage 1a seed
 * structures. The real backend resolves this from the class/subject's
 * assigned structure (later: from the Result Template). Unmapped classes
 * fall back to the school's default structure.
 */
export const SEED_CLASS_STRUCTURE: Record<string, string> = {
  "cls-jss1": "as-seed-standard",
  "cls-ss1": "as-seed-composite",
};

const FIRST_NAMES = [
  "Adebayo", "Chiamaka", "Ibrahim", "Ngozi", "Tobi", "Aisha", "Emeka", "Funmilayo", "Kelechi", "Zainab",
  "Oluwaseun", "Amara", "Musa", "Temitope", "Chinedu", "Halima",
];
const LAST_NAMES = [
  "Okonkwo", "Adeyemi", "Bello", "Eze", "Ogunleye", "Abubakar", "Nwosu", "Balogun", "Okafor", "Yusuf",
  "Afolabi", "Obi", "Danjuma", "Lawal",
];

export type SeedStudent = { id: string; name: string; admission_no: string; seat_no: string };

/** Deterministic roster per arm (10 students; 12 in Year 11). */
export function seedRoster(armId: string): SeedStudent[] {
  const armIndex = SEED_CLASSES.flatMap((cls) => cls.arms).findIndex((arm) => arm.id === armId);
  if (armIndex < 0) return [];
  const size = armId === "arm-y11-a" ? 12 : 10;
  return Array.from({ length: size }, (_, i) => {
    const n = armIndex * 20 + i;
    return {
      id: `stu-${armId}-${i + 1}`,
      name: `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[(n * 7 + armIndex) % LAST_NAMES.length]}`,
      admission_no: `ZS/${String(2400 + n).padStart(4, "0")}`,
      seat_no: String(i + 1).padStart(3, "0"),
    };
  });
}

/** Electives: every other student takes it. Core subjects: everyone in the arm. */
export function enrolledIn(armId: string, subjectId: string): SeedStudent[] {
  const offer = SEED_ARM_SUBJECTS[armId]?.find((item) => item.subject_id === subjectId);
  if (!offer) return [];
  const roster = seedRoster(armId);
  return offer.elective ? roster.filter((_, index) => index % 2 === 0) : roster;
}

/** Mock teachers and their teaching assignments (subject + class-arm) — the effective_scope the mock simulates. */
export const SEED_TEACHERS: Array<{ id: string; name: string; assignments: Array<{ subject_id: string; class_arm_id: string }> }> = [
  {
    id: "stf-okafor",
    name: "Adaeze Okafor",
    assignments: [
      { subject_id: "sub-math", class_arm_id: "arm-jss1-a" },
      { subject_id: "sub-math", class_arm_id: "arm-jss1-b" },
      { subject_id: "sub-math", class_arm_id: "arm-y11-a" },
    ],
  },
  {
    id: "stf-bello",
    name: "Tunde Bello",
    assignments: [
      { subject_id: "sub-phy", class_arm_id: "arm-ss1-sci" },
      { subject_id: "sub-chem", class_arm_id: "arm-ss1-sci" },
      { subject_id: "sub-fmath", class_arm_id: "arm-ss1-sci" },
    ],
  },
  {
    id: "stf-eze",
    name: "Grace Eze",
    assignments: [
      { subject_id: "sub-eng", class_arm_id: "arm-jss1-a" },
      { subject_id: "sub-eng", class_arm_id: "arm-jss1-b" },
    ],
  },
];

/** Cutoffs: the current year's first term is open; last year's exams are closed (read-only grid). */
const CLOSES_ON: Record<string, [string, string]> = {
  "y-2026-t1": ["2026-11-30", "2026-12-18"],
  "y-2026-t2": ["2027-03-01", "2027-04-02"],
  "y-2026-t3": ["2027-06-14", "2027-07-23"],
  "y-2025-t1": ["2025-11-28", "2025-12-19"],
  "y-2025-t2": ["2026-03-02", "2026-04-03"],
  "y-2025-t3": ["2026-06-12", "2026-07-24"],
};

export const SEED_EXAMS: Exam[] = SEED_YEARS.flatMap((year) =>
  seedTerms(year.id).flatMap((term) => {
    const [caCloses, examCloses] = CLOSES_ON[term.id];
    return [
      { id: `${term.id}-ca`, name: `${term.name} CA`, kind: "ca" as const, academic_year_id: year.id, term_id: term.id, entry_closes_on: caCloses },
      { id: `${term.id}-exam`, name: `${term.name} Examination`, kind: "exam" as const, academic_year_id: year.id, term_id: term.id, entry_closes_on: examCloses },
    ];
  }),
);
