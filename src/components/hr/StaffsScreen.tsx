"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type ColumnDef, type FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import {
  deleteStaffDraft,
  getStaff,
  listStaffPage,
  STAFF_PAGE_SIZE_DEFAULT,
  STAFF_PAGE_SIZES,
  staffListQueryKeyRoot,
  staffPageQueryKey,
  type StaffPageParams,
  type StaffPageSize,
} from "@/lib/hr/staffRecordsApi";
import { permissionGroupsQueryKey } from "@/lib/hr/permissionGroupsApi";
import { STAFF_LIST_STATUSES, type Staff, type StaffStatus } from "@/lib/hr/hrTypes";
import { StaffsHeader } from "@/components/hr/StaffsHeader";
import { StaffTypeTabs, type StaffListView } from "@/components/hr/StaffTypeTabs";
import { ClassArmChip, StaffAvatar, StaffStatusBadge } from "@/components/hr/StaffBadges";
import { useHrReferenceData } from "@/components/hr/useHrReferenceData";
import { clampToStaffStep, type StaffWizardStep } from "@/components/hr/wizard/staffForm";

// Lazy-loaded — the wizard is the biggest chunk here and most visits just
// browse the list (same reasoning as the Students wizard).
const StaffWizard = dynamic(() => import("@/components/hr/wizard/StaffWizard").then((mod) => ({ default: mod.StaffWizard })), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="h-[80vh] w-full max-w-6xl animate-pulse rounded-2xl bg-surface" />
    </div>
  ),
});

/** Search is sent server-side, so wait for typing to pause before re-querying. */
const SEARCH_DEBOUNCE_MS = 300;

/** The roster by default — retired/terminated/suspended staff drop out of it, reachable via the Status filter. Drafts have no Status filter. */
function defaultFilters(view: StaffListView): Record<string, string> {
  return view === "drafts" ? {} : { status: "active" };
}

/** Keep the previous page on screen while the next loads — but only within the same view, never another view's rows. */
function isSameView(previous: Query | undefined, params: StaffPageParams): boolean {
  const previousParams = previous?.queryKey[previous.queryKey.length - 1] as Partial<StaffPageParams> | undefined;
  return (
    !!previousParams &&
    previousParams.staffType === params.staffType &&
    (previousParams.statuses ?? []).includes("draft") === params.statuses.includes("draft")
  );
}

type WizardState =
  | { mode: "create"; staff?: Staff; initialStep?: StaffWizardStep }
  | { mode: "edit"; staff: Staff };

/**
 * HR › Staffs list (Figma 3347:61729). Mirrors the Students list
 * discipline: paging, staff_type (the tab), status, department, subject
 * and search are all server params (listStaffPage → GET erp/staff), with
 * page sizes up to "All" assembled from 200-row requests. Runs against the
 * MOCK staffRecordsApi until the backend ships the full list — NOT the lean
 * real GET erp/staff lookup Departments uses.
 *
 * Assignments are year-scoped: the list asks for the header's selected
 * year, so chips (and the Subject filter) reflect that year. Department /
 * subject / class-arm NAMES resolve against the real Academic APIs —
 * empty under dev-bypass, so those show "—" locally.
 */
