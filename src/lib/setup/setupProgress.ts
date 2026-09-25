import { useQueries, useQuery } from "@tanstack/react-query";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { PROGRESS_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { academicYearsService } from "@/lib/setup/academicStructure/academicYearsApi";
import { awardBodiesService } from "@/lib/setup/academicStructure/awardBodiesApi";
import { schoolTypesService } from "@/lib/setup/academicStructure/schoolTypesApi";
import { createClassesService } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey } from "@/lib/setup/academicStructure/sectionsApi";
import type { SetupItem } from "@/lib/setup/setupConfig";

/**
 * Product-owner rule: a setup item counts as configured once at least ONE
 * record exists in its list — we can't know how many classes/terms/etc. a
 * school actually needs, so one saved record is the signal. This only
 * applies to these BUILT, list-based CRUD screens; items with no live
 * check (School Settings' already-real single-instance screens, and
 * not-yet-built stubs) keep using their own static `item.done` — see
 * isSetupItemComplete().
 *
 * react-query retrofit: every check below reuses the EXACT query key its
 * own real Setup screen uses (academicYearsService.queryKey, etc.), via
 * `select` to derive just a boolean from the same cached list — there's no
 * separate "progress" cache. That means visiting Academic Years' screen
 * and this checklist share one fetch, and creating a record on the screen
 * (which invalidates that key) flips the checklist's checkmark without a
 * separate refetch of its own. `select` runs per-observer, not on the
 * shared cache entry itself, so the screen's own (unselected) query and
 * this boolean-selecting one coexist against the same underlying data
 * without conflict — and PROGRESS_STALE_TIME_MS here can be shorter than
 * the screen's own STRUCTURAL_STALE_TIME_MS, since this is the one place a
 * user actively watches for a just-made change to reflect.
 *
 * The old Record<string, ExistenceChecker> registry doesn't fit a
 * hook-based model (hooks can't be called dynamically in a loop over a
 * Record) — this set is now just the "which items have a live check"
 * lookup isSetupItemComplete() needs; the actual fetching is explicit
 * per-entity hook calls below.
 */
const ITEMS_WITH_LIVE_CHECK = new Set(["academicYears", "awardBodies", "schoolTypes", "classes", "classArms"]);

export type SetupProgressState =
  | { status: "loading" }
  | { status: "loaded"; completedKeys: Set<string> };

export function useSetupProgress(): SetupProgressState {
  const { selectedYearId: yearId } = useAcademicYear();

  const academicYearsQuery = useQuery({
    queryKey: academicYearsService.queryKey,
    queryFn: () => academicYearsService.list().then(throwIfTransient),
    select: (result) => result.ok && result.data.length > 0,
    staleTime: PROGRESS_STALE_TIME_MS,
  });

  const awardBodiesQuery = useQuery({
    queryKey: awardBodiesService.queryKey,
    queryFn: () => awardBodiesService.list().then(throwIfTransient),
    select: (result) => result.ok && result.data.length > 0,
    staleTime: PROGRESS_STALE_TIME_MS,
  });

  const schoolTypesQuery = useQuery({
    queryKey: schoolTypesService.queryKey,
    queryFn: () => schoolTypesService.list().then(throwIfTransient),
    select: (result) => result.ok && result.data.length > 0,
    staleTime: PROGRESS_STALE_TIME_MS,
  });

  // Raw (unselected) — classArms below needs the actual class list to know
  // which classes to check sections for, not just a boolean, so this one
  // stays a plain CrudResult and gets its own boolean derived separately.
  const classesService = yearId ? createClassesService(yearId) : null;
  const classesQuery = useQuery({
    queryKey: classesService?.queryKey ?? ["setup", "classes", "none"],
    queryFn: () => classesService!.list().then(throwIfTransient),
    enabled: !!classesService,
    staleTime: PROGRESS_STALE_TIME_MS,
  });
  const classesExist = !!yearId && !!classesQuery.data?.ok && classesQuery.data.data.length > 0;

  // Sections have no "all sections for a school" endpoint (see
  // sectionsApi.ts) — a dependent query set: which classes to check isn't
  // known until classesQuery itself resolves. Same active-classes-only
  // scoping Class-arms' own screen uses (see its backend-limitation note).
  const activeClassIds =
    yearId && classesQuery.data?.ok ? classesQuery.data.data.filter((cls) => cls.is_active).map((cls) => cls.id) : [];
  const sectionQueries = useQueries({
    queries: activeClassIds.map((classId) => ({
      queryKey: sectionsQueryKey(classId),
      queryFn: () => fetchSectionsForClass(classId).then(throwIfTransient),
      select: (result: Awaited<ReturnType<typeof fetchSectionsForClass>>) => result.ok && result.data.length > 0,
      staleTime: PROGRESS_STALE_TIME_MS,
    })),
  });
  // Lenient by design (any one class having a section is enough), distinct
  // from the Class-arms screen's own stricter "any failed class fails the
  // whole merge" — that rule exists there because a partial list would
  // misrepresent the screen's contents; here we only need one true.
  const classArmsExist = !!yearId && sectionQueries.some((query) => query.data === true);

  const sectionsStillLoading = activeClassIds.length > 0 && sectionQueries.some((query) => query.isPending);
  const isLoading =
    academicYearsQuery.isPending ||
    awardBodiesQuery.isPending ||
    schoolTypesQuery.isPending ||
    (!!yearId && (classesQuery.isPending || sectionsStillLoading));

  if (isLoading) return { status: "loading" };

  const completedKeys = new Set<string>();
  if (academicYearsQuery.data) completedKeys.add("academicYears");
  if (awardBodiesQuery.data) completedKeys.add("awardBodies");
  if (schoolTypesQuery.data) completedKeys.add("schoolTypes");
  if (classesExist) completedKeys.add("classes");
  if (classArmsExist) completedKeys.add("classArms");

  return { status: "loaded", completedKeys };
}

/**
 * The single source of truth for "is this setup item done" — used by both
 * the overall progress bar and each category's item rows, so they can
 * never disagree. Checker-covered items report not-complete while still
 * loading (never true, never a guess) rather than flashing a wrong state.
 */
export function isSetupItemComplete(item: SetupItem, progress: SetupProgressState): boolean {
  if (!ITEMS_WITH_LIVE_CHECK.has(item.key)) return item.done;
  return progress.status === "loaded" && progress.completedKeys.has(item.key);
}
