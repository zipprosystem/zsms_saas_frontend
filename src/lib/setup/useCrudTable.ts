import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type CrudService } from "./crudTypes";

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
 * directly for those and invalidates service.queryKey on success, which
 * is what makes THIS hook's query refetch (react-query, not a manual
 * refetch() call, though `refetch` is still exposed below for the
 * DataTable/CardGrid "retry" button and behaves the same either way).
 *
 * Client-side pagination: every current service's list() fetches
 * everything in one call (no real page/limit contract to page against),
 * so this hook still paginates/searches/filters in memory over whatever
 * the query returns. matchesSearch/matchesFilters are supplied per-screen
 * since what "search" or a given filter key means is entity-specific.
 *
 * react-query retrofit: `service.queryKey` is the cache key (a fixed
 * constant for a singleton service, or including e.g. a year id for a
 * factory-built one — see crudTypes.ts's CrudService). The queryFn runs
 * the result through throwIfTransient so only genuinely transient
 * failures (network/server) get react-query's retry+backoff; every other
 * failure kind resolves normally and is mapped below into the exact same
 * TableLoadState shape this hook has always returned — DataTable/CardGrid/
 * CrudScreen and every screen consuming this hook are unchanged by this.
 */
export function useCrudTable<T, CreateInput, UpdateInput>(
  service: CrudService<T, CreateInput, UpdateInput>,
  { matchesSearch, matchesFilters }: UseCrudTableOptions<T>,
) {
  const query = useQuery({
    queryKey: service.queryKey,
    queryFn: () => service.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const load: TableLoadState<T> = query.isPending
    ? { status: "loading" }
    : query.isError
      ? { status: "error" } // TransientQueryError, retries already exhausted
      : query.data.ok
        ? { status: "loaded", items: query.data.data }
        : query.data.kind === "forbidden"
          ? { status: "forbidden" }
          : query.data.kind === "devBypassUnavailable"
            ? { status: "devBypassUnavailable" }
            : { status: "error" };

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
    refetch: query.refetch,
  };
}
