"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import { departmentsService, type Department } from "@/lib/setup/academicStructure/departmentsApi";
import { subjectsMasterService, type SubjectMaster } from "@/lib/setup/academicStructure/subjectsMasterApi";
import { staffPostsService } from "@/lib/hr/staffPostsApi";
import { permissionGroupsService } from "@/lib/hr/permissionGroupsApi";
import type { PermissionGroup, StaffPost } from "@/lib/hr/hrTypes";

/**
 * Everything the Staff list and the Add/Edit wizard resolve names / pick
 * options from. Everything is the REAL API (HR masters included since the
 * 2026-10-23 flip) — empty under dev-bypass (`academicUnavailable` says so, so the
 * wizard can show "not available locally" instead of a bare empty list).
 * Same query keys as the Setup screens, so caches are shared. The subject
 * PICKER uses the server-side search (SubjectSearchSelect); `subjects`
 * here only resolves names for saved assignments.
 */
export function useHrReferenceData(yearId: string | null) {
  const postsQuery = useQuery({
    queryKey: staffPostsService.queryKey,
    queryFn: () => staffPostsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const groupsQuery = useQuery({
    queryKey: permissionGroupsService.queryKey,
    queryFn: () => permissionGroupsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const departmentsQuery = useQuery({
    queryKey: departmentsService.queryKey,
    queryFn: () => departmentsService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const subjectsQuery = useQuery({
    queryKey: subjectsMasterService.queryKey,
    queryFn: () => subjectsMasterService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });

  const classesService = yearId ? createClassesService(yearId) : null;
  const classesQuery = useQuery({
    queryKey: classesService?.queryKey ?? ["setup", "classes", "none"],
    queryFn: () => classesService!.list().then(throwIfTransient),
    enabled: !!classesService,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes: SchoolClass[] = classesQuery.data?.ok ? classesQuery.data.data : [];

  const sectionQueries = useQueries({
    queries: classes.map((cls) => ({
      queryKey: sectionsQueryKey(cls.id),
      queryFn: () => fetchSectionsForClass(cls.id).then(throwIfTransient),
      staleTime: STRUCTURAL_STALE_TIME_MS,
    })),
  });

  const posts: StaffPost[] = postsQuery.data?.ok ? postsQuery.data.data : [];
  const groups: PermissionGroup[] = groupsQuery.data?.ok ? groupsQuery.data.data : [];
  const departments: Department[] = departmentsQuery.data?.ok ? departmentsQuery.data.data : [];
  const subjects: SubjectMaster[] = subjectsQuery.data?.ok ? subjectsQuery.data.data : [];
  const sections: Section[] = sectionQueries.flatMap((query) => (query.data?.ok ? query.data.data : []));

  return {
    posts,
    groups,
    departments,
    subjects,
    classes,
    sections,
    isLoadingPosts: postsQuery.isPending,
    isLoadingGroups: groupsQuery.isPending,
    academicUnavailable: isDevBypassUnavailable(departmentsQuery.data) || isDevBypassUnavailable(subjectsQuery.data),
    departmentName: (id: string) => departments.find((department) => department.id === id)?.name ?? "—",
    subjectName: (id: string) => subjects.find((subject) => subject.id === id)?.name ?? "—",
    postName: (id: string | null) => (id ? (posts.find((post) => post.id === id)?.name ?? "—") : "—"),
    className: (id: string) => classes.find((cls) => cls.id === id)?.name ?? "—",
    armName: (id: string) => sections.find((section) => section.id === id)?.name ?? "—",
    classIndex: (id: string) => classes.findIndex((cls) => cls.id === id),
  };
}

export type HrReferenceData = ReturnType<typeof useHrReferenceData>;
