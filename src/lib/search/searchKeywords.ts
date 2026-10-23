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
