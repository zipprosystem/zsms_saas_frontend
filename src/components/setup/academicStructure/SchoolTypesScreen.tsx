"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { CrudScreen } from "@/components/setup/CrudScreen";
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
};

const EMPTY_FORM: FormState = { name: "", award_body_ids: [], description: "" };

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
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.schoolTypes.errors.nameRequired");
        if (data.award_body_ids.length === 0) {
          errors.award_body_ids = t("setup.schoolTypes.errors.awardBodiesRequired");
        }
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        award_body_ids: data.award_body_ids,
        description: data.description.trim() || null,
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        award_body_ids: data.award_body_ids,
        description: data.description.trim() || null,
      })}
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
