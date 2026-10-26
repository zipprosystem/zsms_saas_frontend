import type { Exam, ExamTermOption, ExamYearOption, GradeBasedStructure, GradeScale, RatingScale, ReportVariant } from "@/lib/exam/examTypes";

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

/** assessment_mode comes from the structure in force (examMockBackend resolves it), not from here. */
export const SEED_CLASSES: Array<{ id: string; name: string; arms: Array<{ id: string; name: string }> }> = [
  { id: "cls-jss1", name: "JSS 1", arms: [{ id: "arm-jss1-a", name: "A" }, { id: "arm-jss1-b", name: "B" }] },
  { id: "cls-ss1", name: "SS 1", arms: [{ id: "arm-ss1-sci", name: "Science" }, { id: "arm-ss1-art", name: "Arts" }] },
  { id: "cls-y11", name: "Year 11", arms: [{ id: "arm-y11-a", name: "A" }] },
  // Appended (Stage 1c) so the existing arms' seeded rosters keep their ids.
  { id: "cls-y9", name: "Year 9", arms: [{ id: "arm-y9-oak", name: "Oak" }, { id: "arm-y9-elm", name: "Elm" }] },
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
  "sub-sci": "Science",
  "sub-hist": "History",
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
  "arm-y9-oak": [{ subject_id: "sub-math" }, { subject_id: "sub-eng" }, { subject_id: "sub-sci" }, { subject_id: "sub-hist" }],
  "arm-y9-elm": [{ subject_id: "sub-math" }, { subject_id: "sub-eng" }, { subject_id: "sub-sci" }, { subject_id: "sub-hist", elective: true }],
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

// ---------------------------------------------------------------------------
// Grade-based (British) — Stage 1c. MOCK definitions the real backend will
// own (grade-scale / trait masters are Stage 3; the grade_based structure
// fields come with the Assessment Types grade_based mode).
// ---------------------------------------------------------------------------

export const SEED_GRADE_SCALES: GradeScale[] = [
  {
    id: "scale-gcse",
    name: "GCSE 9–1",
    grades: [
      { code: "9", label: "9" },
      { code: "8", label: "8" },
      { code: "7", label: "7" },
      { code: "6", label: "6" },
      { code: "5", label: "5" },
      { code: "4", label: "4" },
      { code: "3", label: "3" },
      { code: "2", label: "2" },
      { code: "1", label: "1" },
      { code: "U", label: "U" },
    ],
  },
  {
    id: "scale-ks3",
    name: "KS3 attainment",
    grades: [
      { code: "M", label: "Mastering" },
      { code: "S", label: "Secure" },
      { code: "D", label: "Developing" },
      { code: "E", label: "Emerging" },
    ],
  },
];

export const SEED_RATING_SCALES: RatingScale[] = [
  {
    id: "rating-1-4",
    name: "1–4 rating",
    levels: [
      { code: "1", label: "Excellent" },
      { code: "2", label: "Good" },
      { code: "3", label: "Requires improvement" },
      { code: "4", label: "Cause for concern" },
    ],
  },
];

export const SEED_GRADE_STRUCTURES: GradeBasedStructure[] = [
  {
    id: "gs-ks3",
    name: "KS3 Academic Report",
    attainment: { id: "gs-ks3-att", name: "Current Attainment", grade_scale_id: "scale-ks3" },
    rating_domains: [
      { id: "gs-ks3-eng", key: "engagement", name: "Engagement", rating_scale_id: "rating-1-4" },
      { id: "gs-ks3-lb", key: "learning_behaviour", name: "Learning Behaviour", rating_scale_id: "rating-1-4" },
    ],
  },
  {
    // Subject-wise domains only — Boarding Commitment is student-wise (Report Progression, Stage 3).
    id: "gs-ks4",
    name: "KS4 Academic Report",
    attainment: { id: "gs-ks4-att", name: "Current Attainment", grade_scale_id: "scale-gcse" },
    rating_domains: [
      { id: "gs-ks4-eng", key: "engagement", name: "Engagement", rating_scale_id: "rating-1-4" },
      { id: "gs-ks4-lb", key: "learning_behaviour", name: "Learning Behaviour", rating_scale_id: "rating-1-4" },
    ],
  },
];

/** Classes that report grade-based (British). Everything else is component_based (SEED_CLASS_STRUCTURE / default). */
export const SEED_CLASS_GRADE_STRUCTURE: Record<string, string> = {
  "cls-y9": "gs-ks3",
  "cls-y11": "gs-ks4",
};

/**
 * Read-only per-student references for the Academic Report — Stage 3 owns
 * MTG management/import and the Grade Book; here they're deterministic
 * seeds on the class's grade scale. One target (mtg) per student/subject.
 */
export function seedReferences(
  studentIndex: number,
  subjectId: string,
  scale: GradeScale,
): { mtg: string | null; grade_book: string | null } {
  const codes = scale.grades.map((grade) => grade.code).filter((code) => code !== "U");
  if (codes.length === 0) return { mtg: null, grade_book: null };
  const salt = subjectId.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const at = (offset: number) => codes[Math.min(codes.length - 1, Math.max(0, offset))];
  const mtgIndex = (studentIndex * 3 + salt) % Math.max(1, codes.length - 1);
  return {
    mtg: at(mtgIndex),
    grade_book: at(mtgIndex + ((studentIndex + salt) % 3) - 1),
  };
}

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
      { subject_id: "sub-math", class_arm_id: "arm-y9-oak" },
      { subject_id: "sub-math", class_arm_id: "arm-y9-elm" },
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
      { subject_id: "sub-eng", class_arm_id: "arm-y9-oak" },
      { subject_id: "sub-eng", class_arm_id: "arm-y11-a" },
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

/**
 * Each term auto-creates exactly two points per assessment mode (names are
 * school-editable; these are the defaults). Score classes: CA + Examination.
 * British (grade-based) classes: A/B per term (1A, 1B, 2A…), each carrying a
 * report_variant — Third Term uses "full" at both points (a school may).
 */
const GRADE_VARIANTS: Record<number, [ReportVariant, ReportVariant]> = {
  1: ["progress", "full"],
  2: ["progress", "full"],
  3: ["full", "full"],
};

export const SEED_EXAMS: Exam[] = SEED_YEARS.flatMap((year) =>
  seedTerms(year.id).flatMap((term, index) => {
    const [firstCloses, secondCloses] = CLOSES_ON[term.id];
    const n = index + 1;
    const [variantA, variantB] = GRADE_VARIANTS[n];
    const base = { academic_year_id: year.id, term_id: term.id };
    return [
      { ...base, id: `${term.id}-ca`, name: `${term.name} CA`, assessment_mode: "component_based" as const, kind: "ca" as const, report_variant: null, entry_closes_on: firstCloses },
      { ...base, id: `${term.id}-exam`, name: `${term.name} Examination`, assessment_mode: "component_based" as const, kind: "exam" as const, report_variant: null, entry_closes_on: secondCloses },
      { ...base, id: `${term.id}-a`, name: `${n}A`, assessment_mode: "grade_based" as const, kind: null, report_variant: variantA, entry_closes_on: firstCloses },
      { ...base, id: `${term.id}-b`, name: `${n}B`, assessment_mode: "grade_based" as const, kind: null, report_variant: variantB, entry_closes_on: secondCloses },
    ];
  }),
);
