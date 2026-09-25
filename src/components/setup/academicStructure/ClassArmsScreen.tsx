"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { FilterDropdown } from "@/components/setup/SetupToolbar";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import {
  buildingsService,
  classroomsService,
  type Building,
  type Classroom,
} from "@/lib/setup/academicStructure/facilitiesApi";
import {
  createSectionsService,
  type Section,
  type SectionCache,
  type SectionInput,
} from "@/lib/setup/academicStructure/sectionsApi";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";

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
 * school type is currently being viewed, and owns the section cache
 * (a plain Map in a ref — the SAME instance survives every school-type
 * switch within this mount, which is what makes "switching back doesn't
 * refetch" work: SectionsTable rebuilds its service on each switch, but
 * every one of those services shares this one cache).
 */
function SchoolTypeGate({ yearId }: { yearId: string }) {
  const t = useTranslations();
  const [schoolTypes, setSchoolTypes] = useState<SchoolTypesState>({ status: "loading" });
  const [classes, setClasses] = useState<ClassesState>({ status: "loading" });
  const [selectedSchoolTypeId, setSelectedSchoolTypeId] = useState("");
  const cacheRef = useRef<SectionCache>(new Map());

  useEffect(() => {
    let cancelled = false;
    // A different year means an entirely different set of class ids —
    // wipe the cache and the current selection rather than risk any
    // cross-year confusion.
    cacheRef.current = new Map();
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
          cache={cacheRef.current}
        />
      )}
    </div>
  );
}

