import { useEffect, useState } from "react";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { academicYearsService } from "@/lib/setup/academicStructure/academicYearsApi";
import { awardBodiesService } from "@/lib/setup/academicStructure/awardBodiesApi";
import { schoolTypesService } from "@/lib/setup/academicStructure/schoolTypesApi";
import { createClassesService } from "@/lib/setup/academicStructure/classesApi";
import { createSectionsService } from "@/lib/setup/academicStructure/sectionsApi";
import type { SetupItem } from "@/lib/setup/setupConfig";

/**
 * Product-owner rule: a setup item counts as configured once at least ONE
 * record exists in its list — we can't know how many classes/terms/etc. a
 * school actually needs, so one saved record is the signal. This only
 * applies to BUILT, list-based CRUD screens (registered below); items with
 * no checker (School Settings' already-real single-instance screens, and
 * not-yet-built stubs) keep using their own static `item.done` — see
 * isSetupItemComplete().
 *
 * Each checker reuses the entity's own real service — no new endpoints,
 * no separate "count" API. That's a slightly heavier call than a true
 * limit=1 would be (list() fetches up to 200), but it's the same
 * fetch-once-and-check pattern already used throughout Setup, and reusing
 * the existing, already-correct service (auth, error handling, dev-bypass
 * guard) beats adding a parallel lightweight variant of each one for a
 * check that only needs to run once per checklist page load.
 */
export type ExistenceCheckContext = { yearId: string | null };
export type ExistenceChecker = (context: ExistenceCheckContext) => Promise<boolean>;

export const setupExistenceCheckers: Record<string, ExistenceChecker> = {
  academicYears: async () => {
    const result = await academicYearsService.list();
    return result.ok && result.data.length > 0;
  },
  awardBodies: async () => {
    const result = await awardBodiesService.list();
    return result.ok && result.data.length > 0;
  },
  schoolTypes: async () => {
    const result = await schoolTypesService.list();
    return result.ok && result.data.length > 0;
  },
  classes: async ({ yearId }) => {
    if (!yearId) return false;
    const result = await createClassesService(yearId).list();
    return result.ok && result.data.length > 0;
  },
  // Sections have no "all sections for a school" endpoint (see
  // sectionsApi.ts) — reuses that same factory's list() across every
  // active class for the year, exactly like the Class-arms screen itself
  // does per school type, just with a fresh, throwaway cache (this check
  // runs once on the checklist page, not repeatedly).
  classArms: async ({ yearId }) => {
    if (!yearId) return false;
    const classesResult = await createClassesService(yearId).list();
    if (!classesResult.ok) return false;
    const activeClassIds = classesResult.data.filter((cls) => cls.is_active).map((cls) => cls.id);
    if (activeClassIds.length === 0) return false;
    const sectionsResult = await createSectionsService({ classIds: activeClassIds, cache: new Map() }).list();
    return sectionsResult.ok && sectionsResult.data.length > 0;
  },
};

export type SetupProgressState =
  | { status: "loading" }
  | { status: "loaded"; completedKeys: Set<string> };

/**
 * Fires every registered checker in parallel, once, on mount and again
 * whenever the selected academic year changes (year-scoped checkers —
 * Classes, Class-arms — depend on it). A single failure (rejected promise
 * or a CrudResult that isn't ok) is caught and treated as "doesn't exist",
 * never as a crash — this is a progress indicator, not a hard gate.
 *
 * This is exactly the shape a react-query retrofit will manage instead
 * (parallel queries keyed by [checkerKey, yearId], cached across
 * navigations) — the checker registry above is already the right unit to
 * hand to it; only this hook's body would change.
 */
export function useSetupProgress(): SetupProgressState {
  const { selectedYearId } = useAcademicYear();
  const [state, setState] = useState<SetupProgressState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    Promise.all(
      Object.entries(setupExistenceCheckers).map(async ([key, checker]) => {
        try {
          return [key, await checker({ yearId: selectedYearId })] as const;
        } catch {
          return [key, false] as const;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setState({
        status: "loaded",
        completedKeys: new Set(results.filter(([, exists]) => exists).map(([key]) => key)),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedYearId]);

  return state;
}

/**
 * The single source of truth for "is this setup item done" — used by both
 * the overall progress bar and each category's item rows, so they can
 * never disagree. Checker-covered items report not-complete while still
 * loading (never true, never a guess) rather than flashing a wrong state.
 */
export function isSetupItemComplete(item: SetupItem, progress: SetupProgressState): boolean {
  const checker = setupExistenceCheckers[item.key];
  if (!checker) return item.done;
  return progress.status === "loaded" && progress.completedKeys.has(item.key);
}
