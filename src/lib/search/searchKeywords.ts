/**
 * Small, hand-authored supplementary synonyms — NOT a duplicate of the
 * navigation/settings/setup config the index is built from (see
 * useSearchIndex.ts), just extra match terms for the handful of entries
 * where an obvious synonym genuinely helps (e.g. searching "WAEC" should
 * find "Award Bodies"). Keyed by the same setup item `key` used in
 * setupConfig.ts. Add to sparingly — most entries need none.
 */
export const SETUP_ITEM_KEYWORDS: Record<string, string[]> = {
  awardBodies: ["WAEC", "NECO", "Cambridge", "IB", "Edexcel", "exam board", "examining body"],
  schoolTypes: ["Creche", "Nursery", "Primary", "JSS", "SSS", "Junior Secondary", "Senior Secondary"],
  departments: ["HOD", "head of department", "line manager"],
  grades: ["grade", "grades", "grade bands", "grading", "grade weight", "GPA", "GPA grades", "score range", "remark", "A1", "F9", "pass mark", "is pass"],
  attainmentGrades: ["attainment", "attainment scale", "British grades", "GCSE", "KS3", "9-1", "grade weight", "point value", "value added", "VA", "pass mark"],
  progressGrades: ["progress grade", "rating scale", "rating levels", "traits", "psychomotor", "affective", "engagement", "learning behaviour", "boarding", "descriptors", "rating key"],
  psychomotorSkills: ["psychomotor", "skills", "traits", "handwriting", "sports", "games", "handling of tools", "verbal fluency"],
  affectiveDomain: ["affective", "affective traits", "traits", "behaviour", "punctuality", "leadership", "neatness", "attentiveness", "character"],
  classSubjects: ["core", "elective"],
  studentTermDetails: ["roll number", "roll no", "promotion", "class placement"],
  assessmentTypes: ["score structure", "CA", "continuous assessment", "exam", "test", "assignment", "marks", "weighting"],
  subjectEnrolment: ["enrol", "enrollment", "enroll", "core subjects", "elective subjects"],
};

/** Same idea for real sidebar submenu entries, keyed by SidebarNavChild.key. */
export const NAV_CHILD_KEYWORDS: Record<string, string[]> = {
  academicsExam: ["exams", "examination", "results", "CA", "continuous assessment", "test"],
  hrStaffs: ["staff", "teachers", "employees", "teaching", "non-teaching"],
  hrStaffPosts: ["designation", "post", "job title", "position"],
  hrPermissionGroups: ["roles", "permissions", "access", "RBAC", "user groups"],
  hrAssignmentReview: ["carry forward", "carried forward", "new year", "rollover", "unmatched", "remap", "teaching assignments", "class teacher"],
};

/** Exam › Results › View Results (results reframe: arm cards -> student list -> report). */
export const SEARCH_VIEW_RESULTS_KEYWORDS = [
  "results",
  "class results",
  "report",
  "report card",
  "student report",
  "rank",
  "position",
  "class average",
  "total average",
  "class PDF",
  "psychomotor",
  "affective",
  "traits",
  "class teacher remarks",
  "head teacher remarks",
];

/** Exam › Broad Sheet › Broadsheet (General, one term: CA · Exam · Total per subject). */
export const SEARCH_BROAD_SHEET_KEYWORDS = [
  "broadsheet",
  "broad sheet",
  "matrix",
  "all subjects",
  "CA",
  "exam score",
  "subject average",
  "highest score",
  "lowest score",
  "class average",
  "cumulative score",
  "ranking",
  "position",
];

/** Exam › Broad Sheet › Cumulative Broadsheet (the year's terms side by side). */
export const SEARCH_CUMULATIVE_BROADSHEET_KEYWORDS = [
  "cumulative broadsheet",
  "cumulative",
  "1st term",
  "2nd term",
  "3rd term",
  "term average",
  "yearly average",
  "annual result",
  "trend",
  "overall average",
];

/** Exam › Broad Sheet › Progression (British / grade-based classes). */
export const SEARCH_PROGRESSION_KEYWORDS = [
  "progression",
  "british broadsheet",
  "grade book",
  "GB",
  "MTG",
  "target grade",
  "CAG",
  "current attainment",
  "value added",
  "VA",
  "CEM",
  "GL SAS",
];

/** Exam › Results › Grade Book (British /100 per subject per point). */
export const SEARCH_GRADE_BOOK_KEYWORDS = [
  "grade book",
  "gradebook",
  "gradebook report",
  "GB",
  "british",
  "test 1",
  "test 2",
  "homework",
  "classwork",
  "unified assessment",
  "score out of 100",
  "attainment",
];

/** Exam › Results › Academic Report (British grade-based entry, Stage 1c). */
export const SEARCH_ACADEMIC_REPORT_KEYWORDS = [
  "british",
  "attainment",
  "current attainment",
  "grades",
  "MTG",
  "minimum target grade",
  "target grade",
  "grade book",
  "engagement",
  "learning behaviour",
  "report comment",
  "progress report",
  "full report",
  "report variant",
  "assessment point",
  "GCSE",
  "KS3",
];
