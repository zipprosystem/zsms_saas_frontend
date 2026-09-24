"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { CrudScreen } from "@/components/setup/CrudScreen";
import {
  schoolTypesService,
  type SchoolType,
  type SchoolTypeInput,
} from "@/lib/setup/academicStructure/schoolTypesApi";
import { awardBodiesService, type AwardBody } from "@/lib/setup/academicStructure/awardBodiesApi";

type FormState = {
  name: string;
  award_body_id: string;
  description: string;
};

const EMPTY_FORM: FormState = { name: "", award_body_id: "", description: "" };

type AwardBodiesState =
  | { status: "loading" }
  | { status: "loaded"; items: AwardBody[] }
  | { status: "error" };

export function SchoolTypesScreen() {
  const t = useTranslations();

  // Fetched once, independently of useCrudTable/CrudScreen — this is the
  // dropdown's OWN data source, not a school-type field itself. No changes
  // to the generic pattern needed for this: renderFields is a closure
  // defined right here, so it naturally sees this component's own state.
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

  const awardBodyName = (id: string | null): string | null => {
    if (!id || awardBodies.status !== "loaded") return null;
    return awardBodies.items.find((body) => body.id === id)?.name ?? null;
  };

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
            const bodyName = awardBodyName(row.award_body_id);
            if (bodyName && row.description) return `${bodyName} — ${row.description}`;
            return bodyName ?? row.description;
          },
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
        award_body_id: row.award_body_id ?? "",
        description: row.description ?? "",
      })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.schoolTypes.errors.nameRequired");
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        award_body_id: data.award_body_id || null,
        description: data.description.trim() || null,
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        award_body_id: data.award_body_id || null,
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
          />

          <div className="flex flex-col gap-1.5">
            <SelectField
              id="school-type-award-body"
              label={t("setup.schoolTypes.fields.awardBody.label")}
              value={data.award_body_id}
              onChange={(event) => onChange({ award_body_id: event.target.value })}
              disabled={awardBodies.status === "loading"}
            >
              {awardBodies.status === "loading" ? (
                <option value="">{t("setup.schoolTypes.fields.awardBody.loading")}</option>
              ) : (
                <>
                  <option value="">{t("setup.schoolTypes.fields.awardBody.none")}</option>
                  {awardBodies.status === "loaded"
                    ? awardBodies.items.map((body) => (
                        <option key={body.id} value={body.id}>
                          {body.name}
                        </option>
                      ))
                    : null}
                </>
              )}
            </SelectField>
            {awardBodies.status === "loaded" && awardBodies.items.length === 0 ? (
              <p className="text-xs text-text-muted">
                {t("setup.schoolTypes.fields.awardBody.emptyHint")}{" "}
                <Link
                  href="/admin/setup/academic-structure/award-bodies"
                  className="font-semibold text-accent hover:underline"
                >
                  {t("setup.schoolTypes.fields.awardBody.emptyHintLink")}
                </Link>
              </p>
            ) : null}
            {awardBodies.status === "error" ? (
              <p className="text-xs text-error">{t("setup.schoolTypes.fields.awardBody.loadError")}</p>
            ) : null}
          </div>

          <InputField
            id="school-type-description"
            label={t("setup.schoolTypes.fields.description.label")}
            placeholder={t("setup.schoolTypes.fields.description.placeholder")}
            value={data.description}
            onChange={(event) => onChange({ description: event.target.value })}
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
