"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { SessionPill } from "@/components/layout/SessionPill";
import { UserMenu } from "@/components/layout/UserMenu";
import { getPageTitleKey } from "@/components/layout/sidebar-nav";
import { BellIcon } from "@/components/icons/header/BellIcon";
import { SearchIcon } from "@/components/icons/header/SearchIcon";

// Lazy — this is UI only ever shown on demand (opened), so it has no
// business being in the initial bundle. ssr:false since it's a client-only
// overlay (keyboard/focus management, no server-renderable content).
const CommandPalette = dynamic(() => import("@/components/search/CommandPalette"), { ssr: false });

type HeaderProps = {
  onOpenMobileNav: () => void;
};

export function Header({ onOpenMobileNav }: HeaderProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const title = t(getPageTitleKey(pathname));
  const today = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Global — works from anywhere in the admin app, not just while the
  // search box itself has focus. Header is mounted on every admin page (via
  // AppShell), so this is the one natural place to listen.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-background px-4 text-left text-text-muted transition-colors hover:border-accent"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-sm text-text-muted">{t("common.searchPlaceholder")}</span>
          <kbd className="hidden shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-muted sm:block">
            {t("search.shortcutHint")}
          </kbd>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          aria-label={t("common.searchPlaceholder")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-text-secondary transition-colors hover:bg-brand-tint/40 md:hidden"
        >
          <SearchIcon className="h-5 w-5" />
        </button>

        <button
          type="button"
          aria-label={t("header.notifications")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-text-secondary transition-colors hover:bg-brand-tint/40"
        >
          <BellIcon className="h-5 w-5" />
        </button>

        <UserMenu />
      </div>

      {isSearchOpen ? <CommandPalette onClose={() => setIsSearchOpen(false)} /> : null}
    </header>
  );
}
