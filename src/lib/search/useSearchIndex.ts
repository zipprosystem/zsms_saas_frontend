import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { sidebarNavItems } from "@/components/layout/sidebar-nav";
import { SETTINGS_SECTION_KEYS, settingsSectionHref, settingsSectionTitleKey } from "@/lib/settings/settingsSections";
import { getShellCategories, setupCategories } from "@/lib/setup/setupConfig";
import { setupScreenRegistry } from "@/lib/setup/screenRegistry";
import { SETUP_ITEM_KEYWORDS } from "./searchKeywords";
import type { SearchGroup } from "./searchTypes";

/**
 * Builds the three phase-1 groups entirely from existing config — never a
 * separate hand-maintained list, so the index stays in sync automatically
 * as screens are added:
 *   - Navigation: sidebarNavItems (top-level only — the hasSubmenu items'
 *     "sub-items" aren't real data yet, Sidebar.tsx just renders a static
 *     "coming soon" placeholder when one is expanded, so there's nothing
 *     further to index there).
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

  return useMemo(() => {
    const navigation: SearchGroup = {
      key: "navigation",
      label: t("search.groups.navigation"),
      entries: sidebarNavItems.map((item) => ({
        id: `nav-${item.key}`,
        title: t(item.labelKey),
        href: item.href,
      })),
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
        category.items.map((item) => {
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

    return [navigation, settings, setup];
  }, [t]);
}
