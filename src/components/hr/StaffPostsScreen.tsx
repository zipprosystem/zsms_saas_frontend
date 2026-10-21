"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { CrudScreen } from "@/components/setup/CrudScreen";
import type { ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { staffPostsService } from "@/lib/hr/staffPostsApi";
import type { StaffPost, StaffPostInput } from "@/lib/hr/hrTypes";

type FormState = { name: string; is_active: boolean };

const EMPTY_FORM: FormState = { name: "", is_active: true };

function ActiveBadge({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isActive ? "bg-category-green-tint text-success" : "border border-border text-text-secondary"
      }`}
    >
      {label}
    </span>
  );
}

/**
 * Staff Posts — the designations master (Principal, Teacher, Bursar…) a
 * staff's "Post" points at. Label only: a post grants no access (that's
 * Permission Groups). Add/edit only, per the task — an inactive post drops
 * out of the staff form's choices; current holders keep it.
 */
export function StaffPostsScreen() {
  const t = useTranslations();

  const columns: ColumnDef<StaffPost>[] = [
    { key: "sn", header: t("hr.staffPosts.columns.sn"), render: (_row, index) => index + 1 },
    { key: "name", header: t("hr.staffPosts.columns.name"), render: (row) => row.name },
    { key: "staffCount", header: t("hr.staffPosts.columns.staffCount"), render: (row) => row.staff_count ?? "—" },
    {
      key: "status",
      header: t("hr.staffPosts.columns.status"),
      render: (row) => (
        <ActiveBadge isActive={row.is_active} label={t(row.is_active ? "hr.common.active" : "hr.common.inactive")} />
      ),
    },
  ];

  const exportColumns: ExportColumn<StaffPost>[] = [
    { header: t("hr.staffPosts.columns.name"), value: (row) => row.name },
    { header: t("hr.staffPosts.columns.staffCount"), value: (row) => row.staff_count ?? "" },
    { header: t("hr.staffPosts.columns.status"), value: (row) => t(row.is_active ? "hr.common.active" : "hr.common.inactive") },
  ];

  const toInput = (data: FormState): StaffPostInput => ({ name: data.name.trim(), is_active: data.is_active });

  return (
    <CrudScreen<StaffPost, StaffPostInput, StaffPostInput, FormState>
      title={t("hr.staffPosts.title")}
      subtitle={t("hr.staffPosts.subtitle")}
      addNewLabel={t("hr.staffPosts.addNew")}
      panelTitle={{ create: t("hr.staffPosts.panel.createTitle"), edit: t("hr.staffPosts.panel.editTitle") }}
      service={staffPostsService}
      display={{ mode: "table", columns }}
      getRowId={(row) => row.id}
      searchPlaceholder={t("hr.staffPosts.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      filterDefs={[
        {
          key: "status",
          label: t("hr.staffPosts.columns.status"),
          options: [
            { value: "", label: t("hr.common.allStatuses") },
            { value: "active", label: t("hr.common.active") },
            { value: "inactive", label: t("hr.common.inactive") },
          ],
        },
      ]}
      matchesFilters={(row, filters) => !filters.status || (filters.status === "active") === row.is_active}
      rowActions={(_row, helpers) => [{ key: "edit", label: t("common.edit"), onClick: helpers.edit }]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({ name: row.name, is_active: row.is_active })}
      validate={(data): Record<string, string> => (data.name.trim() ? {} : { name: t("hr.staffPosts.errors.nameRequired") })}
      toCreateInput={toInput}
      toUpdateInput={toInput}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="staff-post-name"
            label={t("hr.staffPosts.fields.name.label")}
            placeholder={t("hr.staffPosts.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />
          <Toggle
            id="staff-post-active"
            label={t("hr.staffPosts.fields.isActive.label")}
            helper={t("hr.staffPosts.fields.isActive.helper")}
            checked={data.is_active}
            onChange={(checked) => onChange({ is_active: checked })}
          />
        </>
      )}
      emptyMessage={t("hr.staffPosts.empty")}
      toastMessages={{
        created: t("hr.staffPosts.toast.created"),
        updated: t("hr.staffPosts.toast.updated"),
        deleted: t("hr.staffPosts.toast.deleted"),
      }}
      exportColumns={exportColumns}
      exportFilenamePrefix="staff-posts"
    />
  );
}
