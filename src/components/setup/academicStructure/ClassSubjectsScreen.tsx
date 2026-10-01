"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { useToast } from "@/components/ui/Toast";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { DataTable } from "@/components/setup/DataTable";
import { CheckboxList, type CheckboxListOption } from "@/components/setup/CheckboxList";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { FileAttachmentField } from "@/components/files/FileAttachmentField";
import { FileDownloadLink } from "@/components/files/FileDownloadLink";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type ColumnDef, type FilterDef, type RowAction } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { usePaginatedView } from "@/lib/setup/usePaginatedView";
import type { AttachedFile } from "@/lib/files/filesApi";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { subjectsMasterService, type SubjectMaster } from "@/lib/setup/academicStructure/subjectsMasterApi";
import { classroomsService, classroomsQueryKey, type Classroom } from "@/lib/setup/academicStructure/facilitiesApi";
import { validateClassSubjectFile } from "@/lib/setup/academicStructure/classSubjectFileUpload";
import {
  classSubjectsQueryKey,
  fetchClassSubjectsForYear,
  bulkCreateClassSubjects,
  updateClassSubject,
  removeClassSubject,
  type ClassSubject,
  type SubjectGroup,
} from "@/lib/setup/academicStructure/classSubjectsApi";

const SUBJECT_GROUPS: SubjectGroup[] = ["Core", "Elective"];

// The API's casing ("Core"/"Elective") -> this screen's i18n key segment.
const SUBJECT_GROUP_I18N_KEY: Record<SubjectGroup, "core" | "elective"> = { Core: "core", Elective: "elective" };

type FormState = {
  school_type_id: string;
  class_ids: string[];
  subject_master_ids: string[];
  subject_group: SubjectGroup | "";
  unit: string;
  room_id: string;
  file: AttachedFile | null;
};

const EMPTY_FORM: FormState = {
  school_type_id: "",
  class_ids: [],
  subject_master_ids: [],
  subject_group: "",
  unit: "",
  room_id: "",
  file: null,
};

type PanelState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; row: ClassSubject };

/**
 * Outer guard — Class Subjects is year-scoped (a class always belongs to a
 * year), same shape as Classes/Class-arms/Class Terms.
 */
export function ClassSubjectsScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.classSubjects.noYear.message")}</p>
        <Link
          href="/admin/setup/academic-structure/academic-years"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {t("setup.classSubjects.noYear.linkLabel")}
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

  return <ClassSubjectsTable yearId={selectedYearId} />;
}

