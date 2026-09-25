"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { useToast } from "@/components/ui/Toast";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { SetupToolbar } from "@/components/setup/SetupToolbar";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { useRowActionConfirm } from "@/lib/setup/useRowActionConfirm";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type FilterDef, type RowAction } from "@/lib/setup/crudTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import {
  classTermsQueryKey,
  createClassTerms,
  fetchTermsForClass,
  removeClassTerm,
  updateClassTerm,
  type ClassTerm,
  type ClassTermCreateInput,
  type ClassTermUpdateInput,
  type TermType,
} from "@/lib/setup/academicStructure/classTermsApi";

const TERM_TYPES: TermType[] = ["First", "Second", "Third"];

type FormState = {
  academic_year_id: string;
  class_ids: string[];
  term_name: string;
  start_date: string;
  end_date: string;
  next_term_start_date: string;
  next_term_fee: string;
  term_type: TermType | "";
};

const EMPTY_FORM = (yearId: string): FormState => ({
  academic_year_id: yearId,
  class_ids: [],
  term_name: "",
  start_date: "",
  end_date: "",
  next_term_start_date: "",
  next_term_fee: "",
  term_type: "",
});

type PanelState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; row: ClassTerm };

/**
 * Outer guard — a class-term always belongs to a class, which always
 * belongs to an academic year. Same shape as Classes/Class-arms.
 */
export function ClassTermsScreen() {
  const t = useTranslations();
  const { selectedYearId, isLoading, error } = useAcademicYear();

  if (!isLoading && !error && !selectedYearId) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-sm text-text-secondary">{t("setup.classTerms.noYear.message")}</p>
        <Link
          href="/admin/setup/academic-structure/academic-years"
          className="text-sm font-semibold text-accent hover:underline"
        >
          {t("setup.classTerms.noYear.linkLabel")}
        </Link>
      </div>
    );
  }

  if (!selectedYearId) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-text-muted">
        {t("setup.dataTable.loading")}
      </div>
    );
  }

  return <ClassTermsTable yearId={selectedYearId} />;
}

