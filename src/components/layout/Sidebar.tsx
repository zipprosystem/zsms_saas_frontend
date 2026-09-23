"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { Setting2Icon } from "@/components/icons/sidebar/Setting2Icon";
import { sidebarNavItems } from "@/components/layout/sidebar-nav";
import { useAuth } from "@/lib/auth/AuthProvider";

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
      <SidebarBrand />

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
        href="/admin/settings"
        onClick={onClose}
        className="flex shrink-0 items-center gap-2.5 rounded-xl border border-white/[0.12] px-4 py-3.5 text-white transition-colors hover:bg-white/5"
      >
        <Setting2Icon className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold">{t("nav.schoolSettings")}</span>
      </Link>
    </aside>
  );
}

// school.name/logo_url are unconfirmed against the real login response (see
// the flag on AuthSchool in AuthProvider.tsx) — every branch here degrades
// gracefully if either is missing, so this is safe to ship ahead of that
// confirmation. The dev-bypass mock school has no logo_url, so locally this
// always falls to the box/initial fallback; a real logo only shows on a
// deployed tenant with a real login.
function SidebarBrand() {
  const { school } = useAuth();
  const name = typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS";
  const logoUrl = typeof school?.logo_url === "string" && school.logo_url ? school.logo_url : null;

  return (
    <div className="flex items-center gap-2.5 pl-3">
      {/* Kept white behind the logo (not just a bare <img>) so a
          dark-on-transparent upload still shows up against the sidebar's
          dark background. Revisit once a real uploaded logo is visible on
          a deployed tenant — may need a dedicated light/white variant
          instead of relying on this background. */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        ) : name !== "ZSMS" ? (
          <span className="text-sm font-semibold text-[#0c111d]">
            {name.charAt(0).toUpperCase()}
          </span>
        ) : null}
      </div>
      <p className="truncate text-base font-semibold text-white">{name}</p>
    </div>
  );
}
