"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS, TransientQueryError } from "@/lib/queryClient";
import { PAGE_SIZE, usePaginatedView } from "@/lib/setup/usePaginatedView";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { listStudents, studentsQueryKey } from "@/lib/students/studentsApi";
import type { Student } from "@/lib/students/studentTypes";
import { MOCK_BOARDING_HOUSES, MOCK_CLASSES, MOCK_CLASS_ARMS } from "@/lib/students/studentsMockData";
import {
  genderLabelKey,
  matchesStudentFilters,
  matchesStudentSearch,
  modeLabelKey,
  resolveArmName,
  resolveBoardingHouseName,
  resolveClassName,
} from "@/lib/students/studentsTableHelpers";
import { StudentsHeader } from "@/components/students/StudentsHeader";
import { StudentsStatCards } from "@/components/students/StudentsStatCards";
import { StudentsTabs, type StudentsTabKey } from "@/components/students/StudentsTabs";
import { StudentsComingSoonTab } from "@/components/students/StudentsComingSoonTab";
import { MoreActionsMenu } from "@/components/students/MoreActionsMenu";
import { StudentRowActionsMenu } from "@/components/students/StudentRowActionsMenu";

/** Small initials circle — the Add Student wizard's real photo upload (Commit 2) replaces this per-row once a student has photo_file_id set. */
function StudentAvatar({ student }: { student: Student }) {
  const initials = `${student.first_name[0] ?? ""}${student.last_name[0] ?? ""}`.toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-2 text-xs font-semibold text-accent">
      {initials || "—"}
    </span>
  );
}

const COMING_SOON_TAB_TITLE_KEYS: Partial<Record<StudentsTabKey, string>> = {
  admissions: "students.tabs.admissions",
  subjectEnrollment: "students.tabs.subjectEnrollment",
  classEnrollment: "students.tabs.classEnrollment",
  notes: "students.tabs.notes",
  withdrawn: "students.tabs.withdrawn",
  graduate: "students.tabs.graduate",
};

/**
 * Bespoke screen, NOT CrudScreen — CrudScreen hardcodes "Add New" to open
 * its own internal SlideOverPanel form with no override hook, but Students
 * needs "Add New Student" to launch the (much larger) Add Student wizard
 * instead (lands in Commit 2). Composes the same lower-level primitives
 * CrudScreen itself is built from: DataTable (table/toolbar/pagination
 * shell) + the generic export mechanism — same pattern ClassArmsScreen.tsx
 * already uses for the same "can't go through a single CrudService list()"
 * reason (there, a merged multi-class query; here, "Add New" needs a
 * custom target).
 */
