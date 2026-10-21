"use client";

import { useEffect, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useQueries, useQuery, type Query } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type ColumnDef, type FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import { departmentsService, type Department } from "@/lib/setup/academicStructure/departmentsApi";
import { subjectsMasterService, type SubjectMaster } from "@/lib/setup/academicStructure/subjectsMasterApi";
import { staffPostsService } from "@/lib/hr/staffPostsApi";
import {
  listStaffPage,
  STAFF_PAGE_SIZE_DEFAULT,
  STAFF_PAGE_SIZES,
  staffPageQueryKey,
  type StaffPageParams,
  type StaffPageSize,
} from "@/lib/hr/staffRecordsApi";
import { STAFF_LIST_STATUSES, type Staff, type StaffPost, type StaffStatus, type StaffType } from "@/lib/hr/hrTypes";
import { StaffsHeader } from "@/components/hr/StaffsHeader";
import { StaffTypeTabs } from "@/components/hr/StaffTypeTabs";
import { ClassArmChip, StaffAvatar, StaffStatusBadge } from "@/components/hr/StaffBadges";

/** Search is sent server-side, so wait for typing to pause before re-querying. */
const SEARCH_DEBOUNCE_MS = 300;

/** The roster view by default — retired/terminated/suspended staff drop out of it, reachable via the Status filter. */
const DEFAULT_FILTERS: Record<string, string> = { status: "active" };

/** Keep the previous page on screen while the next loads — but only within the same tab, never another tab's rows. */
function isSameTab(previous: Query | undefined, staffType: StaffType): boolean {
  const previousParams = previous?.queryKey[previous.queryKey.length - 1] as Partial<StaffPageParams> | undefined;
  return previousParams?.staffType === staffType;
}

/**
 * HR › Staffs list (Figma 3347:61729). Mirrors the Students list
 * discipline: paging, staff_type (the tab), status, department, subject
 * and search are all server params (listStaffPage → GET erp/staff), with
 * page sizes up to "All" assembled from 200-row requests. Runs against the
 * MOCK staffRecordsApi until the backend ships the full list — NOT the lean
 * real GET erp/staff lookup Departments uses.
 *
 * Department / subject / class-arm NAMES resolve against the real Academic
 * APIs (departments, subject master, the selected year's classes +
 * arms) — empty under dev-bypass, so those show "—" locally.
 */
