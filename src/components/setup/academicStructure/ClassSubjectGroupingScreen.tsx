"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { CheckboxList, type CheckboxListOption } from "@/components/setup/CheckboxList";
import { RadioList, type RadioListOption } from "@/components/setup/RadioList";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { subjectsMasterService, type SubjectMaster } from "@/lib/setup/academicStructure/subjectsMasterApi";
import { classSubjectsQueryKey, fetchClassSubjectsForYear, type ClassSubject } from "@/lib/setup/academicStructure/classSubjectsApi";
import {
  createClassSubjectGroupService,
  type ClassSubjectGroup,
  type ClassSubjectGroupInput,
} from "@/lib/setup/academicStructure/classSubjectGroupingApi";

type FormState = {
  name: string;
  /** Filter only, narrows the Class radio list — never sent to the service. */
  school_type_id: string;
  /**
   * Filter only, narrows the Class Subjects checklist to one class — a
   * group has no class_ids in the API (see classSubjectGroupingApi.ts),
   * it's derived entirely from class_subject_ids. Single class per product
   * owner: a group's class-subjects all come from one class, picked via
   * radio, not a multi-class checklist.
   */
  class_id: string;
  class_subject_ids: string[];
  /** The membership the edit form was seeded with — the service diffs against it to add/remove members. */
  previous_class_subject_ids: string[];
};

const EMPTY_FORM: FormState = {
  name: "",
  school_type_id: "",
  class_id: "",
  class_subject_ids: [],
  previous_class_subject_ids: [],
};

/**
 * Outer guard — a group always belongs to an academic year (same shape as
 * Classes/Class Subjects). Unlike Class Subjects, a group IS a single
 * record per create/edit (no fan-out), so this goes straight through
 * CrudScreen via a year-scoped factory service, same pattern as Classes
 * itself (createClassesService(yearId)).
 */
export function ClassSubjectGroupingScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.classSubjectGrouping.noYear.message")}</p>
        <Link
          href="/admin/setup/academic-structure/academic-years"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {t("setup.classSubjectGrouping.noYear.linkLabel")}
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

  return <ClassSubjectGroupingTable yearId={selectedYearId} />;
}

