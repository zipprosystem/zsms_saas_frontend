"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/setup/DataTable";
import { ExportMenu } from "@/components/setup/ExportMenu";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ActionsMenu, type ActionsMenuItem } from "@/components/ui/ActionsMenu";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { NAV_PERMISSIONS } from "@/lib/auth/navPermissions";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient, type ColumnDef, type CrudResult, type FilterDef } from "@/lib/setup/crudTypes";
import type { ExportColumn, ExportConfig } from "@/lib/export/exportTypes";
import { isPrimaryParentOf } from "@/lib/parents/parentLinks";
import {
  deleteParent,
  getParent,
  listParentsOfStudent,
  listParentsPage,
  PARENT_PAGE_SIZE_DEFAULT,
  PARENT_PAGE_SIZES,
  parentChildQueryKey,
  parentRecordQueryKey,
  parentsOfStudentQueryKey,
  parentsPageQueryKey,
  parentsQueryKeyRoot,
  type ParentPageParams,
  type ParentPageSize,
} from "@/lib/parents/parentsApi";
import type { Parent, ParentChild, ParentListItem, ParentRelationship, ParentStatus, StudentOption } from "@/lib/parents/parentTypes";
import { EmailActiveIndicator, ParentAvatar, ParentsHeader, ParentStatusBadge, RelationshipBadge } from "@/components/parents/ParentBadges";
import { ParentChildrenCell, PrimaryForCell } from "@/components/parents/ParentChildren";
import { ParentDetail } from "@/components/parents/ParentDetail";
import { ParentFormModal } from "@/components/parents/ParentFormModal";
import { useCanSee, useStudentOptions } from "@/components/parents/useParentData";

const SEARCH_DEBOUNCE_MS = 300;

type FormState = { mode: "create" } | { mode: "edit"; parent: Parent };

/** Export resolves children from whatever the page already cached — never fires new requests. */
function cachedChildren(queryClient: QueryClient, parent: ParentListItem): ParentChild[] {
  const record = queryClient.getQueryData<CrudResult<Parent>>(parentRecordQueryKey(parent.id));
  if (!record?.ok) return [];
  return record.data.student_ids
    .map((id) => queryClient.getQueryData<CrudResult<ParentChild>>(parentChildQueryKey(id)))
    .flatMap((result) => (result?.ok ? [result.data] : []));
}

/**
 * Admin Panel › Parents (spec v1.2 §4) — mirrors HR › Staff: server-paged
 * list (search / relationship / status are GET erp/parents params), a
 * detail modal, a single-step Add/Edit form, delete. Parents auto-created
 * by student registration are just rows here — the backend dedupes them
 * (email + sibling reuse), so the page never merges or re-creates; a
 * manual create with a taken email is pointed at the existing parent.
 *
 * "Filter by child" is a separate mode (listParentsOfStudent — FLAGGED
 * workaround until GET erp/parents takes a student_id).
 *
 * Gating: the page on adminPanelParents, every write (add / edit / delete
 * / link / unlink) on adminPanelParentsManage — both safe-visible until
 * the user payload carries permissions (navPermissions.ts).
 */
