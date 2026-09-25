"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import {
  createClassesService,
  type SchoolClass,
  type ClassCreateInput,
  type ClassUpdateInput,
} from "@/lib/setup/academicStructure/classesApi";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { feesService, type Fee } from "@/lib/setup/academicStructure/feesApi";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";

type FormState = {
  school_type_id: string;
  name: string;
  level: string;
  duration: string;
  short_name: string;
  minimum_age_years: string;
  description: string;
  fee_id: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  school_type_id: "",
  name: "",
  level: "",
  duration: "",
  short_name: "",
  minimum_age_years: "",
  description: "",
  fee_id: "",
  is_active: true,
};

type SchoolTypesState =
  | { status: "loading" }
  | { status: "loaded"; items: SchoolType[] }
  | { status: "error" };

type FeesState = { status: "loading" } | { status: "loaded"; items: Fee[] };

/**
 * Outer guard — a class always belongs to an academic year, so this screen
 * has nothing meaningful to show without one selected. Split into two
 * components (rather than an early return inside one) so ClassesTable
 * never has to deal with a null yearId at all, and so its hooks
 * (useMemo(createClassesService), the fetch-on-mount effects) don't run
 * pointlessly while there's no year to scope them to.
 */
export function ClassesScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.classes.noYear.message")}</p>
        <Link
          href="/admin/setup/academic-structure/academic-years"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {t("setup.classes.noYear.linkLabel")}
        </Link>
      </div>
    );
  }

  if (!selectedYearId) {
    // Loading or errored — AcademicYearContext already logs/handles the
    // error case globally (e.g. the header pill); this screen just waits
    // rather than duplicating a second error banner for the same state.
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-text-muted">
        {t("setup.dataTable.loading")}
      </div>
    );
  }

  return <ClassesTable yearId={selectedYearId} />;
}

