"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { CheckboxList } from "@/components/setup/CheckboxList";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type ColumnDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { EXAM_USES_MOCK, examQueryKeys, getEntryOptions } from "@/lib/exam/examApi";
import { MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import { Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { gradesService, type GradeBand, type GradeBandInput } from "@/lib/setup/assessmentConfiguration/gradesApi";

type FormState = {
  grade: string;
  grade_weight: string;
  gpa: string;
  min_score: string;
  max_score: string;
  remark: string;
  class_ids: string[];
};

const EMPTY_FORM: FormState = { grade: "", grade_weight: "", gpa: "", min_score: "", max_score: "", remark: "", class_ids: [] };

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInput(data: FormState): GradeBandInput {
  return {
    grade: data.grade.trim(),
    grade_weight: toNumber(data.grade_weight) ?? 0,
    gpa: toNumber(data.gpa),
    min_score: toNumber(data.min_score) ?? 0,
    max_score: toNumber(data.max_score) ?? 0,
    remark: data.remark.trim(),
    class_ids: data.class_ids,
  };
}

/**
 * Setup › Assessment Config › Grades — per-class grade bands (Grade ·
 * Grade Weight · GPA (optional) · Score range % · Remark · Apply to
 * classes). A band applies to every arm of its classes; results
 * computation reads these. Admin-gated: in the mock the acting-as caller
 * must be the admin (the backend also refuses others with 403); with the
 * real backend there's no role claim on the session yet, so the backend's
 * 403 is the gate.
 *
 * Classes come from the Exam entry-options (score-reporting classes only —
 * grade-based British classes use attainment scales, not score bands).
 */
export function GradesScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`setup.grades.${key}`, values);
  const [actingAs] = useMockActingAs();

  const optionsQuery = useQuery({
    queryKey: [...examQueryKeys.entryOptions(null), actingAs],
    queryFn: () => getEntryOptions(null).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes = (optionsQuery.data?.ok ? optionsQuery.data.data.classes : []).filter((cls) => cls.assessment_mode !== "grade_based");
  const className = (id: string) => classes.find((cls) => cls.id === id)?.name ?? id;

  if (EXAM_USES_MOCK && actingAs !== MOCK_ADMIN) {
    return <Notice>{k("adminOnly")}</Notice>;
  }

  const range = (row: GradeBand) => k("range", { min: row.min_score, max: row.max_score });

  const columns: ColumnDef<GradeBand>[] = [
    { key: "grade", header: k("columns.grade"), render: (row) => <span className="font-semibold">{row.grade}</span> },
    { key: "weight", header: k("columns.gradeWeight"), render: (row) => row.grade_weight },
    { key: "gpa", header: k("columns.gpa"), render: (row) => (row.gpa === null ? <span className="text-text-muted">{k("gpaNotUsed")}</span> : row.gpa) },
    { key: "range", header: k("columns.range"), render: range },
    { key: "remark", header: k("columns.remark"), render: (row) => row.remark || "—" },
    { key: "classes", header: k("columns.classes"), render: (row) => row.class_ids.map(className).join(", ") },
  ];

  const exportColumns: ExportColumn<GradeBand>[] = [
    { header: k("columns.grade"), value: (row) => row.grade },
    { header: k("columns.gradeWeight"), value: (row) => row.grade_weight },
    { header: k("columns.gpa"), value: (row) => row.gpa ?? "" },
    { header: k("columns.range"), value: range },
    { header: k("columns.remark"), value: (row) => row.remark },
    { header: k("columns.classes"), value: (row) => row.class_ids.map(className).join(", ") },
  ];

  const numberError = (value: string, { optional = false, max }: { optional?: boolean; max?: number } = {}) => {
    if (!value.trim()) return optional ? null : k("errors.required");
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return k("errors.notNegative");
    if (max !== undefined && parsed > max) return k("errors.max", { max });
    return null;
  };

  return (
    <CrudScreen<GradeBand, GradeBandInput, GradeBandInput, FormState>
      title={k("title")}
      subtitle={k("subtitle")}
      addNewLabel={k("addNew")}
      panelTitle={{ create: k("panel.createTitle"), edit: k("panel.editTitle") }}
      panelSubtitle={k("panel.subtitle")}
      service={gradesService}
      display={{ mode: "table", columns }}
      exportColumns={exportColumns}
      exportFilenamePrefix="grades"
      getRowId={(row) => row.id}
      searchPlaceholder={k("searchPlaceholder")}
      matchesSearch={(row, query) => [row.grade, row.remark].some((value) => value.toLowerCase().includes(query.toLowerCase()))}
      filterDefs={[
        {
          key: "class",
          label: k("filters.class"),
          options: [{ value: "", label: k("filters.allClasses") }, ...classes.map((cls) => ({ value: cls.id, label: cls.name }))],
        },
      ]}
      matchesFilters={(row, filters) => !filters.class || row.class_ids.includes(filters.class)}
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: { title: k("confirmDelete.title"), message: k("confirmDelete.message", { grade: row.grade }) },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({
        grade: row.grade,
        grade_weight: String(row.grade_weight),
        gpa: row.gpa === null ? "" : String(row.gpa),
        min_score: String(row.min_score),
        max_score: String(row.max_score),
        remark: row.remark,
        class_ids: row.class_ids,
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.grade.trim()) errors.grade = k("errors.required");
        const checks: Array<[keyof FormState, string | null]> = [
          ["grade_weight", numberError(data.grade_weight)],
          ["gpa", numberError(data.gpa, { optional: true })],
          ["min_score", numberError(data.min_score, { max: 100 })],
          ["max_score", numberError(data.max_score, { max: 100 })],
        ];
        for (const [field, message] of checks) if (message) errors[field] = message;
        const min = toNumber(data.min_score);
        const max = toNumber(data.max_score);
        if (!errors.min_score && !errors.max_score && min !== null && max !== null && min > max) errors.min_score = k("errors.minAboveMax");
        if (data.class_ids.length === 0) errors.class_ids = k("errors.classesRequired");
        return errors;
      }}
      toCreateInput={toInput}
      toUpdateInput={toInput}
      renderFields={({ data, onChange, errors }) => (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              id="grade-grade"
              label={k("fields.grade")}
              placeholder={k("fields.gradePlaceholder")}
              value={data.grade}
              maxLength={10}
              onChange={(event) => onChange({ grade: event.target.value })}
              hasError={!!errors.grade}
              error={errors.grade}
            />
            <InputField
              id="grade-weight"
              type="number"
              inputMode="decimal"
              min={0}
              label={k("fields.gradeWeight")}
              value={data.grade_weight}
              onChange={(event) => onChange({ grade_weight: event.target.value })}
              hasError={!!errors.grade_weight}
              error={errors.grade_weight}
            />
            <InputField
              id="grade-min"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              label={k("fields.minScore")}
              value={data.min_score}
              onChange={(event) => onChange({ min_score: event.target.value })}
              hasError={!!errors.min_score}
              error={errors.min_score}
            />
            <InputField
              id="grade-max"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              label={k("fields.maxScore")}
              value={data.max_score}
              onChange={(event) => onChange({ max_score: event.target.value })}
              hasError={!!errors.max_score}
              error={errors.max_score}
            />
          </div>
          <div className="flex flex-col gap-1">
            <InputField
              id="grade-gpa"
              type="number"
              inputMode="decimal"
              min={0}
              label={k("fields.gpa")}
              placeholder={k("fields.gpaPlaceholder")}
              value={data.gpa}
              onChange={(event) => onChange({ gpa: event.target.value })}
              hasError={!!errors.gpa}
              error={errors.gpa}
            />
            <p className="text-xs text-text-muted">{k("fields.gpaHelp")}</p>
          </div>
          <InputField
            id="grade-remark"
            label={k("fields.remark")}
            placeholder={k("fields.remarkPlaceholder")}
            value={data.remark}
            maxLength={100}
            onChange={(event) => onChange({ remark: event.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{k("fields.applyTo")}</span>
            <p className="text-xs text-text-muted">{k("fields.applyToHelp")}</p>
            <CheckboxList
              options={classes.map((cls) => ({ id: cls.id, label: cls.name }))}
              selectedIds={data.class_ids}
              onChange={(ids) => onChange({ class_ids: ids })}
              selectAllLabel={k("fields.selectAll")}
            />
            {errors.class_ids ? <p className="text-sm text-error">{errors.class_ids}</p> : null}
          </div>
        </>
      )}
      emptyMessage={k("empty")}
      toastMessages={{ created: k("toast.created"), updated: k("toast.updated"), deleted: k("toast.deleted") }}
    />
  );
}
