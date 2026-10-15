"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS, TransientQueryError } from "@/lib/queryClient";
import { PAGE_SIZE, usePaginatedView } from "@/lib/setup/usePaginatedView";
import { throwIfTransient, type ColumnDef, type FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import {
  deleteDraftStudent,
  getStudent,
  listStudents,
  studentStatusEventsQueryKey,
  studentsQueryKey,
} from "@/lib/students/studentsApi";
import type { Student } from "@/lib/students/studentTypes";
import { clampToWizardStep, type WizardStep } from "@/components/students/wizard/WizardStepper";
import { MOCK_BOARDING_HOUSES } from "@/lib/students/studentsMockData";
import {
  genderLabelKey,
  isBoardingHouseVisible,
  isWithdrawnGroup,
  matchesStudentFilters,
  matchesStudentSearch,
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
};

/** The three tabs that are real lists over the same loaded student set, each its own slice by status. */
type StudentListTabKey = "list" | "withdrawn" | "graduate";

function isStudentListTab(tab: StudentsTabKey): tab is StudentListTabKey {
  return tab === "list" || tab === "withdrawn" || tab === "graduate";
}

/**
 * Student List = active + draft (drafts have no tab of their own, so they
 * surface here with a badge and Resume/Delete instead of the menu).
 * Withdrawn = withdrawn + suspended + expelled (one Withdraw flow, told
 * apart by the Status column). Graduate = graduated.
 */
const TAB_ROW_FILTERS: Record<StudentListTabKey, (student: Student) => boolean> = {
  list: (student) => student.status === "active" || student.status === "draft",
  withdrawn: isWithdrawnGroup,
  graduate: (student) => student.status === "graduated",
};

/** Status filter choices per tab — Graduate has a single status, so no filter. */
const TAB_STATUS_FILTER_OPTIONS: Record<StudentListTabKey, Student["status"][]> = {
  list: ["active", "draft"],
  withdrawn: ["withdrawn", "suspended", "expelled"],
  graduate: [],
};

const TAB_EMPTY_KEYS: Record<StudentListTabKey, string> = {
  list: "students.empty",
  withdrawn: "students.emptyWithdrawn",
  graduate: "students.emptyGraduate",
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
  const { selectedYear, selectedYearId, activeYear } = useAcademicYear();
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
  const listTab: StudentListTabKey = isStudentListTab(activeTab) ? activeTab : "list";
  // Each list tab is a status slice of the same loaded set (TAB_ROW_FILTERS).
  // No sortable columns exist on this table (DataTable has no column-sort
  // mechanism), so "most recently added at the top" is simply the list's
  // one and only order — newest created_at first.
  const visibleStudents = allItems
    .filter(TAB_ROW_FILTERS[listTab])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const isLoading = query.isPending;
  const errorMessage = query.isError ? t("students.list.loadError") : null;

  const view = usePaginatedView(visibleStudents, {
    matchesSearch: matchesStudentSearch,
    matchesFilters: (student, filters) => matchesStudentFilters(student, filters, sections),
  });

  const armNames = Array.from(new Set(sections.map((section) => section.name))).sort();
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
    view.setSearch("");
    view.setFilters({});
  };

  const handleStatusDone = (message: string) => {
    const studentId = statusTarget?.student.id;
    setStatusTarget(null);
    queryClient.invalidateQueries({ queryKey: studentsQueryKey });
    if (studentId) queryClient.invalidateQueries({ queryKey: studentStatusEventsQueryKey(studentId) });
    showToast(message);
  };

  const handleConfirmDeleteDraft = async () => {
    if (!deleteDraftTarget) return;
    setIsDeletingDraft(true);
    const result = await deleteDraftStudent(deleteDraftTarget.id);
    setIsDeletingDraft(false);
    setDeleteDraftTarget(null);
    if (!result.ok) {
      showToast(("message" in result && result.message) || t("students.actions.deleteDraftFailed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: studentsQueryKey });
    showToast(t("students.actions.deleteDraftSucceeded"));
  };

  const statusFilterOptions = TAB_STATUS_FILTER_OPTIONS[listTab];
  const filterDefs: FilterDef[] = [
    ...(statusFilterOptions.length > 0
      ? [
          {
            key: "status",
            label: t("students.filters.status"),
            options: [
              { value: "", label: t("students.filters.allStatuses") },
              ...statusFilterOptions.map((status) => ({ value: status, label: t(`students.status.${status}`) })),
            ],
          },
        ]
      : []),
    {
      key: "class",
      label: t("students.filters.class"),
      options: [
        { value: "", label: t("students.filters.allClasses") },
        ...classes.map((cls) => ({ value: cls.id, label: cls.name })),
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
    ...(boardingHouseVisible
      ? [
          {
            key: "boardingHouse",
            label: t("students.filters.boardingHouse"),
            options: [
              { value: "", label: t("students.filters.allBoardingHouses") },
              ...MOCK_BOARDING_HOUSES.map((house) => ({ value: house.id, label: house.name })),
            ],
          },
        ]
      : []),
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
                  const sibling = allItems.find((item) => item.id === siblingId);
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
  const exportConfig: ExportConfig<Student> = {
    filteredRows: view.filteredItems,
    allRows: visibleStudents,
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

      {isStudentListTab(activeTab) ? (
        <>
          {activeTab === "list" ? <StudentsStatCards students={allItems} /> : null}
          <DataTable<Student>
            columns={columns}
            rows={view.items}
            getRowId={(row) => row.id}
            searchValue={view.search}
            onSearchChange={view.setSearch}
            searchPlaceholder={t("students.searchPlaceholder")}
            filters={filters}
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
            page={view.page}
            totalPages={view.totalPages}
            onPreviousPage={() => view.setPage((p) => Math.max(1, p - 1))}
            onNextPage={() => view.setPage((p) => Math.min(view.totalPages, p + 1))}
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
