"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { TextareaField } from "@/components/ui/Textarea";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { SelectField } from "@/components/ui/Select";
import { CrudScreen } from "@/components/setup/CrudScreen";
import { ReportLogoUploadField } from "@/components/setup/academicStructure/ReportLogoUploadField";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type CrudService } from "@/lib/setup/crudTypes";
import { resultTemplatesService } from "@/lib/setup/assessmentConfiguration/resultTemplatesApi";
import { idCardTemplatesServices } from "@/lib/setup/assessmentConfiguration/idCardTemplatesApi";
import type { TemplateStatus } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import {
  schoolTypesService,
  type SchoolType,
  type SchoolTypeInput,
} from "@/lib/setup/academicStructure/schoolTypesApi";
import { awardBodiesService, type AwardBody } from "@/lib/setup/academicStructure/awardBodiesApi";

type FormState = {
  name: string;
  award_body_ids: string[];
  description: string;
  result_template_id: string;
  student_id_card_template_id: string;
  staff_id_card_template_id: string;
  report_logo_file_id: string | null;
  report_display_name: string;
  motto: string;
  mission_statement: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  award_body_ids: [],
  description: "",
  result_template_id: "",
  student_id_card_template_id: "",
  staff_id_card_template_id: "",
  report_logo_file_id: null,
  report_display_name: "",
  motto: "",
  mission_statement: "",
};

type AssignableTemplate = { id: string; name: string; status: TemplateStatus };