function ClassesCheckboxList({
  classes,
  selectedIds,
  onChange,
}: {
  classes: SchoolClass[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations();
  const allChecked = classes.length > 0 && selectedIds.length === classes.length;
  const someChecked = selectedIds.length > 0 && !allChecked;

  const toggleAll = () => {
    onChange(allChecked ? [] : classes.map((cls) => cls.id));
  };
  const toggleOne = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((current) => current !== id) : [...selectedIds, id]);
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border">
      <label className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm font-semibold text-text-primary">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(node) => {
            if (node) node.indeterminate = someChecked;
          }}
          onChange={toggleAll}
          className="h-4 w-4 shrink-0 rounded border-border accent-accent"
        />
        {t("setup.classTerms.fields.applyTo.selectAll")}
      </label>
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto p-1.5">
        {classes.map((cls) => (
          <label
            key={cls.id}
            className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-primary hover:bg-background"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(cls.id)}
              onChange={() => toggleOne(cls.id)}
              className="h-4 w-4 shrink-0 rounded border-border accent-accent"
            />
            {cls.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function ClassTermsTable({ yearId }: { yearId: string }) {
  const t = useTranslations();
  const { years } = useAcademicYear();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const classesService = createClassesService(yearId);
  const classesQuery = useQuery({
    queryKey: classesService.queryKey,
    queryFn: () => classesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes = classesQuery.data?.ok ? classesQuery.data.data : [];

  const termQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: classTermsQueryKey(cls.id),
      queryFn: () => fetchTermsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });

  const isLoading = classesQuery.isPending || (classes.length > 0 && termQueries.some((query) => query.isPending));
  const hasError = classesQuery.isError || termQueries.some((query) => query.isError || (query.data && !query.data.ok));

  const allTerms: ClassTerm[] = termQueries.flatMap((query) => (query.data?.ok ? query.data.data : []));

  const classById = (id: string): SchoolClass | null => classes.find((cls) => cls.id === id) ?? null;

  // ----- search / filters -----
  const [search, setSearch] = useState("");
  const [termTypeFilter, setTermTypeFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const isFiltering = !!search.trim() || !!termTypeFilter || !!classFilter;

  const matchesSearchAndFilters = (term: ClassTerm) => {
    const needle = search.trim().toLowerCase();
    const matchesSearchText =
      !needle ||
      term.term_name.toLowerCase().includes(needle) ||
      (classById(term.class_id)?.name.toLowerCase().includes(needle) ?? false);
    const matchesClass = !classFilter || term.class_id === classFilter;
    return matchesSearchText && matchesClass;
  };

  const termTypeLabel = (type: TermType) => t(`setup.classTerms.termType.${type.toLowerCase()}`);

  const groups = TERM_TYPES.filter((type) => !termTypeFilter || termTypeFilter === type)
    .map((type) => ({
      type,
      rows: allTerms.filter((term) => term.term_type === type).filter(matchesSearchAndFilters),
    }))
    .filter((group) => !isFiltering || group.rows.length > 0);

  const [expanded, setExpanded] = useState<Set<TermType>>(new Set(TERM_TYPES));
  const toggleExpanded = (type: TermType) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filterDefs: FilterDef[] = [
    {
      key: "termType",
      label: t("setup.classTerms.filters.termType"),
      options: [
        { value: "", label: t("setup.classTerms.filters.all") },
        ...TERM_TYPES.map((type) => ({ value: type, label: termTypeLabel(type) })),
      ],
    },
    {
      key: "class",
      label: t("setup.classTerms.filters.class"),
      options: [{ value: "", label: t("setup.classTerms.filters.all") }, ...classes.map((cls) => ({ value: cls.id, label: cls.name }))],
    },
  ];
  const filters = [
    { def: filterDefs[0], value: termTypeFilter, onChange: setTermTypeFilter },
    { def: filterDefs[1], value: classFilter, onChange: setClassFilter },
  ];

  // ----- panel / form -----
  const [panel, setPanel] = useState<PanelState>({ mode: "closed" });
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM(yearId));
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The create form's own Academic Year field is independently changeable
  // from the screen's currently-viewed year — same pattern as Class-arms'
  // form-level School Type field re-filtering its own Class dropdown.
  const formClassesService = formData.academic_year_id ? createClassesService(formData.academic_year_id) : null;
  const formClassesQuery = useQuery({
    queryKey: formClassesService?.queryKey ?? ["setup", "classes", "none"],
    queryFn: () => formClassesService!.list().then(throwIfTransient),
    enabled: !!formClassesService && panel.mode === "create",
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const activeFormClasses = (formClassesQuery.data?.ok ? formClassesQuery.data.data : []).filter(
    (cls) => cls.is_active,
  );

  const openCreate = () => {
    setFormData(EMPTY_FORM(yearId));
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "create" });
  };
  const openEdit = (row: ClassTerm) => {
    setFormData({
      academic_year_id: row.academic_year_id,
      class_ids: [row.class_id],
      term_name: row.term_name,
      start_date: row.start_date,
      end_date: row.end_date,
      next_term_start_date: row.next_term_start_date,
      next_term_fee: row.next_term_fee !== null ? String(row.next_term_fee) : "",
      term_type: row.term_type,
    });
    setFormErrors({});
    setGeneralError(null);
    setPanel({ mode: "edit", row });
  };
  const closePanel = () => setPanel({ mode: "closed" });

  // Cleared whenever the form's OWN academic year changes — the class pool
  // just changed, so any already-checked ids may no longer be valid/active.
  useEffect(() => {
    setFormData((current) => (current.class_ids.length > 0 ? { ...current, class_ids: [] } : current));
    // Deliberately only on academic_year_id changing, not on every
    // formData update — this would otherwise clear the selection on every
    // keystroke elsewhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.academic_year_id]);

  const validate = (data: FormState): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!data.academic_year_id) errors.academic_year_id = t("setup.classTerms.errors.yearRequired");
    if (!data.term_name.trim()) errors.term_name = t("setup.classTerms.errors.termNameRequired");
    if (!data.start_date) errors.start_date = t("setup.classTerms.errors.startDateRequired");
    if (!data.end_date) errors.end_date = t("setup.classTerms.errors.endDateRequired");
    else if (data.start_date && data.end_date <= data.start_date) {
      errors.end_date = t("setup.classTerms.errors.endBeforeStart");
    }
    if (!data.next_term_start_date) {
      errors.next_term_start_date = t("setup.classTerms.errors.nextTermStartRequired");
    } else if (data.end_date && data.next_term_start_date <= data.end_date) {
      errors.next_term_start_date = t("setup.classTerms.errors.nextTermStartBeforeEnd");
    }
    if (data.next_term_fee.trim() && (Number.isNaN(Number(data.next_term_fee)) || Number(data.next_term_fee) < 0)) {
      errors.next_term_fee = t("setup.classTerms.errors.feeInvalid");
    }
    if (!data.term_type) errors.term_type = t("setup.classTerms.errors.termTypeRequired");
    if (panel.mode === "create" && data.class_ids.length === 0) {
      errors.class_ids = t("setup.classTerms.errors.classesRequired");
    }
    return errors;
  };

  const invalidateClass = (classId: string) => queryClient.invalidateQueries({ queryKey: classTermsQueryKey(classId) });

  // DUPLICATE_NAME maps to the `term_name` field (classTermsApi.ts) — since
  // client-side validation already guarantees term_name is non-empty
  // before a request is ever sent, a server-side validation error landing
  // on that specific field with no message of its own is, in practice,
  // always this duplicate case, not a generic "invalid" one.
  const fieldErrorFallback = (field: string): string =>
    field === "term_name" ? t("setup.classTerms.errors.duplicateTerm") : t("setup.crudScreen.errors.fieldInvalid");

  const handleSave = async () => {
    // Only ever invoked while the panel is open (SlideOverPanel's onSave),
    // but TS can't infer that from control flow alone — this guard is what
    // narrows `panel` to {mode:"create"}|{mode:"edit"} for everything below.
    if (panel.mode === "closed") return;

    const errors = validate(formData);
    setFormErrors(errors);
    setGeneralError(null);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    const fee = formData.next_term_fee.trim() ? Number(formData.next_term_fee) : null;

    if (panel.mode === "create") {
      const input: ClassTermCreateInput = {
        academic_year_id: formData.academic_year_id,
        class_ids: formData.class_ids,
        term_name: formData.term_name.trim(),
        start_date: formData.start_date,
        end_date: formData.end_date,
        next_term_start_date: formData.next_term_start_date,
        next_term_fee: fee,
        term_type: formData.term_type as TermType,
      };
      const result = await createClassTerms(input);
      setIsSaving(false);

      if (result.ok) {
        closePanel();
        await Promise.all(formData.class_ids.map(invalidateClass));
        showToast(t("setup.classTerms.toast.created", { count: formData.class_ids.length }));
        return;
      }
      if (result.kind === "validation") {
        const fieldErrors: Record<string, string> = {};
        for (const error of result.errors) {
          fieldErrors[error.field] = error.message ?? fieldErrorFallback(error.field);
        }
        setFormErrors(fieldErrors);
      }
      setGeneralError(resultErrorMessage(result, t));
      return;
    }

    const update: ClassTermUpdateInput = {
      term_name: formData.term_name.trim(),
      start_date: formData.start_date,
      end_date: formData.end_date,
      next_term_start_date: formData.next_term_start_date,
      next_term_fee: fee,
      term_type: formData.term_type as TermType,
    };
    const result = await updateClassTerm(panel.row.id, update);
    setIsSaving(false);

    if (result.ok) {
      const classId = panel.row.class_id;
      closePanel();
      await invalidateClass(classId);
      showToast(t("setup.classTerms.toast.updated"));
      return;
    }
    if (result.kind === "validation") {
      const fieldErrors: Record<string, string> = {};
      for (const error of result.errors) {
        fieldErrors[error.field] = error.message ?? fieldErrorFallback(error.field);
      }
      setFormErrors(fieldErrors);
    }
    setGeneralError(resultErrorMessage(result, t));
  };

  const runDelete = async (row: ClassTerm) => {
    const result = await removeClassTerm(row.id);
    if (result.ok) {
      await invalidateClass(row.class_id);
      showToast(t("setup.classTerms.toast.deleted"));
      return;
    }
    showToast(resultErrorMessage(result, t), "error");
  };

  const rowActions = (row: ClassTerm): RowAction<ClassTerm>[] => [
    { key: "edit", label: t("common.edit"), onClick: () => openEdit(row) },
    {
      key: "delete",
      label: t("common.delete"),
      variant: "danger",
      onClick: () => runDelete(row),
      confirm: {
        title: t("setup.classTerms.confirmDelete.title"),
        message: t("setup.classTerms.confirmDelete.message", {
          class: classById(row.class_id)?.name ?? "",
        }),
      },
    },
  ];

  const { pending, isRunning, handleActionClick, handleConfirm, cancel } = useRowActionConfirm<ClassTerm>();

  const yearOptions = years.map((year) => ({ id: year.id, name: year.name }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t("setup.classTerms.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("setup.classTerms.subtitle")}</p>
      </div>

      <SetupToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t("setup.classTerms.searchPlaceholder")}
        filters={filters}
        onAddNew={openCreate}
        addNewLabel={t("setup.classTerms.addNew")}
      />

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-text-muted">
          {t("setup.dataTable.loading")}
        </div>
      ) : hasError ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-error">
          {t("setup.dataTable.errors.loadFailed")}
        </div>
      ) : allTerms.length === 0 && !isFiltering ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-text-muted">
          {t("setup.classTerms.empty")}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-text-muted">
          {t("setup.classTerms.noMatches")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const isExpanded = expanded.has(group.type);
            return (
              <div key={group.type} className="overflow-hidden rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.type)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-sm font-semibold text-text-primary">{termTypeLabel(group.type)}</span>
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    {t("setup.classTerms.classCount", { count: group.rows.length })}
                    <ChevronDownIcon
                      className={`h-4 w-4 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
                {isExpanded && group.rows.length > 0 ? (
                  <div className="border-t border-border">
                    {group.rows.map((row, index) => (
                      <div
                        key={row.id}
                        className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                          index === group.rows.length - 1 ? "" : "border-b border-border"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {classById(row.class_id)?.name ?? "—"}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-text-muted">
                            {row.term_name} · {row.start_date} – {row.end_date}
                            {row.next_term_fee !== null
                              ? ` · ${t("setup.classTerms.columns.fee")}: ${row.next_term_fee}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {rowActions(row).map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              onClick={() => handleActionClick(row, action)}
                              className={`text-sm font-semibold transition-colors hover:underline ${
                                action.variant === "danger" ? "text-error" : "text-accent"
                              }`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pending}
        title={pending?.action.confirm?.title ?? ""}
        message={pending?.action.confirm?.message ?? ""}
        isDangerous={pending?.action.variant === "danger"}
        isConfirming={isRunning}
        onConfirm={handleConfirm}
        onCancel={cancel}
      />

      <SlideOverPanel
        isOpen={panel.mode !== "closed"}
        onClose={closePanel}
        title={panel.mode === "edit" ? t("setup.classTerms.panel.editTitle") : t("setup.classTerms.panel.createTitle")}
        onSave={handleSave}
        isSaving={isSaving}
      >
        <div className="flex flex-col gap-5">
          {generalError ? (
            <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
          ) : null}
          {panel.mode !== "closed" ? (
            <>
              {panel.mode === "edit" ? (
                <div className="rounded-md border border-border bg-background px-4 py-3 text-sm text-text-secondary">
                  <p>
                    {t("setup.classTerms.fields.academicYear.label")}:{" "}
                    <span className="font-medium text-text-primary">
                      {years.find((year) => year.id === panel.row.academic_year_id)?.name ?? "—"}
                    </span>
                  </p>
                  <p className="mt-1">
                    {t("setup.classTerms.fields.class.label")}:{" "}
                    <span className="font-medium text-text-primary">
                      {classById(panel.row.class_id)?.name ?? "—"}
                    </span>
                  </p>
                </div>
              ) : (
                <SelectField
                  id="class-term-academic-year"
                  label={t("setup.classTerms.fields.academicYear.label")}
                  value={formData.academic_year_id}
                  onChange={(event) => setFormData((current) => ({ ...current, academic_year_id: event.target.value }))}
                  hasError={!!formErrors.academic_year_id}
                  error={formErrors.academic_year_id}
                >
                  {yearOptions.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </SelectField>
              )}

              <InputField
                id="class-term-name"
                label={t("setup.classTerms.fields.termName.label")}
                placeholder={t("setup.classTerms.fields.termName.placeholder")}
                value={formData.term_name}
                onChange={(event) => setFormData((current) => ({ ...current, term_name: event.target.value }))}
                hasError={!!formErrors.term_name}
                error={formErrors.term_name}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <InputField
                  id="class-term-start-date"
                  type="date"
                  label={t("setup.classTerms.fields.startDate.label")}
                  value={formData.start_date}
                  onChange={(event) => setFormData((current) => ({ ...current, start_date: event.target.value }))}
                  hasError={!!formErrors.start_date}
                  error={formErrors.start_date}
                />
                <InputField
                  id="class-term-end-date"
                  type="date"
                  label={t("setup.classTerms.fields.endDate.label")}
                  value={formData.end_date}
                  onChange={(event) => setFormData((current) => ({ ...current, end_date: event.target.value }))}
                  hasError={!!formErrors.end_date}
                  error={formErrors.end_date}
                />
              </div>

              <InputField
                id="class-term-next-start-date"
                type="date"
                label={t("setup.classTerms.fields.nextTermStartDate.label")}
                value={formData.next_term_start_date}
                onChange={(event) =>
                  setFormData((current) => ({ ...current, next_term_start_date: event.target.value }))
                }
                hasError={!!formErrors.next_term_start_date}
                error={formErrors.next_term_start_date}
              />

              <InputField
                id="class-term-fee"
                type="number"
                label={t("setup.classTerms.fields.nextTermFee.label")}
                placeholder={t("setup.classTerms.fields.nextTermFee.placeholder")}
                value={formData.next_term_fee}
                onChange={(event) => setFormData((current) => ({ ...current, next_term_fee: event.target.value }))}
                hasError={!!formErrors.next_term_fee}
                error={formErrors.next_term_fee}
              />

              <ChipGroup
                label={t("setup.classTerms.fields.termType.label")}
                multiple={false}
                options={TERM_TYPES.map((type) => ({ value: type, label: termTypeLabel(type) }))}
                value={formData.term_type ? [formData.term_type] : []}
                onChange={(values) =>
                  setFormData((current) => ({ ...current, term_type: (values[0] as TermType) ?? "" }))
                }
                hasError={!!formErrors.term_type}
                error={formErrors.term_type}
              />

              {panel.mode === "create" ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-text-primary">
                    {t("setup.classTerms.fields.applyTo.label")}
                  </span>
                  {formClassesQuery.isPending ? (
                    <p className="text-sm text-text-muted">{t("setup.classTerms.fields.applyTo.loading")}</p>
                  ) : activeFormClasses.length === 0 ? (
                    <p className="text-xs text-text-muted">
                      {t("setup.classTerms.fields.applyTo.emptyHint")}{" "}
                      <Link
                        href="/admin/setup/academic-structure/classes"
                        className="font-semibold text-accent hover:underline"
                      >
                        {t("setup.classTerms.fields.applyTo.emptyHintLink")}
                      </Link>
                    </p>
                  ) : (
                    <ClassesCheckboxList
                      classes={activeFormClasses}
                      selectedIds={formData.class_ids}
                      onChange={(ids) => setFormData((current) => ({ ...current, class_ids: ids }))}
                    />
                  )}
                  {formErrors.class_ids ? <p className="text-xs text-error">{formErrors.class_ids}</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SlideOverPanel>
    </div>
  );
}
