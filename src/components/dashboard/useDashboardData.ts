"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import {
  attendanceTodayQueryKey,
  enrollmentTrendQueryKey,
  getAttendanceToday,
  getEnrollmentTrend,
  getRecentActivity,
  recentActivityQueryKey,
  todayIso,
} from "@/lib/dashboard/dashboardApi";
import type { AttendanceAudience } from "@/lib/dashboard/dashboardTypes";
import { kpiQueries, type KpiKey, type KpiState } from "@/lib/dashboard/kpiCounts";
import { throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";

/** Dashboard numbers move during the day — refresh on focus, keep for a minute. */
const DASHBOARD_STALE_MS = 60_000;

/** Unwraps a CrudResult for react-query: data on success, a thrown error (→ the card's retry state) otherwise. */
async function unwrap<T>(promise: Promise<CrudResult<T>>): Promise<T> {
  const result = throwIfTransient(await promise);
  if (!result.ok) throw new Error(result.kind);
  return result.data;
}

export type KpiTileQuery = { state: KpiState | undefined; isPending: boolean; isError: boolean; refetch: () => void };

/**
 * The six KPI tiles, each its own query (one tile failing or forbidden
 * never blanks the others). Real module APIs — see kpiCounts.ts.
 */
export function useKpiCounts(): Record<KpiKey, KpiTileQuery> {
  const { selectedYearId, isLoading: isYearLoading } = useAcademicYear();
  const defs = kpiQueries(selectedYearId, !isYearLoading);
  const results = useQueries({
    queries: defs.map((def) => ({
      queryKey: def.queryKey,
      queryFn: def.queryFn,
      select: def.select,
      enabled: def.enabled,
      staleTime: DASHBOARD_STALE_MS,
    })),
  });
  return Object.fromEntries(
    defs.map((def, i) => {
      const r = results[i];
      return [def.key, { state: r.data, isPending: r.isPending, isError: r.isError, refetch: () => void r.refetch() }];
    }),
  ) as Record<KpiKey, KpiTileQuery>;
}

export function useAttendanceToday(audience: AttendanceAudience) {
  const date = todayIso();
  return useQuery({
    queryKey: attendanceTodayQueryKey(audience, date),
    queryFn: () => unwrap(getAttendanceToday(audience, date)),
    staleTime: DASHBOARD_STALE_MS,
  });
}

export function useEnrollmentTrend() {
  const { selectedYearId } = useAcademicYear();
  return useQuery({
    queryKey: enrollmentTrendQueryKey(selectedYearId),
    queryFn: () => unwrap(getEnrollmentTrend(selectedYearId)),
    staleTime: DASHBOARD_STALE_MS,
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: recentActivityQueryKey,
    queryFn: () => unwrap(getRecentActivity()),
    staleTime: DASHBOARD_STALE_MS,
  });
}
