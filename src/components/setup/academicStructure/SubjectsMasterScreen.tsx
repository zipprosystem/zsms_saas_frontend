"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { ColorPicker, getNextUnusedColor } from "@/components/ui/ColorPicker";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { FileAttachmentField } from "@/components/files/FileAttachmentField";
import { FileDownloadLink } from "@/components/files/FileDownloadLink";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import {
  subjectsMasterService,
  type SubjectMaster,
  type SubjectMasterInput,
} from "@/lib/setup/academicStructure/subjectsMasterApi";
import { departmentsService, type Department } from "@/lib/setup/academicStructure/departmentsApi";
import { validateSubjectFile } from "@/lib/setup/academicStructure/subjectFileUpload";
import type { AttachedFile } from "@/lib/files/filesApi";

// Lazy-loaded — only enters the bundle once the Subject form actually
// opens. See SubjectDescriptionEditor.tsx's own header comment for why
// TipTap specifically earns this treatment when nothing else here does.
const SubjectDescriptionEditor = dynamic(() => import("./SubjectDescriptionEditor"), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-md border border-border bg-background" />,
});

type FormState = {
  name: string;
  short_name: string;
  shortNameTouched: boolean;
  color: string;
  department_id: string;
  file: AttachedFile | null;
  description_json: Record<string, unknown> | null;
  show_on_frontend: boolean;
};

function deriveShortName(name: string): string {
  return name.trim().slice(0, 4).toUpperCase();
}

