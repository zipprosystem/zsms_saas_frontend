"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { CrudScreen } from "@/components/setup/CrudScreen";
import type { ColumnDef, FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn } from "@/lib/export/exportTypes";
import { EXAM_USES_MOCK } from "@/lib/exam/examApi";
import { MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import { Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import {
  TRAIT_MASTER_NAME_MAX,
  traitMastersServiceFor,
  type TraitMasterInput,
  type TraitMasterItem,
  type TraitMasterKind,
} from "@/lib/setup/assessmentConfiguration/traitMastersApi";

type FormState = {
  /** The item being edited (null = new) — for the client-side uniqueness check only; never sent. */
  id: string | null;
  name: string;
  school_type_id: string;
  /** Position in the school type's list as typed; "" = the end (new) / unchanged (edit). */
  sort_order: string;
};

type SchoolTypesState = { status: "loading" } | { status: "loaded"; items: SchoolType[] } | { status: "error" };

const EMPTY_FORM: FormState = { id: null, name: "", school_type_id: "", sort_order: "" };

/**
 * Setup › Assessment Config › Psychomotor Skills / Affective Domain — a
 * school's named skills or traits, one list PER SCHOOL TYPE (contract in
 * traitMastersApi.ts). Each item is Name + School Type + its position in
 * that type's list (the order report cards print). The table lists every
 * type's items, in order, with a School Type filter; Move up / Move down
 * reorder within a type, or type a position in the form (blank = the end
 * for a new item). Lists only — rating them
 * happens on Report Progression (a later piece). Admin-gated (same gate as
 * Progress Grades).
 */
function TraitMastersScreen({ kind }: { kind: TraitMasterKind }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`setup.traitMasters.${kind}.${key}`, values);
  const c = (key: string, values?: Record<string, string | number>) => t(`setup.traitMasters.common.${key}`, values);
  const [actingAs] = useMockActingAs();
  const service = useMemo(() => traitMastersServiceFor(kind), [kind]);
  const [items, setItems] = useState<TraitMasterItem[]>([]);
  const [schoolTypes, setSchoolTypes] = useState<SchoolTypesState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    schoolTypesService.list().then((result) => {
      if (!cancelled) setSchoolTypes(result.ok ? { status: "loaded", items: result.data } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (EXAM_USES_MOCK && actingAs !== MOCK_ADMIN) {
    return <Notice>{k("adminOnly")}</Notice>;
  }

  const types = schoolTypes.status === "loaded" ? schoolTypes.items : [];
  const noSchoolTypesYet = schoolTypes.status === "loaded" && types.length === 0;
  // A type deleted since (or not loaded) still shows something rather than a blank cell.
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? "—";

  // How many items each school type has — Move down is off for the last one.
  const countByType = items.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.school_type_id]: (counts[item.school_type_id] ?? 0) + 1 }), {});

  const columns: ColumnDef<TraitMasterItem>[] = [
    { key: "order", header: c("columns.order"), render: (row) => <span className="tabular-nums text-text-secondary">{row.sort_order}</span> },
    { key: "name", header: c("columns.name"), render: (row) => <span className="font-semibold">{row.name}</span> },
    { key: "schoolType", header: c("columns.schoolType"), render: (row) => typeName(row.school_type_id) },
  ];

  const exportColumns: ExportColumn<TraitMasterItem>[] = [
    { header: c("columns.order"), value: (row) => row.sort_order },
    { header: c("columns.name"), value: (row) => row.name },
    { header: c("columns.schoolType"), value: (row) => typeName(row.school_type_id) },
  ];

  const filterDefs: FilterDef[] = [
    {
      key: "schoolType",
      label: c("filters.schoolType"),
      options: [{ value: "", label: c("filters.all") }, ...types.map((type) => ({ value: type.id, label: type.name }))],
    },
  ];

  const toInput = (data: FormState): TraitMasterInput => {
    const position = data.sort_order.trim();
    return { name: data.name.trim(), school_type_id: data.school_type_id, ...(position ? { sort_order: Number(position) } : {}) };
  };

  return (
    <CrudScreen<TraitMasterItem, TraitMasterInput, TraitMasterInput, FormState>
      title={k("title")}
      subtitle={k("subtitle")}
      addNewLabel={k("addNew")}
      panelTitle={{ create: k("panel.createTitle"), edit: k("panel.editTitle") }}
      panelSubtitle={k("panel.subtitle")}
      service={service}
      display={{ mode: "table", columns }}
      exportColumns={exportColumns}
      exportFilenamePrefix={kind === "psychomotor" ? "psychomotor-skills" : "affective-domain"}
      getRowId={(row) => row.id}
      searchPlaceholder={c("searchPlaceholder")}
      matchesSearch={(row, query) => row.name.toLowerCase().includes(query.trim().toLowerCase())}
      filterDefs={filterDefs}
      matchesFilters={(row, filters) => !filters.schoolType || row.school_type_id === filters.schoolType}
      onItemsLoaded={setItems}
      rowActions={(row, helpers) => [
        { key: "moveUp", label: c("actions.moveUp"), onClick: () => helpers.runCustom("moveUp"), disabled: row.sort_order <= 1 },
        { key: "moveDown", label: c("actions.moveDown"), onClick: () => helpers.runCustom("moveDown"), disabled: row.sort_order >= (countByType[row.school_type_id] ?? 0) },
        { key: "edit", label: t("common.edit"), onClick: helpers.edit },
        {
          key: "delete",
          label: t("common.delete"),
          variant: "danger",
          onClick: helpers.remove,
          confirm: { title: k("confirmDelete.title"), message: k("confirmDelete.message", { name: row.name, schoolType: typeName(row.school_type_id) }) },
        },
      ]}
      emptyFormState={EMPTY_FORM}
      toFormState={(row) => ({ id: row.id, name: row.name, school_type_id: row.school_type_id, sort_order: String(row.sort_order) })}
      validate={(data) => {
        const errors: Record<string, string> = {};
        const name = data.name.trim();
        if (!data.school_type_id) errors.school_type_id = c("errors.required");
        if (!name) errors.name = c("errors.required");
        else if (
          data.school_type_id &&
          items.some((item) => item.id !== data.id && item.school_type_id === data.school_type_id && item.name.toLowerCase() === name.toLowerCase())
        ) {
          errors.name = k("errors.duplicateName");
        }
        const position = data.sort_order.trim();
        if (position && (!/^\d+$/.test(position) || Number(position) < 1)) errors.sort_order = c("errors.position");
        return errors;
      }}
      toCreateInput={toInput}
      toUpdateInput={toInput}
      renderFields={({ data, onChange, errors }) => (
        <>
          <div className="flex flex-col gap-1.5">
            <SelectField
              id={`${kind}-school-type`}
              label={c("fields.schoolType")}
              value={data.school_type_id}
              onChange={(event) => onChange({ school_type_id: event.target.value })}
              disabled={schoolTypes.status === "loading" || noSchoolTypesYet}
              hasError={!!errors.school_type_id}
              error={errors.school_type_id}
            >
              {schoolTypes.status === "loading" ? (
                <option value="">{c("fields.schoolTypeLoading")}</option>
              ) : (
                <>
                  <option value="" disabled>
                    {c("fields.schoolTypePlaceholder")}
                  </option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </>
              )}
            </SelectField>
            {noSchoolTypesYet ? (
              <p className="text-xs text-text-muted">
                {c("fields.schoolTypeEmptyHint")}{" "}
                <Link href="/admin/setup/academic-structure/school-types" className="font-semibold text-accent hover:underline">
                  {c("fields.schoolTypeEmptyHintLink")}
                </Link>
              </p>
            ) : null}
            {schoolTypes.status === "error" ? <p className="text-xs text-error">{c("fields.schoolTypeLoadError")}</p> : null}
          </div>
          <InputField
            id={`${kind}-name`}
            label={c("fields.name")}
            placeholder={k("namePlaceholder")}
            value={data.name}
            maxLength={TRAIT_MASTER_NAME_MAX}
            onChange={(event) => onChange({ name: event.target.value })}
            hasError={!!errors.name}
            error={errors.name}
          />
          <div className="flex flex-col gap-1.5 sm:max-w-[10rem]">
            <InputField
              id={`${kind}-position`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              label={c("fields.position")}
              value={data.sort_order}
              onChange={(event) => onChange({ sort_order: event.target.value })}
              hasError={!!errors.sort_order}
              error={errors.sort_order}
            />
          </div>
          <p className="-mt-2 text-xs text-text-muted">{data.id ? c("fields.positionHelpEdit") : c("fields.positionHelpNew")}</p>
        </>
      )}
      emptyMessage={k("empty")}
      toastMessages={{ created: k("toast.created"), updated: k("toast.updated"), deleted: k("toast.deleted") }}
    />
  );
}

/** Setup › Assessment Config › Psychomotor Skills. */
export function PsychomotorSkillsScreen() {
  return <TraitMastersScreen kind="psychomotor" />;
}

/** Setup › Assessment Config › Affective Domain. */
export function AffectiveDomainScreen() {
  return <TraitMastersScreen kind="affective" />;
}
