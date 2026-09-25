import { useQuery } from "@tanstack/react-query";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type CrudService } from "./crudTypes";
import { usePaginatedView } from "./usePaginatedView";

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
 * The search/filter/paginate part (everything past "here are the loaded
 * items") lives in usePaginatedView — factored out so Class-arms, whose
 * merged multi-class list can't go through a single service.list() (see
 * sectionsApi.ts), can reuse it directly instead of duplicating it.
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

  const allItems = load.status === "loaded" ? load.items : [];
  const view = usePaginatedView(allItems, { matchesSearch, matchesFilters });

  return {
    load,
    ...view,
    refetch: query.refetch,
  };
}
