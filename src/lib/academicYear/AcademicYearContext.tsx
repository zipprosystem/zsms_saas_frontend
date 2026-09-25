"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { academicYearsService, type AcademicYear } from "@/lib/setup/academicStructure/academicYearsApi";

/**
 * App-wide, like AuthProvider — not Setup-scoped, even though it reuses
 * Setup's academicYearsApi service. Year-scoped screens (Classes,
 * Class-arms, etc.) read selectedYearId from useAcademicYear() to know
 * their :yearId scope.
 *
 * react-query retrofit: this reads the SAME query key
 * (academicYearsService.queryKey) the Academic Years Setup screen itself
 * uses — creating/editing/deleting/activating a year there invalidates
 * that one shared cache entry, so this context (and therefore the header
 * SessionPill and every year-scoped screen) reflects it without a
 * separate refetch of its own. That's new: previously this context had
 * its own independent fetch, so a change made on the Setup screen only
 * showed up here on this context's own next mount.
 *
 * ACTIVE vs SELECTED (important distinction, not the same thing):
 *   - activeYear: the backend's is_active year — the school's one
 *     canonical current year, changed only via the Activate action in the
 *     Academic Years CRUD screen.
 *   - selectedYear: whichever year the user is currently VIEWING via the
 *     header picker. Defaults to activeYear, but switching it never
 *     touches the backend's is_active flag — it only changes what this
 *     tab is looking at.
 *
 * Mounted inside AuthGate in admin/layout.tsx, so by the time this
 * component exists at all, the app is already authenticated — no internal
 * isAuthenticated check needed, it fetches on mount unconditionally.
 */

export type AcademicYearError = "devBypassUnavailable" | "forbidden" | "network" | "server" | null;

type AcademicYearContextValue = {
  years: AcademicYear[];
  selectedYear: AcademicYear | null;
  /** Convenience — identical to selectedYear?.id ?? null, for scoped screens that only need the id. */
  selectedYearId: string | null;
  setSelectedYear: (year: AcademicYear) => void;
  activeYear: AcademicYear | null;
  isLoading: boolean;
  error: AcademicYearError;
  refetch: () => void;
};

const AcademicYearContext = createContext<AcademicYearContextValue | null>(null);

function storageKey(schoolSlug: string): string {
  return `zsms.selectedAcademicYearId.${schoolSlug}`;
}

function readPersistedYearId(schoolSlug: string | null): string | null {
  if (!schoolSlug) return null;
  try {
    return window.localStorage.getItem(storageKey(schoolSlug));
  } catch {
    // Private browsing / storage disabled — degrade to "nothing persisted", never crash.
    return null;
  }
}

function writePersistedYearId(schoolSlug: string | null, yearId: string): void {
  if (!schoolSlug) return;
  try {
    window.localStorage.setItem(storageKey(schoolSlug), yearId);
  } catch {
    // Best-effort only.
  }
}

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const { school } = useAuth();
  const schoolSlug = typeof school?.slug === "string" ? school.slug : null;

  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: academicYearsService.queryKey,
    queryFn: () => academicYearsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });

  // Memoized so its reference only changes when query.data actually does —
  // otherwise the `!ok` branch's fresh `[]` literal every render would
  // make the value useMemo below recompute on every unrelated re-render.
  const years = useMemo(() => (query.data?.ok ? query.data.data : []), [query.data]);
  const isLoading = query.isPending;

  // query.isError is a thrown TransientQueryError with retries exhausted
  // (was "network" or "server" before it threw — that distinction doesn't
  // survive the throw, and nothing in the UI has ever displayed them
  // differently, so this collapses to "server" as a generic label).
  // devBypassUnavailable/forbidden come through as resolved (non-thrown)
  // data, same as academicYearsApi.ts's list() has always returned them.
  const error: AcademicYearError = query.isError
    ? "server"
    : query.data && !query.data.ok
      ? (query.data.kind as AcademicYearError)
      : null;

  const refetch = useCallback(() => {
    query.refetch();
    // query.refetch is stable across renders (react-query's own guarantee)
    // — this wrapper exists only to keep the exposed type a plain () =>
    // void, matching what every existing caller already expects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve which year is selected once the list has loaded (and again on
  // any actual refetch/invalidation, e.g. after activating a year on the
  // Setup screen). Restores the persisted choice ONLY if it still exists
  // in the freshly-fetched list — if that year was soft-deleted (or the
  // list otherwise no longer includes it, e.g. a school switch), it simply
  // won't be found here and this falls back to the active year, same as
  // "never persisted" at all. Keyed on dataUpdatedAt (react-query's own
  // "a fetch actually just landed" timestamp) rather than `years` directly,
  // so this resolves once per real fetch, not on every unrelated re-render.
  useEffect(() => {
    if (!query.data?.ok) return;

    const activeYear = years.find((year) => year.is_active) ?? null;
    const persistedId = readPersistedYearId(schoolSlug);
    const persistedStillExists = persistedId && years.some((year) => year.id === persistedId);

    setSelectedYearId(persistedStillExists ? persistedId : (activeYear?.id ?? years[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.dataUpdatedAt]);

  const setSelectedYear = useCallback(
    (year: AcademicYear) => {
      setSelectedYearId(year.id);
      writePersistedYearId(schoolSlug, year.id);
    },
    [schoolSlug],
  );

  const selectedYear = years.find((year) => year.id === selectedYearId) ?? null;
  const activeYear = years.find((year) => year.is_active) ?? null;

  const value = useMemo<AcademicYearContextValue>(
    () => ({
      years,
      selectedYear,
      selectedYearId: selectedYear?.id ?? null,
      setSelectedYear,
      activeYear,
      isLoading,
      error,
      refetch,
    }),
    [years, selectedYear, setSelectedYear, activeYear, isLoading, error, refetch],
  );

  return <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>;
}

export function useAcademicYear(): AcademicYearContextValue {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) throw new Error("useAcademicYear must be used within an AcademicYearProvider");
  return ctx;
}
