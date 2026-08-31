import type { ComponentType, SVGProps } from "react";
import { BookIcon } from "@/components/icons/sidebar/BookIcon";
import { BookSavedIcon } from "@/components/icons/sidebar/BookSavedIcon";
import { BoxIcon } from "@/components/icons/sidebar/BoxIcon";
import { CalendarIcon } from "@/components/icons/sidebar/CalendarIcon";
import { CarIcon } from "@/components/icons/sidebar/CarIcon";
import { ChartIcon } from "@/components/icons/sidebar/ChartIcon";
import { DevicesIcon } from "@/components/icons/sidebar/DevicesIcon";
import { DocumentTextIcon } from "@/components/icons/sidebar/DocumentTextIcon";
import { FinanceAdminIcon } from "@/components/icons/sidebar/FinanceAdminIcon";
import { HospitalAltIcon } from "@/components/icons/sidebar/HospitalAltIcon";
import { HospitalIcon } from "@/components/icons/sidebar/HospitalIcon";
import { MessageTextIcon } from "@/components/icons/sidebar/MessageTextIcon";
import { Messages2Icon } from "@/components/icons/sidebar/Messages2Icon";
import { PeopleIcon } from "@/components/icons/sidebar/PeopleIcon";
import { Profile2UserIcon } from "@/components/icons/sidebar/Profile2UserIcon";
import { ShoppingCartIcon } from "@/components/icons/sidebar/ShoppingCartIcon";
import { Warning2Icon } from "@/components/icons/sidebar/Warning2Icon";

export type SidebarIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type SidebarNavItem = {
  key: string;
  labelKey: string;
  href: string;
  icon: SidebarIcon;
  hasSubmenu?: boolean;
};

export const sidebarNavItems: SidebarNavItem[] = [
  { key: "overview", labelKey: "nav.overview", href: "/admin/overview", icon: ChartIcon },
  { key: "academics", labelKey: "nav.academics", href: "/admin/academics", icon: BookSavedIcon, hasSubmenu: true },
  { key: "attendance", labelKey: "nav.attendance", href: "/admin/attendance", icon: CalendarIcon, hasSubmenu: true },
  { key: "conducts", labelKey: "nav.conducts", href: "/admin/conducts", icon: Warning2Icon, hasSubmenu: true },
  { key: "communications", labelKey: "nav.communications", href: "/admin/communications", icon: MessageTextIcon, hasSubmenu: true },
  { key: "library", labelKey: "nav.library", href: "/admin/library", icon: BookIcon, hasSubmenu: true },
  { key: "financeAdmin", labelKey: "nav.financeAdmin", href: "/admin/finance-admin", icon: FinanceAdminIcon, hasSubmenu: true },
  { key: "inventory", labelKey: "nav.inventory", href: "/admin/inventory", icon: ShoppingCartIcon },
  { key: "reports", labelKey: "nav.reports", href: "/admin/reports", icon: DocumentTextIcon },
  { key: "pastoral", labelKey: "nav.pastoral", href: "/admin/pastoral", icon: Profile2UserIcon, hasSubmenu: true },
  { key: "hr", labelKey: "nav.hr", href: "/admin/hr", icon: HospitalIcon, hasSubmenu: true },
  { key: "clinic", labelKey: "nav.clinic", href: "/admin/clinic", icon: HospitalIcon },
  { key: "adminPanel", labelKey: "nav.adminPanel", href: "/admin/admin-panel", icon: BoxIcon },
  { key: "students", labelKey: "nav.students", href: "/admin/students", icon: PeopleIcon },
  { key: "messages", labelKey: "nav.messages", href: "/admin/messages", icon: Messages2Icon },
  { key: "websiteCms", labelKey: "nav.websiteCms", href: "/admin/website-cms", icon: DevicesIcon, hasSubmenu: true },
  { key: "media", labelKey: "nav.media", href: "/admin/media", icon: HospitalAltIcon },
  { key: "facilities", labelKey: "nav.facilities", href: "/admin/facilities", icon: CarIcon, hasSubmenu: true },
];

const settingsTitleItem = { href: "/admin/settings", labelKey: "nav.schoolSettings" };

export function getPageTitleKey(pathname: string): string {
  const match = [...sidebarNavItems, settingsTitleItem].find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.labelKey ?? "nav.overview";
}
