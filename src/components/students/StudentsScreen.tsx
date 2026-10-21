"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useQueries, useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type ColumnDef, type FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import {
  deleteDraftStudent,
  getStudent,
  getStudentsSummary,
  listStudentsPage,
  STUDENT_PAGE_SIZES,
  STUDENTS_PAGE_SIZE_DEFAULT,
  studentsAllYearsQueryKeyRoot,
  studentsPageQueryKey,
  studentStatusEventsQueryKey,
  studentsQueryKey,
  studentsSummaryQueryKey,
  type StudentListFilters,
  type StudentListScope,
  type StudentPageParams,
  type StudentPageSize,
} from "@/lib/students/studentsApi";
import type { Student, StudentStatus } from "@/lib/students/studentTypes";
import { clampToWizardStep, type WizardStep } from "@/components/students/wizard/WizardStepper";
import {
  genderLabelKey,
  isBoardingHouseVisible,
  modeLabelKey,
  resolveArmName,
  resolveBoardingHouseName,
  resolveClassName,
  studentFullName,
} from "@/lib/students/studentsTableHelpers";
import { StudentsHeader } from "@/components/students/StudentsHeader";
import { StudentsStatCards } from "@/components/students/StudentsStatCards";
import { StudentsTabs, type StudentsTabKey } from "@/components/students/StudentsTabs";
import { StudentsComingSoonTab } from "@/components/students/StudentsComingSoonTab";
import { MoreActionsMenu } from "@/components/students/MoreActionsMenu";
import { StudentRowActionsMenu } from "@/components/students/StudentRowActionsMenu";
import { StudentAvatar } from "@/components/students/StudentAvatar";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { StudentViewPanel } from "@/components/students/StudentViewPanel";
import { StudentStatusActionPanel, type StudentStatusPanelAction } from "@/components/students/StudentStatusActionPanel";

// Lazy-loaded — the wizard (7 steps + Login Details) is the largest chunk
// in this module and only needed once "Add New Student"/a row/a draft is
// actually clicked; most visits to this page (browsing/searching/
// filtering the list) never touch it. ssr:false since it's pure client
// interaction (modal, file upload, localStorage-backed drafts) with
// nothing meaningful to server-render — same justification as
// CommandPalette (Header.tsx).
const StudentWizard = dynamic(
  () => import("@/components/students/wizard/StudentWizard").then((mod) => ({ default: mod.StudentWizard })),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="h-[80vh] w-full max-w-4xl animate-pulse rounded-2xl bg-surface" />
      </div>
    ),
  },
);

const COMING_SOON_TAB_TITLE_KEYS: Partial<Record<StudentsTabKey, string>> = {
  admissions: "students.tabs.admissions",
  subjectEnrollment: "students.tabs.subjectEnrollment",
  classEnrollment: "students.tabs.classEnrollment",
  notes: "students.tabs.notes",
};

/** The tabs that are real server-paged lists, each its own status slice. */
type StudentListTabKey = "list" | "drafts" | "withdrawn" | "graduate";

function isStudentListTab(tab: StudentsTabKey): tab is StudentListTabKey {
  return tab === "list" || tab === "drafts" || tab === "withdrawn" || tab === "graduate";
}

/**
 * The `status` param each tab sends. Student List = active only. Drafts =
 * draft, across ALL years (all_years=true — a draft may not have a year
 * yet). Withdrawn = withdrawn + suspended + expelled (one Withdraw flow,
 * told apart by the Status column). Graduate = graduated.
 */
const TAB_STATUSES: Record<StudentListTabKey, StudentStatus[]> = {
  list: ["active"],
  drafts: ["draft"],
  withdrawn: ["withdrawn", "suspended", "expelled"],
  graduate: ["graduated"],
};

/** Tabs whose Status filter narrows TAB_STATUSES to one — only Withdrawn has more than one status to pick from. */
const TAB_HAS_STATUS_FILTER: Record<StudentListTabKey, boolean> = {
  list: false,
  drafts: false,
  withdrawn: true,
  graduate: false,
};

