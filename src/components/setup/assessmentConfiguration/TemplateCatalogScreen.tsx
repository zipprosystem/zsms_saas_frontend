"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { WideModal } from "@/components/ui/WideModal";
import { useToast } from "@/components/ui/Toast";
import { CardGrid } from "@/components/setup/CardGrid";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { TemplatePreviewFrame, type PreviewFocus } from "@/components/setup/assessmentConfiguration/TemplatePreviewFrame";
import { useCrudTable } from "@/lib/setup/useCrudTable";
import type { CrudResult, CrudService, RowAction } from "@/lib/setup/crudTypes";
import type { TemplateStatus } from "@/lib/setup/assessmentConfiguration/templateCatalog";

/** What both catalogs (Result Templates, ID Card Templates) have in common. */
export type CatalogTemplate = {
  id: string;
  name: string;
  description: string | null;
  suited_for_label: string | null;
  status: TemplateStatus;
  is_default: boolean;
  preview_path: string | null;
};

// never: the catalog screen only lists, archives and sets defaults — it never calls create/update itself.
export type CatalogService<T extends CatalogTemplate> = CrudService<T, never, never> & {
  setDefault: (template: T) => Promise<CrudResult<T>>;
};

const STATUS_BADGE_CLASSES: Record<TemplateStatus, string> = {
  available: "bg-category-green-tint text-success",
  draft: "bg-category-amber-tint text-warning",
  archived: "bg-background text-text-muted",
};

type TemplateCatalogScreenProps<T extends CatalogTemplate> = {
  title: string;
  subtitle: string;
  service: CatalogService<T>;
  searchPlaceholder: string;
  emptyMessage: string;
  /** e.g. ID cards' Student/Staff tabs — rendered between the heading and the gallery. */
  tabs?: ReactNode;
  /** Which card of a multi-card design file to show (ID cards). */
  previewFocus?: PreviewFocus;
  /** Width the design is laid out at before the thumbnail scales it down. */
  previewVirtualWidth?: number;
};

/**
 * Card-gallery catalog for templates — composes useCrudTable + CardGrid
 * directly (not CrudScreen, whose Add New always opens its own form; here
 * Add New is a stub, same reasoning as StudentsScreen). Archive is the
 * service's remove() (DELETE archives server-side); set-default is its own
 * action. The UI pre-disables what the backend would refuse (see the mock
 * rules in templateCatalog.ts) — the backend's 409 still surfaces as a
 * toast if the two ever disagree.
 */
export function TemplateCatalogScreen<T extends CatalogTemplate>({
  title,
  subtitle,
  service,
  searchPlaceholder,
  emptyMessage,
  tabs,
  previewFocus,
  previewVirtualWidth,
}: TemplateCatalogScreenProps<T>) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [previewTarget, setPreviewTarget] = useState<T | null>(null);
  const table = useCrudTable(service, {
    matchesSearch: (row, query) => row.name.toLowerCase().includes(query.toLowerCase()),
  });

  const runMutation = async (run: () => Promise<CrudResult<unknown>>, successMessage: string) => {
    const result = await run();
    if (!result.ok) {
      showToast(resultErrorMessage(result, t), "error");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: service.queryKey });
    showToast(successMessage);
  };

  const rowActions = (row: T): RowAction<T>[] => [
    { key: "preview", label: t("setup.templateCatalog.actions.preview"), onClick: () => setPreviewTarget(row) },
    {
      key: "setDefault",
      label: t("setup.templateCatalog.actions.setDefault"),
      disabled: row.is_default || row.status !== "available",
      disabledReason: row.is_default
        ? t("setup.templateCatalog.disabled.alreadyDefault")
        : t("setup.templateCatalog.disabled.notAvailable"),
      onClick: () => runMutation(() => service.setDefault(row), t("setup.templateCatalog.toast.defaultSet", { name: row.name })),
    },
    {
      key: "archive",
      label: t("setup.templateCatalog.actions.archive"),
      variant: "danger",
      disabled: row.is_default || row.status === "archived",
      disabledReason:
        row.status === "archived" ? t("setup.templateCatalog.disabled.archived") : t("setup.templateCatalog.disabled.isDefault"),
      confirm: {
        title: t("setup.templateCatalog.confirmArchive.title"),
        message: t("setup.templateCatalog.confirmArchive.message", { name: row.name }),
      },
      onClick: () => runMutation(() => service.remove(row.id), t("setup.templateCatalog.toast.archived", { name: row.name })),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
      </div>

      {tabs}

      <CardGrid<T>
        card={{
          title: (row) => row.name,
          description: (row) => row.suited_for_label,
          badge: (row) => (
            <div className="flex flex-col items-end gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[row.status]}`}>
                {t(`setup.templateCatalog.status.${row.status}`)}
              </span>
              {row.is_default ? (
                <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-accent">
                  {t("setup.templateCatalog.defaultBadge")}
                </span>
              ) : null}
            </div>
          ),
          media: (row) => (
            <button
              type="button"
              onClick={() => setPreviewTarget(row)}
              aria-label={t("setup.templateCatalog.actions.previewNamed", { name: row.name })}
              className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <TemplatePreviewFrame
                previewPath={row.preview_path}
                title={row.name}
                focus={previewFocus}
                variant="thumbnail"
                virtualWidth={previewVirtualWidth}
              />
            </button>
          ),
        }}
        rows={table.items}
        getRowId={(row) => row.id}
        rowActions={rowActions}
        searchValue={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder={searchPlaceholder}
        onAddNew={() => showToast(t("setup.templateCatalog.addNewComingSoon"))}
        addNewLabel={t("setup.templateCatalog.addNew")}
        isLoading={table.load.status === "loading"}
        errorMessage={
          table.load.status === "forbidden"
            ? t("setup.crudScreen.errors.forbidden")
            : table.load.status === "devBypassUnavailable"
              ? t("setup.crudScreen.errors.devBypassUnavailable")
              : table.load.status === "error"
                ? t("setup.dataTable.errors.loadFailed")
                : null
        }
        onRetry={table.refetch}
        emptyMessage={emptyMessage}
        page={table.page}
        totalPages={table.totalPages}
        onPreviousPage={() => table.setPage((current) => Math.max(1, current - 1))}
        onNextPage={() => table.setPage((current) => Math.min(table.totalPages, current + 1))}
      />

      <WideModal
        isOpen={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
        title={previewTarget?.name ?? ""}
        subtitle={previewTarget?.description ?? undefined}
        size="2xl"
        footer={
          <>
            <span className="text-xs text-text-muted">{t("setup.templateCatalog.preview.sampleData")}</span>
            <Button type="button" variant="secondary" onClick={() => setPreviewTarget(null)} className="h-10 px-4 text-sm">
              {t("common.close")}
            </Button>
          </>
        }
      >
        {previewTarget ? (
          <TemplatePreviewFrame
            previewPath={previewTarget.preview_path}
            title={previewTarget.name}
            focus={previewFocus}
            variant="full"
          />
        ) : null}
      </WideModal>
    </div>
  );
}
