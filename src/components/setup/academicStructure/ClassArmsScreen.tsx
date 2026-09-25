"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { DataTable } from "@/components/setup/DataTable";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { FilterDropdown } from "@/components/setup/SetupToolbar";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { usePaginatedView } from "@/lib/setup/usePaginatedView";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import {
  buildingsService,
  classroomsService,
  type Building,
  type Classroom,
} from "@/lib/setup/academicStructure/facilitiesApi";
import {
  createSection,
  deactivateSection,
  fetchSectionsForClass,
  reactivateSection,
  removeSection,
  sectionsQueryKey,
  updateSection,
  type Section,
  type SectionInput,
} from "@/lib/setup/academicStructure/sectionsApi";
import type { ColumnDef, FilterDef, RowAction } from "@/lib/setup/crudTypes";

type FormState = {
  school_type_id: string;
  class_id: string;
  arm_name: string;
  building_id: string;
  classroom_id: string;
  class_time_start: string;
  class_time_end: string;
  description: string;
  is_active: boolean;
};

type SchoolTypesState =
  | { status: "loading" }
  | { status: "loaded"; items: SchoolType[] }
  | { status: "error" };

type ClassesState =
  | { status: "loading" }
  | { status: "loaded"; items: SchoolClass[] }
  | { status: "error" };

type ReferenceListState<T> = { status: "loading" } | { status: "loaded"; items: T[] };

/**
 * Outer guard — a class-arm always belongs to a class, which always
 * belongs to an academic year, so this screen has nothing meaningful to
 * show without a year selected. Same split-into-guard-components shape as
 * ClassesScreen, for the same reason (SchoolTypeGate's hooks shouldn't run
 * pointlessly with no year to scope them to).
 */
export function ClassArmsScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.classArms.noYear.message")}</p>
        <Link
          href="/admin/setup/academic-structure/academic-years"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {t("setup.classArms.noYear.linkLabel")}
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

  return <SchoolTypeGate yearId={selectedYearId} />;
}

/**
 * Fetches School Types + all of the year's Classes once, owns which
 * school type is currently being viewed. No cache of its own anymore
 * (react-query owns that per-class, keyed by sectionsQueryKey) — switching
 * school types back and forth just re-derives `activeClasses`, and
 * whichever classes were already fetched stay cached under their own key
 * regardless of which school type is currently selected.
 */
function SchoolTypeGate({ yearId }: { yearId: string }) {
  const t = useTranslations();
  const [schoolTypes, setSchoolTypes] = useState<SchoolTypesState>({ status: "loading" });
  const [classes, setClasses] = useState<ClassesState>({ status: "loading" });
  const [selectedSchoolTypeId, setSelectedSchoolTypeId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSelectedSchoolTypeId("");
    setSchoolTypes({ status: "loading" });
    setClasses({ status: "loading" });

    schoolTypesService.list().then((result) => {
      if (cancelled) return;
      setSchoolTypes(result.ok ? { status: "loaded", items: result.data } : { status: "error" });
    });
    createClassesService(yearId)
      .list()
      .then((result) => {
        if (cancelled) return;
        setClasses(result.ok ? { status: "loaded", items: result.data } : { status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [yearId]);

  if (schoolTypes.status === "loading" || classes.status === "loading") {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-text-muted">
        {t("setup.dataTable.loading")}
      </div>
    );
  }

  if (schoolTypes.status === "error" || classes.status === "error") {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-error">
        {t("setup.dataTable.errors.loadFailed")}
      </div>
    );
  }

  const activeClasses = classes.items.filter(
    (cls) => cls.school_type_id === selectedSchoolTypeId && cls.is_active,
  );

  return (
    <div className="flex flex-col gap-4">
      {/*
        A native <select>'s open menu is rendered by the browser/OS and
        can't be constrained by this page's CSS — on mobile (or a narrow
        desktop viewport) it can overflow past the screen edge regardless
        of the closed trigger's own width. FilterDropdown renders its own
        CSS-anchored menu instead (same fix already applied to the
        Status/School Type filters inside DataTable/CardGrid's toolbar).
      */}
      <FilterDropdown
        def={{
          key: "schoolType",
          label: t("setup.classArms.schoolTypeSelector.label"),
          options: schoolTypes.items.map((type) => ({ value: type.id, label: type.name })),
        }}
        value={selectedSchoolTypeId}
        onChange={setSelectedSchoolTypeId}
      />

      {!selectedSchoolTypeId ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-text-muted">
          {t("setup.classArms.selectSchoolTypePrompt")}
        </div>
      ) : activeClasses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-sm text-text-muted">{t("setup.classArms.noClassesPrompt.message")}</p>
          <Link
            href="/admin/setup/academic-structure/classes"
            className="text-sm font-semibold text-accent hover:underline"
          >
            {t("setup.classArms.noClassesPrompt.linkLabel")}
          </Link>
        </div>
      ) : (
        <ClassArmsTable
          schoolTypes={schoolTypes.items}
          classes={classes.items}
          activeClasses={activeClasses}
          selectedSchoolTypeId={selectedSchoolTypeId}
        />
      )}
    </div>
  );
}

