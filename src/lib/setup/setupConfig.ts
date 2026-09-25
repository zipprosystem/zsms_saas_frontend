export type SetupItem = {
  key: string;
  /** i18n key resolving to the item's display name */
  name: string;
  /** i18n key resolving to the item's description, if any */
  description?: string;
  done: boolean;
  /** Kebab-case slug under /setup/[slug]. Explicit (not derived from `key`) so the route is stable across key renames. */
  slug: string;
};

export type SetupCategoryIconKey =
  | "gear"
  | "academicCap"
  | "clipboardChart"
  | "locationPin"
  | "clock";

export type SetupCategory = {
  key: string;
  /** i18n key resolving to the category's display name */
  name: string;
  weightPercent: number;
  /** Tailwind color token suffix, e.g. "category-purple" */
  colorToken: string;
  /** Looked up against the icon map in CategoryCard — keeps this file free of component imports. */
  iconKey: SetupCategoryIconKey;
  /** Kebab-case slug under /admin/setup/[category]/[screen]. Explicit (not derived from `key`), same reasoning as SetupItem.slug. */
  slug: string;
  items: SetupItem[];
};

export type SetupConfig = SetupCategory[];

export const setupCategories: SetupConfig = [
  {
    key: "schoolSettings",
    name: "setup.categories.schoolSettings.name",
    slug: "school-settings",
    weightPercent: 15,
    colorToken: "category-purple",
    iconKey: "gear",
    // TODO: Custom Domain will be added here later as a School Settings sub-item.
    items: [
      {
        key: "schoolIdentity",
        name: "setup.items.schoolIdentity.name",
        done: true,
        slug: "school-identity",
      },
      {
        key: "brandingAssets",
        name: "setup.items.brandingAssets.name",
        done: true,
        slug: "branding-assets",
      },
      {
        key: "generalBehaviour",
        name: "setup.items.generalBehaviour.name",
        done: true,
        slug: "general-behaviour",
      },
      {
        key: "integrationsAlerts",
        name: "setup.items.integrationsAlerts.name",
        done: true,
        slug: "integrations-alerts",
      },
    ],
  },
  {
    key: "academicStructure",
    name: "setup.categories.academicStructure.name",
    slug: "academic-structure",
    weightPercent: 35,
    colorToken: "category-blue",
    iconKey: "academicCap",
    items: [
      {
        key: "academicYears",
        name: "setup.items.academicYears.name",
        description: "setup.items.academicYears.description",
        done: false,
        slug: "academic-years",
      },
      {
        key: "awardBodies",
        name: "setup.items.awardBodies.name",
        description: "setup.items.awardBodies.description",
        done: false,
        slug: "award-bodies",
      },
      {
        key: "schoolTypes",
        name: "setup.items.schoolTypes.name",
        description: "setup.items.schoolTypes.description",
        done: false,
        slug: "school-types",
      },
      {
        key: "classes",
        name: "setup.items.classes.name",
        description: "setup.items.classes.description",
        done: false,
        slug: "classes",
      },
      // No screen built yet (and no slug to preserve — this item didn't
      // exist under any name before). Placeholder description, INFERRED.
      {
        key: "classArms",
        name: "setup.items.classArms.name",
        description: "setup.items.classArms.description",
        done: false,
        slug: "class-arms",
      },
      {
        key: "classTerms",
        name: "setup.items.classTerms.name",
        description: "setup.items.classTerms.description",
        done: false,
        slug: "class-terms",
      },
      {
        key: "departments",
        name: "setup.items.departments.name",
        description: "setup.items.departments.description",
        done: false,
        slug: "departments",
      },
      {
        key: "subjectsMaster",
        name: "setup.items.subjectsMaster.name",
        description: "setup.items.subjectsMaster.description",
        done: false,
        slug: "subjects-master",
      },
      {
        key: "classSubjects",
        name: "setup.items.classSubjects.name",
        description: "setup.items.classSubjects.description",
        done: false,
        slug: "class-subjects",
      },
      {
        key: "classSubjectGrouping",
        name: "setup.items.classSubjectGrouping.name",
        description: "setup.items.classSubjectGrouping.description",
        done: false,
        slug: "class-subject-grouping",
      },
      // INFERRED item names/descriptions — reconcile when built.
      {
        key: "subjectEnrolment",
        name: "setup.items.subjectEnrolment.name",
        description: "setup.items.subjectEnrolment.description",
        done: false,
        slug: "subject-enrolment",
      },
      {
        key: "studentTermDetails",
        name: "setup.items.studentTermDetails.name",
        description: "setup.items.studentTermDetails.description",
        done: false,
        slug: "student-term-details",
      },
      {
        key: "classAcademicMaterial",
        name: "setup.items.classAcademicMaterial.name",
        description: "setup.items.classAcademicMaterial.description",
        done: false,
        slug: "class-academic-material",
      },
    ],
  },
  {
    key: "assessmentConfiguration",
    name: "setup.categories.assessmentConfiguration.name",
    slug: "assessment-configuration",
    weightPercent: 20,
    colorToken: "category-cyan",
    iconKey: "clipboardChart",
    // INFERRED item names — reconcile against the Assessment config Figma screens when built.
    items: [
      {
        key: "gradingSchemes",
        name: "setup.items.gradingSchemes.name",
        done: false,
        slug: "grading-schemes",
      },
      {
        key: "gradeScales",
        name: "setup.items.gradeScales.name",
        done: false,
        slug: "grade-scales",
      },
      {
        key: "assessmentTypes",
        name: "setup.items.assessmentTypes.name",
        done: false,
        slug: "assessment-types",
      },
      {
        key: "resultTemplates",
        name: "setup.items.resultTemplates.name",
        done: false,
        slug: "result-templates",
      },
      {
        key: "commentBanks",
        name: "setup.items.commentBanks.name",
        done: false,
        slug: "comment-banks",
      },
      {
        key: "rankingRules",
        name: "setup.items.rankingRules.name",
        done: false,
        slug: "ranking-rules",
      },
      {
        key: "promotionCriteria",
        name: "setup.items.promotionCriteria.name",
        done: false,
        slug: "promotion-criteria",
      },
    ],
  },
  {
    key: "physicalSpace",
    name: "setup.categories.physicalSpace.name",
    slug: "physical-space",
    weightPercent: 20,
    colorToken: "category-green",
    iconKey: "locationPin",
    // INFERRED item names — reconcile when built.
    items: [
      {
        key: "campuses",
        name: "setup.items.campuses.name",
        done: false,
        slug: "campuses",
      },
      {
        key: "buildings",
        name: "setup.items.buildings.name",
        done: false,
        slug: "buildings",
      },
      {
        key: "floors",
        name: "setup.items.floors.name",
        done: false,
        slug: "floors",
      },
      {
        key: "classrooms",
        name: "setup.items.classrooms.name",
        done: false,
        slug: "classrooms",
      },
      {
        key: "facilities",
        name: "setup.items.facilities.name",
        done: false,
        slug: "facilities",
      },
      {
        key: "hostels",
        name: "setup.items.hostels.name",
        done: false,
        slug: "hostels",
      },
    ],
  },
  {
    key: "scheduling",
    name: "setup.categories.scheduling.name",
    slug: "scheduling",
    weightPercent: 10,
    colorToken: "category-amber",
    iconKey: "clock",
    // INFERRED item names — reconcile when built.
    items: [
      {
        key: "timetableStructure",
        name: "setup.items.timetableStructure.name",
        done: false,
        slug: "timetable-structure",
      },
      {
        key: "periodsAndBells",
        name: "setup.items.periodsAndBells.name",
        done: false,
        slug: "periods-and-bells",
      },
      {
        key: "calendarAndEvents",
        name: "setup.items.calendarAndEvents.name",
        done: false,
        slug: "calendar-and-events",
      },
    ],
  },
];

