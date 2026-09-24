"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { CrudScreen } from "@/components/setup/CrudScreen";
import {
  awardBodiesService,
  type AwardBody,
  type AwardBodyInput,
} from "@/lib/setup/academicStructure/awardBodiesApi";

type FormState = {
  name: string;
  description: string;
};

const EMPTY_FORM: FormState = { name: "", description: "" };

export function AwardBodiesScreen() {
  const t = useTranslations();

  return (
    <CrudScreen<AwardBody, AwardBodyInput, AwardBodyInput, FormState>
      title={t("setup.awardBodies.title")}
      subtitle={t("setup.awardBodies.subtitle")}
      addNewLabel={t("setup.awardBodies.addNew")}
      panelTitle={{
        create: t("setup.awardBodies.panel.createTitle"),
        edit: t("setup.awardBodies.panel.editTitle"),
      }}
      service={awardBodiesService}
      display={{
        mode: "cards",
        card: {
          title: (row) => row.name,
          description: (row) => row.description,
        },
      }}
      getRowId={(row) => row.id}
      searchPlaceholder={t("setup.awardBodies.searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.toLowerCase())}
      rowActions={(row, helpers) => [
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: {
            title: t("setup.awardBodies.confirmDelete.title"),
            message: t("setup.awardBodies.confirmDelete.message", { name: row.name }),
          },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({ name: row.name, description: row.description ?? "" })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        if (!data.name.trim()) errors.name = t("setup.awardBodies.errors.nameRequired");
        return errors;
      }}
      toCreateInput={(data) => ({
        name: data.name.trim(),
        description: data.description.trim() || null,
      })}
      toUpdateInput={(data) => ({
        name: data.name.trim(),
        description: data.description.trim() || null,
      })}
      renderFields={({ data, onChange, errors }) => (
        <>
          <InputField
            id="award-body-name"
            label={t("setup.awardBodies.fields.name.label")}
            placeholder={t("setup.awardBodies.fields.name.placeholder")}
            value={data.name}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />
          <InputField
            id="award-body-description"
            label={t("setup.awardBodies.fields.description.label")}
            placeholder={t("setup.awardBodies.fields.description.placeholder")}
            value={data.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </>
      )}
      emptyMessage={t("setup.awardBodies.empty")}
      toastMessages={{
        created: t("setup.awardBodies.toast.created"),
        updated: t("setup.awardBodies.toast.updated"),
        deleted: t("setup.awardBodies.toast.deleted"),
      }}
    />
  );
}
