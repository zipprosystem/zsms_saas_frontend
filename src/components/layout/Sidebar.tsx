"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { Setting2Icon } from "@/components/icons/sidebar/Setting2Icon";
import { sidebarNavItems } from "@/components/layout/sidebar-nav";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex h-full w-[231px] shrink-0 flex-col gap-8 bg-[#0c111d] px-4 pb-8 pt-10 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2.5 pl-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-white" />
        <p className="text-base font-semibold text-white">ZSMS</p>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {sidebarNavItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const expanded = expandedKeys.includes(item.key);
          const rowClasses = `flex h-11 w-full items-center gap-3 rounded-2xl text-sm transition-colors ${
            active
              ? "bg-white/10 text-white"
              : "text-[#94a3b8] hover:bg-white/5 hover:text-white"
          }`;

          if (!item.hasSubmenu) {
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onClose}
                className={`${rowClasses} px-3`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate text-left">{t(item.labelKey)}</span>
              </Link>
            );
          }

          return (
            <div key={item.key} className="flex flex-col gap-0.5">
              <div className={`${rowClasses} pl-3 pr-2`}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 truncate text-left">{t(item.labelKey)}</span>
                </Link>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={t(item.labelKey)}
                  onClick={() => toggleExpanded(item.key)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-white/10"
                >
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform duration-150 ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>
              {expanded && (
                <div className="ml-[44px] flex flex-col gap-0.5 border-l border-white/10 pb-1 pl-3">
                  <span className="px-2 py-1.5 text-xs italic text-[#94a3b8]/70">
                    {t("common.comingSoon")}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <Link
        href="/settings"
        onClick={onClose}
        className="flex shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.12] px-4 py-3.5 text-white transition-colors hover:bg-white/5"
      >
        <Setting2Icon className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold">{t("nav.schoolSettings")}</span>
      </Link>
    </aside>
  );
}