type PanelState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; row: Section };

type SectionsLoadState =
  | { status: "loading" }
  | { status: "loaded"; items: Section[] }
  | { status: "forbidden" }
  | { status: "devBypassUnavailable" }
  | { status: "error" };

/**
 * Reads bypass the generic CrudScreen/useCrudTable pattern entirely —
 * there's no single "list sections for a school type" endpoint to back a
 * service.list(), only per-class (see sectionsApi.ts). useQueries runs one
 * query per active class, and this component merges + presents them via
 * DataTable directly (the same presentational component CrudScreen itself
 * uses under the hood) plus a hand-wired SlideOverPanel for create/edit —
 * mirroring CrudScreen's own internal logic, just adapted for a merged
 * multi-query source instead of one service.
 */
function ClassArmsTable({
  schoolTypes,
  classes,
  activeClasses,
  selectedSchoolTypeId,
}: {
  schoolTypes: SchoolType[];
  classes: SchoolClass[];
  activeClasses: SchoolClass[];
  selectedSchoolTypeId: string;
}) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [buildings, setBuildings] = useState<ReferenceListState<Building>>({ status: "loading" });
  const [classrooms, setClassrooms] = useState<ReferenceListState<Classroom>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    buildingsService.list().then((items) => {
      if (!cancelled) setBuildings({ status: "loaded", items });
    });
    classroomsService.list().then((items) => {
      if (!cancelled) setClassrooms({ status: "loaded", items });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // One query per active class, sharing react-query's own per-key cache —
  // switching school types back to an already-visited one finds its
  // classes' queries already cached, no manual cache of our own needed.
  const sectionQueries = useQueries({
    queries: activeClasses.map((cls) => ({
      queryKey: sectionsQueryKey(cls.id),
      queryFn: () => fetchSectionsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });

  // Same "one failed class fails the whole merge" rule the old Map-cache
  // design had — a partial list would misrepresent what's actually under
  // this school type.
  const load: SectionsLoadState =
    activeClasses.length === 0
      ? { status: "loaded", items: [] }
      : sectionQueries.some((query) => query.isPending)
        ? { status: "loading" }
        : sectionQueries.some((query) => query.isError)
          ? { status: "error" }
          : (() => {
              const failed = sectionQueries.find((query) => query.data && !query.data.ok);
              if (!failed?.data || failed.data.ok) {
                return {
                  status: "loaded" as const,
                  items: sectionQueries.flatMap((query) => (query.data?.ok ? query.data.data : [])),
                };
              }
              if (failed.data.kind === "forbidden") return { status: "forbidden" as const };
              if (failed.data.kind === "devBypassUnavailable") return { status: "devBypassUnavailable" as const };
              return { status: "error" as const };
            })();

  // Not memoized: useQueries returns a fresh array every render regardless
  // of whether any underlying query result actually changed, so `load` (and
  // therefore `allItems`) has no stable reference to key a useMemo off in
  // the first place — recomputing this plain filter/map/sort every render
  // is cheap enough (a school's section count) that it isn't worth fighting
  // that with a deep-equality check.
  const allItems = load.status === "loaded" ? load.items : [];
  const armNames = Array.from(new Set(allItems.map((item) => item.name))).sort();

  const view = usePaginatedView(allItems, {
    matchesSearch: (row, query) => row.name.toLowerCase().includes(query.toLowerCase()),
    matchesFilters: (row, filters) =>
      (!filters.class || row.class_id === filters.class) &&
      (!filters.armName || row.name === filters.armName) &&
      (!filters.status || (filters.status === "active") === row.is_active),
  });

  const classById = (id: string): SchoolClass | null => classes.find((cls) => cls.id === id) ?? null;
  const schoolTypeNameForClass = (classId: string): string | null => {
    const cls = classById(classId);
    if (!cls) return null;
    return schoolTypes.find((type) => type.id === cls.school_type_id)?.name ?? null;
  };
  const buildingName = (id: string | null): string | null =>
    id && buildings.status === "loaded" ? (buildings.items.find((b) => b.id === id)?.name ?? null) : null;
  const classroomName = (id: string | null): string | null =>
    id && classrooms.status === "loaded" ? (classrooms.items.find((c) => c.id === id)?.name ?? null) : null;

  const columns: ColumnDef<Section>[] = [
    { key: "name", header: t("setup.classArms.columns.name"), render: (row) => row.name },
    {
      key: "class",
      header: t("setup.classArms.columns.class"),
      render: (row) => classById(row.class_id)?.name ?? "—",
    },
    {
      key: "schoolType",
      header: t("setup.classArms.columns.schoolType"),
      render: (row) => schoolTypeNameForClass(row.class_id) ?? "—",
    },
    {
      key: "location",
      header: t("setup.classArms.columns.location"),
      render: (row) => {
        const parts = [buildingName(row.building_id), classroomName(row.classroom_id)].filter(
          (part): part is string => !!part,
        );
        return parts.length ? parts.join(" — ") : "—";
      },
    },
    {
      key: "classTime",
      header: t("setup.classArms.columns.classTime"),
      render: (row) =>
        row.class_time_start && row.class_time_end ? `${row.class_time_start}–${row.class_time_end}` : "—",
    },
    {
      key: "status",
      header: t("setup.classArms.columns.status"),
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            row.is_active ? "bg-category-green-tint text-status-done-text" : "bg-background text-text-muted"
          }`}
        >
          {t(row.is_active ? "setup.classArms.status.active" : "setup.classArms.status.inactive")}
        </span>
      ),
    },
  ];

  const filterDefs: FilterDef[] = [
    {
      key: "class",
      label: t("setup.classArms.filters.class"),
      options: [
        { value: "", label: t("setup.classArms.filters.all") },
        ...activeClasses.map((cls) => ({ value: cls.id, label: cls.name })),
      ],
    },
    {
      key: "armName",
      label: t("setup.classArms.filters.armName"),
      options: [
        { value: "", label: t("setup.classArms.filters.all") },
        ...armNames.map((name) => ({ value: name, label: name })),
      ],
    },
    {
      key: "status",
      label: t("setup.classArms.filters.status"),
      options: [
        { value: "", label: t("setup.classArms.filters.all") },
        { value: "active", label: t("setup.classArms.status.active") },
        { value: "inactive", label: t("setup.classArms.status.inactive") },
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

  const emptyFormState: FormState = {
    school_type_id: selectedSchoolTypeId,
    class_id: "",
    arm_name: "",
    building_id: "",
    classroom_id: "",
    // Defaulted on create (a typical school day), never overridden on
    // edit — toFormState() always seeds from the actual record's values.
    class_time_start: "08:00",
    class_time_end: "15:00",
    description: "",
    is_active: true,
  };

  const toFormState = (row: Section): FormState => ({
    school_type_id: classById(row.class_id)?.school_type_id ?? "",
    class_id: row.class_id,
    arm_name: row.name,
    building_id: row.building_id ?? "",
    classroom_id: row.classroom_id ?? "",
    class_time_start: row.class_time_start ?? "",
    class_time_end: row.class_time_end ?? "",
    description: row.description ?? "",
    is_active: row.is_active,
  });

  const toInput = (data: FormState): SectionInput => ({
    class_id: data.class_id,
    arm_name: data.arm_name.trim(),
    building_id: data.building_id || null,
    classroom_id: data.classroom_id || null,
    class_time_start: data.class_time_start || null,
    class_time_end: data.class_time_end || null,
    description: data.description.trim() || null,
    is_active: data.is_active,
  });

  const validate = (data: FormState): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!data.school_type_id) errors.school_type_id = t("setup.classArms.errors.schoolTypeRequired");
    if (!data.class_id) errors.class_id = t("setup.classArms.errors.classRequired");
    if (!data.arm_name.trim()) errors.arm_name = t("setup.classArms.errors.armNameRequired");
    if (data.class_time_start && data.class_time_end && data.class_time_end <= data.class_time_start) {
      errors.class_time_end = t("setup.classArms.errors.endBeforeStart");
    }
    return errors;
  };

  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });
  const [formData, setFormData] = useState<FormState>(emptyFormState);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => {
    setFormData(emptyFormState);
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "create" });
  };
  const openEdit = (row: Section) => {
    setFormData(toFormState(row));
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "edit", row });
  };
  const closePanel = () => setPanel({ mode: "closed" });

  const invalidateClass = (classId: string) => queryClient.invalidateQueries({ queryKey: sectionsQueryKey(classId) });

  const handleSave = async () => {
    const errors = validate(formData);
    setFormErrors(errors);
    setGeneralError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    const result =
      panel.mode === "edit" ? await updateSection(panel.row.id, toInput(formData)) : await createSection(toInput(formData));
    setIsSaving(false);

    if (result.ok) {
      const wasEdit = panel.mode === "edit";
      // An edit's Class dropdown is changeable — if it moved the section
      // to a different class, the OLD class's cache needs invalidating
      // too, not just the new one. panel.row is still the pre-edit row
      // here (captured when the panel opened), so its class_id is exactly
      // that "old" value — no lookup needed.
      const previousClassId = wasEdit ? panel.row.class_id : null;
      closePanel();
      await invalidateClass(formData.class_id);
      if (previousClassId && previousClassId !== formData.class_id) {
        await invalidateClass(previousClassId);
      }
      showToast(wasEdit ? t("setup.classArms.toast.updated") : t("setup.classArms.toast.created"));
      return;
    }

    if (result.kind === "validation") {
      const fieldErrors: Record<string, string> = {};
      for (const error of result.errors) {
        fieldErrors[error.field] = error.message ?? t("setup.crudScreen.errors.fieldInvalid");
      }
      setFormErrors(fieldErrors);
    }
    setGeneralError(resultErrorMessage(result, t));
  };

  const runDelete = async (row: Section) => {
    const result = await removeSection(row.id);
    if (result.ok) {
      await invalidateClass(row.class_id);
      showToast(t("setup.classArms.toast.deleted"));
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const runDeactivate = async (row: Section) => {
    const result = await deactivateSection(row.id);
    if (result.ok) {
      await invalidateClass(row.class_id);
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const runReactivate = async (row: Section) => {
    const result = await reactivateSection(row.id);
    if (result.ok) {
      await invalidateClass(row.class_id);
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const rowActions = (row: Section): RowAction<Section>[] => [
    { key: "edit", label: t("common.edit"), onClick: () => openEdit(row) },
    row.is_active
      ? { key: "deactivate", label: t("setup.classArms.actions.deactivate"), onClick: () => runDeactivate(row) }
      : { key: "reactivate", label: t("setup.classArms.actions.reactivate"), onClick: () => runReactivate(row) },
    {
      key: "delete",
      label: t("common.delete"),
      variant: "danger",
      onClick: () => runDelete(row),
      confirm: {
        title: t("setup.classArms.confirmDelete.title"),
        message: t("setup.classArms.confirmDelete.message", { name: row.name }),
      },
    },
  ];

  const errorMessage =
    load.status === "forbidden"
      ? t("setup.crudScreen.errors.forbidden")
      : load.status === "devBypassUnavailable"
        ? t("setup.crudScreen.errors.devBypassUnavailable")
        : load.status === "error"
          ? t("setup.dataTable.errors.loadFailed")
          : null;

  const noSchoolTypesForForm = schoolTypes.length === 0;
  const classesOfFormType = classes.filter(
    (cls) => cls.school_type_id === formData.school_type_id && cls.is_active,
  );

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t("setup.classArms.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("setup.classArms.subtitle")}</p>
      </div>

      <p className="text-xs text-text-muted">{t("setup.classArms.inactiveClassNote")}</p>

      <DataTable<Section>
        columns={columns}
        rows={view.items}
        getRowId={(row) => row.id}
        rowActions={rowActions}
        searchValue={view.search}
        onSearchChange={view.setSearch}
        searchPlaceholder={t("setup.classArms.searchPlaceholder")}
        filters={filters}
        onAddNew={openCreate}
        addNewLabel={t("setup.classArms.addNew")}
        isLoading={load.status === "loading"}
        errorMessage={errorMessage}
        onRetry={() => sectionQueries.forEach((query) => query.refetch())}
        emptyMessage={t("setup.classArms.empty")}
        page={view.page}
        totalPages={view.totalPages}
        onPreviousPage={() => view.setPage((current) => Math.max(1, current - 1))}
        onNextPage={() => view.setPage((current) => Math.min(view.totalPages, current + 1))}
      />

      <SlideOverPanel
        isOpen={panel.mode !== "closed"}
        onClose={closePanel}
        title={panel.mode === "edit" ? t("setup.classArms.panel.editTitle") : t("setup.classArms.panel.createTitle")}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="flex flex-col gap-5">
          {generalError ? (
            <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
          ) : null}
          {panel.mode !== "closed" ? (
            <>
              <SelectField
                id="section-school-type"
                label={t("setup.classArms.fields.schoolType.label")}
                value={formData.school_type_id}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, school_type_id: event.target.value, class_id: "" }))
                }
                disabled={noSchoolTypesForForm}
                hasError={!!formErrors.school_type_id}
                error={formErrors.school_type_id}
              >
                <option value="" disabled>
                  {t("setup.classArms.fields.schoolType.placeholder")}
                </option>
                {schoolTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                id="section-class"
                label={t("setup.classArms.fields.class.label")}
                value={formData.class_id}
                onChange={(event) => setFormData((current) => ({ ...current, class_id: event.target.value }))}
                disabled={!formData.school_type_id}
                hasError={!!formErrors.class_id}
                error={formErrors.class_id}
              >
                <option value="" disabled>
                  {t("setup.classArms.fields.class.placeholder")}
                </option>
                {classesOfFormType.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </SelectField>

              <InputField
                id="section-arm-name"
                label={t("setup.classArms.fields.armName.label")}
                placeholder={t("setup.classArms.fields.armName.placeholder")}
                value={formData.arm_name}
                onChange={(event) => setFormData((current) => ({ ...current, arm_name: event.target.value }))}
                hasError={!!formErrors.arm_name}
                error={formErrors.arm_name}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="section-building"
                  label={t("setup.classArms.fields.building.label")}
                  value={formData.building_id}
                  onChange={(event) => setFormData((current) => ({ ...current, building_id: event.target.value }))}
                  disabled={buildings.status === "loading"}
                >
                  {buildings.status === "loading" ? (
                    <option value="">{t("setup.classArms.fields.building.loading")}</option>
                  ) : (
                    <>
                      <option value="">{t("setup.classArms.fields.building.none")}</option>
                      {buildings.items.map((building) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </>
                  )}
                </SelectField>

                <SelectField
                  id="section-classroom"
                  label={t("setup.classArms.fields.classroom.label")}
                  value={formData.classroom_id}
                  onChange={(event) => setFormData((current) => ({ ...current, classroom_id: event.target.value }))}
                  disabled={classrooms.status === "loading"}
                >
                  {classrooms.status === "loading" ? (
                    <option value="">{t("setup.classArms.fields.classroom.loading")}</option>
                  ) : (
                    <>
                      <option value="">{t("setup.classArms.fields.classroom.none")}</option>
                      {classrooms.items.map((classroom) => (
                        <option key={classroom.id} value={classroom.id}>
                          {classroom.name}
                        </option>
                      ))}
                    </>
                  )}
                </SelectField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  id="section-time-start"
                  type="time"
                  label={t("setup.classArms.fields.classTimeStart.label")}
                  value={formData.class_time_start}
                  onChange={(event) =>
                    setFormData((current) => ({ ...current, class_time_start: event.target.value }))
                  }
                />
                <InputField
                  id="section-time-end"
                  type="time"
                  label={t("setup.classArms.fields.classTimeEnd.label")}
                  value={formData.class_time_end}
                  onChange={(event) => setFormData((current) => ({ ...current, class_time_end: event.target.value }))}
                  hasError={!!formErrors.class_time_end}
                  error={formErrors.class_time_end}
                />
              </div>

              <InputField
                id="section-description"
                label={t("setup.classArms.fields.description.label")}
                placeholder={t("setup.classArms.fields.description.placeholder")}
                value={formData.description}
                onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
              />

              <Toggle
                id="section-is-active"
                label={t("setup.classArms.fields.isActive.label")}
                helper={t("setup.classArms.fields.isActive.helper")}
                checked={formData.is_active}
                onChange={(checked) => setFormData((current) => ({ ...current, is_active: checked }))}
              />
            </>
          ) : null}
        </div>
      </SlideOverPanel>
    </div>
  );
}