export function getTotalItems(config: SetupConfig): number {
  return config.reduce((sum, category) => sum + category.items.length, 0);
}

/**
 * `isComplete` used to just read `item.done` internally — it's now an
 * explicit parameter so the checklist can drive it from live "does at
 * least one record exist" checks (see setupProgress.ts) for built
 * CRUD-list screens, while items with no such check (School Settings'
 * already-real screens, and not-yet-built stubs) keep using their own
 * static `item.done`. These functions stay pure either way; setupProgress.ts
 * is what decides what `isComplete` actually means for a given item.
 */
export type SetupItemComplete = (item: SetupItem) => boolean;

export function getConfiguredItems(config: SetupConfig, isComplete: SetupItemComplete): number {
  return config.reduce(
    (sum, category) => sum + category.items.filter(isComplete).length,
    0,
  );
}

export function getCategoryProgress(
  category: SetupCategory,
  isComplete: SetupItemComplete,
): {
  configuredCount: number;
  totalCount: number;
  categoryComplete: boolean;
} {
  const totalCount = category.items.length;
  const configuredCount = category.items.filter(isComplete).length;
  return {
    configuredCount,
    totalCount,
    categoryComplete: totalCount > 0 && configuredCount === totalCount,
  };
}

export function getCategoryPercent(category: SetupCategory, isComplete: SetupItemComplete): number {
  const { configuredCount, totalCount } = getCategoryProgress(category, isComplete);
  return totalCount > 0 ? Math.round((configuredCount / totalCount) * 100) : 0;
}

