"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/icons/header/SearchIcon";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import type { ColumnDef, FilterDef, RowAction } from "@/lib/setup/crudTypes";

type ActiveFilter = { def: FilterDef; value: string; onChange: (value: string) => void };

type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  rowActions?: (row: T) => RowAction<T>[];

  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;

  filters?: ActiveFilter[];

  onAddNew?: () => void;
  addNewLabel?: string;

  isLoading: boolean;
  errorMessage: string | null;
  onRetry?: () => void;
  emptyMessage: string;

  page: number;
  totalPages: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  rowActions,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  onAddNew,
  addNewLabel,
  isLoading,
  errorMessage,
  onRetry,
  emptyMessage,
  page,
  totalPages,
  onPreviousPage,
  onNextPage,
}: DataTableProps<T>) {
  const t = useTranslations();
  const hasActions = !!rowActions;

  // Confirm-before-run lives here (not in CrudScreen) since `confirm` is a
  // property of the generic RowAction contract — any screen's any action
  // gets this behavior automatically just by setting it, nothing extra to wire.
  const [pending, setPending] = useState<{ action: RowAction<T>; row: T } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleActionClick = (row: T, action: RowAction<T>) => {
    if (action.confirm) {
      setPending({ action, row });
    } else {
      action.onClick(row);
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setIsRunning(true);
    await pending.action.onClick(pending.row);
    setIsRunning(false);
    setPending(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/*
        Mobile-first: everything stacks full-width below `sm`, so no single
        item's min-width (the search box, a filter dropdown) can ever force
        the row — and therefore the page — wider than the viewport. At `sm`
        and up it becomes the original wrapping row.
      */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full min-w-0 sm:min-w-[200px] sm:flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-11 w-full rounded-md border border-border bg-surface pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {filters?.map(({ def, value, onChange }) => (
          <FilterDropdown key={def.key} def={def} value={value} onChange={onChange} />
        ))}

        {onAddNew ? (
          <Button
            type="button"
            onClick={onAddNew}
            icon={<PlusIcon className="h-4 w-4" />}
            className="w-full px-4 text-sm sm:ml-auto sm:w-auto"
          >
            {addNewLabel}
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted ${column.className ?? ""}`}
                  >
                    {column.header}
                  </th>
                ))}
                {hasActions ? (
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {t("setup.dataTable.actionsHeader")}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-10 text-center text-sm text-text-muted">
                    {t("setup.dataTable.loading")}
                  </td>
                </tr>
              ) : errorMessage ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-10">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-sm text-error">{errorMessage}</p>
                      {onRetry ? (
                        <Button type="button" variant="secondary" onClick={onRetry} className="h-9 px-4 text-sm">
                          {t("common.retry")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-10 text-center text-sm text-text-muted">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={getRowId(row)} className="border-b border-border last:border-b-0 hover:bg-background">
                    {columns.map((column) => (
                      <td key={column.key} className={`px-4 py-3.5 text-text-primary ${column.className ?? ""}`}>
                        {column.render(row)}
                      </td>
                    ))}
                    {hasActions ? (
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-3">
                          {rowActions!(row).map((action) => (
                            <button
                              key={action.key}
                              type="button"
                              disabled={action.disabled}
                              title={action.disabled ? action.disabledReason : undefined}
                              onClick={() => handleActionClick(row, action)}
                              className={`text-sm font-semibold transition-colors hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline ${
                                action.variant === "danger" ? "text-error" : "text-accent"
                              }`}
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && !errorMessage && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-xs text-text-muted">
            {t("setup.dataTable.pageOf", { page, total: totalPages })}
          </span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={onPreviousPage}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("setup.dataTable.previous")}
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={onNextPage}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("setup.dataTable.next")}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={!!pending}
        title={pending?.action.confirm?.title ?? ""}
        message={pending?.action.confirm?.message ?? ""}
        isDangerous={pending?.action.variant === "danger"}
        isConfirming={isRunning}
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

type FilterDropdownProps = {
  def: FilterDef;
  value: string;
  onChange: (value: string) => void;
};

// A native <select>'s open dropdown is rendered by the browser/OS, not by
// this page's CSS — there is no reliable way to constrain its width or
// position from here, and on mobile (or a narrow desktop-emulated
// viewport) it can render wider than the screen regardless of how the
// closed trigger is styled. This custom dropdown renders its own menu, so
// its width and position are ordinary CSS: `left-0 right-0` ties the menu
// to its own trigger's width, which is itself already viewport-safe (full
// width on mobile, per the toolbar layout above) — it can never be wider
// than its parent, on any screen size.
function FilterDropdown({ def, value, onChange }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedLabel = def.options.find((option) => option.value === value)?.label ?? def.label;

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={def.label}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 text-sm text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto sm:min-w-[160px]"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg sm:right-auto sm:w-max sm:min-w-full"
        >
          {def.options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`block w-full truncate px-4 py-2 text-left text-sm transition-colors ${
                  option.value === value
                    ? "bg-brand-tint text-accent"
                    : "text-text-primary hover:bg-background"
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