export function StudentsScreen() {
  const t = useTranslations();
  const { showToast } = useToast();
  const { school } = useAuth();
  const { selectedYear } = useAcademicYear();
  const [activeTab, setActiveTab] = useState<StudentsTabKey>("list");

  const query = useQuery({
    queryKey: studentsQueryKey,
    queryFn: async () => {
      const result = await listStudents();
      if (!result.ok) throw new TransientQueryError();
      return result;
    },
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });

  const allItems: Student[] = query.data?.ok ? query.data.data : [];
  // Student List tab is always active-only — withdrawn/suspended/expelled/
  // graduated/draft students live on the Withdrawn/Graduate tabs instead
  // (both placeholders in this commit; see COMING_SOON_TAB_TITLE_KEYS).
  const activeStudents = allItems.filter((student) => student.status === "active");

  const isLoading = query.isPending;
  const errorMessage = query.isError ? t("students.list.loadError") : null;

  const view = usePaginatedView(activeStudents, {
    matchesSearch: matchesStudentSearch,
    matchesFilters: matchesStudentFilters,
  });

  const armNames = Array.from(new Set(MOCK_CLASS_ARMS.map((arm) => arm.name))).sort();
  const comingSoon = () => showToast(t("students.actions.comingSoon"));

  const filterDefs: FilterDef[] = [
    {
      key: "class",
      label: t("students.filters.class"),
      options: [
        { value: "", label: t("students.filters.allClasses") },
        ...MOCK_CLASSES.map((cls) => ({ value: cls.id, label: cls.name })),
      ],
    },
    {
      key: "arm",
      label: t("students.filters.arm"),
      options: [
        { value: "", label: t("students.filters.allArms") },
        ...armNames.map((name) => ({ value: name, label: name })),
      ],
    },
    {
      key: "boardingHouse",
      label: t("students.filters.boardingHouse"),
      options: [
        { value: "", label: t("students.filters.allBoardingHouses") },
        ...MOCK_BOARDING_HOUSES.map((house) => ({ value: house.id, label: house.name })),
      ],
    },
    {
      key: "mode",
      label: t("students.filters.studentType"),
      options: [
        { value: "", label: t("students.filters.allTypes") },
        { value: "day", label: t("students.mode.day") },
        { value: "boarding", label: t("students.mode.boarding") },
      ],
    },
  ];
  const filters = filterDefs.map((def) => ({
    def,
    value: view.filters[def.key] ?? "",
    onChange: (value: string) => {
      view.setFilters((current) => {
        const next = { ...current };
        if (value) next[def.key] = value;
        else delete next[def.key];
        return next;
      });
    },
  }));

  const columns: ColumnDef<Student>[] = [
    {
      key: "sn",
      header: t("students.columns.sn"),
      render: (_row, index) => (view.page - 1) * PAGE_SIZE + index + 1,
    },
    { key: "admissionNumber", header: t("students.columns.admissionNumber"), render: (row) => row.admission_number ?? "—" },
    { key: "photo", header: t("students.columns.photo"), render: (row) => <StudentAvatar student={row} /> },
    { key: "lastName", header: t("students.columns.lastName"), render: (row) => row.last_name },
    { key: "firstName", header: t("students.columns.firstName"), render: (row) => row.first_name },
    { key: "otherNames", header: t("students.columns.otherNames"), render: (row) => row.other_names ?? "—" },
    { key: "gender", header: t("students.columns.gender"), render: (row) => t(genderLabelKey(row)) },
    { key: "arm", header: t("students.columns.arm"), render: (row) => resolveArmName(row.class_arm_id) },
    {
      key: "boardingHouse",
      header: t("students.columns.boardingHouse"),
      render: (row) => resolveBoardingHouseName(row.boarding_house_id),
    },
    { key: "siblings", header: t("students.columns.siblings"), render: (row) => row.sibling_student_ids.length },
    {
      key: "actions",
      header: t("students.columns.actions"),
      render: (row) => <StudentRowActionsMenu student={row} onComingSoon={comingSoon} />,
    },
  ];

  const exportColumns: ExportColumn<Student>[] = [
    { header: t("students.columns.admissionNumber"), value: (row) => row.admission_number ?? "" },
    { header: t("students.columns.lastName"), value: (row) => row.last_name },
    { header: t("students.columns.firstName"), value: (row) => row.first_name },
    { header: t("students.columns.otherNames"), value: (row) => row.other_names ?? "" },
    { header: t("students.columns.gender"), value: (row) => t(genderLabelKey(row)) },
    { header: t("students.columns.class"), value: (row) => resolveClassName(row.class_id) },
    { header: t("students.columns.arm"), value: (row) => resolveArmName(row.class_arm_id) },
    { header: t("students.columns.boardingHouse"), value: (row) => resolveBoardingHouseName(row.boarding_house_id) },
    { header: t("students.columns.mode"), value: (row) => t(modeLabelKey(row)) },
    { header: t("students.columns.siblings"), value: (row) => row.sibling_student_ids.length },
    {
      header: t("students.columns.guardianPhone"),
      value: (row) => {
        const primary = row.primary_contact ? row[row.primary_contact] : (row.guardian ?? row.father ?? row.mother);
        return primary?.phone ?? "";
      },
    },
  ];
  const exportConfig: ExportConfig<Student> = {
    filteredRows: view.filteredItems,
    allRows: activeStudents,
    columns: exportColumns,
    title: t("students.tabs.list"),
    filenamePrefix: "students",
    schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
    periodLabel: selectedYear?.name,
  };

  const comingSoonTitleKey = COMING_SOON_TAB_TITLE_KEYS[activeTab];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StudentsHeader />
      <StudentsTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "list" ? (
        <>
          <StudentsStatCards students={allItems} />
          <DataTable<Student>
            columns={columns}
            rows={view.items}
            getRowId={(row) => row.id}
            searchValue={view.search}
            onSearchChange={view.setSearch}
            searchPlaceholder={t("students.searchPlaceholder")}
            filters={filters}
            onAddNew={comingSoon}
            addNewLabel={t("students.addNew")}
            extraActions={
              <>
                <ExportMenu config={exportConfig} label={t("students.export.label")} />
                <MoreActionsMenu onComingSoon={comingSoon} />
              </>
            }
            isLoading={isLoading}
            errorMessage={errorMessage}
            onRetry={() => query.refetch()}
            emptyMessage={t("students.empty")}
            page={view.page}
            totalPages={view.totalPages}
            onPreviousPage={() => view.setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => view.setPage((p) => Math.min(view.totalPages, p + 1))}
          />
        </>
      ) : (
        <StudentsComingSoonTab titleKey={comingSoonTitleKey ?? "students.tabs.list"} />
      )}
    </div>
  );
}