/**
 * Weighted-by-complete-category method: sums weightPercent for categories
 * that are fully complete. A future refinement could instead weight by
 * per-item completion within each category. Kept a pure function of the data.
 */
export function getOverallPercent(config: SetupConfig, isComplete: SetupItemComplete): number {
  return config.reduce((sum, category) => {
    const { categoryComplete } = getCategoryProgress(category, isComplete);
    return categoryComplete ? sum + category.weightPercent : sum;
  }, 0);
}

// Superseded findSetupItemBySlug (flat, item-slug-only lookup) removed —
// it backed the old /admin/setup/[slug] stub, which the two-level
// /admin/setup/[category]/[screen] structure replaces. Use
// findSetupCategoryBySlug + findSetupItemInCategoryBySlug instead.

export function findSetupCategoryBySlug(
  config: SetupConfig,
  categorySlug: string,
): SetupCategory | undefined {
  return config.find((category) => category.slug === categorySlug);
}

export function findSetupItemInCategoryBySlug(
  category: SetupCategory,
  itemSlug: string,
): SetupItem | undefined {
  return category.items.find((item) => item.slug === itemSlug);
}

/**
 * Shared by /admin/setup/[category]/[screen]'s layout.tsx and page.tsx —
 * both need the same category+item lookup independently (App Router gives
 * each route segment file its own params), so this is the one place that
 * decides what counts as a valid route. school-settings is explicitly
 * excluded: its items already link straight to /admin/settings (see
 * CategoryCard), so nothing should ever land here for that category.
 */
export function resolveSetupRoute(
  categorySlug: string,
  itemSlug: string,
): { category: SetupCategory; item: SetupItem } | null {
  const category = findSetupCategoryBySlug(setupCategories, categorySlug);
  if (!category || category.key === "schoolSettings") return null;
  const item = findSetupItemInCategoryBySlug(category, itemSlug);
  if (!item) return null;
  return { category, item };
}

/** The 4 categories this shell's sub-nav shows — School Settings has its own home at /admin/settings. */
export function getShellCategories(config: SetupConfig): SetupCategory[] {
  return config.filter((category) => category.key !== "schoolSettings");
}
