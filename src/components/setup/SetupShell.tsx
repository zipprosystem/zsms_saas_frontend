"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";
import { GearIcon } from "@/components/icons/setup/GearIcon";
import { AcademicCapIcon } from "@/components/icons/setup/AcademicCapIcon";
import { ClipboardChartIcon } from "@/components/icons/setup/ClipboardChartIcon";
import { LocationPinIcon } from "@/components/icons/setup/LocationPinIcon";
import { ClockIcon } from "@/components/icons/setup/ClockIcon";
import type { SetupCategory, SetupCategoryIconKey } from "@/lib/setup/setupConfig";

const categoryIcons: Record<SetupCategoryIconKey, typeof GearIcon> = {
  gear: GearIcon,
  academicCap: AcademicCapIcon,
  clipboardChart: ClipboardChartIcon,
  locationPin: LocationPinIcon,
  clock: ClockIcon,
};

type SetupShellProps = {
  /** The 4 non-Settings categories (see getShellCategories) — School Settings lives at /admin/settings, not in this shell. */
  categories: SetupCategory[];
  activeCategory: SetupCategory;
  activeScreenSlug: string;
  activeScreenName: string;
  children: ReactNode;
};

export function SetupShell({
  categories,
  activeCategory,
  activeScreenSlug,
  activeScreenName,
  children,
}: SetupShellProps) {
  const t = useTranslations();
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set([activeCategory.key]));
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const toggleCategory = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const subNav = (
    <nav className="flex flex-col gap-1">
      {categories.map((category) => {
        const Icon = categoryIcons[category.iconKey];
        const isActiveCategory = category.key === activeCategory.key;
        const isExpanded = expandedKeys.has(category.key);
        // Setup-1: only Academic Structure's items are real links (to the
        // new [category]/[screen] routes, whether the screen itself is
        // built yet or still the generic "coming soon" placeholder). The
        // other 3 categories are expandable but their items are inert
        // until built, per the approved plan.
        const itemsAreLinks = category.key === "academicStructure";

        return (
          <div key={category.key}>
            <button
              type="button"
              onClick={() => toggleCategory(category.key)}
              aria-expanded={isExpanded}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-background ${
                isActiveCategory ? "text-text-primary" : "text-text-secondary"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-sm font-medium">{t(category.name)}</span>
              <ChevronDownIcon
                className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-150 ${
                  isExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            {isExpanded ? (
              <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                {category.items.map((item) => {
                  const isActiveItem = isActiveCategory && item.slug === activeScreenSlug;

                  if (!itemsAreLinks) {
                    return (
                      <span
                        key={item.key}
                        className="truncate rounded-md px-3 py-2 text-sm text-text-muted/70"
                      >
                        {t(item.name)}
                      </span>
                    );
                  }

                  return (
                    <Link
                      key={item.key}
                      href={`/admin/setup/${category.slug}/${item.slug}`}
                      onClick={() => setIsMobileNavOpen(false)}
                      className={`truncate rounded-md px-3 py-2 text-sm transition-colors ${
                        isActiveItem
                          ? "bg-brand-tint font-semibold text-accent"
                          : "text-text-secondary hover:bg-background hover:text-text-primary"
                      }`}
                    >
                      {t(item.name)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <button
        type="button"
        onClick={() => setIsMobileNavOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary lg:hidden"
      >
        {t("setup.shell.browseCategories")}
      </button>

      {isMobileNavOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={`z-50 shrink-0 rounded-xl border border-border bg-surface p-3 lg:sticky lg:top-6 lg:z-0 lg:block lg:w-[262px] lg:p-4 ${
          isMobileNavOpen ? "fixed inset-y-4 left-4 right-4 overflow-y-auto" : "hidden"
        }`}
      >
        {subNav}
      </aside>

      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-text-muted">
          <Link href="/admin/setup" className="transition-colors hover:text-text-primary">
            {t("setup.shell.breadcrumbRoot")}
          </Link>
          <ArrowRightIcon className="h-3 w-3 shrink-0" />
          <span>{t(activeCategory.name)}</span>
          <ArrowRightIcon className="h-3 w-3 shrink-0" />
          <span className="font-medium text-text-primary">{activeScreenName}</span>
        </nav>

        {children}
      </div>
    </div>
  );
}
