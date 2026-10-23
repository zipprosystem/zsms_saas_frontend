"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { MultiSearchableSelect } from "@/components/ui/MultiSearchableSelect";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient, type ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { permissionGroupsService } from "@/lib/hr/permissionGroupsApi";
import { allStaffQueryKey, listAllStaff, staffFullName } from "@/lib/hr/staffRecordsApi";
import { PermissionMatrix } from "@/components/hr/PermissionMatrix";
import { canonicalizePermissions, fetchPermissionCatalog, permissionCatalogQueryKey } from "@/lib/hr/permissionCatalog";
import { STAFF_LIST_STATUSES, type PermissionGroup, type PermissionGroupInput, type Staff } from "@/lib/hr/hrTypes";

type FormState = { name: string; permissions: string[]; member_staff_ids: string[] };

const EMPTY_FORM: FormState = { name: "", permissions: [], member_staff_ids: [] };

/** Members are picked from every non-draft staff — a retired/suspended member still shows (and can be removed). */
export function useStaffPickerQuery() {
  return useQuery({
    queryKey: allStaffQueryKey,
    queryFn: () => listAllStaff({}, [...STAFF_LIST_STATUSES]).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
}

/** The backend permission catalog — shared cache for the screen and its form. */
export function usePermissionCatalogQuery() {
  return useQuery({
    queryKey: permissionCatalogQueryKey,
    queryFn: () => fetchPermissionCatalog().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
}

/**
 * Permission Groups — name + permissions from the BACKEND catalog
 * (GET erp/permission-catalog; no hardcoded list) + members (staff.id).
 * No separate role entity; a one-member group is fine. Members can be
 * added/removed here or from the staff form (the group owns membership
 * either way). Capture only: nothing in the app enforces these yet.
 *
 * Stored keys are mapped onto the catalog only once it has LOADED
 * (canonicalizePermissions: legacy staff.create/edit/delete ->
 * staff.manage, unknown keys dropped). If the catalog can't load, the
 * permission picker is replaced by a notice and a save keeps the group's
 * keys exactly as they were.
 */
export function PermissionGroupsScreen() {
  const t = useTranslations();
  const staffQuery = useStaffPickerQuery();
  const catalogQuery = usePermissionCatalogQuery();
  const catalog = catalogQuery.data?.ok && catalogQuery.data.data.modules.length > 0 ? catalogQuery.data.data : null;
  const canonical = (keys: string[]) => (catalog ? canonicalizePermissions(keys, catalog) : keys);
  const staff: Staff[] = staffQuery.data?.ok ? staffQuery.data.data : [];
  const staffName = (id: string) => {
    const member = staff.find((item) => item.id === id);
    return member ? staffFullName(member) : t("hr.common.unknownStaff");
  };

  const memberOptions = staff.map((member) => ({
    value: member.id,
    label: member.staff_no ? `${staffFullName(member)} (${member.staff_no})` : staffFullName(member),
    searchText: [staffFullName(member), member.staff_no, member.email].filter(Boolean).join(" "),
  }));

  const columns: ColumnDef<PermissionGroup>[] = [
    { key: "sn", header: t("hr.permissionGroups.columns.sn"), render: (_row, index) => index + 1 },
    { key: "name", header: t("hr.permissionGroups.columns.name"), render: (row) => row.name },
    {
      key: "permissions",
      header: t("hr.permissionGroups.columns.permissions"),
      render: (row) => t("hr.permissionGroups.permissionCount", { count: canonical(row.permissions).length }),
    },
    {
      key: "members",
      header: t("hr.permissionGroups.columns.members"),
      render: (row) =>
        row.member_staff_ids.length === 0 ? (
          <span className="text-text-muted">{t("hr.permissionGroups.noMembers")}</span>
        ) : (
          <span className="block max-w-xs truncate" title={row.member_staff_ids.map(staffName).join(", ")}>
            {t("hr.permissionGroups.memberCount", { count: row.member_staff_ids.length })}
            {" · "}
            {row.member_staff_ids.slice(0, 3).map(staffName).join(", ")}
            {row.member_staff_ids.length > 3 ? "…" : ""}
          </span>
        ),
    },
  ];

  const exportColumns: ExportColumn<PermissionGroup>[] = [
    { header: t("hr.permissionGroups.columns.name"), value: (row) => row.name },
    { header: t("hr.permissionGroups.columns.permissions"), value: (row) => canonical(row.permissions).join(", ") },
    { header: t("hr.permissionGroups.columns.members"), value: (row) => row.member_staff_ids.map(staffName).join(", ") },
  ];

  const toInput = (data: FormState): PermissionGroupInput => ({
    name: data.name.trim(),
    permissions: data.permissions,
    member_staff_ids: data.member_staff_ids,
  });

  return (
    <CrudScreen<PermissionGroup, PermissionGroupInput, PermissionGroupInput, FormState>
      title={t("hr.permissionGroups.title")}
      subtitle={t("hr.permissionGroups.subtitle")}
      addNewLabel={t("hr.permissionGroups.addNew")}
      panelTitle={{ create: t("hr.permissionGroups.panel.createTitle"), edit: t("hr.permissionGroups.panel.editTitle") }}
      panelSubtitle={t("hr.permissionGroups.panel.subtitle")}
      service={permissionGroupsService}
      display={{ mode: "table", columns }}
      getRowId={(row) => row.id}
      searchPlaceholder={t("hr.permissionGroups.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      rowActions={(_row, helpers) => [{ key: "edit", label: t("common.edit"), onClick: helpers.edit }]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({ name: row.name, permissions: canonical(row.permissions), member_staff_ids: row.member_staff_ids })}
      validate={(data): Record<string, string> =>
        data.name.trim() ? {} : { name: t("hr.permissionGroups.errors.nameRequired") }
      }
      toCreateInput={toInput}
      toUpdateInput={toInput}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="permission-group-name"
            label={t("hr.permissionGroups.fields.name.label")}
            placeholder={t("hr.permissionGroups.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />
          {catalog ? (
            <PermissionMatrix catalog={catalog} value={data.permissions} onChange={(permissions) => onChange({ permissions })} />
          ) : (
            <div className="rounded-md border border-border px-4 py-3 text-sm text-text-muted">
              {catalogQuery.isPending
                ? t("hr.permissionGroups.catalog.loading")
                : isDevBypassUnavailable(catalogQuery.data)
                  ? t("setup.crudScreen.errors.devBypassUnavailable")
                  : t("hr.permissionGroups.catalog.unavailable")}
            </div>
          )}
          <MultiSearchableSelect
            id="permission-group-members"
            label={t("hr.permissionGroups.fields.members.label")}
            placeholder={
              staffQuery.isPending ? t("hr.common.loading") : t("hr.permissionGroups.fields.members.placeholder")
            }
            options={memberOptions}
            value={data.member_staff_ids}
            onChange={(member_staff_ids) => onChange({ member_staff_ids })}
            disabled={staffQuery.isPending}
            noOptionsLabel={t("hr.permissionGroups.fields.members.noOptions")}
          />
        </>
      )}
      emptyMessage={t("hr.permissionGroups.empty")}
      toastMessages={{
        created: t("hr.permissionGroups.toast.created"),
        updated: t("hr.permissionGroups.toast.updated"),
        deleted: t("hr.permissionGroups.toast.deleted"),
      }}
      exportColumns={exportColumns}
      exportFilenamePrefix="permission-groups"
    />
  );
}
