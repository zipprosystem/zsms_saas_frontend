import { useCallback, useEffect, useState } from "react";
import type { CrudService } from "./crudTypes";

const PAGE_SIZE = 10;

export type TableLoadState<T> =
  | { status: "loading" }
  | { status: "loaded"; items: T[] }
  | { status: "forbidden" }
  | { status: "devBypassUnavailable" }
  | { status: "error" };

type UseCrudTableOptions<T> = {
  matchesSearch?: (row: T, query: string) => boolean;
  matchesFilters?: (row: T, filters: Record<string, string>) => boolean;
};

/**
 * Owns list/search/filter/paginate state for a CRUD screen. Deliberately
 * does NOT own create/update/delete — CrudScreen calls the service
 * directly for those and calls refetch() on success. That's simpler than
 * this hook trying to patch mutation results into local state: activate,
 * for instance, changes MULTIPLE rows server-side (the previously-active
 * one flips off), which a single mutation response can't fully reflect.
 *
 * Client-side pagination: the confirmed Academic Years contract has no
 * page/pageSize/search query params, so list() fetches everything once and
 * this hook paginates/searches/filters in memory. matchesSearch/
 * matchesFilters are supplied per-screen since what "search" or a given
 * filter key means is entity-specific.
 */
export function useCrudTable<T, CreateInput, UpdateInput>(
  service: CrudService<T, CreateInput, UpdateInput>,
  { matchesSearch, matchesFilters }: UseCrudTableOptions<T>,
) {
  const [load, setLoad] = useState<TableLoadState<T>>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const refetch = useCallback(() => {
    setLoad({ status: "loading" });
    service.list().then((result) => {
      if (result.ok) {
        setLoad({ status: "loaded", items: result.data });
        return;
      }
      if (result.kind === "forbidden") {
        setLoad({ status: "forbidden" });
        return;
      }
      if (result.kind === "devBypassUnavailable") {
        setLoad({ status: "devBypassUnavailable" });
        return;
      }
      // "validation"/"conflict" can't happen on a list call; network/server
      // both fall back to the same retry-able error state.
      setLoad({ status: "error" });
    });
  }, [service]);

  useEffect(() => {
    refetch();
    // Only meant to run on mount (and when the service instance itself
    // changes, which it never does for a given screen) — refetch is called
    // explicitly after mutations instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 1 whenever the visible set could shrink out from under
  // the current page.
  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  const allItems = load.status === "loaded" ? load.items : [];
  const filteredItems = allItems
    .filter((row) => !search.trim() || (matchesSearch?.(row, search.trim()) ?? true))
    .filter(
      (row) =>
        Object.keys(filters).length === 0 || (matchesFilters?.(row, filters) ?? true),
    );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return {
    load,
    items: pageItems,
    totalItems: filteredItems.length,
    page: currentPage,
    totalPages,
    setPage,
    search,
    setSearch,
    filters,
    setFilters,
    refetch,
  };
}
