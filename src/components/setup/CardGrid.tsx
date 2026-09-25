"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { SetupToolbar } from "@/components/setup/SetupToolbar";
import { SetupPagination } from "@/components/setup/SetupPagination";
import { useRowActionConfirm } from "@/lib/setup/useRowActionConfirm";
import type { CardFieldsDef, SetupListBaseProps } from "@/lib/setup/crudTypes";

type CardGridProps<T> = SetupListBaseProps<T> & {
  card: CardFieldsDef<T>;
};

/**
 * Card-grid sibling to DataTable — same useCrudTable state, same toolbar/
 * pagination/confirm-dialog wiring, just rendered as cards instead of table
 * rows. For screens whose Figma is a card grid (e.g. School Types) rather
 * than a table. 1 column on mobile, 2 columns from `sm` up, per the design.
 */
export function CardGrid<T>({
  card,
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
}: CardGridProps<T>) {
  const t = useTranslations();
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

      {isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-sm text-text-muted">
          {t("setup.dataTable.loading")}
        </div>
      ) : errorMessage ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-sm text-error">{errorMessage}</p>
          {onRetry ? (
            <Button type="button" variant="secondary" onClick={onRetry} className="h-9 px-4 text-sm">
              {t("common.retry")}
            </Button>
          ) : null}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-text-muted">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((row) => {
            const description = card.description?.(row);
            const badge = card.badge?.(row);
            const tags = card.tags?.(row) ?? [];
            const actions = rowActions?.(row);

            return (
              <div
                key={getRowId(row)}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-primary">{card.title(row)}</p>
                    {description ? (
                      <p className="mt-1 text-xs text-text-secondary">{description}</p>
                    ) : null}
                  </div>
                  {badge ? <div className="shrink-0">{badge}</div> : null}
                </div>

                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-brand-tint px-2.5 py-1 text-xs font-medium text-accent"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {actions && actions.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                    {actions.map((action) => (
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
                ) : null}
              </div>
            );
          })}
        </div>
      )}

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
