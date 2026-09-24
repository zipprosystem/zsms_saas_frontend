"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { CrudScreen } from "@/components/setup/CrudScreen";
import {
  academicYearsService,
  type AcademicYear,
  type AcademicYearInput,
} from "@/lib/setup/academicStructure/academicYearsApi";
import {
  deriveAcademicYearStatus,
  ACADEMIC_YEAR_STATUS_BADGE_STYLES,
  type AcademicYearStatus,
} from "@/lib/setup/academicStructure/academicYearStatus";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";

type FormState = {
  name: string;
  start_date: string;
  end_date: string;
};

const EMPTY_FORM: FormState = { name: "", start_date: "", end_date: "" };

export function AcademicYearsScreen() {
  const t = useTranslations();
  const statusLabel = (status: AcademicYearStatus) => t(`setup.academicYears.status.${status}`);

  const columns: ColumnDef<AcademicYear>[] = [
    { key: "name", header: t("setup.academicYears.columns.name"), render: (row) => row.name },
    { key: "start_date", header: t("setup.academicYears.columns.startDate"), render: (row) => row.start_date },
    { key: "end_date", header: t("setup.academicYears.columns.endDate"), render: (row) => row.end_date },
    {
      key: "status",
      header: t("setup.academicYears.columns.status"),
      render: (row) => {
        const status = deriveAcademicYearStatus(row);
        return (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACADEMIC_YEAR_STATUS_BADGE_STYLES[status]}`}>
            {statusLabel(status)}
          </span>
        );
      },
    },
  ];

  const filterDefs: FilterDef[] = [
    {
      key: "status",
      label: t("setup.academicYears.filters.status"),
      options: [
        { value: "", label: t("setup.academicYears.filters.all") },
        { value: "active", label: statusLabel("active") },
        { value: "upcoming", label: statusLabel("upcoming") },
        { value: "completed", label: statusLabel("completed") },
      ],
    },
  ];

  return (
    <CrudScreen<AcademicYear, AcademicYearInput, AcademicYearInput, FormState>
      title={t("setup.academicYears.title")}
      subtitle={t("setup.academicYears.subtitle")}
      addNewLabel={t("setup.academicYears.addNew")}
      panelTitle={{
        create: t("setup.academicYears.panel.createTitle"),
        edit: t("setup.academicYears.panel.editTitle"),
      }}
      panelSubtitle={t("setup.academicYears.panel.subtitle")}
      service={academicYearsService}
      display={{ mode: "table", columns }}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.academicYears.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      filterDefs={filterDefs}
      matchesFilters={(row, filters) => !filters.status || deriveAcademicYearStatus(row) === filters.status}
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "activate",
          label: t("setup.academicYears.actions.activate"),
          onClick: () => helpers.runCustom("activate"),
          disabled: row.is_active,
          disabledReason: row.is_active ? t("setup.academicYears.actions.alreadyActive") : undefined,
        },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          disabled: row.is_active,
          disabledReason: row.is_active ? t("setup.academicYears.actions.cantDeleteActive") : undefined,
          confirm: {
            title: t("setup.academicYears.confirmDelete.title"),
            message: t("setup.academicYears.confirmDelete.message", { name: row.name }),
          },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({ name: row.name, start_date: row.start_date, end_date: row.end_date })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.academicYears.errors.nameRequired");
        if (!data.start_date) errors.start_date = t("setup.academicYears.errors.startDateRequired");
        if (!data.end_date) errors.end_date = t("setup.academicYears.errors.endDateRequired");
        if (data.start_date && data.end_date && data.end_date <= data.start_date) {
          errors.end_date = t("setup.academicYears.errors.endBeforeStart");
        }
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
      })}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="academic-year-name"
            label={t("setup.academicYears.fields.name.label")}
            placeholder={t("setup.academicYears.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />
          <InputField
            id="academic-year-start-date"
            type="date"
            label={t("setup.academicYears.fields.startDate.label")}
            value={data.start_date}
            onChange={(event) => onChange({ start_date: event.target.value })}
            hasError={!!errors.start_date}
            error={errors.start_date}
          />
          <InputField
            id="academic-year-end-date"
            type="date"
            label={t("setup.academicYears.fields.endDate.label")}
            value={data.end_date}
            onChange={(event) => onChange({ end_date: event.target.value })}
            hasError={!!errors.end_date}
            error={errors.end_date}
          />
        </>
      )}
      emptyMessage={t("setup.academicYears.empty")}
      toastMessages={{
        created: t("setup.academicYears.toast.created"),
        updated: t("setup.academicYears.toast.updated"),
        deleted: t("setup.academicYears.toast.deleted"),
      }}
    />
  );
}
