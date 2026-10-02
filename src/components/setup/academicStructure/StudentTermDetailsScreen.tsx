"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueries, useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/SearchableSelect";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient, type ColumnDef, type FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import {
  fetchTermsForClass,
  classTermsQueryKey,
  findActiveClassTerm,
  type ClassTerm,
  type TermType,
} from "@/lib/setup/academicStructure/classTermsApi";
import {
  createStudentTermDetailService,
  type StudentTermDetail,
  type StudentTermDetailInput,
} from "@/lib/setup/academicStructure/studentTermDetailsApi";
import { listStudents, studentsQueryKey } from "@/lib/students/studentsApi";
import type { Student } from "@/lib/students/studentTypes";
import { studentFullName } from "@/lib/students/studentsTableHelpers";
import { MOCK_HOUSES } from "@/lib/students/studentsMockData";

type FormState = {
  class_id: string;
  class_term_id: string;
  section_id: string;
  student_id: string;
  house_id: string;
  seat_number: string;
  roll_no: string;
  remark: string;
};

const EMPTY_FORM: FormState = {
  class_id: "",
  class_term_id: "",
  section_id: "",
  student_id: "",
  house_id: "",
  seat_number: "",
  roll_no: "",
  remark: "",
};

const TERM_TYPES: TermType[] = ["First", "Second", "Third"];

/**
 * Outer guard — a term-detail always belongs to a class (via class_term_id),
 * which always belongs to an academic year — same "nothing to show without
 * a year" shape as every other year-scoped Setup screen.
 */
export function StudentTermDetailsScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.studentTermDetails.noYear.message")}</p>
        <Link
          href="/admin/setup/academic-structure/academic-years"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {t("setup.studentTermDetails.noYear.linkLabel")}
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

  return <StudentTermDetailsTable yearId={selectedYearId} />;
}

