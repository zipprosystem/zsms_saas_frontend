"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import type { ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import {
  departmentsService,
  type Department,
  type DepartmentInput,
} from "@/lib/setup/academicStructure/departmentsApi";
import { subjectsMasterService } from "@/lib/setup/academicStructure/subjectsMasterApi";
import { staffQueryKey, listStaff, type StaffMember } from "@/lib/staff/staffApi";

type FormState = {
  name: string;
  hod_staff_id: string;
  senior_manager_staff_id: string;
};

const EMPTY_FORM: FormState = { name: "", hod_staff_id: "", senior_manager_staff_id: "" };

export function DepartmentsScreen() {
  const t = useTranslations();

  // Fetched once, shared across every screen that needs a staff dropdown
  // (currently just this one) via the same query key.
  const staffQuery = useQuery({
    queryKey: staffQueryKey,
    queryFn: listStaff,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const staff: StaffMember[] = staffQuery.data ?? [];
  const staffName = (id: string): string | null => staff.find((member) => member.id === id)?.full_name ?? null;

  // Subjects-count derivation — reads Subject Master's OWN query key (not a
  // separate fetch) via `select`, so this and SubjectsMasterScreen's own
  // list share one cache entry. Creating/deleting a subject there
  // invalidates ["setup","subjectsMaster"], which refetches here too and
  // updates every department's count with no extra plumbing.
  const subjectsCountQuery = useQuery({
    queryKey: subjectsMasterService.queryKey,
    queryFn: () => subjectsMasterService.list().then(throwIfTransient),
    select: (result): Record<string, number> => {
      if (!result.ok) return {};
      const counts: Record<string, number> = {};
      for (const subject of result.data) {
        counts[subject.department_id] = (counts[subject.department_id] ?? 0) + 1;
      }
      return counts;
    },
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const subjectsCount = (departmentId: string): number => subjectsCountQuery.data?.[departmentId] ?? 0;

  const columns: ColumnDef<Department>[] = [
    { key: "name", header: t("setup.departments.columns.name"), render: (row) => row.name },
    {
      key: "hod",
      header: t("setup.departments.columns.hod"),
      render: (row) => staffName(row.hod_staff_id) ?? "—",
    },
    {
      key: "seniorManager",
      header: t("setup.departments.columns.seniorManager"),
      render: (row) => (row.senior_manager_staff_id ? (staffName(row.senior_manager_staff_id) ?? "—") : "—"),
    },
    {
      key: "subjectsCount",
      header: t("setup.departments.columns.subjectsCount"),
      render: (row) => String(subjectsCount(row.id)),
    },
    {
      // Pending the Staff/HR module — no real staff-to-department link
      // exists yet, so this is deliberately "—", never a guessed 0 (0
      // would imply "confirmed zero staff", which we don't know).
      key: "staffCount",
      header: t("setup.departments.columns.staffCount"),
      render: () => "—",
    },
  ];

  const exportColumns: ExportColumn<Department>[] = [
    { header: t("setup.departments.columns.name"), value: (row) => row.name },
    { header: t("setup.departments.columns.hod"), value: (row) => staffName(row.hod_staff_id) ?? "" },
    {
      header: t("setup.departments.columns.seniorManager"),
      value: (row) => (row.senior_manager_staff_id ? (staffName(row.senior_manager_staff_id) ?? "") : ""),
    },
    { header: t("setup.departments.columns.subjectsCount"), value: (row) => subjectsCount(row.id) },
  ];

  return (
    <CrudScreen<Department, DepartmentInput, DepartmentInput, FormState>
      title={t("setup.departments.title")}
      subtitle={t("setup.departments.subtitle")}
      addNewLabel={t("setup.departments.addNew")}
      panelTitle={{
        create: t("setup.departments.panel.createTitle"),
        edit: t("setup.departments.panel.editTitle"),
      }}
      service={departmentsService}
      display={{ mode: "table", columns }}
      exportColumns={exportColumns}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.departments.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      rowActions={(row, helpers) => {
        const count = subjectsCount(row.id);
        return [
          { key: "edit", label: t("common.edit"), onClick: helpers.edit },
          {
            key: "delete",
            label: t("common.delete"),
            variant: "danger",
            onClick: helpers.remove,
            // FRONTEND-ONLY guard until the real API enforces this
            // server-side (409) — see departmentsApi.ts's remove().
            disabled: count > 0,
            disabledReason:
              count > 0 ? t("setup.departments.actions.cantDeleteHasSubjects", { count }) : undefined,
            confirm: {
              title: t("setup.departments.confirmDelete.title"),
              message: t("setup.departments.confirmDelete.message", { name: row.name }),
            },
          },
        ];
      }}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({
        name: row.name,
        hod_staff_id: row.hod_staff_id,
        senior_manager_staff_id: row.senior_manager_staff_id ?? "",
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.departments.errors.nameRequired");
        if (!data.hod_staff_id) errors.hod_staff_id = t("setup.departments.errors.hodRequired");
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        hod_staff_id: data.hod_staff_id,
        senior_manager_staff_id: data.senior_manager_staff_id || null,
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        hod_staff_id: data.hod_staff_id,
        senior_manager_staff_id: data.senior_manager_staff_id || null,
      })}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="department-name"
            label={t("setup.departments.fields.name.label")}
            placeholder={t("setup.departments.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />

          <SelectField
            id="department-hod"
            label={t("setup.departments.fields.hod.label")}
            value={data.hod_staff_id}
            onChange={(event) => onChange({ hod_staff_id: event.target.value })}
            disabled={staffQuery.isPending}
            hasError={!!errors.hod_staff_id}
            error={errors.hod_staff_id}
          >
            {staffQuery.isPending ? (
              <option value="">{t("setup.departments.fields.hod.loading")}</option>
            ) : (
              <>
                <option value="" disabled>
                  {t("setup.departments.fields.hod.placeholder")}
                </option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} — {member.role}
                  </option>
                ))}
              </>
            )}
          </SelectField>

          <SelectField
            id="department-senior-manager"
            label={t("setup.departments.fields.seniorManager.label")}
            value={data.senior_manager_staff_id}
            onChange={(event) => onChange({ senior_manager_staff_id: event.target.value })}
            disabled={staffQuery.isPending}
          >
            {staffQuery.isPending ? (
              <option value="">{t("setup.departments.fields.seniorManager.loading")}</option>
            ) : (
              <>
                <option value="">{t("setup.departments.fields.seniorManager.none")}</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} — {member.role}
                  </option>
                ))}
              </>
            )}
          </SelectField>
        </>
      )}
      emptyMessage={t("setup.departments.empty")}
      toastMessages={{
        created: t("setup.departments.toast.created"),
        updated: t("setup.departments.toast.updated"),
        deleted: t("setup.departments.toast.deleted"),
      }}
    />
  );
}
