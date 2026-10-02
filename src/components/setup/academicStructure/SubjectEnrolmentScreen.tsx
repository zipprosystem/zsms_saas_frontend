"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { useToast } from "@/components/ui/Toast";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import {
  classTermsQueryKey,
  fetchTermsForClass,
  type ClassTerm,
  type TermType,
} from "@/lib/setup/academicStructure/classTermsApi";
import {
  classSubjectsQueryKey,
  fetchClassSubjectsForYear,
  type ClassSubject,
} from "@/lib/setup/academicStructure/classSubjectsApi";
import { subjectsMasterService, type SubjectMaster } from "@/lib/setup/academicStructure/subjectsMasterApi";
import {
  createStudentTermDetailService,
  type StudentTermDetail,
} from "@/lib/setup/academicStructure/studentTermDetailsApi";
import { listStudents, studentsQueryKey } from "@/lib/students/studentsApi";
import type { Student } from "@/lib/students/studentTypes";
import { studentFullName } from "@/lib/students/studentsTableHelpers";
import {
  effectiveSubjectIds,
  getCoreClassSubjectIds,
  listSubjectEnrolments,
  removeSubjectEnrolment,
  setStudentElectives,
  subjectEnrolmentsQueryKey,
  type SubjectEnrolment,
} from "@/lib/setup/academicStructure/subjectEnrolmentApi";
import { StudentSubjectPills } from "@/components/setup/academicStructure/subjectEnrolment/StudentSubjectPills";

// Lazy-loaded — only needed once "Enrol New" is actually clicked, same
// justification as the Add Student wizard (StudentsScreen.tsx).
const EnrolSubjectsModal = dynamic(
  () =>
    import("@/components/setup/academicStructure/subjectEnrolment/EnrolSubjectsModal").then((mod) => ({
      default: mod.EnrolSubjectsModal,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="h-[70vh] w-full max-w-4xl animate-pulse rounded-2xl bg-surface" />
      </div>
    ),
  },
);

const TERM_TYPES: TermType[] = ["First", "Second", "Third"];
type Tab = "perClass" | "perSubject" | "perStudent";

/**
 * Outer guard — same "nothing to show without a year" shape as every other
 * year-scoped Setup screen.
 */
export function SubjectEnrolmentScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.subjectEnrolment.noYear.message")}</p>
        <Link href="/admin/setup/academic-structure/academic-years" className="text-sm font-semibold text-accent hover:underline">
          {t("setup.subjectEnrolment.noYear.linkLabel")}
        </Link>
      </div>
    );
  }

  if (!selectedYearId) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-text-muted">
        {t("setup.dataTable.loading")}
      </div>
    );
  }

  return <SubjectEnrolmentTable yearId={selectedYearId} />;
}

