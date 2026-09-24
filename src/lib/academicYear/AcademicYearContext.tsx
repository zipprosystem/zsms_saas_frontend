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
import { useAuth } from "@/lib/auth/AuthProvider";
import { DEV_AUTH_BYPASS } from "@/lib/auth/authBridge";
import { academicYearsService, type AcademicYear } from "@/lib/setup/academicStructure/academicYearsApi";

/**
 * App-wide, like AuthProvider — not Setup-scoped, even though it reuses
 * Setup's academicYearsApi service. Year-scoped screens (Classes, Subjects,
 * etc.) will read selectedYearId from useAcademicYear() to know their
 * :yearId scope; this increment only builds the context + header picker.
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

type LoadStatus = "loading" | "loaded" | "error";

export function AcademicYearProvider({ children }: { children: ReactNode }) {
  const { school } = useAuth();
  const schoolSlug = typeof school?.slug === "string" ? school.slug : null;

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [error, setError] = useState<AcademicYearError>(null);

  const refetch = useCallback(() => {
    if (DEV_AUTH_BYPASS) {
      // The real API can't work with the mock token — graceful empty
      // state, not an error banner. Same guard academicYearsApi.ts already
      // applies internally; short-circuiting here too avoids even
      // attempting the call.
      setYears([]);
      setLoadStatus("error");
      setError("devBypassUnavailable");
      return;
    }

    setLoadStatus("loading");
    setError(null);
    academicYearsService.list().then((result) => {
      if (result.ok) {
        setYears(result.data);
        setLoadStatus("loaded");
        return;
      }
      setLoadStatus("error");
      setError(
        result.kind === "forbidden" || result.kind === "devBypassUnavailable"
          ? result.kind
          : result.kind === "network"
            ? "network"
            : "server",
      );
    });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Resolve which year is selected once the list has loaded. Restores the
  // persisted choice ONLY if it still exists in the freshly-fetched list —
  // if that year was soft-deleted (or the list otherwise no longer
  // includes it, e.g. a school switch), it simply won't be found here and
  // this falls back to the active year, same as "never persisted" at all.
  useEffect(() => {
    if (loadStatus !== "loaded") return;

    const activeYear = years.find((year) => year.is_active) ?? null;
    const persistedId = readPersistedYearId(schoolSlug);
    const persistedStillExists = persistedId && years.some((year) => year.id === persistedId);

    setSelectedYearId(persistedStillExists ? persistedId : (activeYear?.id ?? years[0]?.id ?? null));
    // Deliberately keyed off loadStatus flipping to "loaded" (a fresh
    // fetch), not `years`/`schoolSlug` individually — this should resolve
    // once per successful fetch, not re-run and clobber an in-session
    // switch every time some unrelated render recomputes `years`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStatus]);

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
      isLoading: loadStatus === "loading",
      error,
      refetch,
    }),
    [years, selectedYear, setSelectedYear, activeYear, loadStatus, error, refetch],
  );

  return <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>;
}

export function useAcademicYear(): AcademicYearContextValue {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) throw new Error("useAcademicYear must be used within an AcademicYearProvider");
  return ctx;
}