function ClassSubjectGroupingTable({ yearId }: { yearId: string }) {
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

  const schoolTypesQuery = useQuery({
    queryKey: schoolTypesService.queryKey,
    queryFn: () => schoolTypesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const schoolTypes: SchoolType[] = schoolTypesQuery.data?.ok ? schoolTypesQuery.data.data : [];

  const subjectsQuery = useQuery({
    queryKey: subjectsMasterService.queryKey,
    queryFn: () => subjectsMasterService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const subjects: SubjectMaster[] = subjectsQuery.data?.ok ? subjectsQuery.data.data : [];

  const classSubjectsQuery = useQuery({
    queryKey: classSubjectsQueryKey(yearId),
    queryFn: () => fetchClassSubjectsForYear(yearId).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classSubjects: ClassSubject[] = classSubjectsQuery.data?.ok ? classSubjectsQuery.data.data : [];

  const classById = (id: string): SchoolClass | null => classes.find((cls) => cls.id === id) ?? null;
  const subjectById = (id: string): SubjectMaster | null => subjects.find((subject) => subject.id === id) ?? null;
  const classSubjectLabel = (row: ClassSubject): string =>
    `${classById(row.class_id)?.name ?? "—"} — ${subjectById(row.subject_master_id)?.name ?? "—"}`;
  // A group's classes aren't stored — they're whichever classes its member
  // class-subjects belong to.
  const groupClassIds = (group: ClassSubjectGroup): string[] => {
    const members = new Set(group.class_subject_ids);
    return Array.from(
      new Set(classSubjects.filter((row) => members.has(row.id)).map((row) => row.class_id)),
    );
  };

  const groupService = useMemo(() => createClassSubjectGroupService(yearId), [yearId]);

  const columns: ColumnDef<ClassSubjectGroup>[] = [
    { key: "name", header: t("setup.classSubjectGrouping.columns.name"), render: (row) => row.name },
    {
      key: "classes",
      header: t("setup.classSubjectGrouping.columns.classes"),
      render: (row) => {
        const names = groupClassIds(row).map((id) => classById(id)?.name).filter((name): name is string => !!name);
        if (names.length === 0) return "—";
        return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
      },
    },
    {
      key: "subjects",
      header: t("setup.classSubjectGrouping.columns.subjects"),
      render: (row) => (
        <span className="text-sm text-text-secondary">
          {t("setup.classSubjectGrouping.columns.subjectsCount", { count: row.class_subject_ids.length })}
        </span>
      ),
    },
  ];

  const exportColumns: ExportColumn<ClassSubjectGroup>[] = [
    { header: t("setup.classSubjectGrouping.columns.name"), value: (row) => row.name },
    {
      header: t("setup.classSubjectGrouping.columns.classes"),
      value: (row) => groupClassIds(row).map((id) => classById(id)?.name).filter(Boolean).join(", "),
    },
    { header: t("setup.classSubjectGrouping.columns.subjects"), value: (row) => row.class_subject_ids.length },
  ];

  return (
    <CrudScreen<ClassSubjectGroup, ClassSubjectGroupInput, ClassSubjectGroupInput, FormState>
      title={t("setup.classSubjectGrouping.title")}
      subtitle={t("setup.classSubjectGrouping.subtitle")}
      addNewLabel={t("setup.classSubjectGrouping.addNew")}
      panelTitle={{
        create: t("setup.classSubjectGrouping.panel.createTitle"),
        edit: t("setup.classSubjectGrouping.panel.editTitle"),
      }}
      service={groupService}
      display={{ mode: "table", columns }}
      exportColumns={exportColumns}
      exportFilenamePrefix="class-subject-grouping"
      exportPeriodLabel={selectedYear?.name}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.classSubjectGrouping.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: {
            title: t("setup.classSubjectGrouping.confirmDelete.title"),
            message: t("setup.classSubjectGrouping.confirmDelete.message", { name: row.name }),
          },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => {
        const classIds = groupClassIds(row);
        return {
          name: row.name,
          // Best-effort: a group created before this single-class rule (or
          // with manually mixed members) could span more than one class —
          // the form seeds the first and editing re-narrows to it;
          // class_subject_ids is always the source of truth either way.
          school_type_id: classById(classIds[0])?.school_type_id ?? "",
          class_id: classIds[0] ?? "",
          class_subject_ids: row.class_subject_ids,
          previous_class_subject_ids: row.class_subject_ids,
        };
      }}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.classSubjectGrouping.errors.nameRequired");
        if (!data.class_id) errors.class_id = t("setup.classSubjectGrouping.errors.classRequired");
        if (data.class_subject_ids.length === 0) {
          errors.class_subject_ids = t("setup.classSubjectGrouping.errors.classSubjectsRequired");
        }
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        class_subject_ids: data.class_subject_ids,
        previous_class_subject_ids: [],
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        class_subject_ids: data.class_subject_ids,
        previous_class_subject_ids: data.previous_class_subject_ids,
      })}
      renderFields={({ data, onChange, errors }) => {
        const classesOfType = (
          data.school_type_id ? activeClasses.filter((cls) => cls.school_type_id === data.school_type_id) : activeClasses
        ).map((cls): RadioListOption => ({ id: cls.id, label: cls.name }));

        const classSubjectsForChosenClass = classSubjects.filter((row) => row.class_id === data.class_id);
        const classSubjectOptions: CheckboxListOption[] = classSubjectsForChosenClass.map((row) => ({
          id: row.id,
          label: classSubjectLabel(row),
        }));

        return (
          <>
            <InputField
              id="class-subject-group-name"
              label={t("setup.classSubjectGrouping.fields.name.label")}
              placeholder={t("setup.classSubjectGrouping.fields.name.placeholder")}
              value={data.name}
              onChange={(event) => onChange({ name: event.target.value })}
              hasError={!!errors.name}
              error={errors.name}
            />

            <SelectField
              id="class-subject-group-school-type"
              label={t("setup.classSubjectGrouping.fields.schoolType.label")}
              value={data.school_type_id}
              onChange={(event) =>
                onChange({ school_type_id: event.target.value, class_id: "", class_subject_ids: [] })
              }
            >
              <option value="">{t("setup.classSubjectGrouping.fields.schoolType.all")}</option>
              {schoolTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </SelectField>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">
                {t("setup.classSubjectGrouping.fields.classes.label")}
              </span>
              {classesOfType.length === 0 ? (
                <p className="text-xs text-text-muted">
                  {t("setup.classSubjectGrouping.fields.classes.emptyHint")}{" "}
                  <Link
                    href="/admin/setup/academic-structure/classes"
                    className="font-semibold text-accent hover:underline"
                  >
                    {t("setup.classSubjectGrouping.fields.classes.emptyHintLink")}
                  </Link>
                </p>
              ) : (
                <RadioList
                  name="class-subject-group-class"
                  options={classesOfType}
                  selectedId={data.class_id}
                  onChange={(class_id) => {
                    const stillValidIds = new Set(
                      classSubjects.filter((row) => row.class_id === class_id).map((row) => row.id),
                    );
                    onChange({
                      class_id,
                      class_subject_ids: data.class_subject_ids.filter((id) => stillValidIds.has(id)),
                    });
                  }}
                />
              )}
              {errors.class_id ? <p className="text-xs text-error">{errors.class_id}</p> : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">
                {t("setup.classSubjectGrouping.fields.classSubjects.label")}
              </span>
              {!data.class_id ? (
                <p className="text-xs text-text-muted">{t("setup.classSubjectGrouping.fields.classSubjects.selectClassesFirst")}</p>
              ) : classSubjectOptions.length === 0 ? (
                <p className="text-xs text-text-muted">
                  {t("setup.classSubjectGrouping.fields.classSubjects.emptyHint")}{" "}
                  <Link
                    href="/admin/setup/academic-structure/class-subjects"
                    className="font-semibold text-accent hover:underline"
                  >
                    {t("setup.classSubjectGrouping.fields.classSubjects.emptyHintLink")}
                  </Link>
                </p>
              ) : (
                <CheckboxList
                  options={classSubjectOptions}
                  selectedIds={data.class_subject_ids}
                  onChange={(class_subject_ids) => onChange({ class_subject_ids })}
                  selectAllLabel={t("setup.classSubjectGrouping.fields.classSubjects.selectAll")}
                />
              )}
              {errors.class_subject_ids ? <p className="text-xs text-error">{errors.class_subject_ids}</p> : null}
            </div>
          </>
        );
      }}
      emptyMessage={t("setup.classSubjectGrouping.empty")}
      toastMessages={{
        created: t("setup.classSubjectGrouping.toast.created"),
        updated: t("setup.classSubjectGrouping.toast.updated"),
        deleted: t("setup.classSubjectGrouping.toast.deleted"),
      }}
    />
  );
}
