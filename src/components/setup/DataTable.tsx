"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { SetupToolbar } from "@/components/setup/SetupToolbar";
import { SetupPagination } from "@/components/setup/SetupPagination";
import { useRowActionConfirm } from "@/lib/setup/useRowActionConfirm";
import type { ColumnDef, SetupListBaseProps } from "@/lib/setup/crudTypes";

type DataTableProps<T> = SetupListBaseProps<T> & {
  columns: ColumnDef<T>[];
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
  const { pending, isRunning, handleActionClick, handleConfirm, cancel } = useRowActionConfirm<T>();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SetupToolbar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filters={filters}
        onAddNew={onAddNew}
        addNewLabel={addNewLabel}
      />

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
        <SetupPagination
          page={page}
          totalPages={totalPages}
          onPreviousPage={onPreviousPage}
          onNextPage={onNextPage}
        />
      ) : null}

      <ConfirmDialog
        isOpen={!!pending}
        title={pending?.action.confirm?.title ?? ""}
        message={pending?.action.confirm?.message ?? ""}
        isDangerous={pending?.action.variant === "danger"}
        isConfirming={isRunning}
        onConfirm={handleConfirm}
        onCancel={cancel}
      />
    </div>
  );
}
