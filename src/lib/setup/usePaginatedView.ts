import { useEffect, useState } from "react";

const PAGE_SIZE = 10;

type UsePaginatedViewOptions<T> = {
  matchesSearch?: (row: T, query: string) => boolean;
  matchesFilters?: (row: T, filters: Record<string, string>) => boolean;
};

/**
 * The client-side search/filter/paginate logic every Setup list screen
 * needs, extracted out of useCrudTable so a screen whose READ side can't
 * go through the generic CrudService/useCrudTable pattern (Class-arms —
 * see sectionsApi.ts/ClassArmsScreen.tsx, whose merged multi-class list
 * comes from useQueries, not a single service.list()) can still reuse this
 * part rather than duplicating it. Takes an already-resolved array, not a
 * service — everything upstream of "here are the items" is the caller's
 * concern.
 */
export function usePaginatedView<T>(items: T[], { matchesSearch, matchesFilters }: UsePaginatedViewOptions<T>) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever the visible set could shrink out from under
  // the current page.
  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  const filteredItems = items
    .filter((row) => !search.trim() || (matchesSearch?.(row, search.trim()) ?? true))
    .filter((row) => Object.keys(filters).length === 0 || (matchesFilters?.(row, filters) ?? true));

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return {
    items: pageItems,
    totalItems: filteredItems.length,
    page: currentPage,
    totalPages,
    setPage,
    search,
    setSearch,
    filters,
    setFilters,
  };
}
