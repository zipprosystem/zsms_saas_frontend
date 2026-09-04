"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/actions/set-locale";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/lib/auth/AuthProvider";
import { UserIcon } from "@/components/icons/header/UserIcon";
import type { Locale } from "@/i18n/request";

export function UserMenu() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSetLocale = (next: Locale) => {
    startTransition(async () => {
      await setLocale(next);
      window.location.reload();
    });
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={t("header.userMenu")}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-14 w-48 items-center gap-3 rounded-[20px] border border-brand-tint bg-background px-4 py-3 text-left transition-colors hover:bg-brand-tint/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-accent">
          <UserIcon className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-text-primary">
            {t("header.defaultUserName")}
          </span>
          <span className="truncate text-xs text-accent">
            {t("header.defaultUserRole")}
          </span>
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-border bg-surface p-2 shadow-lg">
          <div className="flex items-center gap-3 border-b border-border px-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-accent">
              <UserIcon className="h-6 w-6" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-text-primary">
                {t("header.defaultUserName")}
              </span>
              <span className="truncate text-xs text-text-secondary">
                {t("header.defaultUserRole")}
              </span>
            </span>
          </div>

          <div className="border-b border-border px-3 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("header.theme")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  theme === "light"
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-text-primary hover:bg-background"
                }`}
              >
                {t("header.lightMode")}
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  theme === "dark"
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-text-primary hover:bg-background"
                }`}
              >
                {t("header.darkMode")}
              </button>
            </div>
          </div>

          <div className="border-b border-border px-3 py-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("header.language")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleSetLocale("en")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  locale === "en"
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-text-primary hover:bg-background"
                }`}
              >
                EN
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleSetLocale("fr")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                  locale === "fr"
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface text-text-primary hover:bg-background"
                }`}
              >
                FR
              </button>
            </div>
          </div>

          <div className="flex flex-col py-1">
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="rounded-md px-3 py-2 text-sm text-text-primary transition-colors hover:bg-background"
            >
              {t("header.profile")} / {t("header.settings")}
            </Link>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                void logout();
              }}
              className="rounded-md px-3 py-2 text-left text-sm text-error transition-colors hover:bg-background"
            >
              {t("header.logout")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
