"use client";

import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { SessionPill } from "@/components/layout/SessionPill";
import { UserMenu } from "@/components/layout/UserMenu";
import { getPageTitleKey } from "@/components/layout/sidebar-nav";
import { BellIcon } from "@/components/icons/header/BellIcon";
import { SearchIcon } from "@/components/icons/header/SearchIcon";

type HeaderProps = {
  onOpenMobileNav: () => void;
};

export function Header({ onOpenMobileNav }: HeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();

  const title = t(getPageTitleKey(pathname));
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="flex h-28 w-full shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label={t("header.openMenu")}
          className="flex shrink-0 flex-col justify-center gap-1 rounded-lg border border-border bg-surface p-2.5 lg:hidden"
        >
          <span className="h-0.5 w-5 rounded-full bg-text-primary" />
          <span className="h-0.5 w-5 rounded-full bg-text-primary" />
          <span className="h-0.5 w-5 rounded-full bg-text-primary" />
        </button>

        <div className="min-w-0">
          <p className="truncate text-xl font-semibold text-text-primary">{title}</p>
          <p className="truncate text-sm text-text-secondary">{today}</p>
        </div>

        <SessionPill />
      </div>

      <div className="hidden min-w-0 flex-1 max-w-md md:flex">
        <div className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-background px-4 text-text-muted">
          <SearchIcon className="h-4 w-4 shrink-0" />
          <input
            type="text"
            disabled
            placeholder={t("common.searchPlaceholder")}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:cursor-not-allowed"
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          aria-label={t("header.notifications")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-text-secondary transition-colors hover:bg-brand-tint/40"
        >
          <BellIcon className="h-5 w-5" />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
