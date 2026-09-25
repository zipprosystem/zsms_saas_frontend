"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { DataTable } from "@/components/setup/DataTable";
import { CardGrid } from "@/components/setup/CardGrid";
import { useCrudTable } from "@/lib/setup/useCrudTable";
import type { CrudDisplay, CrudResult, CrudService, FilterDef, RowAction } from "@/lib/setup/crudTypes";

type RowActionHelpers = {
  edit: () => void;
  remove: () => void;
  runCustom: (actionKey: string) => void;
};

type FormFieldsRenderer<FormState> = (props: {
  data: FormState;
  onChange: (patch: Partial<FormState>) => void;
  errors: Record<string, string>;
}) => ReactNode;

type PanelState<T> = { mode: "closed" } | { mode: "create" } | { mode: "edit"; row: T };

export type CrudScreenProps<T, CreateInput, UpdateInput, FormState> = {
  title: string;
  subtitle?: string;
  addNewLabel: string;
  panelTitle: { create: string; edit: string };
  panelSubtitle?: string;
  service: CrudService<T, CreateInput, UpdateInput>;
  display: CrudDisplay<T>;
  getRowId: (row: T) => string;
  searchPlaceholder: string;
  matchesSearch?: (row: T, query: string) => boolean;
  /** Each FilterDef's own options should include an "All" option (value: "") — CrudScreen doesn't inject one. */
  filterDefs?: FilterDef[];
  matchesFilters?: (row: T, filters: Record<string, string>) => boolean;
  rowActions: (row: T, helpers: RowActionHelpers) => RowAction<T>[];
  emptyFormState: FormState;
  toFormState: (row: T) => FormState;
  /** Empty return = valid. Keys should match the wire field names — server 422 errors are mapped onto form fields by field name directly (see handleSave). */
  validate: (data: FormState) => Record<string, string>;
  toCreateInput: (data: FormState) => CreateInput;
  toUpdateInput: (data: FormState) => UpdateInput;
  renderFields: FormFieldsRenderer<FormState>;
  emptyMessage: string;
  toastMessages: { created: string; updated: string; deleted: string };
};

function resultErrorMessage(
  result: Extract<CrudResult<unknown>, { ok: false }>,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (result.kind) {
    case "forbidden":
      return result.message ?? t("setup.crudScreen.errors.forbidden");
    case "conflict":
      return result.message ?? t("setup.crudScreen.errors.conflict");
    case "devBypassUnavailable":
      return t("setup.crudScreen.errors.devBypassUnavailable");
    case "validation":
      return t("setup.crudScreen.errors.validation");
    case "server":
      return result.message ?? t("setup.crudScreen.errors.saveFailed");
    default:
      return t("setup.crudScreen.errors.saveFailed");
  }
}

/**
 * Orchestrates a full CRUD screen: useCrudTable (list/search/filter/page) +
 * DataTable (presentation + confirm-before-run) + a SlideOverPanel add/edit
 * form. A new screen supplies columns, a service, a form-fields renderer,
 * and a few small mapper functions — nothing here is entity-specific.
 */
export function CrudScreen<T, CreateInput, UpdateInput, FormState>({
  title,
  subtitle,
  addNewLabel,
  panelTitle,
  panelSubtitle,
  service,
  display,
  getRowId,
  searchPlaceholder,
  matchesSearch,
  filterDefs,
  matchesFilters,
  rowActions,
  emptyFormState,
  toFormState,
  validate,
  toCreateInput,
  toUpdateInput,
  renderFields,
  emptyMessage,
  toastMessages,
}: CrudScreenProps<T, CreateInput, UpdateInput, FormState>) {
  const t = useTranslations();
  const { showToast } = useToast();
  const table = useCrudTable(service, { matchesSearch, matchesFilters });

  const [panel, setPanel] = useState<PanelState<T>>({ mode: "closed" });
  const [formData, setFormData] = useState<FormState>(emptyFormState);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => {
    setFormData(emptyFormState);
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "create" });
  };

  const openEdit = (row: T) => {
    setFormData(toFormState(row));
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "edit", row });
  };

  const closePanel = () => setPanel({ mode: "closed" });

  const handleSave = async () => {
    const errors = validate(formData);
    setFormErrors(errors);
    setGeneralError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    const result =
      panel.mode === "edit"
        ? await service.update(getRowId(panel.row), toUpdateInput(formData))
        : await service.create(toCreateInput(formData));
    setIsSaving(false);

    if (result.ok) {
      const wasEdit = panel.mode === "edit";
      closePanel();
      table.refetch();
      showToast(wasEdit ? toastMessages.updated : toastMessages.created);
      return;
    }

    if (result.kind === "validation") {
      const fieldErrors: Record<string, string> = {};
      for (const error of result.errors) {
        // Prefer the backend's own message (e.g. "already exists") over the
        // generic fallback, same reasoning as resultErrorMessage() above.
        fieldErrors[error.field] = error.message ?? t("setup.crudScreen.errors.fieldInvalid");
      }
      setFormErrors(fieldErrors);
    }
    setGeneralError(resultErrorMessage(result, t));
  };

  const runDelete = async (row: T) => {
    const result = await service.remove(getRowId(row));
    if (result.ok) {
      table.refetch();
      showToast(toastMessages.deleted);
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const runCustom = async (row: T, actionKey: string) => {
    const action = service.customActions?.[actionKey];
    if (!action) return;
    const result = await action(getRowId(row));
    if (result.ok) {
      table.refetch();
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const filters = filterDefs?.map((def) => ({
    def,
    value: table.filters[def.key] ?? "",
    onChange: (value: string) => {
      table.setFilters((current) => {
        const next = { ...current };
        if (value) next[def.key] = value;
        else delete next[def.key];
        return next;
      });
    },
  }));

  const listProps = {
    rows: table.items,
    getRowId,
    rowActions: (row: T) =>
      rowActions(row, {
        edit: () => openEdit(row),
        remove: () => runDelete(row),
        runCustom: (actionKey: string) => runCustom(row, actionKey),
      }),
    searchValue: table.search,
    onSearchChange: table.setSearch,
    searchPlaceholder,
    filters,
    onAddNew: openCreate,
    addNewLabel,
    isLoading: table.load.status === "loading",
    errorMessage:
      table.load.status === "forbidden"
        ? t("setup.crudScreen.errors.forbidden")
        : table.load.status === "devBypassUnavailable"
          ? t("setup.crudScreen.errors.devBypassUnavailable")
          : table.load.status === "error"
            ? t("setup.dataTable.errors.loadFailed")
            : null,
    onRetry: table.refetch,
    emptyMessage,
    page: table.page,
    totalPages: table.totalPages,
    onPreviousPage: () => table.setPage((current) => Math.max(1, current - 1)),
    onNextPage: () => table.setPage((current) => Math.min(table.totalPages, current + 1)),
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
      </div>

      {display.mode === "table" ? (
        <DataTable columns={display.columns} {...listProps} />
      ) : (
        <CardGrid card={display.card} {...listProps} />
      )}

      <SlideOverPanel
        isOpen={panel.mode !== "closed"}
        onClose={closePanel}
        title={panel.mode === "edit" ? panelTitle.edit : panelTitle.create}
        subtitle={panelSubtitle}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="flex flex-col gap-5">
          {generalError ? (
            <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
          ) : null}
          {panel.mode !== "closed"
            ? renderFields({
                data: formData,
                onChange: (patch) => setFormData((current) => ({ ...current, ...patch })),
                errors: formErrors,
              })
            : null}
        </div>
      </SlideOverPanel>
    </div>
  );
}