export function StaffsScreen() {
  const t = useTranslations();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { school } = useAuth();
  const { selectedYearId } = useAcademicYear();
  const refs = useHrReferenceData(selectedYearId);

  // ---- Table state (all server-side) --------------------------------------
  const [view, setView] = useState<StaffListView>("teaching");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(defaultFilters("teaching"));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<StaffPageSize>(STAFF_PAGE_SIZE_DEFAULT);
  const [wizardState, setWizardState] = useState<WizardState | null>(null);
  const [openingStaffId, setOpeningStaffId] = useState<string | null>(null);
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<Staff | null>(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const isDrafts = view === "drafts";

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  // Back to page 1 whenever what's being paged changes — adjusted during
  // render so the stale page number is never requested.
  const viewKey = JSON.stringify([view, selectedYearId, debouncedSearch, filters, pageSize]);
  const [pagedViewKey, setPagedViewKey] = useState(viewKey);
  if (pagedViewKey !== viewKey) {
    setPagedViewKey(viewKey);
    setPage(1);
  }

  const statusFilter = filters.status as StaffStatus | undefined;
  const statuses: StaffStatus[] = isDrafts
    ? ["draft"]
    : statusFilter && STAFF_LIST_STATUSES.includes(statusFilter)
      ? [statusFilter]
      : [...STAFF_LIST_STATUSES];
  const pageParams: StaffPageParams = {
    academicYearId: selectedYearId ?? undefined,
    staffType: isDrafts ? undefined : view,
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
    placeholderData: (previous, previousQuery) => (isSameView(previousQuery as Query | undefined, pageParams) ? previous : undefined),
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

  // Search/filters are per-view.
  const handleViewChange = (next: StaffListView) => {
    setView(next);
    setSearch("");
    setDebouncedSearch("");
    setFilters(defaultFilters(next));
  };

  // ---- Open / delete --------------------------------------------------------
  // Resume/Edit always re-fetch the full record for the selected year (the
  // wizard sends the COMPLETE record back, so a list row must never seed it).
  const openStaff = async (row: Staff, intent: "resume" | "edit") => {
    if (openingStaffId) return;
    setOpeningStaffId(row.id);
    const result = await getStaff(row.id, selectedYearId);
    setOpeningStaffId(null);
    if (!result.ok) {
      showToast(resultErrorMessage(result, t));
      return;
    }
    setWizardState(
      intent === "resume"
        ? { mode: "create", staff: result.data, initialStep: clampToStaffStep(result.data.draft_last_step) }
        : { mode: "edit", staff: result.data },
    );
  };

  const handleConfirmDeleteDraft = async () => {
    if (!deleteDraftTarget) return;
    setIsDeletingDraft(true);
    const result = await deleteStaffDraft(deleteDraftTarget.id);
    setIsDeletingDraft(false);
    setDeleteDraftTarget(null);
    if (!result.ok) {
      showToast(resultErrorMessage(result, t));
      return;
    }
    queryClient.invalidateQueries({ queryKey: staffListQueryKeyRoot });
    queryClient.invalidateQueries({ queryKey: permissionGroupsQueryKey });
    showToast(t("hr.staffs.toast.draftDeleted"));
  };

  // ---- Toolbar ------------------------------------------------------------
  const filterDefs: FilterDef[] = isDrafts
    ? []
    : [
        {
          key: "department_id",
          label: t("hr.staffs.filters.department"),
          options: [
            { value: "", label: t("hr.staffs.filters.allDepartments") },
            ...refs.departments.map((department) => ({ value: department.id, label: department.name })),
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
        ...(view === "teaching"
          ? [
              {
                key: "subject_id",
                label: t("hr.staffs.filters.subject"),
                options: [
                  { value: "", label: t("hr.staffs.filters.allSubjects") },
                  ...refs.subjects.map((subject) => ({ value: subject.id, label: subject.name })),
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
  const formatRelative = (value: string | null) => (value ? format.relativeTime(new Date(value), now) : "—");
  const armLabel = (classId: string, sectionId: string) =>
    t("hr.staffs.classArm", { className: refs.className(classId), armName: refs.armName(sectionId) });

  const subjectGroups = (staff: Staff) => {
    const bySubject = new Map<string, Staff["subject_assignments"]>();
    for (const assignment of staff.subject_assignments) {
      bySubject.set(assignment.subject_id, [...(bySubject.get(assignment.subject_id) ?? []), assignment]);
    }
    return Array.from(bySubject.entries());
  };

  const actionLink = "text-sm font-semibold text-accent hover:underline disabled:opacity-50";

  const sharedLeadingColumns: ColumnDef<Staff>[] = [
    { key: "sn", header: t("hr.staffs.columns.sn"), render: (_row, index) => (page - 1) * (pageData?.limit ?? 0) + index + 1 },
    { key: "photo", header: t("hr.staffs.columns.photo"), render: (row) => <StaffAvatar staff={row} /> },
    { key: "lastName", header: t("hr.staffs.columns.lastName"), render: (row) => row.last_name || "—" },
    { key: "firstName", header: t("hr.staffs.columns.firstName"), render: (row) => row.first_name || "—" },
  ];

  const draftColumns: ColumnDef<Staff>[] = [
    ...sharedLeadingColumns,
    { key: "type", header: t("hr.staffs.columns.type"), render: (row) => t(`hr.staffs.tabs.${row.staff_type}`) },
    { key: "post", header: t("hr.staffs.columns.post"), render: (row) => refs.postName(row.post_id) },
    { key: "email", header: t("hr.staffs.columns.email"), render: (row) => row.email ?? "—" },
    { key: "lastSaved", header: t("hr.staffs.columns.lastSaved"), className: "whitespace-nowrap", render: (row) => formatRelative(row.updated_at || null) },
    {
      key: "actions",
      header: t("hr.staffs.columns.actions"),
      render: (row) => (
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void openStaff(row, "resume")} disabled={openingStaffId === row.id} className={actionLink}>
            {t("hr.staffs.actions.resume")}
          </button>
          <button type="button" onClick={() => setDeleteDraftTarget(row)} className="text-sm font-semibold text-error hover:underline">
            {t("common.delete")}
          </button>
        </div>
      ),
    },
  ];

  const rosterColumns: ColumnDef<Staff>[] = [
    ...sharedLeadingColumns,
    {
      key: "department",
      header: t("hr.staffs.columns.department"),
      render: (row) => (row.department_ids.length ? row.department_ids.map(refs.departmentName).join(", ") : "—"),
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
                <span>{refs.subjectName(subjectId)}</span>
                <div className="flex flex-wrap gap-1">
                  {assignments.map((assignment) => (
                    <ClassArmChip
                      key={`${assignment.class_id}-${assignment.section_id}`}
                      label={armLabel(assignment.class_id, assignment.section_id)}
                      colorIndex={refs.classIndex(assignment.class_id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      },
    },
    { key: "post", header: t("hr.staffs.columns.post"), render: (row) => refs.postName(row.post_id) },
    { key: "dateJoined", header: t("hr.staffs.columns.dateJoined"), className: "whitespace-nowrap", render: (row) => formatDate(row.date_joined) },
    { key: "status", header: t("hr.staffs.columns.status"), render: (row) => <StaffStatusBadge status={row.status} /> },
    { key: "lastActive", header: t("hr.staffs.columns.lastActive"), className: "whitespace-nowrap", render: (row) => formatRelative(row.last_active_at) },
    {
      key: "actions",
      header: t("hr.staffs.columns.actions"),
      render: (row) => (
        <button type="button" onClick={() => void openStaff(row, "edit")} disabled={openingStaffId === row.id} className={actionLink}>
          {t("common.edit")}
        </button>
      ),
    },
  ];

  // Export covers exactly what's loaded: the page on screen, or — with
  // the "All" page size — the fully-assembled filtered set. Never a password.
  const exportColumns: ExportColumn<Staff>[] = [
    { header: t("hr.staffs.columns.staffNo"), value: (row) => row.staff_no ?? "" },
    { header: t("hr.staffs.columns.lastName"), value: (row) => row.last_name },
    { header: t("hr.staffs.columns.firstName"), value: (row) => row.first_name },
    { header: t("hr.staffs.columns.department"), value: (row) => row.department_ids.map(refs.departmentName).join(", ") },
    {
      header: t("hr.staffs.columns.subjects"),
      value: (row) =>
        subjectGroups(row)
          .map(([subjectId, assignments]) => `${refs.subjectName(subjectId)} (${assignments.map((a) => armLabel(a.class_id, a.section_id)).join(", ")})`)
          .join("; "),
    },
    { header: t("hr.staffs.columns.post"), value: (row) => refs.postName(row.post_id) },
    { header: t("hr.staffs.columns.dateJoined"), value: (row) => formatDate(row.date_joined) },
    { header: t("hr.staffs.columns.status"), value: (row) => t(`hr.staffs.status.${row.status}`) },
    { header: t("hr.staffs.columns.email"), value: (row) => row.email ?? "" },
  ];
  const viewTitle = t(`hr.staffs.tabs.${view}`);
  const exportConfig: ExportConfig<Staff> = {
    filteredRows: rows,
    allRows: rows,
    columns: exportColumns,
    title: viewTitle,
    filenamePrefix: isDrafts ? "staff-drafts" : view === "teaching" ? "teaching-staff" : "non-teaching-staff",
    schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StaffsHeader />
      <StaffTypeTabs activeView={view} onChange={handleViewChange} />

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary">
          {pageData ? t("hr.staffs.tabTitleWithCount", { title: viewTitle, count: pageData.total }) : viewTitle}
        </h2>
        <DataTable<Staff>
          columns={isDrafts ? draftColumns : rosterColumns}
          rows={rows}
          getRowId={(row) => row.id}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t("hr.staffs.searchPlaceholder")}
          filters={[...toolbarFilters, pageSizeControl]}
          // Import is hidden per spec.
          onAddNew={() => setWizardState({ mode: "create" })}
          addNewLabel={t("hr.staffs.addNew")}
          extraActions={<ExportMenu config={exportConfig} label={t("hr.staffs.export")} />}
          isLoading={query.isPending}
          errorMessage={errorMessage}
          onRetry={() => query.refetch()}
          emptyMessage={t(isDrafts ? "hr.staffs.emptyDrafts" : view === "teaching" ? "hr.staffs.emptyTeaching" : "hr.staffs.emptyNonTeaching")}
          page={page}
          totalPages={totalPages}
          onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
          onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
        />
      </section>

      {wizardState ? (
        <StaffWizard
          mode={wizardState.mode}
          initialStaff={wizardState.staff}
          initialStep={wizardState.mode === "create" ? wizardState.initialStep : undefined}
          onClose={() => setWizardState(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={!!deleteDraftTarget}
        title={t("hr.staffs.confirmDeleteDraft.title")}
        message={t("hr.staffs.confirmDeleteDraft.message")}
        isDangerous
        isConfirming={isDeletingDraft}
        onConfirm={() => void handleConfirmDeleteDraft()}
        onCancel={() => setDeleteDraftTarget(null)}
      />
    </div>
  );
}
