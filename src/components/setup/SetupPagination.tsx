"use client";

import { useTranslations } from "next-intl";

export type SetupPaginationProps = {
  page: number;
  totalPages: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

/** Shared by DataTable and CardGrid — the Previous/Next footer. */
export function SetupPagination({ page, totalPages, onPreviousPage, onNextPage }: SetupPaginationProps) {
  const t = useTranslations();

  return (
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
  );
}
