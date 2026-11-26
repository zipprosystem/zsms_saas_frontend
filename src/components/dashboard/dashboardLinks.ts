import type { ComponentType, SVGProps } from "react";
import { NAV_PERMISSIONS, type NavPermission } from "@/lib/auth/navPermissions";
import type { KpiKey } from "@/lib/dashboard/kpiCounts";
import {
  BellIcon,
  CourseIcon,
  DepartmentIcon,
  HouseFlagIcon,
  OpenBookIcon,
  ParentsIcon,
  ReportIcon,
  StaffIcon,
  StudentIcon,
  UserCheckIcon,
  UserPlusIcon,
  WaitingListIcon,
} from "@/components/dashboard/DashboardIcons";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const ADD_STUDENT_HREF = "/admin/students?new=1";
export const MARK_ATTENDANCE_HREF = "/admin/attendance";
export const SETUP_HREF = "/admin/setup";

/**
 * KPI tiles, in Figma order. Each links to its module. `emptyKey` is the
 * first-run hint shown under a zero count.
 *
 * FLAGGED targets: Waiting List has no module yet (→ Students, where
 * admissions live today) and House Color has no screen yet (→ Pastoral,
 * the module houses usually belong to; still a "coming soon" page).
 */
export const KPI_TILES: Array<{
  key: KpiKey;
  labelKey: string;
  emptyKey: string;
  href: string;
  icon: Icon;
  /** Solid icon-chip colour (fixed identity colours, same in both themes). */
  chip: string;
}> = [
  { key: "students", labelKey: "students", emptyKey: "students", href: "/admin/students", icon: StudentIcon, chip: "bg-accent" },
  { key: "staff", labelKey: "staff", emptyKey: "staff", href: "/admin/hr/staffs", icon: StaffIcon, chip: "bg-category-cyan" },
  {
    key: "departments",
    labelKey: "departments",
    emptyKey: "departments",
    href: "/admin/setup/academic-structure/departments",
    icon: DepartmentIcon,
    chip: "bg-category-amber",
  },
  { key: "waiting_list", labelKey: "waitingList", emptyKey: "waitingList", href: "/admin/students", icon: WaitingListIcon, chip: "bg-accent-2" },
  { key: "parents", labelKey: "parents", emptyKey: "parents", href: "/admin/admin-panel/parents", icon: ParentsIcon, chip: "bg-error" },
  { key: "houses", labelKey: "houses", emptyKey: "houses", href: "/admin/pastoral", icon: HouseFlagIcon, chip: "bg-category-blue" },
];

/**
 * Quick Actions, in Figma order. Each is gated by its own permission
 * (safe-visible fallback, see navPermissions.ts).
 *
 * FLAGGED targets: Create Exam opens Exam › List (its create wizard is a
 * button there — no deep link yet); Mark Attendance and Send Notice land
 * on their modules' "coming soon" pages until those are built; Add Course
 * = Setup › Subjects Master.
 */
export const QUICK_ACTIONS: Array<{
  key: string;
  href: string;
  icon: Icon;
  chip: string;
  permission: NavPermission;
}> = [
  { key: "addStudent", href: ADD_STUDENT_HREF, icon: UserPlusIcon, chip: "bg-accent-hover", permission: NAV_PERMISSIONS.quickAddStudent },
  { key: "createExam", href: "/admin/academics/exam/list", icon: OpenBookIcon, chip: "bg-category-cyan", permission: NAV_PERMISSIONS.quickCreateExam },
  {
    key: "generateReport",
    href: "/admin/academics/exam/report-progression",
    icon: ReportIcon,
    chip: "bg-accent-2",
    permission: NAV_PERMISSIONS.quickGenerateReport,
  },
  { key: "markAttendance", href: MARK_ATTENDANCE_HREF, icon: UserCheckIcon, chip: "bg-category-amber", permission: NAV_PERMISSIONS.quickMarkAttendance },
  { key: "sendNotice", href: "/admin/communications", icon: BellIcon, chip: "bg-category-blue", permission: NAV_PERMISSIONS.quickSendNotice },
  {
    key: "addCourse",
    href: "/admin/setup/academic-structure/subjects-master",
    icon: CourseIcon,
    chip: "bg-error",
    permission: NAV_PERMISSIONS.quickAddCourse,
  },
];