export function ParentsScreen() {
  const t = useTranslations();
  const p = useTranslations("parents");
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { school } = useAuth();
  const canView = useCanSee(NAV_PERMISSIONS.adminPanelParents);
  const canManage = useCanSee(NAV_PERMISSIONS.adminPanelParentsManage);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ParentPageSize>(PARENT_PAGE_SIZE_DEFAULT);
  const [child, setChild] = useState<StudentOption | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ParentListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const childSearch = useStudentOptions(canView);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search]);

  const viewKey = JSON.stringify([debouncedSearch, filters, pageSize]);
  const [pagedViewKey, setPagedViewKey] = useState(viewKey);
  if (pagedViewKey !== viewKey) {
    setPagedViewKey(viewKey);
    setPage(1);
  }

  const pageParams: ParentPageParams = {
    search: debouncedSearch || undefined,
    relationship: (filters.relationship as ParentRelationship) || undefined,
    status: (filters.status as ParentStatus) || undefined,
    page,
    limit: pageSize,
  };

  const pageQuery = useQuery({
    queryKey: parentsPageQueryKey(pageParams),
    queryFn: () => listParentsPage(pageParams).then(throwIfTransient),
    enabled: canView && !child,
    staleTime: STRUCTURAL_STALE_TIME_MS,
    placeholderData: (previous) => previous,
  });
  const childQuery = useQuery({
    queryKey: parentsOfStudentQueryKey(child?.id ?? ""),
    queryFn: () => listParentsOfStudent(child?.id ?? "").then(throwIfTransient),
    enabled: canView && !!child,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const activeQuery = child ? childQuery : pageQuery;

  const pageData = !child && pageQuery.data?.ok ? pageQuery.data.data : null;
  const rows: ParentListItem[] = child ? (childQuery.data?.ok ? childQuery.data.data : []) : (pageData?.items ?? []);
  const lastPage = pageData ? Math.max(1, Math.ceil(pageData.total / pageData.limit)) : 1;
  const totalPages = child ? 1 : pageData?.hasMore ? Math.max(lastPage, page + 1) : lastPage;
  if (pageData && !pageQuery.isPlaceholderData && rows.length === 0 && page > 1) setPage(Math.min(page - 1, lastPage));

  const errorMessage = isDevBypassUnavailable(activeQuery.data)
    ? t("setup.crudScreen.errors.devBypassUnavailable")
    : activeQuery.isError || (activeQuery.data && !activeQuery.data.ok)
      ? p("loadError")
      : null;

  // ---- Actions -------------------------------------------------------------
  const openEdit = async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    const result = await getParent(id); // the form sends the COMPLETE record — never seed it from a list row
    setOpeningId(null);
    if (!result.ok) {
      showToast(resultErrorMessage(result, t));
      return;
    }
    setDetailId(null);
    setFormState({ mode: "edit", parent: result.data });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteParent(deleteTarget.id);
    setIsDeleting(false);
    setDeleteTarget(null);
    if (!result.ok) {
      showToast(resultErrorMessage(result, t));
      return;
    }
    setDetailId(null);
    await queryClient.invalidateQueries({ queryKey: parentsQueryKeyRoot });
    showToast(p("toast.deleted"));
  };

  const findExisting = (email: string) => {
    setFormState(null);
    setChild(null);
    setFilters({});
    setSearch(email);
  };

  // ---- Toolbar -------------------------------------------------------------
  const filterDefs: FilterDef[] = [
    {
      key: "relationship",
      label: p("filters.relationship"),
      options: [
        { value: "", label: p("filters.allRelationships") },
        { value: "parent", label: p("relationship.parent") },
        { value: "guardian", label: p("relationship.guardian") },
      ],
    },
    {
      key: "status",
      label: p("filters.status"),
      options: [
        { value: "", label: p("filters.allStatuses") },
        { value: "active", label: p("status.active") },
        { value: "inactive", label: p("status.inactive") },
      ],
    },
  ];
  const toolbarFilters = child
    ? []
    : filterDefs.map((def) => ({
        def,
        value: filters[def.key] ?? "",
        onChange: (value: string) =>
          setFilters((current) => {
            const next = { ...current };
            if (value) next[def.key] = value;
            else delete next[def.key];
            return next;
          }),
      }));
  const pageSizeControl = {
    def: {
      key: "pageSize",
      label: p("pageSize.label"),
      options: PARENT_PAGE_SIZES.map((size) => ({ value: String(size), label: p("pageSize.option", { count: size }) })),
    },
    value: String(pageSize),
    onChange: (value: string) => {
      const next = PARENT_PAGE_SIZES.find((size) => String(size) === value);
      if (next) setPageSize(next);
    },
  };

  // ---- Columns -------------------------------------------------------------
  const columns: ColumnDef<ParentListItem>[] = [
    { key: "sn", header: p("columns.sn"), render: (_row, index) => (child ? 0 : (page - 1) * (pageData?.limit ?? 0)) + index + 1 },
    {
      key: "name",
      header: p("columns.name"),
      className: "min-w-[200px]",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <ParentAvatar name={row.full_name} />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => setDetailId(row.id)}
              className="text-left font-medium text-text-primary hover:text-accent hover:underline"
            >
              {row.full_name || "—"}
            </button>
            <RelationshipBadge relationship={row.relationship} />
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: p("columns.contact"),
      className: "min-w-[240px]",
      render: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-text-primary [overflow-wrap:anywhere]">{row.email ?? "—"}</span>
          <EmailActiveIndicator email={row.email} emailActive={row.email_active} />
          <span className="text-xs text-text-secondary">{row.phone ?? ""}</span>
        </div>
      ),
    },
    { key: "children", header: p("columns.children"), render: (row) => <ParentChildrenCell parent={row} /> },
    { key: "primary", header: p("columns.primary"), className: "whitespace-nowrap", render: (row) => <PrimaryForCell parent={row} /> },
    { key: "status", header: p("columns.status"), render: (row) => <ParentStatusBadge status={row.status} /> },
    {
      key: "actions",
      header: p("columns.actions"),
      render: (row) => {
        const items: ActionsMenuItem[] = [{ key: "view", label: p("actions.view"), onClick: () => setDetailId(row.id) }];
        if (canManage) {
          items.push({ key: "edit", label: p("actions.edit"), onClick: () => void openEdit(row.id), disabled: openingId === row.id });
          items.push({ key: "delete", label: p("actions.delete"), onClick: () => setDeleteTarget(row), variant: "danger" });
        }
        const menuLabel = p("actions.menuLabel", { name: row.full_name });
        return (
          <ActionsMenu
            menuLabel={menuLabel}
            items={items}
            trigger={({ isOpen, toggle }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-label={menuLabel}
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <MoreVerticalIcon className="h-4 w-4" />
              </button>
            )}
          />
        );
      },
    },
  ];

  const exportColumns: ExportColumn<ParentListItem>[] = [
    { header: p("columns.name"), value: (row) => row.full_name },
    { header: p("fields.relationship"), value: (row) => p(`relationship.${row.relationship}`) },
    { header: p("fields.email"), value: (row) => row.email ?? "" },
    { header: p("columns.mailable"), value: (row) => (row.email_active ? p("emailActive.active") : p("emailActive.inactive")) },
    { header: p("fields.phone"), value: (row) => row.phone ?? "" },
    { header: p("columns.totalKids"), value: (row) => row.total_kids },
    {
      header: p("columns.children"),
      value: (row) =>
        cachedChildren(queryClient, row)
          .map((kid) => (isPrimaryParentOf(row, kid) ? `${kid.full_name} (${p("primary.label")})` : kid.full_name))
          .join(", "),
    },
    { header: p("columns.status"), value: (row) => p(`status.${row.status}`) },
  ];
  const exportConfig: ExportConfig<ParentListItem> = {
    filteredRows: rows,
    allRows: rows,
    columns: exportColumns,
    title: p("header.title"),
    filenamePrefix: "parents",
    schoolName: typeof school?.name === "string" && school.name.trim() ? school.name.trim() : "ZSMS",
  };

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <ParentsHeader />
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">{p("noAccess")}</p>
      </div>
    );
  }

  const childOptions = [
    ...(child ? [{ value: child.id, label: child.full_name }] : []),
    ...childSearch.options
      .filter((option) => option.id !== child?.id)
      .map((option) => ({ value: option.id, label: option.student_no ? `${option.full_name} · ${option.student_no}` : option.full_name })),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ParentsHeader />

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            {child
              ? p("titleForChild", { name: child.full_name, count: rows.length })
              : pageData
                ? p("titleWithCount", { count: pageData.total })
                : p("header.title")}
          </h2>
          <div className="flex min-w-0 items-end gap-2 sm:w-80">
            <div className="min-w-0 flex-1">
              <SearchableSelect
                id="parents-child-filter"
                label={p("filters.child")}
                placeholder={p("filters.childPlaceholder")}
                options={childOptions}
                value={child?.id ?? ""}
                onChange={(id) => {
                  const picked = childSearch.options.find((option) => option.id === id);
                  if (picked) setChild(picked);
                }}
                onQueryChange={childSearch.setTyped}
                loading={childSearch.isFetching && childOptions.length === 0}
                loadingLabel={p("loading")}
                noOptionsLabel={childSearch.failed ? p("link.searchFailed") : childSearch.search ? p("link.noMatches") : p("link.typeToSearch")}
              />
            </div>
            {child ? (
              <button
                type="button"
                onClick={() => setChild(null)}
                className="h-11 shrink-0 rounded-md px-2 text-sm font-semibold text-accent hover:underline"
              >
                {p("filters.clearChild")}
              </button>
            ) : null}
          </div>
        </div>
        {child ? <p className="text-xs text-text-muted">{p("filters.childNote")}</p> : null}

        <DataTable<ParentListItem>
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value);
            if (child) setChild(null);
          }}
          searchPlaceholder={p("searchPlaceholder")}
          filters={child ? [] : [...toolbarFilters, pageSizeControl]}
          onAddNew={canManage ? () => setFormState({ mode: "create" }) : undefined}
          addNewLabel={p("addNew")}
          extraActions={<ExportMenu config={exportConfig} label={p("export")} />}
          isLoading={activeQuery.isPending}
          errorMessage={errorMessage}
          onRetry={() => void activeQuery.refetch()}
          emptyMessage={child ? p("emptyForChild") : debouncedSearch || Object.keys(filters).length ? p("emptyFiltered") : p("empty")}
          page={child ? 1 : page}
          totalPages={totalPages}
          onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
          onNextPage={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      </section>

      {detailId ? (
        <ParentDetail
          parentId={detailId}
          canManage={canManage}
          onClose={() => setDetailId(null)}
          onEdit={(parent) => void openEdit(parent.id)}
          onDelete={(parent) => setDeleteTarget(parent)}
        />
      ) : null}

      {formState ? (
        <ParentFormModal
          parent={formState.mode === "edit" ? formState.parent : undefined}
          onClose={() => setFormState(null)}
          onSaved={(saved) => {
            setFormState(null);
            setDetailId(saved.id);
          }}
          onFindExisting={findExisting}
        />
      ) : null}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={p("confirmDelete.title")}
        message={p("confirmDelete.message", { name: deleteTarget?.full_name ?? "", count: deleteTarget?.total_kids ?? 0 })}
        confirmLabel={p("actions.delete")}
        isDangerous
        isConfirming={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