function SubjectEnrolmentTable({ yearId }: { yearId: string }) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTabState] = useState<Tab>("perClass");
  const [termType, setTermType] = useState<TermType>("First");
  const [detailSectionId, setDetailSectionId] = useState<string | null>(null);
  const [detailClassSubjectId, setDetailClassSubjectId] = useState<string | null>(null);
  const [detailStudentId, setDetailStudentId] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [isEnrolOpen, setIsEnrolOpen] = useState(false);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);

  const setTab = (next: Tab) => {
    setTabState(next);
    setDetailSectionId(null);
    setDetailClassSubjectId(null);
    setDetailStudentId(null);
  };

  const classesService = createClassesService(yearId);
  const classesQuery = useQuery({
    queryKey: classesService.queryKey,
    queryFn: () => classesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes: SchoolClass[] = classesQuery.data?.ok ? classesQuery.data.data : [];
  const classesDevBypass = isDevBypassUnavailable(classesQuery.data);

  const schoolTypesQuery = useQuery({
    queryKey: schoolTypesService.queryKey,
    queryFn: () => schoolTypesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const schoolTypes: SchoolType[] = schoolTypesQuery.data?.ok ? schoolTypesQuery.data.data : [];

  const sectionQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: sectionsQueryKey(cls.id),
      queryFn: () => fetchSectionsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });
  const sections: Section[] = sectionQueries.flatMap((query) => (query.data?.ok ? query.data.data.filter((s) => s.is_active) : []));

  const termQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: classTermsQueryKey(cls.id),
      queryFn: () => fetchTermsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });
  const allTerms: ClassTerm[] = termQueries.flatMap((query) => (query.data?.ok ? query.data.data : []));
  const devBypassActive =
    classesDevBypass ||
    (classes.length > 0 && sectionQueries.some((q) => isDevBypassUnavailable(q.data))) ||
    (classes.length > 0 && termQueries.some((q) => isDevBypassUnavailable(q.data)));

  const classSubjectsQuery = useQuery({
    queryKey: classSubjectsQueryKey(yearId),
    queryFn: () => fetchClassSubjectsForYear(yearId).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classSubjects: ClassSubject[] = classSubjectsQuery.data?.ok ? classSubjectsQuery.data.data : [];

  const subjectsMasterQuery = useQuery({
    queryKey: subjectsMasterService.queryKey,
    queryFn: () => subjectsMasterService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const subjectsMaster: SubjectMaster[] = subjectsMasterQuery.data?.ok ? subjectsMasterQuery.data.data : [];

  const termDetailService = createStudentTermDetailService(yearId);
  const termDetailsQuery = useQuery({
    queryKey: termDetailService.queryKey,
    queryFn: () => termDetailService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const termDetails: StudentTermDetail[] = termDetailsQuery.data?.ok ? termDetailsQuery.data.data : [];

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: () => listStudents(),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const students: Student[] = studentsQuery.data?.ok ? studentsQuery.data.data : [];

  const enrolmentsQuery = useQuery({
    queryKey: subjectEnrolmentsQueryKey(yearId),
    queryFn: () => listSubjectEnrolments(yearId),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const enrolments: SubjectEnrolment[] = enrolmentsQuery.data?.ok ? enrolmentsQuery.data.data : [];

  const classById = (id: string): SchoolClass | null => classes.find((cls) => cls.id === id) ?? null;
  const schoolTypeById = (id: string): SchoolType | null => schoolTypes.find((type) => type.id === id) ?? null;
  const sectionById = (id: string): Section | null => sections.find((section) => section.id === id) ?? null;
  const studentById = (id: string): Student | null => students.find((student) => student.id === id) ?? null;
  const subjectName = (classSubject: ClassSubject): string =>
    subjectsMaster.find((s) => s.id === classSubject.subject_master_id)?.name ?? "—";
  const schoolTypeNameForClass = (classId: string): string => {
    const schoolTypeId = classById(classId)?.school_type_id;
    return (schoolTypeId && schoolTypeById(schoolTypeId)?.name) || "—";
  };

  const termTypeLabel = (type: TermType) => t(`setup.classTerms.termType.${type.toLowerCase()}`);
  const termIdsForType = allTerms.filter((term) => term.term_type === termType).map((term) => term.id);
  const termDetailsInScope = termDetails.filter((row) => termIdsForType.includes(row.class_term_id));

  const handleToggleElective = async (row: StudentTermDetail, classSubjectId: string) => {
    const key = `${row.student_id}:${row.class_term_id}`;
    setMutatingKey(key);
    const currentElectiveIds = enrolments
      .filter((row2) => row2.student_id === row.student_id && row2.class_term_id === row.class_term_id)
      .map((row2) => row2.class_subject_id);
    const desired = currentElectiveIds.includes(classSubjectId)
      ? currentElectiveIds.filter((id) => id !== classSubjectId)
      : [...currentElectiveIds, classSubjectId];
    const result = await setStudentElectives(yearId, row.student_id, row.class_term_id, row.section_id, desired);
    setMutatingKey(null);
    if (!result.ok) {
      showToast(t("setup.subjectEnrolment.toggleFailed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: subjectEnrolmentsQueryKey(yearId) });
  };

  const handleRemoveEnrolment = async (enrolmentId: string) => {
    setMutatingKey(enrolmentId);
    const result = await removeSubjectEnrolment(enrolmentId);
    setMutatingKey(null);
    if (!result.ok) {
      showToast(t("setup.subjectEnrolment.toggleFailed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: subjectEnrolmentsQueryKey(yearId) });
  };

  const renderStudentRowPills = (row: StudentTermDetail) => {
    const coreNames = getCoreClassSubjectIds(row.class_id, classSubjects).map((id) => {
      const cs = classSubjects.find((c) => c.id === id);
      return cs ? subjectName(cs) : "—";
    });
    const electiveOptions = classSubjects
      .filter((cs) => cs.class_id === row.class_id && cs.subject_group === "Elective")
      .map((cs) => ({
        id: cs.id,
        name: subjectName(cs),
        enrolled: enrolments.some(
          (e) => e.student_id === row.student_id && e.class_term_id === row.class_term_id && e.class_subject_id === cs.id,
        ),
      }));
    return (
      <StudentSubjectPills
        coreNames={coreNames}
        electives={electiveOptions}
        onToggleElective={(classSubjectId) => void handleToggleElective(row, classSubjectId)}
        disabled={mutatingKey === `${row.student_id}:${row.class_term_id}`}
      />
    );
  };

  // ---- Per Class ----
  const sectionsInScope = sections.filter((section) =>
    allTerms.some((term) => term.class_id === section.class_id && term.term_type === termType),
  );
  const classCardStats = sectionsInScope.map((section) => {
    const rows = termDetailsInScope.filter((row) => row.section_id === section.id);
    const subjectIds = new Set<string>();
    rows.forEach((row) => effectiveSubjectIds(row.student_id, row.class_id, row.class_term_id, classSubjects, enrolments).forEach((id) => subjectIds.add(id)));
    return { section, studentCount: rows.length, subjectCount: subjectIds.size };
  });

  const perClassExportColumns: ExportColumn<(typeof classCardStats)[number]>[] = [
    { header: t("setup.subjectEnrolment.columns.class"), value: (row) => classById(row.section.class_id)?.name ?? "" },
    { header: t("setup.subjectEnrolment.columns.arm"), value: (row) => row.section.name },
    { header: t("setup.subjectEnrolment.columns.schoolType"), value: (row) => schoolTypeNameForClass(row.section.class_id) },
    { header: t("setup.subjectEnrolment.columns.studentCount"), value: (row) => row.studentCount },
    { header: t("setup.subjectEnrolment.columns.subjectCount"), value: (row) => row.subjectCount },
  ];
  const perClassExportConfig: ExportConfig<(typeof classCardStats)[number]> = {
    filteredRows: classCardStats,
    allRows: classCardStats,
    columns: perClassExportColumns,
    title: t("setup.subjectEnrolment.tabs.perClass"),
    filenamePrefix: "subject-enrolment-per-class",
    schoolName: "ZSMS",
    periodLabel: termTypeLabel(termType),
  };

  // ---- Per Subject ----
  const classSubjectsInScope = classSubjects
    .filter((cs) => allTerms.some((term) => term.class_id === cs.class_id && term.term_type === termType))
    .filter((cs) => {
      if (!subjectSearch.trim()) return true;
      const needle = subjectSearch.trim().toLowerCase();
      return subjectName(cs).toLowerCase().includes(needle) || (classById(cs.class_id)?.name ?? "").toLowerCase().includes(needle);
    });
  const enrolledCountForClassSubject = (cs: ClassSubject): number =>
    cs.subject_group === "Core"
      ? termDetailsInScope.filter((row) => row.class_id === cs.class_id).length
      : enrolments.filter((e) => e.class_subject_id === cs.id && termIdsForType.includes(e.class_term_id)).length;

  const perSubjectExportColumns: ExportColumn<ClassSubject>[] = [
    { header: t("setup.subjectEnrolment.columns.class"), value: (cs) => classById(cs.class_id)?.name ?? "" },
    { header: t("setup.subjectEnrolment.columns.subject"), value: (cs) => subjectName(cs) },
    { header: t("setup.subjectEnrolment.columns.group"), value: (cs) => cs.subject_group },
    { header: t("setup.subjectEnrolment.columns.enrolledCount"), value: (cs) => enrolledCountForClassSubject(cs) },
  ];
  const perSubjectExportConfig: ExportConfig<ClassSubject> = {
    filteredRows: classSubjectsInScope,
    allRows: classSubjectsInScope,
    columns: perSubjectExportColumns,
    title: t("setup.subjectEnrolment.tabs.perSubject"),
    filenamePrefix: "subject-enrolment-per-subject",
    schoolName: "ZSMS",
    periodLabel: termTypeLabel(termType),
  };

  // ---- Per Student ----
  const perStudentRows = termDetailsInScope
    .map((row) => ({ row, student: studentById(row.student_id) }))
    .filter((entry): entry is { row: StudentTermDetail; student: Student } => !!entry.student && entry.student.status === "active")
    .filter((entry) => {
      if (!studentSearch.trim()) return true;
      const needle = studentSearch.trim().toLowerCase();
      return (
        studentFullName(entry.student).toLowerCase().includes(needle) ||
        (entry.student.admission_number?.toLowerCase().includes(needle) ?? false)
      );
    });

  const perStudentExportColumns: ExportColumn<(typeof perStudentRows)[number]>[] = [
    { header: t("setup.subjectEnrolment.columns.student"), value: (entry) => studentFullName(entry.student) },
    { header: t("setup.subjectEnrolment.columns.class"), value: (entry) => classById(entry.row.class_id)?.name ?? "" },
    { header: t("setup.subjectEnrolment.columns.arm"), value: (entry) => sectionById(entry.row.section_id)?.name ?? "" },
    {
      header: t("setup.subjectEnrolment.columns.subjectCount"),
      value: (entry) => effectiveSubjectIds(entry.student.id, entry.row.class_id, entry.row.class_term_id, classSubjects, enrolments).length,
    },
  ];
  const perStudentExportConfig: ExportConfig<(typeof perStudentRows)[number]> = {
    filteredRows: perStudentRows,
    allRows: perStudentRows,
    columns: perStudentExportColumns,
    title: t("setup.subjectEnrolment.tabs.perStudent"),
    filenamePrefix: "subject-enrolment-per-student",
    schoolName: "ZSMS",
    periodLabel: termTypeLabel(termType),
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-primary">{t("setup.subjectEnrolment.title")}</h1>
        <p className="text-sm text-text-secondary">{t("setup.subjectEnrolment.subtitle")}</p>
      </div>

      {devBypassActive ? <p className="text-xs text-text-muted">{t("setup.subjectEnrolment.devBypassNotice")}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {(
            [
              ["perClass", t("setup.subjectEnrolment.tabs.perClass")],
              ["perSubject", t("setup.subjectEnrolment.tabs.perSubject")],
              ["perStudent", t("setup.subjectEnrolment.tabs.perStudent")],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === key ? "bg-accent text-white" : "text-text-secondary hover:bg-background"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            value={termType}
            onChange={(event) => {
              setTermType(event.target.value as TermType);
              setDetailSectionId(null);
              setDetailClassSubjectId(null);
              setDetailStudentId(null);
            }}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {TERM_TYPES.map((type) => (
              <option key={type} value={type}>
                {termTypeLabel(type)}
              </option>
            ))}
          </select>
          {tab === "perClass" ? <ExportMenu config={perClassExportConfig} label={t("setup.export.label")} /> : null}
          {tab === "perSubject" ? <ExportMenu config={perSubjectExportConfig} label={t("setup.export.label")} /> : null}
          {tab === "perStudent" ? <ExportMenu config={perStudentExportConfig} label={t("setup.export.label")} /> : null}
          <Button type="button" onClick={() => setIsEnrolOpen(true)} className="px-4 text-sm">
            {t("setup.subjectEnrolment.enrolNew")}
          </Button>
        </div>
      </div>

      {tab === "perClass" ? (
        detailSectionId ? (
          (() => {
            const section = sectionById(detailSectionId);
            const rows = termDetailsInScope.filter((row) => row.section_id === detailSectionId);
            return (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-text-primary">
                    {classById(section?.class_id ?? "")?.name} {section?.name}
                  </h2>
                  <button type="button" onClick={() => setDetailSectionId(null)} className="text-sm font-semibold text-accent hover:underline">
                    {t("setup.subjectEnrolment.backToGrid")}
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted">{t("setup.subjectEnrolment.emptyDetails")}</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {rows.map((row) => {
                      const student = studentById(row.student_id);
                      return (
                        <div key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-sm font-medium text-text-primary">{student ? studentFullName(student) : "—"}</span>
                          {renderStudentRowPills(row)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classCardStats.length === 0 ? (
              <p className="text-sm text-text-muted">{t("setup.subjectEnrolment.empty")}</p>
            ) : (
              classCardStats.map(({ section, studentCount, subjectCount }) => (
                <div key={section.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
                  <p className="text-sm font-semibold text-text-primary">
                    {classById(section.class_id)?.name} {section.name}
                  </p>
                  <p className="text-xs text-text-muted">{schoolTypeNameForClass(section.class_id)}</p>
                  <p className="text-sm text-text-secondary">
                    {t("setup.subjectEnrolment.cardStats", { students: studentCount, subjects: subjectCount })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDetailSectionId(section.id)}
                    className="mt-1 self-start text-sm font-semibold text-accent hover:underline"
                  >
                    {t("setup.subjectEnrolment.viewDetails")}
                  </button>
                </div>
              ))
            )}
          </div>
        )
      ) : null}

      {tab === "perSubject" ? (
        detailClassSubjectId ? (
          (() => {
            const cs = classSubjects.find((c) => c.id === detailClassSubjectId);
            if (!cs) return null;
            const rows =
              cs.subject_group === "Core"
                ? termDetailsInScope.filter((row) => row.class_id === cs.class_id)
                : termDetailsInScope.filter(
                    (row) =>
                      row.class_id === cs.class_id &&
                      enrolments.some((e) => e.student_id === row.student_id && e.class_term_id === row.class_term_id && e.class_subject_id === cs.id),
                  );
            return (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-text-primary">
                    {classById(cs.class_id)?.name} — {subjectName(cs)}
                  </h2>
                  <button type="button" onClick={() => setDetailClassSubjectId(null)} className="text-sm font-semibold text-accent hover:underline">
                    {t("setup.subjectEnrolment.backToList")}
                  </button>
                </div>
                {cs.subject_group === "Core" ? <p className="text-xs text-text-muted">{t("setup.subjectEnrolment.coreReadOnlyNote")}</p> : null}
                {rows.length === 0 ? (
                  <p className="text-sm text-text-muted">{t("setup.subjectEnrolment.emptyDetails")}</p>
                ) : (
                  <div className="flex flex-col divide-y divide-border">
                    {rows.map((row) => {
                      const student = studentById(row.student_id);
                      const enrolment = enrolments.find(
                        (e) => e.student_id === row.student_id && e.class_term_id === row.class_term_id && e.class_subject_id === cs.id,
                      );
                      return (
                        <div key={row.id} className="flex items-center justify-between py-3">
                          <span className="text-sm text-text-primary">
                            {student ? studentFullName(student) : "—"}{" "}
                            <span className="text-xs text-text-muted">({sectionById(row.section_id)?.name ?? "—"})</span>
                          </span>
                          {cs.subject_group === "Elective" && enrolment ? (
                            <button
                              type="button"
                              disabled={mutatingKey === enrolment.id}
                              onClick={() => void handleRemoveEnrolment(enrolment.id)}
                              className="text-sm font-semibold text-error hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {t("common.delete")}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={subjectSearch}
              onChange={(event) => setSubjectSearch(event.target.value)}
              placeholder={t("setup.subjectEnrolment.subjectSearchPlaceholder")}
              className="h-10 w-full max-w-sm rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {classSubjectsInScope.length === 0 ? (
              <p className="text-sm text-text-muted">{t("setup.subjectEnrolment.empty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-text-muted">
                    <tr>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.class")}</th>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.subject")}</th>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.group")}</th>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.enrolledCount")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {classSubjectsInScope.map((cs) => (
                      <tr key={cs.id}>
                        <td className="px-4 py-3">{classById(cs.class_id)?.name ?? "—"}</td>
                        <td className="px-4 py-3">{subjectName(cs)}</td>
                        <td className="px-4 py-3">
                          {cs.subject_group === "Core" ? t("setup.subjectEnrolment.core") : t("setup.subjectEnrolment.elective")}
                        </td>
                        <td className="px-4 py-3">{enrolledCountForClassSubject(cs)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDetailClassSubjectId(cs.id)}
                            className="text-sm font-semibold text-accent hover:underline"
                          >
                            {t("setup.subjectEnrolment.viewDetails")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      ) : null}

      {tab === "perStudent" ? (
        detailStudentId ? (
          (() => {
            const row = termDetailsInScope.find((r) => r.student_id === detailStudentId);
            const student = studentById(detailStudentId);
            if (!row || !student) return null;
            return (
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-text-primary">{studentFullName(student)}</h2>
                  <button type="button" onClick={() => setDetailStudentId(null)} className="text-sm font-semibold text-accent hover:underline">
                    {t("setup.subjectEnrolment.backToList")}
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  {classById(row.class_id)?.name} {sectionById(row.section_id)?.name}
                </p>
                {renderStudentRowPills(row)}
              </div>
            );
          })()
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder={t("setup.subjectEnrolment.studentSearchPlaceholder")}
              className="h-10 w-full max-w-sm rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {perStudentRows.length === 0 ? (
              <p className="text-sm text-text-muted">{t("setup.subjectEnrolment.empty")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-text-muted">
                    <tr>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.student")}</th>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.class")}</th>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.arm")}</th>
                      <th className="px-4 py-3">{t("setup.subjectEnrolment.columns.subjectCount")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {perStudentRows.map(({ row, student }) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3">{studentFullName(student)}</td>
                        <td className="px-4 py-3">{classById(row.class_id)?.name ?? "—"}</td>
                        <td className="px-4 py-3">{sectionById(row.section_id)?.name ?? "—"}</td>
                        <td className="px-4 py-3">{effectiveSubjectIds(student.id, row.class_id, row.class_term_id, classSubjects, enrolments).length}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDetailStudentId(student.id)}
                            className="text-sm font-semibold text-accent hover:underline"
                          >
                            {t("setup.subjectEnrolment.viewDetails")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      ) : null}

      {isEnrolOpen ? <EnrolSubjectsModal yearId={yearId} termType={termType} onClose={() => setIsEnrolOpen(false)} /> : null}
    </div>
  );
}
