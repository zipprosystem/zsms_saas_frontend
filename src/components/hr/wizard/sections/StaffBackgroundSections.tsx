"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Input";
import { TextareaField } from "@/components/ui/Textarea";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import {
  EMPTY_EXPERIENCE,
  EMPTY_QUALIFICATION,
  EMPTY_REFERENCE,
  rowKey,
  type StaffForm,
} from "@/components/hr/wizard/staffForm";

type RowField<Row> = { field: Exclude<keyof Row, "key"> & string; type?: "text" | "date" | "email" | "tel"; wide?: boolean };

/** One optional add-many section: each row is a card of inputs with a Remove. Empty rows are dropped on save. */
function RepeaterSection<Row extends { key: string }>({
  idPrefix,
  title,
  subtitle,
  addLabel,
  emptyLabel,
  rowLabel,
  rows,
  fields,
  fieldLabel,
  newRow,
  onChange,
}: {
  idPrefix: string;
  title: string;
  subtitle: string;
  addLabel: string;
  emptyLabel: string;
  rowLabel: (index: number) => string;
  rows: Row[];
  fields: RowField<Row>[];
  fieldLabel: (field: string) => string;
  newRow: () => Row;
  onChange: (rows: Row[]) => void;
}) {
  const t = useTranslations();
  const update = (key: string, field: string, value: string) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));

  return (
    <StaffStepSection
      title={title}
      subtitle={subtitle}
      action={
        <Button
          type="button"
          variant="secondary"
          icon={<PlusIcon className="h-4 w-4" />}
          onClick={() => onChange([...rows, newRow()])}
          className="shrink-0 px-3 text-sm"
        >
          {addLabel}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        rows.map((row, index) => (
          <div key={row.key} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-text-primary">{rowLabel(index + 1)}</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                className="text-sm font-semibold text-error hover:underline"
              >
                {t("common.delete")}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {fields.map(({ field, type = "text", wide }) =>
                wide ? (
                  <div key={field} className="sm:col-span-2 lg:col-span-4">
                    <TextareaField
                      id={`${idPrefix}-${field}-${row.key}`}
                      label={fieldLabel(field)}
                      value={String(row[field as keyof Row] ?? "")}
                      onChange={(event) => update(row.key, field, event.target.value)}
                    />
                  </div>
                ) : (
                  <InputField
                    key={field}
                    id={`${idPrefix}-${field}-${row.key}`}
                    type={type}
                    label={fieldLabel(field)}
                    value={String(row[field as keyof Row] ?? "")}
                    onChange={(event) => update(row.key, field, event.target.value)}
                  />
                ),
              )}
            </div>
          </div>
        ))
      )}
    </StaffStepSection>
  );
}

/** Credentials & records step — optional Qualifications / References / Experience (fields per the Figma frame). */
export function StaffBackgroundSections({ form, onChange }: { form: StaffForm; onChange: (patch: Partial<StaffForm>) => void }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-6">
      <RepeaterSection
        idPrefix="qualification"
        title={t("hr.wizard.sections.qualifications.title")}
        subtitle={t("hr.wizard.sections.qualifications.subtitle")}
        addLabel={t("hr.wizard.background.add")}
        emptyLabel={t("hr.wizard.background.noQualifications")}
        rowLabel={(index) => t("hr.wizard.background.qualificationN", { index })}
        rows={form.qualifications}
        fields={[
          { field: "degree" },
          { field: "stream" },
          { field: "board" },
          { field: "institution" },
          { field: "year" },
          { field: "result" },
          { field: "rank" },
          { field: "duration" },
          { field: "remarks", wide: true },
        ]}
        fieldLabel={(field) => t(`hr.wizard.fields.qualification.${field}`)}
        newRow={() => ({ key: rowKey("qualification"), ...EMPTY_QUALIFICATION })}
        onChange={(qualifications) => onChange({ qualifications })}
      />
      <RepeaterSection
        idPrefix="reference"
        title={t("hr.wizard.sections.references.title")}
        subtitle={t("hr.wizard.sections.references.subtitle")}
        addLabel={t("hr.wizard.background.add")}
        emptyLabel={t("hr.wizard.background.noReferences")}
        rowLabel={(index) => t("hr.wizard.background.referenceN", { index })}
        rows={form.references}
        fields={[
          { field: "name" },
          { field: "organization" },
          { field: "designation" },
          { field: "phone", type: "tel" },
          { field: "email", type: "email" },
        ]}
        fieldLabel={(field) => t(`hr.wizard.fields.reference.${field}`)}
        newRow={() => ({ key: rowKey("reference"), ...EMPTY_REFERENCE })}
        onChange={(references) => onChange({ references })}
      />
      <RepeaterSection
        idPrefix="experience"
        title={t("hr.wizard.sections.experience.title")}
        subtitle={t("hr.wizard.sections.experience.subtitle")}
        addLabel={t("hr.wizard.background.add")}
        emptyLabel={t("hr.wizard.background.noExperience")}
        rowLabel={(index) => t("hr.wizard.background.experienceN", { index })}
        rows={form.experience}
        fields={[
          { field: "organization" },
          { field: "role" },
          { field: "tenure_from", type: "date" },
          { field: "tenure_to", type: "date" },
        ]}
        fieldLabel={(field) => t(`hr.wizard.fields.experience.${field}`)}
        newRow={() => ({ key: rowKey("experience"), ...EMPTY_EXPERIENCE })}
        onChange={(experience) => onChange({ experience })}
      />
    </div>
  );
}
