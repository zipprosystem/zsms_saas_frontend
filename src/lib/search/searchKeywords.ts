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
};