function ClassArmsTable({
  schoolTypes,
  classes,
  activeClasses,
  selectedSchoolTypeId,
  cache,
}: {
  schoolTypes: SchoolType[];
  classes: SchoolClass[];
  activeClasses: SchoolClass[];
  selectedSchoolTypeId: string;
  cache: SectionCache;
}) {
  const t = useTranslations();

  const [buildings, setBuildings] = useState<ReferenceListState<Building>>({ status: "loading" });
  const [classrooms, setClassrooms] = useState<ReferenceListState<Classroom>>({ status: "loading" });
  const [armNames, setArmNames] = useState<string[]>([]);

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

  // Rebuilt on every school-type switch, but all instances share the same
  // `cache` (a ref one level up) — a switch back to an already-visited
  // type finds its classes' entries already warm.
  const classIdsKey = activeClasses
    .map((cls) => cls.id)
    .sort()
    .join(",");
  const sectionsService = useMemo(
    () => createSectionsService({ classIds: activeClasses.map((cls) => cls.id), cache }),
    // classIdsKey fully captures what activeClasses/cache changing means
    // here — depending on the array/Map references directly would rebuild
    // every render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classIdsKey],
  );

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

  // Defaulted on create (a typical school day), never overridden on edit —
  // toFormState() below always seeds from the actual record's own values,
  // this default only ever applies via CrudScreen's openCreate().
  const emptyFormState: FormState = {
    school_type_id: selectedSchoolTypeId,
    class_id: "",
    arm_name: "",
    building_id: "",
    classroom_id: "",
    class_time_start: "08:00",
    class_time_end: "15:00",
    description: "",
    is_active: true,
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">{t("setup.classArms.inactiveClassNote")}</p>

      <CrudScreen<Section, SectionInput, SectionInput, FormState>
        title={t("setup.classArms.title")}
        subtitle={t("setup.classArms.subtitle")}
        addNewLabel={t("setup.classArms.addNew")}
        panelTitle={{
          create: t("setup.classArms.panel.createTitle"),
          edit: t("setup.classArms.panel.editTitle"),
        }}
        service={sectionsService}
        display={{ mode: "table", columns }}
        getRowId={(row) => row.id}
        searchPlaceholder={t("setup.classArms.searchPlaceholder")}
        matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
        filterDefs={filterDefs}
        matchesFilters={(row, filters) =>
          (!filters.class || row.class_id === filters.class) &&
          (!filters.armName || row.name === filters.armName) &&
          (!filters.status || (filters.status === "active") === row.is_active)
        }
        onItemsLoaded={(items) => {
          setArmNames(Array.from(new Set(items.map((item) => item.name))).sort());
        }}
        rowActions={(row, helpers) => [
          { key: "edit", label: t("common.edit"), onClick: helpers.edit },
          row.is_active
            ? {
                key: "deactivate",
                label: t("setup.classArms.actions.deactivate"),
                onClick: () => helpers.runCustom("deactivate"),
              }
            : {
                key: "reactivate",
                label: t("setup.classArms.actions.reactivate"),
                onClick: () => helpers.runCustom("reactivate"),
              },
          {
            key: "delete",
            label: t("common.delete"),
            variant: "danger",
            onClick: helpers.remove,
            confirm: {
              title: t("setup.classArms.confirmDelete.title"),
              message: t("setup.classArms.confirmDelete.message", { name: row.name }),
            },
          },
        ]}
        emptyFormState={emptyFormState}
        toFormState={(row) => ({
          school_type_id: classById(row.class_id)?.school_type_id ?? "",
          class_id: row.class_id,
          arm_name: row.name,
          building_id: row.building_id ?? "",
          classroom_id: row.classroom_id ?? "",
          class_time_start: row.class_time_start ?? "",
          class_time_end: row.class_time_end ?? "",
          description: row.description ?? "",
          is_active: row.is_active,
        })}
        validate={(data) => {
          const errors: Record<string, string> = {};
          if (!data.school_type_id) errors.school_type_id = t("setup.classArms.errors.schoolTypeRequired");
          if (!data.class_id) errors.class_id = t("setup.classArms.errors.classRequired");
          if (!data.arm_name.trim()) errors.arm_name = t("setup.classArms.errors.armNameRequired");
          if (
            data.class_time_start &&
            data.class_time_end &&
            data.class_time_end <= data.class_time_start
          ) {
            errors.class_time_end = t("setup.classArms.errors.endBeforeStart");
          }
          return errors;
        }}
        toCreateInput={(data) => ({
          class_id: data.class_id,
          arm_name: data.arm_name.trim(),
          building_id: data.building_id || null,
          classroom_id: data.classroom_id || null,
          class_time_start: data.class_time_start || null,
          class_time_end: data.class_time_end || null,
          description: data.description.trim() || null,
          is_active: data.is_active,
        })}
        toUpdateInput={(data) => ({
          class_id: data.class_id,
          arm_name: data.arm_name.trim(),
          building_id: data.building_id || null,
          classroom_id: data.classroom_id || null,
          class_time_start: data.class_time_start || null,
          class_time_end: data.class_time_end || null,
          description: data.description.trim() || null,
          is_active: data.is_active,
        })}
        renderFields={({ data, onChange, errors }) => {
          const classesOfFormType = classes.filter(
            (cls) => cls.school_type_id === data.school_type_id && cls.is_active,
          );
          return (
            <>
              <SelectField
                id="section-school-type"
                label={t("setup.classArms.fields.schoolType.label")}
                value={data.school_type_id}
                onChange={(event) => onChange({ school_type_id: event.target.value, class_id: "" })}
                hasError={!!errors.school_type_id}
                error={errors.school_type_id}
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
                value={data.class_id}
                onChange={(event) => onChange({ class_id: event.target.value })}
                disabled={!data.school_type_id}
                hasError={!!errors.class_id}
                error={errors.class_id}
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
                value={data.arm_name}
                onChange={(event) => onChange({ arm_name: event.target.value })}
                hasError={!!errors.arm_name}
                error={errors.arm_name}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="section-building"
                  label={t("setup.classArms.fields.building.label")}
                  value={data.building_id}
                  onChange={(event) => onChange({ building_id: event.target.value })}
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
                  value={data.classroom_id}
                  onChange={(event) => onChange({ classroom_id: event.target.value })}
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
                  value={data.class_time_start}
                  onChange={(event) => onChange({ class_time_start: event.target.value })}
                />
                <InputField
                  id="section-time-end"
                  type="time"
                  label={t("setup.classArms.fields.classTimeEnd.label")}
                  value={data.class_time_end}
                  onChange={(event) => onChange({ class_time_end: event.target.value })}
                  hasError={!!errors.class_time_end}
                  error={errors.class_time_end}
                />
              </div>

              <InputField
                id="section-description"
                label={t("setup.classArms.fields.description.label")}
                placeholder={t("setup.classArms.fields.description.placeholder")}
                value={data.description}
                onChange={(event) => onChange({ description: event.target.value })}
              />

              <Toggle
                id="section-is-active"
                label={t("setup.classArms.fields.isActive.label")}
                helper={t("setup.classArms.fields.isActive.helper")}
                checked={data.is_active}
                onChange={(checked) => onChange({ is_active: checked })}
              />
            </>
          );
        }}
        emptyMessage={t("setup.classArms.empty")}
        toastMessages={{
          created: t("setup.classArms.toast.created"),
          updated: t("setup.classArms.toast.updated"),
          deleted: t("setup.classArms.toast.deleted"),
        }}
      />
    </div>
  );
}
