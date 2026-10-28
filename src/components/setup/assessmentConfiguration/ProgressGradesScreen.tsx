"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { TextareaField } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { Segmented } from "@/components/ui/Segmented";
import { CrudScreen } from "@/components/setup/CrudScreen";
import type { ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { EXAM_USES_MOCK } from "@/lib/exam/examApi";
import { MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import { Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import {
  PROGRESS_DESCRIPTOR_MAX,
  PROGRESS_DOMAINS,
  PROGRESS_GRADE_MODES,
  PROGRESS_NAME_MAX,
  PROGRESS_VALUE_MAX,
  PROGRESS_VALUE_PATTERN,
  progressGradesServiceFor,
  sameProgressValue,
  type ProgressDomain,
  type ProgressGrade,
  type ProgressGradeInput,
  type ProgressGradeMode,
} from "@/lib/setup/assessmentConfiguration/progressGradesApi";

type FormState = {
  /** The level being edited (null = new) — for the client-side uniqueness check only; never sent. */
  id: string | null;
  name: string;
  value: string;
  hide_in_report: boolean;
  descriptors: Partial<Record<ProgressDomain, string>>;
};

const EMPTY_FORM: FormState = { id: null, name: "", value: "", hide_in_report: false, descriptors: {} };

/**
 * Setup › Assessment Config › Progress Grades — the rating levels for
 * student-wise traits and the British rating domains (contract in
 * progressGradesApi.ts). Two scales, one tab each:
 *   - General: rates Psychomotor and Affective traits (the View Results
 *     traits pop-up saves a level BY ID). Levels only: Name · Value ·
 *     Hide in report.
 *   - British: the same, plus OPTIONAL Engagement / Learning Behaviour /
 *     Boarding descriptors for the level key the British report prints.
 * Value is alphanumeric (A–D, 1–5…); the list runs best first (1 / A).
 * Name and value are each unique within the scale; any number of levels.
 * Hidden levels still count — the report just leaves them out.
 * Admin-gated (same gate as Grades).
 */
export function ProgressGradesScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`setup.progressGrades.${key}`, values);
  const [actingAs] = useMockActingAs();
  const [mode, setMode] = useState<ProgressGradeMode>("general");
  const [levels, setLevels] = useState<ProgressGrade[]>([]);
  const service = useMemo(() => progressGradesServiceFor(mode), [mode]);
  const domains: readonly ProgressDomain[] = PROGRESS_DOMAINS[mode];

  if (EXAM_USES_MOCK && actingAs !== MOCK_ADMIN) {
    return <Notice>{k("adminOnly")}</Notice>;
  }

  const domainLabel = (domain: ProgressDomain) => k(`domains.${domain}`);
  const describedDomains = (row: ProgressGrade) => domains.filter((domain) => row.descriptors[domain]);

  // Descriptors: British only (General levels have none).
  const hasDescriptors = domains.length > 0;
  const columns: ColumnDef<ProgressGrade>[] = [
    { key: "name", header: k("columns.name"), render: (row) => <span className="font-semibold">{row.name}</span> },
    { key: "value", header: k("columns.value"), render: (row) => row.value },
    {
      key: "hidden",
      header: k("columns.hideInReport"),
      render: (row) => (row.hide_in_report ? <span className="font-medium text-warning">{k("hidden")}</span> : <span className="text-text-muted">{k("shown")}</span>),
    },
    ...(hasDescriptors
      ? [
          {
            key: "descriptors",
            header: k("columns.descriptors"),
            render: (row: ProgressGrade) => {
              const set = describedDomains(row);
              return set.length ? set.map(domainLabel).join(", ") : <span className="text-text-muted">{k("noDescriptors")}</span>;
            },
          },
        ]
      : []),
  ];

  const exportColumns: ExportColumn<ProgressGrade>[] = [
    { header: k("columns.name"), value: (row) => row.name },
    { header: k("columns.value"), value: (row) => row.value },
    { header: k("columns.hideInReport"), value: (row) => (row.hide_in_report ? k("hidden") : k("shown")) },
    ...domains.map((domain) => ({ header: domainLabel(domain), value: (row: ProgressGrade) => row.descriptors[domain] ?? "" })),
  ];

  const toInput = (data: FormState): ProgressGradeInput => {
    const descriptors: ProgressGradeInput["descriptors"] = {};
    for (const domain of domains) {
      const text = data.descriptors[domain]?.trim();
      if (text) descriptors[domain] = text;
    }
    return { mode, name: data.name.trim(), value: data.value.trim(), hide_in_report: data.hide_in_report, descriptors };
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Segmented<ProgressGradeMode>
        label={k("scale.label")}
        options={PROGRESS_GRADE_MODES.map((value) => ({ value, label: k(`scale.${value}`) }))}
        value={mode}
        onChange={(value) => {
          setLevels([]);
          setMode(value);
        }}
      />
      <p className="text-sm text-text-secondary">{k(`scale.help.${mode}`)}</p>
      <CrudScreen<ProgressGrade, ProgressGradeInput, ProgressGradeInput, FormState>
        key={mode}
        title={k("title")}
        subtitle={k("subtitle")}
        addNewLabel={k("addNew")}
        panelTitle={{ create: k("panel.createTitle"), edit: k("panel.editTitle") }}
        panelSubtitle={k(`panel.subtitle.${mode}`)}
        service={service}
        display={{ mode: "table", columns }}
        exportColumns={exportColumns}
        exportFilenamePrefix={`progress-grades-${mode}`}
        getRowId={(row) => row.id}
        searchPlaceholder={k("searchPlaceholder")}
        matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase()) || row.value.toLowerCase() === query.trim().toLowerCase()}
        onItemsLoaded={setLevels}
        rowActions={(row, helpers) => [
          { key: "edit", label: t("common.edit"), onClick: helpers.edit },
          {
            key: "delete",
            label: t("common.delete"),
            variant: "danger",
            onClick: helpers.remove,
            confirm: { title: k("confirmDelete.title"), message: k("confirmDelete.message", { name: row.name }) },
          },
        ]}
        emptyFormState={EMPTY_FORM}
        toFormState={(row) => ({ id: row.id, name: row.name, value: row.value, hide_in_report: row.hide_in_report, descriptors: { ...row.descriptors } })}
        validate={(data) => {
          const errors: Record<string, string> = {};
          const others = levels.filter((level) => level.id !== data.id);
          const name = data.name.trim();
          if (!name) errors.name = k("errors.required");
          else if (others.some((level) => level.name.toLowerCase() === name.toLowerCase())) errors.name = k("errors.duplicateName");
          const value = data.value.trim();
          if (!value) errors.value = k("errors.required");
          else if (!PROGRESS_VALUE_PATTERN.test(value)) errors.value = k("errors.valueRange");
          else if (others.some((level) => sameProgressValue(level.value, value))) errors.value = k("errors.duplicateValue");
          for (const domain of domains) {
            if ((data.descriptors[domain]?.trim().length ?? 0) > PROGRESS_DESCRIPTOR_MAX) errors[`descriptor-${domain}`] = k("errors.descriptorTooLong", { max: PROGRESS_DESCRIPTOR_MAX });
          }
          return errors;
        }}
        toCreateInput={toInput}
        toUpdateInput={toInput}
        renderFields={({ data, onChange, errors }) => (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
              <InputField
                id="progress-grade-name"
                label={k("fields.name")}
                placeholder={k(`fields.namePlaceholder.${mode}`)}
                value={data.name}
                maxLength={PROGRESS_NAME_MAX}
                onChange={(event) => onChange({ name: event.target.value })}
                hasError={!!errors.name}
                error={errors.name}
              />
              <InputField
                id="progress-grade-value"
                type="text"
                autoComplete="off"
                maxLength={PROGRESS_VALUE_MAX}
                label={k("fields.value")}
                value={data.value}
                onChange={(event) => onChange({ value: event.target.value })}
                hasError={!!errors.value}
                error={errors.value}
              />
            </div>
            <p className="-mt-2 text-xs text-text-muted">{k("fields.valueHelp")}</p>
            <Toggle
              id="progress-grade-hide"
              label={k("fields.hideInReport")}
              helper={k("fields.hideInReportHelp")}
              checked={data.hide_in_report}
              onChange={(hide_in_report) => onChange({ hide_in_report })}
            />
            {hasDescriptors ? (
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-medium text-text-primary">{k("fields.descriptors")}</legend>
                <p className="-mt-1 text-xs text-text-muted">{k("fields.descriptorsHelp")}</p>
                {domains.map((domain) => (
                  <TextareaField
                    key={domain}
                    id={`progress-grade-descriptor-${domain}`}
                    label={domainLabel(domain)}
                    rows={2}
                    maxLength={PROGRESS_DESCRIPTOR_MAX}
                    value={data.descriptors[domain] ?? ""}
                    onChange={(event) => onChange({ descriptors: { ...data.descriptors, [domain]: event.target.value } })}
                    hasError={!!errors[`descriptor-${domain}`]}
                    error={errors[`descriptor-${domain}`]}
                  />
                ))}
              </fieldset>
            ) : null}
          </>
        )}
        emptyMessage={k("empty")}
        toastMessages={{ created: k("toast.created"), updated: k("toast.updated"), deleted: k("toast.deleted") }}
      />
    </div>
  );
}