export function SubjectsMasterScreen() {
  const t = useTranslations();

  // Tracks the currently-loaded subject list purely to derive the "next
  // unused color" for a fresh create form — CrudScreen's onItemsLoaded
  // hook exists exactly for this (see crudTypes.ts), so this doesn't cost
  // a second fetch beyond the one useCrudTable already makes internally.
  const [subjects, setSubjects] = useState<SubjectMaster[]>([]);

  // Shared cache entry with DepartmentsScreen's own list — creating a
  // department there invalidates ["setup","departments"], which refetches
  // here too.
  const departmentsQuery = useQuery({
    queryKey: departmentsService.queryKey,
    queryFn: () => departmentsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const departments: Department[] = departmentsQuery.data?.ok ? departmentsQuery.data.data : [];
  const departmentsLoading = departmentsQuery.isPending;
  const noDepartmentsYet = !departmentsLoading && departments.length === 0;
  const departmentName = (id: string): string | null => departments.find((dept) => dept.id === id)?.name ?? null;

  const emptyFormState: FormState = {
    name: "",
    short_name: "",
    shortNameTouched: false,
    color: getNextUnusedColor(subjects.map((subject) => subject.color)),
    department_id: "",
    file: null,
    description_json: null,
    show_on_frontend: false,
  };

  const columns: ColumnDef<SubjectMaster>[] = [
    { key: "name", header: t("setup.subjectsMaster.columns.name"), render: (row) => row.name },
    { key: "shortName", header: t("setup.subjectsMaster.columns.shortName"), render: (row) => row.short_name },
    {
      key: "color",
      header: t("setup.subjectsMaster.columns.color"),
      render: (row) => (
        <span className="inline-flex items-center gap-2">
          <span
            className="h-4 w-4 rounded-full border border-border"
            style={{ backgroundColor: row.color }}
            aria-hidden="true"
          />
          <span className="text-xs text-text-muted">{row.color}</span>
        </span>
      ),
    },
    {
      key: "department",
      header: t("setup.subjectsMaster.columns.department"),
      render: (row) => departmentName(row.department_id) ?? "—",
    },
    {
      key: "file",
      header: t("setup.subjectsMaster.columns.file"),
      render: (row) =>
        row.file ? (
          <FileDownloadLink fileId={row.file.file_id} className="text-sm font-semibold text-accent hover:underline">
            {t("setup.subjectsMaster.columns.fileDownload")}
          </FileDownloadLink>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "showOnFrontend",
      header: t("setup.subjectsMaster.columns.showOnFrontend"),
      render: (row) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            row.show_on_frontend ? "bg-category-green-tint text-status-done-text" : "bg-background text-text-muted"
          }`}
        >
          {t(row.show_on_frontend ? "setup.subjectsMaster.badges.yes" : "setup.subjectsMaster.badges.no")}
        </span>
      ),
    },
  ];

  const exportColumns: ExportColumn<SubjectMaster>[] = [
    { header: t("setup.subjectsMaster.columns.name"), value: (row) => row.name },
    { header: t("setup.subjectsMaster.columns.shortName"), value: (row) => row.short_name },
    { header: t("setup.subjectsMaster.columns.color"), value: (row) => row.color },
    { header: t("setup.subjectsMaster.columns.department"), value: (row) => departmentName(row.department_id) ?? "" },
    {
      header: t("setup.subjectsMaster.columns.showOnFrontend"),
      value: (row) =>
        t(row.show_on_frontend ? "setup.subjectsMaster.badges.yes" : "setup.subjectsMaster.badges.no"),
    },
  ];

  const filterDefs: FilterDef[] = [
    {
      key: "department",
      label: t("setup.subjectsMaster.filters.department"),
      options: [
        { value: "", label: t("setup.subjectsMaster.filters.all") },
        ...departments.map((dept) => ({ value: dept.id, label: dept.name })),
      ],
    },
  ];

  return (
    <CrudScreen<SubjectMaster, SubjectMasterInput, SubjectMasterInput, FormState>
      title={t("setup.subjectsMaster.title")}
      subtitle={t("setup.subjectsMaster.subtitle")}
      addNewLabel={t("setup.subjectsMaster.addNew")}
      panelTitle={{
        create: t("setup.subjectsMaster.panel.createTitle"),
        edit: t("setup.subjectsMaster.panel.editTitle"),
      }}
      service={subjectsMasterService}
      display={{ mode: "table", columns }}
      exportColumns={exportColumns}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.subjectsMaster.searchPlaceholder")}
      matchesSearch={(row, query) => {
        const needle = query.toLowerCase();
        return row.name.toLowerCase().includes(needle) || row.short_name.toLowerCase().includes(needle);
      }}
      filterDefs={filterDefs}
      matchesFilters={(row, filters) => !filters.department || row.department_id === filters.department}
      onItemsLoaded={setSubjects}
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: {
            title: t("setup.subjectsMaster.confirmDelete.title"),
            message: t("setup.subjectsMaster.confirmDelete.message", { name: row.name }),
          },
        },
      ]}
      emptyFormState={emptyFormState}
      toFormState={(row) => ({
        name: row.name,
        short_name: row.short_name,
        shortNameTouched: row.short_name !== deriveShortName(row.name),
        color: row.color,
        department_id: row.department_id,
        file: row.file,
        description_json: row.description_json,
        show_on_frontend: row.show_on_frontend,
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.subjectsMaster.errors.nameRequired");
        if (!data.short_name.trim()) errors.short_name = t("setup.subjectsMaster.errors.shortNameRequired");
        if (!data.department_id) errors.department_id = t("setup.subjectsMaster.errors.departmentRequired");
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        short_name: data.short_name.trim().toUpperCase(),
        color: data.color,
        department_id: data.department_id,
        file_id: data.file?.file_id ?? null,
        description_json: data.description_json,
        show_on_frontend: data.show_on_frontend,
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        short_name: data.short_name.trim().toUpperCase(),
        color: data.color,
        department_id: data.department_id,
        file_id: data.file?.file_id ?? null,
        description_json: data.description_json,
        show_on_frontend: data.show_on_frontend,
      })}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="subject-name"
            label={t("setup.subjectsMaster.fields.name.label")}
            placeholder={t("setup.subjectsMaster.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => {
              const name = event.target.value;
              onChange({
                name,
                // Keeps auto-syncing from the name until the user directly
                // edits the short-name field themselves (see the
                // short-name InputField's onChange below).
                short_name: data.shortNameTouched ? data.short_name : deriveShortName(name),
              });
            }}
            hasError={!!errors.name}
            error={errors.name}
          />

          <InputField
            id="subject-short-name"
            label={t("setup.subjectsMaster.fields.shortName.label")}
            placeholder={t("setup.subjectsMaster.fields.shortName.placeholder")}
            value={data.short_name}
            onChange={(event) =>
              onChange({ short_name: event.target.value.toUpperCase(), shortNameTouched: true })
            }
            hasError={!!errors.short_name}
            error={errors.short_name}
            maxLength={10}
          />

          <ColorPicker
            id="subject-color"
            label={t("setup.subjectsMaster.fields.color.label")}
            customLabel={t("setup.subjectsMaster.fields.color.custom")}
            value={data.color}
            onChange={(color) => onChange({ color })}
          />

          <div className="flex flex-col gap-1.5">
            <SelectField
              id="subject-department"
              label={t("setup.subjectsMaster.fields.department.label")}
              value={data.department_id}
              onChange={(event) => onChange({ department_id: event.target.value })}
              disabled={departmentsLoading || noDepartmentsYet}
              hasError={!!errors.department_id}
              error={errors.department_id}
            >
              {departmentsLoading ? (
                <option value="">{t("setup.subjectsMaster.fields.department.loading")}</option>
              ) : (
                <>
                  <option value="" disabled>
                    {t("setup.subjectsMaster.fields.department.placeholder")}
                  </option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </>
              )}
            </SelectField>
            {noDepartmentsYet ? (
              <p className="text-xs text-text-muted">
                {t("setup.subjectsMaster.fields.department.emptyHint")}{" "}
                <Link
                  href="/admin/setup/academic-structure/departments"
                  className="font-semibold text-accent hover:underline"
                >
                  {t("setup.subjectsMaster.fields.department.emptyHintLink")}
                </Link>
              </p>
            ) : null}
          </div>

          <FileAttachmentField
            label={t("setup.subjectsMaster.fields.file.label")}
            chooseLabel={t("setup.subjectsMaster.fields.file.choose")}
            chooseIcon={<UploadIcon className="h-4 w-4" />}
            accept="application/pdf"
            validate={validateSubjectFile}
            validationMessages={{
              unsupportedType: t("setup.subjectsMaster.fields.file.errors.unsupportedType"),
              tooLarge: t("setup.subjectsMaster.fields.file.errors.tooLarge"),
            }}
            value={data.file}
            onChange={(file) => onChange({ file })}
          />

          {/* JSON only — the backend renders description_html itself (see subjectsMasterApi.ts). */}
          <SubjectDescriptionEditor
            contentJson={data.description_json}
            onChange={(json) => onChange({ description_json: json })}
          />

          <Toggle
            id="subject-show-on-frontend"
            label={t("setup.subjectsMaster.fields.showOnFrontend.label")}
            helper={t("setup.subjectsMaster.fields.showOnFrontend.helper")}
            checked={data.show_on_frontend}
            onChange={(checked) => onChange({ show_on_frontend: checked })}
          />
        </>
      )}
      emptyMessage={t("setup.subjectsMaster.empty")}
      toastMessages={{
        created: t("setup.subjectsMaster.toast.created"),
        updated: t("setup.subjectsMaster.toast.updated"),
        deleted: t("setup.subjectsMaster.toast.deleted"),
      }}
    />
  );
}