function StudentTermDetailsTable({ yearId }: { yearId: string }) {
  const t = useTranslations();
  const { selectedYear } = useAcademicYear();

  const classesService = createClassesService(yearId);
  const classesQuery = useQuery({
    queryKey: classesService.queryKey,
    queryFn: () => classesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes: SchoolClass[] = classesQuery.data?.ok ? classesQuery.data.data : [];
  const activeClasses = classes.filter((cls) => cls.is_active);
  const classesDevBypass = isDevBypassUnavailable(classesQuery.data);

  const schoolTypesQuery = useQuery({
    queryKey: schoolTypesService.queryKey,
    queryFn: () => schoolTypesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const schoolTypes: SchoolType[] = schoolTypesQuery.data?.ok ? schoolTypesQuery.data.data : [];

  // Fanned out across EVERY class (active + inactive — an existing row on a
  // since-deactivated class should still display), one query per class,
  // same shape as ClassArmsScreen/ClassTermsScreen/setupProgress.ts. Lenient
  // merge (flatMap over whichever succeeded) rather than "any failure blanks
  // everything" — this feeds display lookups/form cascades, not the row-
  // owning list itself, so a single class's fetch failing just shows "—"
  // for that class's rows rather than hiding the whole table.
  const sectionQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: sectionsQueryKey(cls.id),
      queryFn: () => fetchSectionsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });
  const sections: Section[] = sectionQueries.flatMap((query) => (query.data?.ok ? query.data.data : []));
  const sectionsDevBypass = classes.length > 0 && sectionQueries.some((query) => isDevBypassUnavailable(query.data));

  const termQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: classTermsQueryKey(cls.id),
      queryFn: () => fetchTermsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });
  const allTerms: ClassTerm[] = termQueries.flatMap((query) => (query.data?.ok ? query.data.data : []));
  const termsDevBypass = classes.length > 0 && termQueries.some((query) => isDevBypassUnavailable(query.data));

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: () => listStudents(),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const students: Student[] = studentsQuery.data?.ok ? studentsQuery.data.data : [];
  const activeStudents = students.filter((student) => student.status === "active");

  const service = useMemo(() => createStudentTermDetailService(yearId), [yearId]);
  // Shares react-query's own cache for `service.queryKey` with CrudScreen's
  // internal list query below (setupProgress.ts documents this same
  // "select runs per-observer against one shared cache entry" pattern) — no
  // extra fetch, just a second read of the same data for the create form's
  // "student not already in this term" check.
  const termDetailsQuery = useQuery({
    queryKey: service.queryKey,
    queryFn: () => service.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const termDetails: StudentTermDetail[] = termDetailsQuery.data?.ok ? termDetailsQuery.data.data : [];

  const classById = (id: string): SchoolClass | null => classes.find((cls) => cls.id === id) ?? null;
  const schoolTypeById = (id: string): SchoolType | null => schoolTypes.find((type) => type.id === id) ?? null;
  const sectionById = (id: string): Section | null => sections.find((section) => section.id === id) ?? null;
  const termById = (id: string): ClassTerm | null => allTerms.find((term) => term.id === id) ?? null;
  const studentById = (id: string): Student | null => students.find((student) => student.id === id) ?? null;
  const houseById = (id: string | null): { id: string; name: string } | null =>
    id ? (MOCK_HOUSES.find((house) => house.id === id) ?? null) : null;

  const termTypeLabel = (type: TermType) => t(`setup.classTerms.termType.${type.toLowerCase()}`);
  const termLabel = (term: ClassTerm): string => `${term.term_name} · ${termTypeLabel(term.term_type)}`;
  const studentName = (row: StudentTermDetail): string => {
    const student = studentById(row.student_id);
    return student ? studentFullName(student) || "—" : "—";
  };
  const schoolTypeName = (row: StudentTermDetail): string => {
    const schoolTypeId = classById(row.class_id)?.school_type_id;
    return (schoolTypeId && schoolTypeById(schoolTypeId)?.name) || "—";
  };

  const armNames = Array.from(new Set(sections.map((section) => section.name))).sort();

  const filterDefs: FilterDef[] = [
    {
      key: "term",
      label: t("setup.studentTermDetails.filters.term"),
      options: [
        { value: "", label: t("setup.studentTermDetails.filters.allTerms") },
        ...TERM_TYPES.map((type) => ({ value: type, label: termTypeLabel(type) })),
      ],
    },
    {
      key: "class",
      label: t("setup.studentTermDetails.filters.class"),
      options: [
        { value: "", label: t("setup.studentTermDetails.filters.allClasses") },
        ...classes.map((cls) => ({ value: cls.id, label: cls.name })),
      ],
    },
    {
      key: "arm",
      label: t("setup.studentTermDetails.filters.arm"),
      options: [
        { value: "", label: t("setup.studentTermDetails.filters.allArms") },
        ...armNames.map((name) => ({ value: name, label: name })),
      ],
    },
  ];

  const columns: ColumnDef<StudentTermDetail>[] = [
    { key: "student", header: t("setup.studentTermDetails.columns.student"), render: (row) => studentName(row) },
    { key: "schoolType", header: t("setup.studentTermDetails.columns.schoolType"), render: (row) => schoolTypeName(row) },
    {
      key: "classTerm",
      header: t("setup.studentTermDetails.columns.classTerm"),
      render: (row) => {
        const term = termById(row.class_term_id);
        return term ? termLabel(term) : "—";
      },
    },
    { key: "class", header: t("setup.studentTermDetails.columns.class"), render: (row) => classById(row.class_id)?.name ?? "—" },
    { key: "arm", header: t("setup.studentTermDetails.columns.arm"), render: (row) => sectionById(row.section_id)?.name ?? "—" },
    { key: "house", header: t("setup.studentTermDetails.columns.house"), render: (row) => houseById(row.house_id)?.name ?? "—" },
  ];

  const exportColumns: ExportColumn<StudentTermDetail>[] = [
    { header: t("setup.studentTermDetails.columns.student"), value: (row) => studentName(row) },
    { header: t("setup.studentTermDetails.columns.schoolType"), value: (row) => schoolTypeName(row) },
    {
      header: t("setup.studentTermDetails.columns.classTerm"),
      value: (row) => {
        const term = termById(row.class_term_id);
        return term ? termLabel(term) : "";
      },
    },
    { header: t("setup.studentTermDetails.columns.class"), value: (row) => classById(row.class_id)?.name ?? "" },
    { header: t("setup.studentTermDetails.columns.arm"), value: (row) => sectionById(row.section_id)?.name ?? "" },
    { header: t("setup.studentTermDetails.columns.house"), value: (row) => houseById(row.house_id)?.name ?? "" },
  ];

  return (
    <CrudScreen<StudentTermDetail, StudentTermDetailInput, StudentTermDetailInput, FormState>
      title={t("setup.studentTermDetails.title")}
      subtitle={t("setup.studentTermDetails.subtitle")}
      addNewLabel={t("setup.studentTermDetails.addNew")}
      panelTitle={{
        create: t("setup.studentTermDetails.panel.createTitle"),
        edit: t("setup.studentTermDetails.panel.editTitle"),
      }}
      panelSubtitle={t("setup.studentTermDetails.panel.subtitle")}
      service={service}
      display={{ mode: "table", columns }}
      exportColumns={exportColumns}
      exportFilenamePrefix="student-term-details"
      exportPeriodLabel={selectedYear?.name}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.studentTermDetails.searchPlaceholder")}
      matchesSearch={(row, query) => {
        const student = studentById(row.student_id);
        if (!student) return false;
        const needle = query.toLowerCase();
        return (
          studentFullName(student).toLowerCase().includes(needle) ||
          (student.admission_number?.toLowerCase().includes(needle) ?? false)
        );
      }}
      filterDefs={filterDefs}
      matchesFilters={(row, filters) =>
        (!filters.term || termById(row.class_term_id)?.term_type === filters.term) &&
        (!filters.class || row.class_id === filters.class) &&
        (!filters.arm || sectionById(row.section_id)?.name === filters.arm)
      }
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: {
            title: t("setup.studentTermDetails.confirmDelete.title"),
            message: t("setup.studentTermDetails.confirmDelete.message", { name: studentName(row) }),
          },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({
        class_id: row.class_id,
        class_term_id: row.class_term_id,
        section_id: row.section_id,
        student_id: row.student_id,
        house_id: row.house_id ?? "",
        seat_number: row.seat_number ?? "",
        roll_no: row.roll_no ?? "",
        remark: row.remark ?? "",
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.class_id) errors.class_id = t("setup.studentTermDetails.errors.classRequired");
        if (!data.class_term_id) errors.class_term_id = t("setup.studentTermDetails.errors.classTermRequired");
        if (!data.section_id) errors.section_id = t("setup.studentTermDetails.errors.armRequired");
        if (!data.student_id) errors.student_id = t("setup.studentTermDetails.errors.studentRequired");
        return errors;
      }}
      toCreateInput={(data) => ({
        academic_year_id: yearId,
        class_term_id: data.class_term_id,
        class_id: data.class_id,
        section_id: data.section_id,
        student_id: data.student_id,
        house_id: data.house_id || null,
        seat_number: data.seat_number.trim() || null,
        roll_no: data.roll_no.trim() || null,
        remark: data.remark.trim() || null,
      })}
      toUpdateInput={(data) => ({
        academic_year_id: yearId,
        class_term_id: data.class_term_id,
        class_id: data.class_id,
        section_id: data.section_id,
        student_id: data.student_id,
        house_id: data.house_id || null,
        seat_number: data.seat_number.trim() || null,
        roll_no: data.roll_no.trim() || null,
        remark: data.remark.trim() || null,
      })}
      renderFields={({ data, onChange, errors }) => {
        const termsForClass = allTerms.filter((term) => term.class_id === data.class_id);
        const sectionsForClass = sections.filter((section) => section.class_id === data.class_id && section.is_active);
        const studentsInTerm = new Set(
          termDetails.filter((row) => row.class_term_id === data.class_term_id).map((row) => row.student_id),
        );
        const availableStudents = activeStudents.filter(
          (student) => student.id === data.student_id || !studentsInTerm.has(student.id),
        );
        const studentOptions: SearchableSelectOption[] = availableStudents.map((student) => ({
          value: student.id,
          label: studentFullName(student) || "—",
          searchText: student.admission_number ?? "",
        }));

        return (
          <>
            <SelectField
              id="student-term-detail-class"
              label={t("setup.studentTermDetails.fields.class.label")}
              value={data.class_id}
              onChange={(event) => {
                const class_id = event.target.value;
                const activeTerm = findActiveClassTerm(allTerms.filter((term) => term.class_id === class_id));
                onChange({ class_id, class_term_id: activeTerm?.id ?? "", section_id: "", student_id: "" });
              }}
              hasError={!!errors.class_id}
              error={errors.class_id}
            >
              <option value="">{t("setup.studentTermDetails.fields.class.placeholder")}</option>
              {activeClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </SelectField>
            {data.class_id && activeClasses.length === 0 ? (
              classesDevBypass ? (
                <p className="text-xs text-text-muted">{t("setup.studentTermDetails.devBypassNotice")}</p>
              ) : (
                <p className="text-xs text-text-muted">
                  {t("setup.studentTermDetails.fields.class.emptyHint")}{" "}
                  <Link href="/admin/setup/academic-structure/classes" className="font-semibold text-accent hover:underline">
                    {t("setup.studentTermDetails.fields.class.emptyHintLink")}
                  </Link>
                </p>
              )
            ) : null}

            <SelectField
              id="student-term-detail-class-term"
              label={t("setup.studentTermDetails.fields.classTerm.label")}
              value={data.class_term_id}
              onChange={(event) => onChange({ class_term_id: event.target.value, student_id: "" })}
              disabled={!data.class_id}
              hasError={!!errors.class_term_id}
              error={errors.class_term_id}
            >
              <option value="">{t("setup.studentTermDetails.fields.classTerm.placeholder")}</option>
              {termsForClass.map((term) => (
                <option key={term.id} value={term.id}>
                  {termLabel(term)}
                </option>
              ))}
            </SelectField>
            {data.class_id && termsForClass.length === 0 && !termsDevBypass ? (
              <p className="text-xs text-text-muted">
                {t("setup.studentTermDetails.fields.classTerm.emptyHint")}{" "}
                <Link href="/admin/setup/academic-structure/class-terms" className="font-semibold text-accent hover:underline">
                  {t("setup.studentTermDetails.fields.classTerm.emptyHintLink")}
                </Link>
              </p>
            ) : null}
            {data.class_id && termsForClass.length === 0 && termsDevBypass ? (
              <p className="text-xs text-text-muted">{t("setup.studentTermDetails.devBypassNotice")}</p>
            ) : null}

            <SelectField
              id="student-term-detail-section"
              label={t("setup.studentTermDetails.fields.arm.label")}
              value={data.section_id}
              onChange={(event) => onChange({ section_id: event.target.value })}
              disabled={!data.class_id}
              hasError={!!errors.section_id}
              error={errors.section_id}
            >
              <option value="">{t("setup.studentTermDetails.fields.arm.placeholder")}</option>
              {sectionsForClass.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </SelectField>
            {data.class_id && sectionsForClass.length === 0 && !sectionsDevBypass ? (
              <p className="text-xs text-text-muted">
                {t("setup.studentTermDetails.fields.arm.emptyHint")}{" "}
                <Link href="/admin/setup/academic-structure/class-arms" className="font-semibold text-accent hover:underline">
                  {t("setup.studentTermDetails.fields.arm.emptyHintLink")}
                </Link>
              </p>
            ) : null}
            {data.class_id && sectionsForClass.length === 0 && sectionsDevBypass ? (
              <p className="text-xs text-text-muted">{t("setup.studentTermDetails.devBypassNotice")}</p>
            ) : null}

            <SearchableSelect
              id="student-term-detail-student"
              label={t("setup.studentTermDetails.fields.student.label")}
              placeholder={t("setup.studentTermDetails.fields.student.placeholder")}
              options={studentOptions}
              value={data.student_id}
              onChange={(student_id) => onChange({ student_id })}
              disabled={!data.class_term_id}
              noOptionsLabel={t("setup.studentTermDetails.fields.student.emptyHint")}
              hasError={!!errors.student_id}
              error={errors.student_id}
            />

            <SelectField
              id="student-term-detail-house"
              label={t("setup.studentTermDetails.fields.house.label")}
              value={data.house_id}
              onChange={(event) => onChange({ house_id: event.target.value })}
            >
              <option value="">{t("setup.studentTermDetails.fields.house.none")}</option>
              {MOCK_HOUSES.map((house) => (
                <option key={house.id} value={house.id}>
                  {house.name}
                </option>
              ))}
            </SelectField>

            <InputField
              id="student-term-detail-seat"
              label={t("setup.studentTermDetails.fields.seatNumber.label")}
              value={data.seat_number}
              onChange={(event) => onChange({ seat_number: event.target.value })}
            />

            <InputField
              id="student-term-detail-roll"
              label={t("setup.studentTermDetails.fields.rollNo.label")}
              value={data.roll_no}
              onChange={(event) => onChange({ roll_no: event.target.value })}
            />

            <InputField
              id="student-term-detail-remark"
              label={t("setup.studentTermDetails.fields.remark.label")}
              value={data.remark}
              onChange={(event) => onChange({ remark: event.target.value })}
            />
          </>
        );
      }}
      emptyMessage={t("setup.studentTermDetails.empty")}
      toastMessages={{
        created: t("setup.studentTermDetails.toast.created"),
        updated: t("setup.studentTermDetails.toast.updated"),
        deleted: t("setup.studentTermDetails.toast.deleted"),
      }}
    />
  );
}