/** Same query key as the catalog screen, so both share one cache entry. */
function useTemplateList<T extends AssignableTemplate>(service: CrudService<T, never, never>) {
  const query = useQuery({
    queryKey: service.queryKey,
    queryFn: () => service.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  return { items: query.data?.ok ? query.data.data : [], isLoading: query.isPending };
}

function toFormInput(data: FormState): SchoolTypeInput {
  return {
    name: data.name.trim(),
    award_body_ids: data.award_body_ids,
    description: data.description.trim() || null,
    result_template_id: data.result_template_id || null,
    student_id_card_template_id: data.student_id_card_template_id || null,
    staff_id_card_template_id: data.staff_id_card_template_id || null,
    report_logo_file_id: data.report_logo_file_id,
    report_display_name: data.report_display_name.trim() || null,
    motto: data.motto.trim() || null,
    mission_statement: data.mission_statement.trim() || null,
  };
}

type AwardBodiesState =
  | { status: "loading" }
  | { status: "loaded"; items: AwardBody[] }
  | { status: "error" };

export function SchoolTypesScreen() {
  const t = useTranslations();

  // Fetched once, independently of useCrudTable/CrudScreen — this is the
  // multi-select's OWN data source, not a school-type field itself. No
  // changes to the generic pattern needed for this: renderFields is a
  // closure defined right here, so it naturally sees this component's own
  // state.
  const [awardBodies, setAwardBodies] = useState<AwardBodiesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    awardBodiesService.list().then((result) => {
      if (cancelled) return;
      setAwardBodies(result.ok ? { status: "loaded", items: result.data } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const noAwardBodiesYet = awardBodies.status === "loaded" && awardBodies.items.length === 0;

  const resultTemplates = useTemplateList(resultTemplatesService);
  const studentCards = useTemplateList(idCardTemplatesServices.student);
  const staffCards = useTemplateList(idCardTemplatesServices.staff);

  // Only `available` templates are assignable. A current assignment that
  // has since been archived stays listed (marked) so opening the form
  // never silently clears it.
  const templateOptions = (items: AssignableTemplate[], selectedId: string) =>
    items
      .filter((item) => item.status === "available" || item.id === selectedId)
      .map((item) => (
        <option key={item.id} value={item.id}>
          {item.status === "available"
            ? item.name
            : t("setup.schoolTypes.fields.templateNotAvailable", {
                name: item.name,
                status: t(`setup.templateCatalog.status.${item.status}`),
              })}
        </option>
      ));

  return (
    <CrudScreen<SchoolType, SchoolTypeInput, SchoolTypeInput, FormState>
      title={t("setup.schoolTypes.title")}
      subtitle={t("setup.schoolTypes.subtitle")}
      addNewLabel={t("setup.schoolTypes.addNew")}
      panelTitle={{
        create: t("setup.schoolTypes.panel.createTitle"),
        edit: t("setup.schoolTypes.panel.editTitle"),
      }}
      service={schoolTypesService}
      display={{
        mode: "cards",
        card: {
          title: (row) => row.name,
          description: (row) => {
            const bodyNames = row.award_bodies.map((body) => body.name).join(", ") || null;
            if (bodyNames && row.description) return `${bodyNames} — ${row.description}`;
            return bodyNames ?? row.description;
          },
          tags: (row) => row.classes.filter((cls) => cls.is_active).map((cls) => cls.name),
        },
      }}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.schoolTypes.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: {
            title: t("setup.schoolTypes.confirmDelete.title"),
            message: t("setup.schoolTypes.confirmDelete.message", { name: row.name }),
          },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({
        name: row.name,
        award_body_ids: row.award_body_ids,
        description: row.description ?? "",
        result_template_id: row.result_template_id ?? "",
        student_id_card_template_id: row.student_id_card_template_id ?? "",
        staff_id_card_template_id: row.staff_id_card_template_id ?? "",
        report_logo_file_id: row.report_logo_file_id,
        report_display_name: row.report_display_name ?? "",
        motto: row.motto ?? "",
        mission_statement: row.mission_statement ?? "",
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.schoolTypes.errors.nameRequired");
        if (data.award_body_ids.length === 0) {
          errors.award_body_ids = t("setup.schoolTypes.errors.awardBodiesRequired");
        }
        if (!data.result_template_id) errors.result_template_id = t("setup.schoolTypes.errors.resultTemplateRequired");
        return errors;
      }}
      toCreateInput={toFormInput}
      toUpdateInput={toFormInput}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="school-type-name"
            label={t("setup.schoolTypes.fields.name.label")}
            placeholder={t("setup.schoolTypes.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
            maxLength={100}
          />

          <div className="flex flex-col gap-1.5">
            {awardBodies.status === "loading" ? (
              <p className="text-sm text-text-muted">{t("setup.schoolTypes.fields.awardBodies.loading")}</p>
            ) : (
              <ChipGroup
                label={t("setup.schoolTypes.fields.awardBodies.label")}
                options={
                  awardBodies.status === "loaded"
                    ? awardBodies.items.map((body) => ({ value: body.id, label: body.name }))
                    : []
                }
                value={data.award_body_ids}
                onChange={(award_body_ids) => onChange({ award_body_ids })}
                hasError={!!errors.award_body_ids}
                error={errors.award_body_ids}
              />
            )}
            {noAwardBodiesYet ? (
              <p className="text-xs text-text-muted">
                {t("setup.schoolTypes.fields.awardBodies.emptyHint")}{" "}
                <Link
                  href="/admin/setup/academic-structure/award-bodies"
                  className="font-semibold text-accent hover:underline"
                >
                  {t("setup.schoolTypes.fields.awardBodies.emptyHintLink")}
                </Link>
              </p>
            ) : null}
            {awardBodies.status === "error" ? (
              <p className="text-xs text-error">{t("setup.schoolTypes.fields.awardBodies.loadError")}</p>
            ) : null}
          </div>

          <InputField
            id="school-type-description"
            label={t("setup.schoolTypes.fields.description.label")}
            placeholder={t("setup.schoolTypes.fields.description.placeholder")}
            value={data.description}
            onChange={(event) => onChange({ description: event.target.value })}
            maxLength={100}
          />

          <SelectField
            id="school-type-result-template"
            label={t("setup.schoolTypes.fields.resultTemplate.label")}
            value={data.result_template_id}
            onChange={(event) => onChange({ result_template_id: event.target.value })}
            disabled={resultTemplates.isLoading}
            hasError={!!errors.result_template_id}
            error={errors.result_template_id}
          >
            <option value="">{t("setup.schoolTypes.fields.resultTemplate.placeholder")}</option>
            {templateOptions(resultTemplates.items, data.result_template_id)}
          </SelectField>

          <SelectField
            id="school-type-student-id-card"
            label={t("setup.schoolTypes.fields.studentIdCard.label")}
            value={data.student_id_card_template_id}
            onChange={(event) => onChange({ student_id_card_template_id: event.target.value })}
            disabled={studentCards.isLoading}
          >
            <option value="">{t("setup.schoolTypes.fields.idCardNone")}</option>
            {templateOptions(studentCards.items, data.student_id_card_template_id)}
          </SelectField>

          <SelectField
            id="school-type-staff-id-card"
            label={t("setup.schoolTypes.fields.staffIdCard.label")}
            value={data.staff_id_card_template_id}
            onChange={(event) => onChange({ staff_id_card_template_id: event.target.value })}
            disabled={staffCards.isLoading}
          >
            <option value="">{t("setup.schoolTypes.fields.idCardNone")}</option>
            {templateOptions(staffCards.items, data.staff_id_card_template_id)}
          </SelectField>

          <div className="flex flex-col gap-1.5">
            <InputField
              id="school-type-report-school-name"
              label={t("setup.schoolTypes.fields.reportSchoolName.label")}
              placeholder={t("setup.schoolTypes.fields.reportSchoolName.placeholder")}
              value={data.report_display_name}
              onChange={(event) => onChange({ report_display_name: event.target.value })}
              maxLength={150}
            />
            <p className="text-xs text-text-muted">{t("setup.schoolTypes.fields.reportSchoolName.helper")}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <InputField
              id="school-type-report-motto"
              label={t("setup.schoolTypes.fields.reportMotto.label")}
              placeholder={t("setup.schoolTypes.fields.reportMotto.placeholder")}
              value={data.motto}
              onChange={(event) => onChange({ motto: event.target.value })}
              maxLength={120}
            />
            <p className="text-xs text-text-muted">{t("setup.schoolTypes.fields.reportMotto.helper")}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <TextareaField
              id="school-type-report-mission"
              label={t("setup.schoolTypes.fields.reportMissionStatement.label")}
              placeholder={t("setup.schoolTypes.fields.reportMissionStatement.placeholder")}
              value={data.mission_statement}
              onChange={(event) => onChange({ mission_statement: event.target.value })}
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-text-muted">{t("setup.schoolTypes.fields.reportMissionStatement.helper")}</p>
          </div>

          <ReportLogoUploadField
            value={data.report_logo_file_id}
            onChange={(report_logo_file_id) => onChange({ report_logo_file_id })}
            error={errors.report_logo_file_id}
          />
        </>
      )}
      emptyMessage={t("setup.schoolTypes.empty")}
      toastMessages={{
        created: t("setup.schoolTypes.toast.created"),
        updated: t("setup.schoolTypes.toast.updated"),
        deleted: t("setup.schoolTypes.toast.deleted"),
      }}
    />
  );
}
