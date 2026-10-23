"use client";

import { useTranslations } from "next-intl";
import { CrudScreen } from "@/components/setup/CrudScreen";
import type { ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import {
  componentContribution,
  structureTotal,
  type AssessmentStructure,
  type AssessmentStructureInput,
  type StructureIssue,
} from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import { AssessmentStructureBuilder } from "@/components/setup/assessmentConfiguration/AssessmentStructureBuilder";
import {
  emptyStructureForm,
  issueErrorKey,
  toStructureForm,
  toStructureInput,
  validateStructureForm,
  type StructureForm,
} from "@/components/setup/assessmentConfiguration/assessmentStructureForm";

function Badge({ tone, children }: { tone: "accent" | "success" | "muted"; children: string }) {
  const toneClass =
    tone === "accent"
      ? "bg-brand-tint text-accent"
      : tone === "success"
        ? "bg-category-green-tint text-success"
        : "border border-border text-text-secondary";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

/** "CA 1 (20) · CA 2 (20) · Exam (60)" — each part's contribution to the 100. */
function componentSummary(row: AssessmentStructure): string {
  return row.components.map((component) => `${component.name} (${componentContribution(component)})`).join(" · ");
}

/**
 * Setup › Assessment Configuration › Assessment Types — the score-structure
 * builder (Exam Stage 1a). A structure is a list of CA/Exam components,
 * each optionally broken down one level into sub-fields; component_based
 * structures must total 100. Grading itself lives in the Exam module, not
 * here. MOCK until the backend ships (assessmentStructuresApi.ts).
 *
 * Admin-only by location: Setup has no per-screen role guard (same as
 * every other Setup master) until the platform-wide /auth/me role claim
 * lands.
 */
export function AssessmentTypesScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`setup.assessmentTypes.${key}`, values);

  const issueMessage = (issue: StructureIssue): string => {
    switch (issue.code) {
      case "total_mismatch":
      case "subfields_sum_mismatch":
      case "subfields_weight_mismatch":
        return k(`errors.${issue.code}`, { actual: issue.actual, target: issue.target });
      default:
        return k(`errors.${issue.code}`);
    }
  };

  const validate = (data: StructureForm): Record<string, string> => {
    // grade_based is selectable but not buildable until Stage 1b.
    if (data.mode === "grade_based") return { mode: k("errors.grade_based_not_ready") };
    const errors: Record<string, string> = {};
    for (const issue of validateStructureForm(data)) {
      const key = issueErrorKey(issue, data);
      if (!errors[key]) errors[key] = issueMessage(issue);
    }
    return errors;
  };

  const modeLabel = (row: AssessmentStructure) => k(`modes.${row.mode}`);
  const statusLabel = (row: AssessmentStructure) => k(row.is_active ? "badges.active" : "badges.inactive");

  const columns: ColumnDef<AssessmentStructure>[] = [
    { key: "sn", header: k("columns.sn"), render: (_row, index) => index + 1 },
    {
      key: "name",
      header: k("columns.name"),
      render: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text-primary">{row.name}</span>
          {row.is_default ? <Badge tone="accent">{k("badges.default")}</Badge> : null}
        </span>
      ),
    },
    { key: "mode", header: k("columns.mode"), render: modeLabel },
    {
      key: "components",
      header: k("columns.components"),
      render: (row) =>
        row.mode === "component_based" && row.components.length > 0 ? (
          <span className="block max-w-xs truncate" title={componentSummary(row)}>
            {componentSummary(row)}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    {
      key: "total",
      header: k("columns.total"),
      render: (row) => (row.mode === "component_based" ? structureTotal(row.components) : "—"),
    },
    {
      key: "status",
      header: k("columns.status"),
      render: (row) => <Badge tone={row.is_active ? "success" : "muted"}>{statusLabel(row)}</Badge>,
    },
  ];

  const exportColumns: ExportColumn<AssessmentStructure>[] = [
    { header: k("columns.name"), value: (row) => row.name },
    { header: k("columns.mode"), value: modeLabel },
    { header: k("columns.components"), value: (row) => componentSummary(row) },
    { header: k("columns.total"), value: (row) => (row.mode === "component_based" ? structureTotal(row.components) : "") },
    { header: k("columns.default"), value: (row) => (row.is_default ? k("badges.default") : "") },
    { header: k("columns.status"), value: statusLabel },
  ];

  return (
    <CrudScreen<AssessmentStructure, AssessmentStructureInput, AssessmentStructureInput, StructureForm>
      title={k("title")}
      subtitle={k("subtitle")}
      addNewLabel={k("addNew")}
      panelTitle={{ create: k("panel.createTitle"), edit: k("panel.editTitle") }}
      panelSubtitle={k("panel.subtitle")}
      panelSize="wide"
      service={assessmentStructuresService}
      display={{ mode: "table", columns }}
      getRowId={(row) => row.id}
      searchPlaceholder={k("searchPlaceholder")}
      matchesSearch={(row, query) => {
        const q = query.toLowerCase();
        return row.name.toLowerCase().includes(q) || row.components.some((c) => c.name.toLowerCase().includes(q));
      }}
      filterDefs={[
        {
          key: "mode",
          label: k("columns.mode"),
          options: [
            { value: "", label: k("filters.allModes") },
            { value: "component_based", label: k("modes.component_based") },
            { value: "grade_based", label: k("modes.grade_based") },
          ],
        },
        {
          key: "status",
          label: k("columns.status"),
          options: [
            { value: "", label: k("filters.allStatuses") },
            { value: "active", label: k("badges.active") },
            { value: "inactive", label: k("badges.inactive") },
          ],
        },
      ]}
      matchesFilters={(row, filters) =>
        (!filters.mode || row.mode === filters.mode) &&
        (!filters.status || (filters.status === "active") === row.is_active)
      }
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "setDefault",
          label: k("actions.setDefault"),
          onClick: () => helpers.runCustom("setDefault"),
          disabled: row.is_default || !row.is_active,
          disabledReason: row.is_default ? k("actions.alreadyDefault") : k("actions.inactiveCannotBeDefault"),
        },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          disabled: row.is_default,
          disabledReason: k("actions.defaultCannotBeDeleted"),
          confirm: { title: k("deleteConfirm.title"), message: k("deleteConfirm.message", { name: row.name }) },
        },
      ]}
      emptyFormState={emptyStructureForm()}
      toFormState={toStructureForm}
      validate={validate}
      toCreateInput={toStructureInput}
      toUpdateInput={toStructureInput}
      renderFields={(props) => <AssessmentStructureBuilder {...props} />}
      emptyMessage={k("empty")}
      toastMessages={{ created: k("toast.created"), updated: k("toast.updated"), deleted: k("toast.deleted") }}
      exportColumns={exportColumns}
      exportFilenamePrefix="assessment-types"
    />
  );
}