const TAB_EMPTY_KEYS: Record<StudentListTabKey, string> = {
  list: "students.empty",
  drafts: "students.emptyDrafts",
  withdrawn: "students.emptyWithdrawn",
  graduate: "students.emptyGraduate",
};

/** Search is sent server-side, so wait for typing to pause before re-querying. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * placeholderData guard: keep showing the previous page while the next one
 * loads (no "Loading…" flash between pages/filters), but only within the
 * same year/all-years scope and tab — never show another tab's or year's
 * rows under this one. Key layout: see studentsPageQueryKey/
 * studentsSummaryQueryKey (index 2 = year id or "allYears").
 */
function isSameListView(previous: Query | undefined, scopeKey: string, statuses?: StudentStatus[]): boolean {
  if (!previous || previous.queryKey[2] !== scopeKey) return false;
  if (!statuses) return true;
  const previousParams = previous.queryKey[previous.queryKey.length - 1] as Partial<StudentPageParams> | undefined;
  return previousParams?.statuses?.join(",") === statuses.join(",");
}

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
  const { selectedYear, selectedYearId, activeYear, isLoading: isYearLoading } = useAcademicYear();
  // school_mode is real/confirmed (academicYearsApi.ts) — this only
  // defaults to "both" while activeYear itself is still null (loading, or
  // no active year yet), never because the field might be missing.
  const boardingHouseVisible = isBoardingHouseVisible(activeYear?.school_mode ?? "both");
  const queryClient = useQueryClient();

  // REAL Classes/Sections for the student list's Class/Arm resolution and
  // filters — the Add Student wizard's Step 1 already writes real
  // class_id/class_arm_id (classesApi/sectionsApi), not mock ids, so this
  // list must resolve against the same source to show real names instead
  // of "—". Mirrors the exact fan-out pattern ClassArmsScreen.tsx and the
  // enrolment screens already use: one classes query, one sections query
  // per class via useQueries (react-query's own per-key cache — visiting
  // Setup's own Classes/Class-arms screens shares this same cache, no
  // duplicate fetch). Gated by DEV_AUTH_BYPASS same as every other real
  // ERP read — locally this resolves to empty arrays (every name shows
  // "—", same degraded-gracefully behavior Setup screens already have),
  // only meaningfully testable on deploy.
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<StudentsTabKey>("list");
  // "create" with a student = resuming a draft (still an unfinished
  // admission — see StudentWizardProps.mode); "edit" = an active student.
  const [wizardState, setWizardState] = useState<
    { mode: "create"; student?: Student; initialStep?: WizardStep } | { mode: "edit"; student: Student } | null
  >(null);
  const [openingStudentId, setOpeningStudentId] = useState<string | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ student: Student; action: StudentStatusPanelAction } | null>(null);
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<Student | null>(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);

  // Command palette's "Add Student" quick action lands here with ?new=1
  // (useSearchIndex.ts) — auto-open the create wizard once, then strip the
  // param so a refresh doesn't re-trigger it (same pattern admin/settings/
  // page.tsx uses for its own ?edit= deep link).
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setWizardState({ mode: "create" });
      router.replace("/admin/students", { scroll: false });
    }
    // Only meant to run once, off the URL present at mount — the deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search/filters/pagination are all server-side: the table only ever
  // holds the page on screen (GET erp/students with page/limit + filters),
  // and the tiles come from GET erp/students/summary. Nothing is fetched
  // in full or filtered/sliced/counted in the browser.
  const listTab: StudentListTabKey = isStudentListTab(activeTab) ? activeTab : "list";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<StudentPageSize>(STUDENTS_PAGE_SIZE_DEFAULT);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  // Class/arm ids belong to one year — drop them when the year changes, or
  // the new year's list would silently filter on the old year's class.
  const [filtersYearId, setFiltersYearId] = useState(selectedYearId);
  if (filtersYearId !== selectedYearId) {
    setFiltersYearId(selectedYearId);
    setFilters((current) => {
      const next = { ...current };
      delete next.class;
      delete next.section_id;
      return next;
    });
  }

  // Back to page 1 whenever what's being paged changes — adjusted during
  // render (not in an effect) so the stale page number is never requested.
  const viewKey = JSON.stringify([selectedYearId, activeTab, debouncedSearch, filters, pageSize]);
  const [pagedViewKey, setPagedViewKey] = useState(viewKey);
  if (pagedViewKey !== viewKey) {
    setPagedViewKey(viewKey);
    setPage(1);
  }

  const listFilters: StudentListFilters = {
    classId: filters.class || undefined,
    sectionId: filters.section_id || undefined,
    mode: filters.mode === "day" || filters.mode === "boarding" ? filters.mode : undefined,
    search: debouncedSearch || undefined,
  };
  const statusFilter = TAB_HAS_STATUS_FILTER[listTab] ? (filters.status as StudentStatus | undefined) : undefined;
  const statuses = statusFilter && TAB_STATUSES[listTab].includes(statusFilter) ? [statusFilter] : TAB_STATUSES[listTab];
  // Drafts span every year; every other tab is scoped to the header's
  // selected year and never fires without one (the backend 422s on a
  // missing academic_year_id; the no-year state below renders instead).
  const listScope: StudentListScope =
    listTab === "drafts" ? { kind: "allYears" } : { kind: "year", academicYearId: selectedYearId ?? "" };
  const scopeKey = listScope.kind === "year" ? listScope.academicYearId : "allYears";
  const pageParams: StudentPageParams = { ...listFilters, statuses, page, limit: pageSize };

  const query = useQuery({
    queryKey: studentsPageQueryKey(listScope, pageParams),
    // throwIfTransient: only network/5xx failures are retried — a 4xx
    // settles immediately.
    queryFn: () => listStudentsPage(listScope, pageParams).then(throwIfTransient),
    enabled: isStudentListTab(activeTab) && (listScope.kind === "allYears" || !!selectedYearId),
    staleTime: STRUCTURAL_STALE_TIME_MS,
    placeholderData: (previous, previousQuery) =>
      isSameListView(previousQuery as Query | undefined, scopeKey, statuses) ? previous : undefined,
  });

  // Tiles: Student List tab only, same year + filters as the list (no
  // status — the summary splits by status itself).
  const summaryQuery = useQuery({
    queryKey: studentsSummaryQueryKey(selectedYearId ?? "", listFilters),
    queryFn: () => getStudentsSummary(selectedYearId ?? "", listFilters).then(throwIfTransient),
    enabled: activeTab === "list" && !!selectedYearId,
    staleTime: STRUCTURAL_STALE_TIME_MS,
    placeholderData: (previous, previousQuery) =>
      isSameListView(previousQuery as Query | undefined, selectedYearId ?? "") ? previous : undefined,
  });
  const summary = summaryQuery.data?.ok ? summaryQuery.data.data : null;

  const hasNoYear = !isYearLoading && !selectedYearId;
  const needsYear = listTab !== "drafts";

  const pageData = query.data?.ok ? query.data.data : null;
  // Server order is the list's order (no client-side sort — this is one page of many).
  const rows: Student[] = pageData?.items ?? [];
  const lastPage = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.limit)) : 1;
  // has_more is authoritative for "is there a next page" even if total disagrees.
  const totalPages = pageData?.hasMore ? Math.max(lastPage, page + 1) : Math.max(lastPage, pageData ? 1 : page);

  // The current page emptied out from under us (e.g. its last row was
  // deleted or changed status) — step back to the real last page.
  if (pageData && !query.isPlaceholderData && rows.length === 0 && page > 1) {
    setPage(Math.min(page - 1, lastPage));
  }

  // A disabled query stays "pending" forever — only count it as loading
  // once there's something to load for.
  const isLoading = (needsYear && isYearLoading) || (query.isPending && (!needsYear || !!selectedYearId));
  const errorMessage = query.isError || (query.data && !query.data.ok) ? t("students.list.loadError") : null;

  // Every class's sections, labelled "Class – Arm" (ids differ per class even when arm names repeat).
  const sectionOptions = sections
    .map((section) => ({
      value: section.id,
      label: t("students.filters.sectionOption", {
        className: resolveClassName(section.class_id, classes),
        armName: section.name,
      }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const comingSoon = () => showToast(t("students.actions.comingSoon"));

  // Resume/Edit always re-fetch the full record (GET /:id) rather than
  // trusting the list row — it's the authoritative copy, and the wizard
  // sends the COMPLETE document back on save, so a stale or partial row
  // would silently overwrite newer data.
  const openStudent = async (row: Student, intent: "resume" | "edit" | "view") => {
    if (openingStudentId) return;
    setOpeningStudentId(row.id);
    const result = await getStudent(row.id);
    setOpeningStudentId(null);
    if (!result.ok) {
      showToast(("message" in result && result.message) || t("students.actions.loadFailed"));
      return;
    }
    if (intent === "resume") {
      // draft_last_step is the cursor the last Save Draft recorded; null
      // (or anything out of range) falls back to step 1.
      setWizardState({ mode: "create", student: result.data, initialStep: clampToWizardStep(result.data.draft_last_step) });
    } else if (intent === "view") {
      setViewStudent(result.data);
    } else {
      setWizardState({ mode: "edit", student: result.data });
    }
  };

  // Search/filters are per-tab: the Status filter's options differ by tab,
  // so a filter carried over from another tab could silently empty the list.
  const handleTabChange = (tab: StudentsTabKey) => {
    setActiveTab(tab);
    setSearch("");
    setDebouncedSearch("");
    setFilters({});
  };

  /** Refetch only the changed student's own year (the one on screen), never every cached year. */
  const invalidateStudentYear = (student: Student) => {
    const yearId = student.academic_year_id ?? selectedYearId;
    if (yearId) queryClient.invalidateQueries({ queryKey: studentsQueryKey(yearId) });
  };

  const handleStatusDone = (message: string) => {
    const student = statusTarget?.student;
    const studentId = student?.id;
    setStatusTarget(null);
    if (student) invalidateStudentYear(student);
    if (studentId) queryClient.invalidateQueries({ queryKey: studentStatusEventsQueryKey(studentId) });
    showToast(message);
  };

  const handleConfirmDeleteDraft = async () => {
    if (!deleteDraftTarget) return;
    const target = deleteDraftTarget;
    setIsDeletingDraft(true);
    const result = await deleteDraftStudent(deleteDraftTarget.id);
    setIsDeletingDraft(false);
    setDeleteDraftTarget(null);
    if (!result.ok) {
      showToast(("message" in result && result.message) || t("students.actions.deleteDraftFailed"));
      return;
    }
    invalidateStudentYear(target);
    queryClient.invalidateQueries({ queryKey: studentsAllYearsQueryKeyRoot });
    showToast(t("students.actions.deleteDraftSucceeded"));
  };

  const filterDefs: FilterDef[] = [
    ...(TAB_HAS_STATUS_FILTER[listTab]
      ? [
          {
            key: "status",
            label: t("students.filters.status"),
            options: [
              { value: "", label: t("students.filters.allStatuses") },
              ...TAB_STATUSES[listTab].map((status) => ({ value: status, label: t(`students.status.${status}`) })),
            ],
          },
        ]
      : []),
    // Class/arm options are the SELECTED year's — Drafts spans every year,
    // so they'd only ever match some of its rows; hidden there.
    ...(listTab !== "drafts"
      ? [
          {
            key: "class",
            label: t("students.filters.class"),
            options: [
              { value: "", label: t("students.filters.allClasses") },
              ...classes.map((cls) => ({ value: cls.id, label: cls.name })),
            ],
          },
          {
            key: "section_id",
            label: t("students.filters.arm"),
            options: [{ value: "", label: t("students.filters.allArms") }, ...sectionOptions],
          },
        ]
      : []),
    // No Boarding House filter: boarding_house_id isn't in the backend
    // schema (mock-only), so there's no server param to send.
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
  // Page size rides in the toolbar's dropdown row (same control as the
  // filters) but is its own state, not a server filter param.
  const pageSizeControl = {
    def: {
      key: "pageSize",
      label: t("students.pageSize.label"),
      options: STUDENT_PAGE_SIZES.map((size) => ({
        value: String(size),
        label: size === "all" ? t("students.pageSize.all") : t("students.pageSize.option", { count: size }),
      })),
    },
    value: String(pageSize),
    onChange: (value: string) => {
      const next = STUDENT_PAGE_SIZES.find((size) => String(size) === value);
      if (next) setPageSize(next);
    },
  };
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

  const columns: ColumnDef<Student>[] = [
    {
      key: "sn",
      header: t("students.columns.sn"),
      render: (_row, index) => (page - 1) * (pageData?.limit ?? 0) + index + 1,
    },
    { key: "admissionNumber", header: t("students.columns.admissionNumber"), render: (row) => row.admission_number ?? "—" },
    { key: "photo", header: t("students.columns.photo"), render: (row) => <StudentAvatar student={row} /> },
    {
      key: "lastName",
      header: t("students.columns.lastName"),
      render: (row) =>
        row.status === "draft" ? (
          <span className="flex items-center gap-2">
            {row.last_name || "—"}
            <span className="rounded-full bg-category-amber-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
              {t("students.badges.draft")}
            </span>
          </span>
        ) : (
          row.last_name
        ),
    },
    { key: "firstName", header: t("students.columns.firstName"), render: (row) => row.first_name },
    { key: "otherNames", header: t("students.columns.otherNames"), render: (row) => row.other_names ?? "—" },
    ...(listTab === "withdrawn"
      ? [{ key: "status", header: t("students.columns.status"), render: (row: Student) => <StudentStatusBadge status={row.status} /> }]
      : []),
    { key: "gender", header: t("students.columns.gender"), render: (row) => t(genderLabelKey(row)) },
    { key: "arm", header: t("students.columns.arm"), render: (row) => resolveArmName(row.class_arm_id, sections) },
    ...(boardingHouseVisible
      ? [
          {
            key: "boardingHouse",
            header: t("students.columns.boardingHouse"),
            render: (row: Student) => resolveBoardingHouseName(row.boarding_house_id),
          },
        ]
      : []),
    {
      key: "siblings",
      header: t("students.columns.siblings"),
      render: (row) =>
        row.sibling_student_ids.length === 0 ? (
          row.sibling_student_ids.length
        ) : (
          <Tooltip
            content={
              <ul className="flex flex-col gap-1">
                {row.sibling_student_ids.map((siblingId) => {
                  // Only this page is loaded — a sibling on another page
                  // (or in another year) shows as unknown.
                  const sibling = rows.find((item) => item.id === siblingId);
                  return (
                    <li key={siblingId}>
                      {sibling
                        ? `${studentFullName(sibling) || "—"} — ${resolveClassName(sibling.class_id, classes)}`
                        : t("students.siblingsTooltip.unknown")}
                    </li>
                  );
                })}
              </ul>
            }
          >
            <span className="underline decoration-dotted underline-offset-2">{row.sibling_student_ids.length}</span>
          </Tooltip>
        ),
    },
    {
      key: "actions",
      header: t("students.columns.actions"),
      render: (row) =>
        row.status === "draft" ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void openStudent(row, "resume")}
              disabled={openingStudentId === row.id}
              className="text-sm font-semibold text-accent hover:underline disabled:opacity-50"
            >
              {t("students.actions.resume")}
            </button>
            <button
              type="button"
              onClick={() => setDeleteDraftTarget(row)}
              className="text-sm font-semibold text-error hover:underline"
            >
              {t("common.delete")}
            </button>
          </div>
        ) : (
          <StudentRowActionsMenu
            student={row}
            onView={() => void openStudent(row, "view")}
            onEdit={() => void openStudent(row, "edit")}
            onStatusAction={(action) => setStatusTarget({ student: row, action })}
            onComingSoon={comingSoon}
          />
        ),
    },
  ];

  const exportColumns: ExportColumn<Student>[] = [
    { header: t("students.columns.admissionNumber"), value: (row) => row.admission_number ?? "" },
    { header: t("students.columns.lastName"), value: (row) => row.last_name },
    { header: t("students.columns.firstName"), value: (row) => row.first_name },
    { header: t("students.columns.otherNames"), value: (row) => row.other_names ?? "" },
    ...(listTab === "withdrawn" ? [{ header: t("students.columns.status"), value: (row: Student) => t(`students.status.${row.status}`) }] : []),
    { header: t("students.columns.gender"), value: (row) => t(genderLabelKey(row)) },
    { header: t("students.columns.class"), value: (row) => resolveClassName(row.class_id, classes) },
    { header: t("students.columns.arm"), value: (row) => resolveArmName(row.class_arm_id, sections) },
    ...(boardingHouseVisible
      ? [{ header: t("students.columns.boardingHouse"), value: (row: Student) => resolveBoardingHouseName(row.boarding_house_id) }]
      : []),
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
  // Export covers exactly what's loaded: the page on screen, or — with the
  // "All" page size — the fully-assembled filtered set (see
  // listStudentsPage), so picking All then exporting exports everything.
  const exportConfig: ExportConfig<Student> = {
    filteredRows: rows,
    allRows: rows,
    columns: exportColumns,
    title: t(`students.tabs.${listTab}`),
    filenamePrefix: "students",
    schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
    periodLabel: selectedYear?.name,
  };

  const comingSoonTitleKey = COMING_SOON_TAB_TITLE_KEYS[activeTab];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StudentsHeader />
      <StudentsTabs activeTab={activeTab} onChange={handleTabChange} />

      {isStudentListTab(activeTab) && needsYear && hasNoYear ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-sm text-text-secondary">{t("students.noYear.message")}</p>
          <Link href="/admin/setup/academic-structure/academic-years" className="text-sm font-semibold text-accent hover:underline">
            {t("students.noYear.linkLabel")}
          </Link>
        </div>
      ) : isStudentListTab(activeTab) ? (
        <>
          {activeTab === "list" ? <StudentsStatCards summary={summary} /> : null}
          <DataTable<Student>
            columns={columns}
            rows={rows}
            getRowId={(row) => row.id}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder={t("students.searchPlaceholder")}
            filters={[...toolbarFilters, pageSizeControl]}
            onAddNew={activeTab === "list" ? () => setWizardState({ mode: "create" }) : undefined}
            addNewLabel={t("students.addNew")}
            extraActions={
              <>
                <ExportMenu config={exportConfig} label={t("students.export.label")} />
                {activeTab === "list" ? <MoreActionsMenu onComingSoon={comingSoon} /> : null}
              </>
            }
            isLoading={isLoading}
            errorMessage={errorMessage}
            onRetry={() => query.refetch()}
            emptyMessage={t(TAB_EMPTY_KEYS[activeTab])}
            page={page}
            totalPages={totalPages}
            onPreviousPage={() => setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        </>
      ) : (
        <StudentsComingSoonTab titleKey={comingSoonTitleKey ?? "students.tabs.list"} />
      )}

      {wizardState ? (
        <StudentWizard
          mode={wizardState.mode}
          initialStudent={wizardState.student}
          initialStep={wizardState.mode === "create" ? wizardState.initialStep : undefined}
          onClose={() => setWizardState(null)}
        />
      ) : null}

      {viewStudent ? (
        <StudentViewPanel
          student={viewStudent}
          classes={classes}
          sections={sections}
          onClose={() => setViewStudent(null)}
          onEdit={() => {
            const target = viewStudent;
            setViewStudent(null);
            setWizardState({ mode: "edit", student: target });
          }}
        />
      ) : null}

      {statusTarget ? (
        <StudentStatusActionPanel
          key={`${statusTarget.student.id}-${statusTarget.action}`}
          student={statusTarget.student}
          action={statusTarget.action}
          onClose={() => setStatusTarget(null)}
          onDone={handleStatusDone}
        />
      ) : null}

      <ConfirmDialog
        isOpen={!!deleteDraftTarget}
        title={t("students.actions.confirmDeleteDraft.title")}
        message={t("students.actions.confirmDeleteDraft.message")}
        isDangerous
        isConfirming={isDeletingDraft}
        onConfirm={() => void handleConfirmDeleteDraft()}
        onCancel={() => setDeleteDraftTarget(null)}
      />
    </div>
  );
}