function ClassSubjectsTable({ yearId }: { yearId: string }) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedYear } = useAcademicYear();
  const { school } = useAuth();

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

  const roomsQuery = useQuery({
    queryKey: classroomsQueryKey,
    queryFn: classroomsService.list,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const rooms: Classroom[] = roomsQuery.data ?? [];

  const classSubjectsQuery = useQuery({
    queryKey: classSubjectsQueryKey(yearId),
    queryFn: () => fetchClassSubjectsForYear(yearId).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const allItems: ClassSubject[] = classSubjectsQuery.data?.ok ? classSubjectsQuery.data.data : [];

  const classById = (id: string): SchoolClass | null => classes.find((cls) => cls.id === id) ?? null;
  const subjectById = (id: string): SubjectMaster | null => subjects.find((subject) => subject.id === id) ?? null;
  const roomName = (id: string | null): string | null =>
    id ? (rooms.find((room) => room.id === id)?.name ?? null) : null;
  const subjectGroupLabel = (group: SubjectGroup) =>
    t(`setup.classSubjects.subjectGroup.${SUBJECT_GROUP_I18N_KEY[group]}`);

  const view = usePaginatedView(allItems, {
    matchesSearch: (row, query) => {
      const needle = query.toLowerCase();
      return (
        (classById(row.class_id)?.name.toLowerCase().includes(needle) ?? false) ||
        (subjectById(row.subject_master_id)?.name.toLowerCase().includes(needle) ?? false)
      );
    },
    matchesFilters: (row, filters) =>
      (!filters.class || row.class_id === filters.class) &&
      (!filters.subject || row.subject_master_id === filters.subject) &&
      (!filters.group || row.subject_group === filters.group),
  });

  const columns: ColumnDef<ClassSubject>[] = [
    { key: "class", header: t("setup.classSubjects.columns.class"), render: (row) => classById(row.class_id)?.name ?? "—" },
    {
      key: "subject",
      header: t("setup.classSubjects.columns.subject"),
      render: (row) => {
        const subject = subjectById(row.subject_master_id);
        return subject ? (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-border"
              style={{ backgroundColor: subject.color }}
              aria-hidden="true"
            />
            {subject.name}
          </span>
        ) : (
          "—"
        );
      },
    },
    {
      key: "group",
      header: t("setup.classSubjects.columns.group"),
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            row.subject_group === "Core"
              ? "bg-category-blue-tint text-accent"
              : "bg-category-amber-tint text-warning"
          }`}
        >
          {subjectGroupLabel(row.subject_group)}
        </span>
      ),
    },
    { key: "unit", header: t("setup.classSubjects.columns.unit"), render: (row) => row.unit ?? "—" },
    { key: "room", header: t("setup.classSubjects.columns.room"), render: (row) => roomName(row.room_id) ?? "—" },
    {
      key: "file",
      header: t("setup.classSubjects.columns.file"),
      render: (row) =>
        row.file ? (
          <FileDownloadLink fileId={row.file.file_id} className="text-sm font-semibold text-accent hover:underline">
            {t("setup.classSubjects.columns.fileDownload")}
          </FileDownloadLink>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
  ];

  const filterDefs: FilterDef[] = [
    {
      key: "class",
      label: t("setup.classSubjects.filters.class"),
      options: [
        { value: "", label: t("setup.classSubjects.filters.all") },
        ...activeClasses.map((cls) => ({ value: cls.id, label: cls.name })),
      ],
    },
    {
      key: "subject",
      label: t("setup.classSubjects.filters.subject"),
      options: [
        { value: "", label: t("setup.classSubjects.filters.all") },
        ...subjects.map((subject) => ({ value: subject.id, label: subject.name })),
      ],
    },
    {
      key: "group",
      label: t("setup.classSubjects.filters.group"),
      options: [
        { value: "", label: t("setup.classSubjects.filters.all") },
        ...SUBJECT_GROUPS.map((group) => ({ value: group, label: subjectGroupLabel(group) })),
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

  const exportColumns: ExportColumn<ClassSubject>[] = [
    { header: t("setup.classSubjects.columns.class"), value: (row) => classById(row.class_id)?.name ?? "" },
    { header: t("setup.classSubjects.columns.subject"), value: (row) => subjectById(row.subject_master_id)?.name ?? "" },
    { header: t("setup.classSubjects.columns.group"), value: (row) => subjectGroupLabel(row.subject_group) },
    { header: t("setup.classSubjects.columns.unit"), value: (row) => row.unit ?? "" },
    { header: t("setup.classSubjects.columns.room"), value: (row) => roomName(row.room_id) ?? "" },
  ];
  const exportConfig: ExportConfig<ClassSubject> = {
    filteredRows: view.filteredItems,
    allRows: allItems,
    columns: exportColumns,
    title: t("setup.classSubjects.title"),
    filenamePrefix: "class-subjects",
    schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
    periodLabel: selectedYear?.name,
  };

  // ----- panel / form -----
  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Narrowing the Classes checklist by School Type clears any already-
  // checked classes outside the new type — same reasoning/pattern as
  // Class Terms' academic-year-change effect: harmless in edit mode, since
  // edit never reads formData.class_ids (see handleSave below).
  useEffect(() => {
    setFormData((current) => (current.class_ids.length > 0 ? { ...current, class_ids: [] } : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.school_type_id]);

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "create" });
  };
  const openEdit = (row: ClassSubject) => {
    setFormData({
      school_type_id: "",
      class_ids: [row.class_id],
      subject_master_ids: [row.subject_master_id],
      subject_group: row.subject_group,
      unit: row.unit !== null ? String(row.unit) : "",
      room_id: row.room_id ?? "",
      file: row.file,
    });
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "edit", row });
  };
  const closePanel = () => setPanel({ mode: "closed" });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: classSubjectsQueryKey(yearId) });

  const validate = (data: FormState): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (panel.mode === "create") {
      if (data.class_ids.length === 0) errors.class_ids = t("setup.classSubjects.errors.classesRequired");
      if (data.subject_master_ids.length === 0) errors.subject_master_ids = t("setup.classSubjects.errors.subjectsRequired");
    }
    if (!data.subject_group) errors.subject_group = t("setup.classSubjects.errors.groupRequired");
    if (data.unit.trim()) {
      const n = Number(data.unit);
      if (!Number.isInteger(n) || n < 1 || n > 10) {
        errors.unit = t("setup.classSubjects.errors.unitInvalid");
      }
    }
    return errors;
  };

  const handleSave = async () => {
    if (panel.mode === "closed") return;

    const errors = validate(formData);
    setFormErrors(errors);
    setGeneralError(null);
    if (Object.keys(errors).length > 0) return;

    const unit = formData.unit.trim() ? Number(formData.unit) : null;
    setIsSaving(true);

    if (panel.mode === "create") {
      const result = await bulkCreateClassSubjects({
        academic_year_id: yearId,
        class_ids: formData.class_ids,
        subject_master_ids: formData.subject_master_ids,
        subject_group: formData.subject_group as SubjectGroup,
        unit,
        room_id: formData.room_id || null,
        file_id: formData.file?.file_id ?? null,
      });
      setIsSaving(false);

      if (result.ok) {
        closePanel();
        await invalidate();
        showToast(
          t("setup.classSubjects.toast.created", {
            created: result.data.created_count,
            skipped: result.data.existing_count,
          }),
        );
        return;
      }
      setGeneralError(resultErrorMessage(result, t));
      return;
    }

    const result = await updateClassSubject(panel.row.id, {
      subject_group: formData.subject_group as SubjectGroup,
      unit,
      room_id: formData.room_id || null,
      file_id: formData.file?.file_id ?? null,
    });
    setIsSaving(false);

    if (result.ok) {
      closePanel();
      await invalidate();
      showToast(t("setup.classSubjects.toast.updated"));
      return;
    }
    setGeneralError(resultErrorMessage(result, t));
  };

  const runDelete = async (row: ClassSubject) => {
    const result = await removeClassSubject(row.id);
    if (result.ok) {
      await invalidate();
      showToast(t("setup.classSubjects.toast.deleted"));
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const rowActions = (row: ClassSubject): RowAction<ClassSubject>[] => [
    { key: "edit", label: t("common.edit"), onClick: () => openEdit(row) },
    {
      key: "delete",
      label: t("common.delete"),
      variant: "danger",
      onClick: () => runDelete(row),
      confirm: {
        title: t("setup.classSubjects.confirmDelete.title"),
        message: t("setup.classSubjects.confirmDelete.message", {
          class: classById(row.class_id)?.name ?? "",
          subject: subjectById(row.subject_master_id)?.name ?? "",
        }),
      },
    },
  ];

  const formClassesOfType = (formData.school_type_id
    ? activeClasses.filter((cls) => cls.school_type_id === formData.school_type_id)
    : activeClasses
  ).map((cls): CheckboxListOption => ({ id: cls.id, label: cls.name }));

  const subjectOptions: CheckboxListOption[] = subjects.map((subject) => ({
    id: subject.id,
    label: `${subject.name} (${subject.short_name})`,
    leading: (
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: subject.color }}
        aria-hidden="true"
      />
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t("setup.classSubjects.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("setup.classSubjects.subtitle")}</p>
      </div>

      <DataTable<ClassSubject>
        columns={columns}
        rows={view.items}
        getRowId={(row) => row.id}
        rowActions={rowActions}
        searchValue={view.search}
        onSearchChange={view.setSearch}
        searchPlaceholder={t("setup.classSubjects.searchPlaceholder")}
        filters={filters}
        exportConfig={exportConfig}
        onAddNew={openCreate}
        addNewLabel={t("setup.classSubjects.addNew")}
        isLoading={classSubjectsQuery.isPending}
        errorMessage={classSubjectsQuery.isError ? t("setup.dataTable.errors.loadFailed") : null}
        onRetry={() => classSubjectsQuery.refetch()}
        emptyMessage={t("setup.classSubjects.empty")}
        page={view.page}
        totalPages={view.totalPages}
        onPreviousPage={() => view.setPage((current) => Math.max(1, current - 1))}
        onNextPage={() => view.setPage((current) => Math.min(view.totalPages, current + 1))}
      />

      <SlideOverPanel
        isOpen={panel.mode !== "closed"}
        onClose={closePanel}
        title={panel.mode === "edit" ? t("setup.classSubjects.panel.editTitle") : t("setup.classSubjects.panel.createTitle")}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="flex flex-col gap-5">
          {generalError ? (
            <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
          ) : null}
          {panel.mode !== "closed" ? (
            <>
              {panel.mode === "edit" ? (
                <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-text-secondary">
                  <p>
                    {t("setup.classSubjects.fields.class.label")}:{" "}
                    <span className="font-medium text-text-primary">{classById(panel.row.class_id)?.name ?? "—"}</span>
                  </p>
                  <p className="mt-1">
                    {t("setup.classSubjects.fields.subject.label")}:{" "}
                    <span className="font-medium text-text-primary">
                      {subjectById(panel.row.subject_master_id)?.name ?? "—"}
                    </span>
                  </p>
                </div>
              ) : (
                <>
                  <SelectField
                    id="class-subject-school-type"
                    label={t("setup.classSubjects.fields.schoolType.label")}
                    value={formData.school_type_id}
                    onChange={(event) => setFormData((current) => ({ ...current, school_type_id: event.target.value }))}
                  >
                    <option value="">{t("setup.classSubjects.fields.schoolType.all")}</option>
                    {schoolTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </SelectField>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-text-primary">
                      {t("setup.classSubjects.fields.classes.label")}
                    </span>
                    {formClassesOfType.length === 0 ? (
                      <p className="text-xs text-text-muted">
                        {t("setup.classSubjects.fields.classes.emptyHint")}{" "}
                        <Link
                          href="/admin/setup/academic-structure/classes"
                          className="font-semibold text-accent hover:underline"
                        >
                          {t("setup.classSubjects.fields.classes.emptyHintLink")}
                        </Link>
                      </p>
                    ) : (
                      <CheckboxList
                        options={formClassesOfType}
                        selectedIds={formData.class_ids}
                        onChange={(class_ids) => setFormData((current) => ({ ...current, class_ids }))}
                        selectAllLabel={t("setup.classSubjects.fields.classes.selectAll")}
                      />
                    )}
                    {formErrors.class_ids ? <p className="text-xs text-error">{formErrors.class_ids}</p> : null}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-text-primary">
                      {t("setup.classSubjects.fields.subjects.label")}
                    </span>
                    {subjectOptions.length === 0 ? (
                      <p className="text-xs text-text-muted">
                        {t("setup.classSubjects.fields.subjects.emptyHint")}{" "}
                        <Link
                          href="/admin/setup/academic-structure/subjects-master"
                          className="font-semibold text-accent hover:underline"
                        >
                          {t("setup.classSubjects.fields.subjects.emptyHintLink")}
                        </Link>
                      </p>
                    ) : (
                      <CheckboxList
                        options={subjectOptions}
                        selectedIds={formData.subject_master_ids}
                        onChange={(subject_master_ids) => setFormData((current) => ({ ...current, subject_master_ids }))}
                        selectAllLabel={t("setup.classSubjects.fields.subjects.selectAll")}
                      />
                    )}
                    {formErrors.subject_master_ids ? (
                      <p className="text-xs text-error">{formErrors.subject_master_ids}</p>
                    ) : null}
                  </div>
                </>
              )}

              <ChipGroup
                label={t("setup.classSubjects.fields.subjectGroup.label")}
                multiple={false}
                options={SUBJECT_GROUPS.map((group) => ({ value: group, label: subjectGroupLabel(group) }))}
                value={formData.subject_group ? [formData.subject_group] : []}
                onChange={(values) =>
                  setFormData((current) => ({ ...current, subject_group: (values[0] as SubjectGroup) ?? "" }))
                }
                hasError={!!formErrors.subject_group}
                error={formErrors.subject_group}
              />

              <InputField
                id="class-subject-unit"
                type="number"
                min={1}
                max={10}
                label={t("setup.classSubjects.fields.unit.label")}
                placeholder={t("setup.classSubjects.fields.unit.placeholder")}
                value={formData.unit}
                onChange={(event) => setFormData((current) => ({ ...current, unit: event.target.value }))}
                hasError={!!formErrors.unit}
                error={formErrors.unit}
              />

              <SelectField
                id="class-subject-room"
                label={t("setup.classSubjects.fields.room.label")}
                value={formData.room_id}
                onChange={(event) => setFormData((current) => ({ ...current, room_id: event.target.value }))}
                disabled={roomsQuery.isPending}
              >
                {roomsQuery.isPending ? (
                  <option value="">{t("setup.classSubjects.fields.room.loading")}</option>
                ) : (
                  <>
                    <option value="">{t("setup.classSubjects.fields.room.none")}</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </>
                )}
              </SelectField>

              <FileAttachmentField
                label={t("setup.classSubjects.fields.file.label")}
                chooseLabel={t("setup.classSubjects.fields.file.choose")}
                accept=".pdf,.doc,.docx,.ppt,.pptx"
                purpose="class_subject"
                validate={validateClassSubjectFile}
                validationMessages={{
                  unsupportedType: t("setup.classSubjects.fields.file.errors.unsupportedType"),
                  tooLarge: t("setup.classSubjects.fields.file.errors.tooLarge"),
                }}
                value={formData.file}
                onChange={(file) => setFormData((current) => ({ ...current, file }))}
              />
            </>
          ) : null}
        </div>
      </SlideOverPanel>
    </div>
  );
}
