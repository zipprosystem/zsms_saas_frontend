"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS, TransientQueryError } from "@/lib/queryClient";
import { PAGE_SIZE, usePaginatedView } from "@/lib/setup/usePaginatedView";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { deleteDraftStudent, listStudents, setStudentStatus, studentsQueryKey } from "@/lib/students/studentsApi";
import type { Student } from "@/lib/students/studentTypes";
import { clampToWizardStep, type WizardStep } from "@/components/students/wizard/WizardStepper";
import { MOCK_BOARDING_HOUSES, MOCK_CLASSES, MOCK_CLASS_ARMS } from "@/lib/students/studentsMockData";
import {
  genderLabelKey,
  isBoardingHouseVisible,
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
  const { selectedYear, activeYear } = useAcademicYear();
  // Defaults to "both" (nothing hidden) while loading or if the real API
  // doesn't send school_mode yet — see academicYearsApi.ts's normalization.
  const boardingHouseVisible = isBoardingHouseVisible(activeYear?.school_mode ?? "both");
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<StudentsTabKey>("list");
  const [wizardState, setWizardState] = useState<
    { mode: "create" } | { mode: "edit"; student: Student; initialStep?: WizardStep } | null
  >(null);
  const [withdrawTarget, setWithdrawTarget] = useState<Student | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
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
  // Student List tab is active + draft — withdrawn/suspended/expelled/
  // graduated students live on the Withdrawn/Graduate tabs instead (both
  // placeholders in this commit; see COMING_SOON_TAB_TITLE_KEYS). Drafts
  // have nowhere else to surface (no "Drafts" tab exists), so they stay
  // visible here, marked with a small badge, with a Resume-only action
  // replacing the normal menu for that row — see the "actions" column and
  // the Last Name column below.
  const visibleStudents = allItems.filter((student) => student.status === "active" || student.status === "draft");

  const isLoading = query.isPending;
  const errorMessage = query.isError ? t("students.list.loadError") : null;

  const view = usePaginatedView(visibleStudents, {
    matchesSearch: matchesStudentSearch,
    matchesFilters: matchesStudentFilters,
  });

  const armNames = Array.from(new Set(MOCK_CLASS_ARMS.map((arm) => arm.name))).sort();
  const comingSoon = () => showToast(t("students.actions.comingSoon"));

  const handleResume = (student: Student) => {
    setWizardState({ mode: "edit", student, initialStep: clampToWizardStep(student.draft_last_step) });
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawTarget) return;
    setIsWithdrawing(true);
    const result = await setStudentStatus(withdrawTarget.id, "withdrawn");
    setIsWithdrawing(false);
    setWithdrawTarget(null);
    if (!result.ok) {
      showToast(t("students.actions.withdrawFailed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: studentsQueryKey });
    showToast(t("students.actions.withdrawSucceeded", { name: result.data.first_name }));
  };

  const handleConfirmDeleteDraft = async () => {
    if (!deleteDraftTarget) return;
    setIsDeletingDraft(true);
    const result = await deleteDraftStudent(deleteDraftTarget.id);
    setIsDeletingDraft(false);
    setDeleteDraftTarget(null);
    if (!result.ok) {
      showToast(t("students.actions.deleteDraftFailed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: studentsQueryKey });
    showToast(t("students.actions.deleteDraftSucceeded"));
  };

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
            <span className="rounded-full bg-accent-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
              {t("students.badges.draft")}
            </span>
          </span>
        ) : (
          row.last_name
        ),
    },
    { key: "firstName", header: t("students.columns.firstName"), render: (row) => row.first_name },
    { key: "otherNames", header: t("students.columns.otherNames"), render: (row) => row.other_names ?? "—" },
    { key: "gender", header: t("students.columns.gender"), render: (row) => t(genderLabelKey(row)) },
    { key: "arm", header: t("students.columns.arm"), render: (row) => resolveArmName(row.class_arm_id) },
    ...(boardingHouseVisible
      ? [
          {
            key: "boardingHouse",
            header: t("students.columns.boardingHouse"),
            render: (row: Student) => resolveBoardingHouseName(row.boarding_house_id),
          },
        ]
      : []),
    { key: "siblings", header: t("students.columns.siblings"), render: (row) => row.sibling_student_ids.length },
    {
      key: "actions",
      header: t("students.columns.actions"),
      render: (row) =>
        row.status === "draft" ? (
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => handleResume(row)} className="text-sm font-semibold text-accent hover:underline">
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
            onEdit={() => setWizardState({ mode: "edit", student: row })}
            onWithdraw={() => setWithdrawTarget(row)}
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
    { header: t("students.columns.gender"), value: (row) => t(genderLabelKey(row)) },
    { header: t("students.columns.class"), value: (row) => resolveClassName(row.class_id) },
    { header: t("students.columns.arm"), value: (row) => resolveArmName(row.class_arm_id) },
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
            onAddNew={() => setWizardState({ mode: "create" })}
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

      {wizardState ? (
        <StudentWizard
          mode={wizardState.mode}
          initialStudent={wizardState.mode === "edit" ? wizardState.student : undefined}
          initialStep={wizardState.mode === "edit" ? wizardState.initialStep : undefined}
          onClose={() => setWizardState(null)}
        />
      ) : null}

      <ConfirmDialog
        isOpen={!!withdrawTarget}
        title={t("students.actions.confirmWithdraw.title")}
        message={t("students.actions.confirmWithdraw.message", { name: withdrawTarget ? `${withdrawTarget.first_name} ${withdrawTarget.last_name}` : "" })}
        isDangerous
        isConfirming={isWithdrawing}
        onConfirm={() => void handleConfirmWithdraw()}
        onCancel={() => setWithdrawTarget(null)}
      />

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
