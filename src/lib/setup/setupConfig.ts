export type SetupItem = {
  key: string;
  /** i18n key resolving to the item's display name */
  name: string;
  /** i18n key resolving to the item's description, if any */
  description?: string;
  done: boolean;
};

export type SetupCategory = {
  key: string;
  /** i18n key resolving to the category's display name */
  name: string;
  weightPercent: number;
  /** Tailwind color token suffix, e.g. "category-purple" */
  colorToken: string;
  items: SetupItem[];
};

export type SetupConfig = SetupCategory[];

export const setupCategories: SetupConfig = [
  {
    key: "schoolSettings",
    name: "setup.categories.schoolSettings.name",
    weightPercent: 15,
    colorToken: "category-purple",
    // TODO: Custom Domain will be added here later as a School Settings sub-item.
    items: [
      {
        key: "schoolIdentity",
        name: "setup.items.schoolIdentity.name",
        done: true,
      },
      {
        key: "brandingAssets",
        name: "setup.items.brandingAssets.name",
        done: true,
      },
      {
        key: "generalBehaviour",
        name: "setup.items.generalBehaviour.name",
        done: true,
      },
      {
        key: "integrationsAlerts",
        name: "setup.items.integrationsAlerts.name",
        done: true,
      },
    ],
  },
  {
    key: "academicStructure",
    name: "setup.categories.academicStructure.name",
    weightPercent: 35,
    colorToken: "category-blue",
    items: [
      {
        key: "academicYears",
        name: "setup.items.academicYears.name",
        description: "setup.items.academicYears.description",
        done: false,
      },
      {
        key: "schoolTypes",
        name: "setup.items.schoolTypes.name",
        description: "setup.items.schoolTypes.description",
        done: false,
      },
      {
        key: "awardBodies",
        name: "setup.items.awardBodies.name",
        description: "setup.items.awardBodies.description",
        done: false,
      },
      {
        key: "terms",
        name: "setup.items.terms.name",
        description: "setup.items.terms.description",
        done: false,
      },
      {
        key: "departments",
        name: "setup.items.departments.name",
        description: "setup.items.departments.description",
        done: false,
      },
      {
        key: "subjectsMaster",
        name: "setup.items.subjectsMaster.name",
        description: "setup.items.subjectsMaster.description",
        done: false,
      },
      {
        key: "courses",
        name: "setup.items.courses.name",
        description: "setup.items.courses.description",
        done: false,
      },
      {
        key: "courseSubjectGroups",
        name: "setup.items.courseSubjectGroups.name",
        description: "setup.items.courseSubjectGroups.description",
        done: false,
      },
      {
        key: "courseSubjects",
        name: "setup.items.courseSubjects.name",
        description: "setup.items.courseSubjects.description",
        done: false,
      },
    ],
  },
  {
    key: "assessmentConfiguration",
    name: "setup.categories.assessmentConfiguration.name",
    weightPercent: 20,
    colorToken: "category-cyan",
    // INFERRED item names — reconcile against the Assessment config Figma screens when built.
    items: [
      {
        key: "gradingSchemes",
        name: "setup.items.gradingSchemes.name",
        done: false,
      },
      {
        key: "gradeScales",
        name: "setup.items.gradeScales.name",
        done: false,
      },
      {
        key: "assessmentTypes",
        name: "setup.items.assessmentTypes.name",
        done: false,
      },
      {
        key: "resultTemplates",
        name: "setup.items.resultTemplates.name",
        done: false,
      },
      {
        key: "commentBanks",
        name: "setup.items.commentBanks.name",
        done: false,
      },
      {
        key: "rankingRules",
        name: "setup.items.rankingRules.name",
        done: false,
      },
      {
        key: "promotionCriteria",
        name: "setup.items.promotionCriteria.name",
        done: false,
      },
    ],
  },
  {
    key: "physicalSpace",
    name: "setup.categories.physicalSpace.name",
    weightPercent: 20,
    colorToken: "category-green",
    // INFERRED item names — reconcile when built.
    items: [
      { key: "campuses", name: "setup.items.campuses.name", done: false },
      { key: "buildings", name: "setup.items.buildings.name", done: false },
      { key: "floors", name: "setup.items.floors.name", done: false },
      {
        key: "classrooms",
        name: "setup.items.classrooms.name",
        done: false,
      },
      {
        key: "facilities",
        name: "setup.items.facilities.name",
        done: false,
      },
      { key: "hostels", name: "setup.items.hostels.name", done: false },
    ],
  },
  {
    key: "scheduling",
    name: "setup.categories.scheduling.name",
    weightPercent: 10,
    colorToken: "category-amber",
    // INFERRED item names — reconcile when built.
    items: [
      {
        key: "timetableStructure",
        name: "setup.items.timetableStructure.name",
        done: false,
      },
      {
        key: "periodsAndBells",
        name: "setup.items.periodsAndBells.name",
        done: false,
      },
      {
        key: "calendarAndEvents",
        name: "setup.items.calendarAndEvents.name",
        done: false,
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