export function StaffsScreen() {
  const t = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { showToast } = useToast();
  const { school } = useAuth();
  const { selectedYearId } = useAcademicYear();

  // ---- Reference data for names / filter options -------------------------
  const departmentsQuery = useQuery({
    queryKey: departmentsService.queryKey,
    queryFn: () => departmentsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const departments: Department[] = departmentsQuery.data?.ok ? departmentsQuery.data.data : [];

  const subjectsQuery = useQuery({
    queryKey: subjectsMasterService.queryKey,
    queryFn: () => subjectsMasterService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const subjects: SubjectMaster[] = subjectsQuery.data?.ok ? subjectsQuery.data.data : [];

  const postsQuery = useQuery({
    queryKey: staffPostsService.queryKey,
    queryFn: () => staffPostsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const posts: StaffPost[] = postsQuery.data?.ok ? postsQuery.data.data : [];

  // Classes are per academic year, so chips resolve against the header's
  // selected year — same fan-out as StudentsScreen (shared cache keys).
  const classesService = selectedYearId ? createClassesService(selectedYearId) : null;
  const classesQuery = useQuery({
    queryKey: classesService?.queryKey ?? ["setup", "classes", "none"],
    queryFn: () => classesService!.list().then(throwIfTransient),
    enabled: !!classesService,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes: SchoolClass[] = classesQuery.data?.ok ? classesQuery.data.data : [];
  const sectionQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: sectionsQueryKey(cls.id),
      queryFn: () => fetchSectionsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });
  const sections: Section[] = sectionQueries.flatMap((query) => (query.data?.ok ? query.data.data : []));

  const departmentName = (id: string) => departments.find((department) => department.id === id)?.name ?? "—";
  const subjectName = (id: string) => subjects.find((subject) => subject.id === id)?.name ?? "—";
  const postName = (id: string | null) => (id ? (posts.find((post) => post.id === id)?.name ?? "—") : "—");
  const classIndex = (id: string) => classes.findIndex((cls) => cls.id === id);
  const armLabel = (classId: string, sectionId: string) => {
    const cls = classes.find((item) => item.id === classId);
    const section = sections.find((item) => item.id === sectionId);
    if (!cls && !section) return "—";
    return t("hr.staffs.classArm", { className: cls?.name ?? "—", armName: section?.name ?? "—" });
  };

  // ---- Table state (all server-side) --------------------------------------
  const [staffType, setStaffType] = useState<StaffType>("teaching");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<StaffPageSize>(STAFF_PAGE_SIZE_DEFAULT);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  // Back to page 1 whenever what's being paged changes — adjusted during
  // render so the stale page number is never requested.
  const viewKey = JSON.stringify([staffType, debouncedSearch, filters, pageSize]);
  const [pagedViewKey, setPagedViewKey] = useState(viewKey);
  if (pagedViewKey !== viewKey) {
    setPagedViewKey(viewKey);
    setPage(1);
  }

  const statusFilter = filters.status as StaffStatus | undefined;
  const statuses: StaffStatus[] =
    statusFilter && STAFF_LIST_STATUSES.includes(statusFilter) ? [statusFilter] : [...STAFF_LIST_STATUSES];
  const pageParams: StaffPageParams = {
    staffType,
    departmentId: filters.department_id || undefined,
    subjectId: filters.subject_id || undefined,
    search: debouncedSearch || undefined,
    statuses,
    page,
    limit: pageSize,
  };

  const query = useQuery({
    queryKey: staffPageQueryKey(pageParams),
    // throwIfTransient: only network/5xx failures are retried.
    queryFn: () => listStaffPage(pageParams).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
    placeholderData: (previous, previousQuery) =>
      isSameTab(previousQuery as Query | undefined, staffType) ? previous : undefined,
  });

  const pageData = query.data?.ok ? query.data.data : null;
  const rows: Staff[] = pageData?.items ?? [];
  const lastPage = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.limit)) : 1;
  const totalPages = pageData?.hasMore ? Math.max(lastPage, page + 1) : Math.max(lastPage, pageData ? 1 : page);

  // The current page emptied out from under us — step back to the real last page.
  if (pageData && !query.isPlaceholderData && rows.length === 0 && page > 1) {
    setPage(Math.min(page - 1, lastPage));
  }

  const errorMessage = query.isError || (query.data && !query.data.ok) ? t("hr.staffs.loadError") : null;
  const comingSoon = () => showToast(t("hr.staffs.comingSoon"));

  // Search/filters are per-tab.
  const handleTabChange = (tab: StaffType) => {
    setStaffType(tab);
    setSearch("");
    setDebouncedSearch("");
    setFilters(DEFAULT_FILTERS);
  };

  // ---- Toolbar ------------------------------------------------------------
  const filterDefs: FilterDef[] = [
    {
      key: "department_id",
      label: t("hr.staffs.filters.department"),
      options: [
        { value: "", label: t("hr.staffs.filters.allDepartments") },
        ...departments.map((department) => ({ value: department.id, label: department.name })),
      ],
    },
    {
      key: "status",
      label: t("hr.staffs.filters.status"),
      options: [
        { value: "", label: t("hr.staffs.filters.allStatuses") },
        ...STAFF_LIST_STATUSES.map((status) => ({ value: status, label: t(`hr.staffs.status.${status}`) })),
      ],
    },
    // Teaching staff are the ones with subject assignments.
    ...(staffType === "teaching"
      ? [
          {
            key: "subject_id",
            label: t("hr.staffs.filters.subject"),
            options: [
              { value: "", label: t("hr.staffs.filters.allSubjects") },
              ...subjects.map((subject) => ({ value: subject.id, label: subject.name })),
            ],
          },
        ]
      : []),
  ];
  const toolbarFilters = filterDefs.map((def) => ({
    def,
    value: filters[def.key] ?? "",
    onChange: (value: string) => {
      setFilters((current) => {
        const next = { ...current };
        if (value) next[def.key] = value;
        else delete next[def.key];
        return next;
      });
    },
  }));
  // Page size rides in the toolbar's dropdown row but is its own state, not a filter param.
  const pageSizeControl = {
    def: {
      key: "pageSize",
      label: t("hr.staffs.pageSize.label"),
      options: STAFF_PAGE_SIZES.map((size) => ({
        value: String(size),
        label: size === "all" ? t("hr.staffs.pageSize.all") : t("hr.staffs.pageSize.option", { count: size }),
      })),
    },
    value: String(pageSize),
    onChange: (value: string) => {
      const next = STAFF_PAGE_SIZES.find((size) => String(size) === value);
      if (next) setPageSize(next);
    },
  };

  // ---- Columns ------------------------------------------------------------
  const formatDate = (value: string | null) =>
    value ? format.dateTime(new Date(value), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  const formatLastActive = (value: string | null) => (value ? format.relativeTime(new Date(value), now) : "—");

  const subjectGroups = (staff: Staff) => {
    const bySubject = new Map<string, Staff["subject_assignments"]>();
    for (const assignment of staff.subject_assignments) {
      bySubject.set(assignment.subject_id, [...(bySubject.get(assignment.subject_id) ?? []), assignment]);
    }
    return Array.from(bySubject.entries());
  };

  const columns: ColumnDef<Staff>[] = [
    {
      key: "sn",
      header: t("hr.staffs.columns.sn"),
      render: (_row, index) => (page - 1) * (pageData?.limit ?? 0) + index + 1,
    },
    { key: "photo", header: t("hr.staffs.columns.photo"), render: (row) => <StaffAvatar staff={row} /> },
    { key: "lastName", header: t("hr.staffs.columns.lastName"), render: (row) => row.last_name || "—" },
    { key: "firstName", header: t("hr.staffs.columns.firstName"), render: (row) => row.first_name || "—" },
    {
      key: "department",
      header: t("hr.staffs.columns.department"),
      render: (row) => (row.department_ids.length ? row.department_ids.map(departmentName).join(", ") : "—"),
    },
    {
      key: "subjects",
      header: t("hr.staffs.columns.subjects"),
      className: "min-w-[180px]",
      render: (row) => {
        const groups = subjectGroups(row);
        if (groups.length === 0) return "—";
        return (
          <div className="flex flex-col gap-2">
            {groups.map(([subjectId, assignments]) => (
              <div key={subjectId} className="flex flex-col gap-1">
                <span>{subjectName(subjectId)}</span>
                <div className="flex flex-wrap gap-1">
                  {assignments.map((assignment) => (
                    <ClassArmChip
                      key={`${assignment.class_id}-${assignment.section_id}`}
                      label={armLabel(assignment.class_id, assignment.section_id)}
                      colorIndex={classIndex(assignment.class_id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      },
    },
    { key: "post", header: t("hr.staffs.columns.post"), render: (row) => postName(row.post_id) },
    {
      key: "dateJoined",
      header: t("hr.staffs.columns.dateJoined"),
      className: "whitespace-nowrap",
      render: (row) => formatDate(row.date_joined),
    },
    { key: "status", header: t("hr.staffs.columns.status"), render: (row) => <StaffStatusBadge status={row.status} /> },
    {
      key: "lastActive",
      header: t("hr.staffs.columns.lastActive"),
      className: "whitespace-nowrap",
      render: (row) => formatLastActive(row.last_active_at),
    },
  ];

  // Export covers exactly what's loaded: the page on screen, or — with
  // the "All" page size — the fully-assembled filtered set.
  const exportColumns: ExportColumn<Staff>[] = [
    { header: t("hr.staffs.columns.staffNo"), value: (row) => row.staff_no ?? "" },
    { header: t("hr.staffs.columns.lastName"), value: (row) => row.last_name },
    { header: t("hr.staffs.columns.firstName"), value: (row) => row.first_name },
    { header: t("hr.staffs.columns.department"), value: (row) => row.department_ids.map(departmentName).join(", ") },
    {
      header: t("hr.staffs.columns.subjects"),
      value: (row) =>
        subjectGroups(row)
          .map(
            ([subjectId, assignments]) =>
              `${subjectName(subjectId)} (${assignments.map((a) => armLabel(a.class_id, a.section_id)).join(", ")})`,
          )
          .join("; "),
    },
    { header: t("hr.staffs.columns.post"), value: (row) => postName(row.post_id) },
    { header: t("hr.staffs.columns.dateJoined"), value: (row) => formatDate(row.date_joined) },
    { header: t("hr.staffs.columns.status"), value: (row) => t(`hr.staffs.status.${row.status}`) },
    { header: t("hr.staffs.columns.email"), value: (row) => row.email ?? "" },
  ];
  const tabTitle = t(`hr.staffs.tabs.${staffType}`);
  const exportConfig: ExportConfig<Staff> = {
    filteredRows: rows,
    allRows: rows,
    columns: exportColumns,
    title: tabTitle,
    filenamePrefix: staffType === "teaching" ? "teaching-staff" : "non-teaching-staff",
    schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StaffsHeader />
      <StaffTypeTabs activeTab={staffType} onChange={handleTabChange} />

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary">
          {pageData ? t("hr.staffs.tabTitleWithCount", { title: tabTitle, count: pageData.total }) : tabTitle}
        </h2>
        <DataTable<Staff>
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("hr.staffs.searchPlaceholder")}
          filters={[...toolbarFilters, pageSizeControl]}
          // Add Staff opens the wizard (next stage); Import is hidden per spec.
          onAddNew={comingSoon}
          addNewLabel={t("hr.staffs.addNew")}
          extraActions={<ExportMenu config={exportConfig} label={t("hr.staffs.export")} />}
          isLoading={query.isPending}
          errorMessage={errorMessage}
          onRetry={() => query.refetch()}
          emptyMessage={t(staffType === "teaching" ? "hr.staffs.emptyTeaching" : "hr.staffs.emptyNonTeaching")}
          page={page}
          totalPages={totalPages}
          onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </section>
    </div>
  );
}
