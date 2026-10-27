import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { sidebarNavItems, visibleNavChildren } from "@/components/layout/sidebar-nav";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, NAV_PERMISSIONS, readUserPermissions } from "@/lib/auth/navPermissions";
import { SETTINGS_SECTION_KEYS, settingsSectionHref, settingsSectionTitleKey } from "@/lib/settings/settingsSections";
import { getShellCategories, setupCategories } from "@/lib/setup/setupConfig";
import { setupScreenRegistry } from "@/lib/setup/screenRegistry";
import {
  NAV_CHILD_KEYWORDS,
  SEARCH_ACADEMIC_REPORT_KEYWORDS,
  SEARCH_BROAD_SHEET_KEYWORDS,
  SEARCH_VIEW_RESULTS_KEYWORDS,
  SETUP_ITEM_KEYWORDS,
} from "./searchKeywords";
import type { SearchGroup } from "./searchTypes";

/**
 * Builds the three phase-1 groups entirely from existing config — never a
 * separate hand-maintained list, so the index stays in sync automatically
 * as screens are added:
 *   - Navigation: sidebarNavItems, plus any REAL submenu children (HR ›
 *     Staff / Staff Posts / Permission Groups). A hasSubmenu item without
 *     children still only renders a "coming soon" placeholder, so there's
 *     nothing further to index for those.
 *   - Settings: SETTINGS_SECTION_KEYS (extracted out of admin/settings/
 *     page.tsx specifically so this and that page read the same source).
 *   - Setup: every item across getShellCategories(setupCategories) — the
 *     same "real category" filter Setup's own routing already applies
 *     (school-settings is excluded there too; its 4 items redirect to
 *     /admin/settings with no specific section, so they're already
 *     covered by the Settings group above instead). "Built vs stub" is
 *     derived by checking setupScreenRegistry, not tracked separately —
 *     an unbuilt item still gets a real href (its "coming soon" page
 *     works fine), just a description badge marking it as such.
 *
 * Memoized on `t` (next-intl's translator identity is stable across
 * re-renders for the same locale) — this rebuilds only on a locale switch,
 * not on every render, for what's a few dozen entries either way.
 */
export function useSearchIndex(): SearchGroup[] {
  const t = useTranslations();
  const { user } = useAuth();
  // Same submenu-level gates as the nav, so search never offers a hidden entry.
  const granted = useMemo(() => readUserPermissions(user), [user]);

  return useMemo(() => {
    const navigation: SearchGroup = {
      key: "navigation",
      label: t("search.groups.navigation"),
      entries: sidebarNavItems.flatMap((item) => [
        { id: `nav-${item.key}`, title: t(item.labelKey), href: item.href },
        // Real submenu entries (e.g. HR › Staff) are indexed too, titled
        // "Parent › Child" so they read unambiguously in the palette.
        ...visibleNavChildren(item, granted).map((child) => ({
          id: `nav-${item.key}-${child.key}`,
          title: `${t(item.labelKey)} › ${t(child.labelKey)}`,
          href: child.href,
          keywords: NAV_CHILD_KEYWORDS[child.key],
        })),
      ]),
    };

    const settings: SearchGroup = {
      key: "settings",
      label: t("search.groups.settings"),
      entries: SETTINGS_SECTION_KEYS.map((key) => ({
        id: `settings-${key}`,
        title: t(settingsSectionTitleKey(key)),
        href: settingsSectionHref(key),
      })),
    };

    const setup: SearchGroup = {
      key: "setup",
      label: t("search.groups.setup"),
      entries: getShellCategories(setupCategories).flatMap((category) =>
        category.items.filter((item) => canSeeNavEntry(item.permission, granted)).map((item) => {
          const isBuilt = `${category.slug}/${item.slug}` in setupScreenRegistry;
          return {
            id: `setup-${category.key}-${item.key}`,
            title: t(item.name),
            href: `/admin/setup/${category.slug}/${item.slug}`,
            description: isBuilt
              ? (item.description ? t(item.description) : undefined)
              : t("common.comingSoon"),
            keywords: SETUP_ITEM_KEYWORDS[item.key],
          };
        }),
      ),
    };

    // First real use of the "PHASE 2 SEAM" from searchTypes.ts — a module
    // beyond Navigation/Settings/Setup gets its own small group. Just one
    // static quick-action entry for now; a future per-student search (by
    // name/admission number) plugs in here as additional entries with no
    // change needed elsewhere.
    const students: SearchGroup = {
      key: "students",
      label: t("search.groups.students"),
      entries: [
        {
          id: "students-add",
          title: t("search.students.addStudent"),
          href: "/admin/students?new=1",
          keywords: ["enroll", "admission", "new student", "register"],
        },
      ],
    };

    // Exam (Stage 1b): the marks-entry screen is a tab inside Academics ›
    // Exam, so it gets its own entry rather than relying on the nav child.
    const exams: SearchGroup = {
      key: "exams",
      label: t("search.groups.exams"),
      entries: [
        {
          id: "exams-manage-result",
          title: t("search.exams.manageExamResult"),
          href: "/admin/academics/exam/results",
          keywords: ["marks", "scores", "enter marks", "enter grades", "CA", "exam result", "results", "gpa grades"],
        },
        {
          id: "exams-academic-report",
          title: t("search.exams.academicReport"),
          href: "/admin/academics/exam/results/academic-report",
          keywords: SEARCH_ACADEMIC_REPORT_KEYWORDS,
        },
        ...(canSeeNavEntry(NAV_PERMISSIONS.examViewResults, granted)
          ? [
              {
                id: "exams-view-results",
                title: t("search.exams.viewResults"),
                href: "/admin/academics/exam/results/view",
                keywords: SEARCH_VIEW_RESULTS_KEYWORDS,
              },
            ]
          : []),
        {
          id: "exams-broad-sheet",
          title: t("search.exams.broadSheet"),
          href: "/admin/academics/exam/broad-sheet",
          keywords: SEARCH_BROAD_SHEET_KEYWORDS,
        },
      ],
    };

    return [navigation, settings, setup, students, exams];
  }, [t, granted]);
}
