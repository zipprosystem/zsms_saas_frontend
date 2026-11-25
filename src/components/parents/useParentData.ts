"use client";

import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { canSeeNavEntry, readUserPermissions, type NavPermission } from "@/lib/auth/navPermissions";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import {
  getParent,
  getParentChild,
  parentChildQueryKey,
  parentRecordQueryKey,
  searchStudentOptions,
  studentOptionsQueryKey,
} from "@/lib/parents/parentsApi";
import type { Parent, ParentChild, StudentOption } from "@/lib/parents/parentTypes";

/** Sub-menu permission check (group credential); shown when the user carries no permission list yet. */
export function useCanSee(permission: NavPermission): boolean {
  const { user } = useAuth();
  return canSeeNavEntry(permission, readUserPermissions(user));
}

/** One parent's full record (detail, the list's children cell, edit). */
export function useParentRecord(id: string | null, enabled = true) {
  return useQuery({
    queryKey: parentRecordQueryKey(id ?? ""),
    queryFn: () => getParent(id ?? "").then(throwIfTransient),
    enabled: enabled && !!id,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
}

export type ChildLookup = { id: string; child: ParentChild | null; isLoading: boolean; failed: boolean };

/**
 * The linked students, resolved one by one from Student Core and cached
 * per student — so the same child shown under two parents (siblings'
 * mother + father) is fetched once. A lookup that fails degrades to the
 * bare id; the rest of the page keeps working.
 */
export function useParentChildren(studentIds: string[]): ChildLookup[] {
  const results = useQueries({
    queries: studentIds.map((id) => ({
      queryKey: parentChildQueryKey(id),
      queryFn: () => getParentChild(id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });
  return studentIds.map((id, index) => {
    const result = results[index];
    const data = result?.data as CrudResult<ParentChild> | undefined;
    return {
      id,
      child: data?.ok ? data.data : null,
      isLoading: !!result?.isPending,
      failed: !!result?.isError || (!!data && !data.ok),
    };
  });
}

const SEARCH_DEBOUNCE_MS = 300;

/** Debounced server-side student search for the link picker / child filter. */
export function useStudentOptions(enabled = true) {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const handle = setTimeout(() => setSearch(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [typed]);
  const query = useQuery({
    queryKey: studentOptionsQueryKey(search),
    queryFn: () => searchStudentOptions(search).then(throwIfTransient),
    enabled: enabled && search.length > 0,
    staleTime: 60_000,
  });
  const options: StudentOption[] = query.data?.ok ? query.data.data : [];
  return { options, setTyped, search, isFetching: query.isFetching, failed: query.isError || (!!query.data && !query.data.ok) };
}

export type { Parent };