function ClassesTable({ yearId }: { yearId: string }) {
  const t = useTranslations();

  // Both fetched once per mount, independently of useCrudTable/CrudScreen —
  // these are reference data for the form/table/filters, not classes
  // fields themselves. Re-created (not re-fetched) when the year changes,
  // since ClassesScreen remounts this component with a new key... actually
  // it doesn't need to: School Types and Fees aren't year-scoped, so they
  // stay valid across a year switch and don't need to be in this effect's
  // deps.
  const [schoolTypes, setSchoolTypes] = useState<SchoolTypesState>({ status: "loading" });
  const [fees, setFees] = useState<FeesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    schoolTypesService.list().then((result) => {
      if (cancelled) return;
      setSchoolTypes(result.ok ? { status: "loaded", items: result.data } : { status: "error" });
    });
    feesService.list().then((items) => {
      if (cancelled) return;
      setFees({ status: "loaded", items });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const noSchoolTypesYet = schoolTypes.status === "loaded" && schoolTypes.items.length === 0;

  const schoolTypeName = (id: string): string | null =>
    schoolTypes.status === "loaded" ? (schoolTypes.items.find((type) => type.id === id)?.name ?? null) : null;

  // Rebuilt whenever the selected year changes — this IS the mechanism
  // that gets Classes to refetch on a year switch, see useCrudTable.ts's
  // refetch-on-service-change effect.
  const classesService = useMemo(() => createClassesService(yearId), [yearId]);

  const columns: ColumnDef<SchoolClass>[] = [
    { key: "name", header: t("setup.classes.columns.name"), render: (row) => row.name },
    {
      key: "shortName",
      header: t("setup.classes.columns.shortName"),
      render: (row) => row.short_name ?? "—",
    },
    {
      key: "schoolType",
      header: t("setup.classes.columns.schoolType"),
      render: (row) => schoolTypeName(row.school_type_id) ?? "—",
    },
    { key: "level", header: t("setup.classes.columns.level"), render: (row) => row.level ?? "—" },
    { key: "duration", header: t("setup.classes.columns.duration"), render: (row) => row.duration },
    {
      key: "minimumAge",
      header: t("setup.classes.columns.minimumAge"),
      render: (row) => row.minimum_age_years,
    },
    {
      key: "status",
      header: t("setup.classes.columns.status"),
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            row.is_active ? "bg-category-green-tint text-status-done-text" : "bg-background text-text-muted"
          }`}
        >
          {t(row.is_active ? "setup.classes.status.active" : "setup.classes.status.inactive")}
        </span>
      ),
    },
  ];

  const filterDefs: FilterDef[] = [
    {
      key: "schoolType",
      label: t("setup.classes.filters.schoolType"),
      options: [
        { value: "", label: t("setup.classes.filters.all") },
        ...(schoolTypes.status === "loaded"
          ? schoolTypes.items.map((type) => ({ value: type.id, label: type.name }))
          : []),
      ],
    },
    {
      key: "status",
      label: t("setup.classes.filters.status"),
      options: [
        { value: "", label: t("setup.classes.filters.all") },
        { value: "active", label: t("setup.classes.status.active") },
        { value: "inactive", label: t("setup.classes.status.inactive") },
      ],
    },
  ];

  return (
    <CrudScreen<SchoolClass, ClassCreateInput, ClassUpdateInput, FormState>
      title={t("setup.classes.title")}
      subtitle={t("setup.classes.subtitle")}
      addNewLabel={t("setup.classes.addNew")}
      panelTitle={{
        create: t("setup.classes.panel.createTitle"),
        edit: t("setup.classes.panel.editTitle"),
      }}
      service={classesService}
      display={{ mode: "table", columns }}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.classes.searchPlaceholder")}
      matchesSearch={(row, query) => {
        const needle = query.toLowerCase();
        return row.name.toLowerCase().includes(needle) || (row.short_name ?? "").toLowerCase().includes(needle);
      }}
      filterDefs={filterDefs}
      matchesFilters={(row, filters) =>
        (!filters.schoolType || row.school_type_id === filters.schoolType) &&
        (!filters.status || (filters.status === "active") === row.is_active)
      }
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        row.is_active
          ? {
              key: "deactivate",
              label: t("setup.classes.actions.deactivate"),
              onClick: () => helpers.runCustom("deactivate"),
            }
          : {
              key: "reactivate",
              label: t("setup.classes.actions.reactivate"),
              onClick: () => helpers.runCustom("reactivate"),
            },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: {
            title: t("setup.classes.confirmDelete.title"),
            message: t("setup.classes.confirmDelete.message", { name: row.name }),
          },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({
        school_type_id: row.school_type_id,
        name: row.name,
        level: row.level !== null ? String(row.level) : "",
        duration: row.duration,
        short_name: row.short_name ?? "",
        minimum_age_years: String(row.minimum_age_years),
        description: row.description ?? "",
        fee_id: row.fee_id ?? "",
        is_active: row.is_active,
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.school_type_id) errors.school_type_id = t("setup.classes.errors.schoolTypeRequired");
        if (!data.name.trim()) errors.name = t("setup.classes.errors.nameRequired");
        if (!data.duration.trim()) errors.duration = t("setup.classes.errors.durationRequired");
        if (!data.minimum_age_years.trim()) {
          errors.minimum_age_years = t("setup.classes.errors.minimumAgeRequired");
        } else if (Number.isNaN(Number(data.minimum_age_years)) || Number(data.minimum_age_years) < 0) {
          errors.minimum_age_years = t("setup.classes.errors.minimumAgeInvalid");
        }
        if (data.level.trim() && (Number.isNaN(Number(data.level)) || Number(data.level) < 0)) {
          errors.level = t("setup.classes.errors.levelInvalid");
        }
        return errors;
      }}
      toCreateInput={(data) => ({
        school_type_id: data.school_type_id,
        name: data.name.trim(),
        duration: data.duration.trim(),
        minimum_age_years: Number(data.minimum_age_years),
        level: data.level.trim() ? Number(data.level) : null,
        short_name: data.short_name.trim() || null,
        description: data.description.trim() || null,
        fee_id: data.fee_id || null,
        is_active: data.is_active,
      })}
      toUpdateInput={(data) => ({
        school_type_id: data.school_type_id,
        name: data.name.trim(),
        duration: data.duration.trim(),
        minimum_age_years: Number(data.minimum_age_years),
        level: data.level.trim() ? Number(data.level) : null,
        short_name: data.short_name.trim() || null,
        description: data.description.trim() || null,
        fee_id: data.fee_id || null,
        is_active: data.is_active,
      })}
      renderFields={({ data, onChange, errors }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <SelectField
              id="class-school-type"
              label={t("setup.classes.fields.schoolType.label")}
              value={data.school_type_id}
              onChange={(event) => onChange({ school_type_id: event.target.value })}
              disabled={schoolTypes.status === "loading" || noSchoolTypesYet}
              hasError={!!errors.school_type_id}
              error={errors.school_type_id}
            >
              {schoolTypes.status === "loading" ? (
                <option value="">{t("setup.classes.fields.schoolType.loading")}</option>
              ) : (
                <>
                  <option value="" disabled>
                    {t("setup.classes.fields.schoolType.placeholder")}
                  </option>
                  {schoolTypes.status === "loaded"
                    ? schoolTypes.items.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))
                    : null}
                </>
              )}
            </SelectField>
            {noSchoolTypesYet ? (
              <p className="text-xs text-text-muted">
                {t("setup.classes.fields.schoolType.emptyHint")}{" "}
                <Link
                  href="/admin/setup/academic-structure/school-types"
                  className="font-semibold text-accent hover:underline"
                >
                  {t("setup.classes.fields.schoolType.emptyHintLink")}
                </Link>
              </p>
            ) : null}
            {schoolTypes.status === "error" ? (
              <p className="text-xs text-error">{t("setup.classes.fields.schoolType.loadError")}</p>
            ) : null}
          </div>

          <InputField
            id="class-name"
            label={t("setup.classes.fields.name.label")}
            placeholder={t("setup.classes.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />

          <InputField
            id="class-duration"
            label={t("setup.classes.fields.duration.label")}
            placeholder={t("setup.classes.fields.duration.placeholder")}
            value={data.duration}
            onChange={(event) => onChange({ duration: event.target.value })}
            hasError={!!errors.duration}
            error={errors.duration}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              id="class-short-name"
              label={t("setup.classes.fields.shortName.label")}
              placeholder={t("setup.classes.fields.shortName.placeholder")}
              value={data.short_name}
              onChange={(event) => onChange({ short_name: event.target.value })}
            />
            <InputField
              id="class-level"
              type="number"
              label={t("setup.classes.fields.level.label")}
              placeholder={t("setup.classes.fields.level.placeholder")}
              value={data.level}
              onChange={(event) => onChange({ level: event.target.value })}
              hasError={!!errors.level}
              error={errors.level}
            />
          </div>

          <InputField
            id="class-minimum-age"
            type="number"
            label={t("setup.classes.fields.minimumAge.label")}
            placeholder={t("setup.classes.fields.minimumAge.placeholder")}
            value={data.minimum_age_years}
            onChange={(event) => onChange({ minimum_age_years: event.target.value })}
            hasError={!!errors.minimum_age_years}
            error={errors.minimum_age_years}
          />

          <InputField
            id="class-description"
            label={t("setup.classes.fields.description.label")}
            placeholder={t("setup.classes.fields.description.placeholder")}
            value={data.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />

          <SelectField
            id="class-fee"
            label={t("setup.classes.fields.fee.label")}
            value={data.fee_id}
            onChange={(event) => onChange({ fee_id: event.target.value })}
            disabled={fees.status === "loading"}
          >
            {fees.status === "loading" ? (
              <option value="">{t("setup.classes.fields.fee.loading")}</option>
            ) : (
              <>
                <option value="">{t("setup.classes.fields.fee.none")}</option>
                {fees.items.map((fee) => (
                  <option key={fee.id} value={fee.id}>
                    {fee.name}
                  </option>
                ))}
              </>
            )}
          </SelectField>

          <Toggle
            id="class-is-active"
            label={t("setup.classes.fields.isActive.label")}
            helper={t("setup.classes.fields.isActive.helper")}
            checked={data.is_active}
            onChange={(checked) => onChange({ is_active: checked })}
          />
        </>
      )}
      emptyMessage={t("setup.classes.empty")}
      toastMessages={{
        created: t("setup.classes.toast.created"),
        updated: t("setup.classes.toast.updated"),
        deleted: t("setup.classes.toast.deleted"),
      }}
    />
  );
}
