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
  items: SetupItem[];
};

export type SetupConfig = SetupCategory[];

export const setupCategories: SetupConfig = [
  {
    key: "schoolSettings",
    name: "setup.categories.schoolSettings.name",
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
        key: "schoolTypes",
        name: "setup.items.schoolTypes.name",
        description: "setup.items.schoolTypes.description",
        done: false,
        slug: "school-types",
      },
      {
        key: "awardBodies",
        name: "setup.items.awardBodies.name",
        description: "setup.items.awardBodies.description",
        done: false,
        slug: "award-bodies",
      },
      {
        key: "terms",
        name: "setup.items.terms.name",
        description: "setup.items.terms.description",
        done: false,
        slug: "terms",
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
        key: "courses",
        name: "setup.items.courses.name",
        description: "setup.items.courses.description",
        done: false,
        slug: "courses",
      },
      {
        key: "courseSubjectGroups",
        name: "setup.items.courseSubjectGroups.name",
        description: "setup.items.courseSubjectGroups.description",
        done: false,
        slug: "course-subject-groups",
      },
      {
        key: "courseSubjects",
        name: "setup.items.courseSubjects.name",
        description: "setup.items.courseSubjects.description",
        done: false,
        slug: "course-subjects",
      },
    ],
  },
  {
    key: "assessmentConfiguration",
    name: "setup.categories.assessmentConfiguration.name",
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

export function getConfiguredItems(config: SetupConfig): number {
  return config.reduce(
    (sum, category) =>
      sum + category.items.filter((item) => item.done).length,
    0,
  );
}

export function getCategoryProgress(category: SetupCategory): {
  configuredCount: number;
  totalCount: number;
  categoryComplete: boolean;
} {
  const totalCount = category.items.length;
  const configuredCount = category.items.filter((item) => item.done).length;
  return {
    configuredCount,
    totalCount,
    categoryComplete: totalCount > 0 && configuredCount === totalCount,
  };
}

export function getCategoryPercent(category: SetupCategory): number {
  const { configuredCount, totalCount } = getCategoryProgress(category);
  return totalCount > 0 ? Math.round((configuredCount / totalCount) * 100) : 0;
}

/**
 * Weighted-by-complete-category method: sums weightPercent for categories
 * that are fully complete. A future refinement could instead weight by
 * per-item completion within each category. Kept a pure function of the data.
 */
export function getOverallPercent(config: SetupConfig): number {
  return config.reduce((sum, category) => {
    const { categoryComplete } = getCategoryProgress(category);
    return categoryComplete ? sum + category.weightPercent : sum;
  }, 0);
}

export function findSetupItemBySlug(
  config: SetupConfig,
  slug: string,
): { item: SetupItem; category: SetupCategory } | undefined {
  for (const category of config) {
    const item = category.items.find((candidate) => candidate.slug === slug);
    if (item) {
      return { item, category };
    }
  }
  return undefined;
}
