"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formDataToStudentBody } from "@/lib/students/studentFormMapping";
import { createStudentDraft, saveStudentDraft } from "@/lib/students/studentsApi";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type { Student } from "@/lib/students/studentTypes";
import type { StudentFormData } from "@/components/students/wizard/studentFormTypes";
import type { WizardStep } from "@/components/students/wizard/WizardStepper";

export type AutoSaveState = "idle" | "saving" | "saved" | "retrying" | "failed";

/** Quiet period after the last field change before an auto-save fires. */
const DEBOUNCE_MS = 2000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

/**
 * Auto-save only starts once these are filled in AND a year is known, so
 * no empty draft rows are ever created. FLAGGED: the contract doesn't list
 * what POST /students/drafts requires. First + last name is the smallest
 * set that makes a draft identifiable in the list. Confirm with Muntajir.
 * A 422 here pauses auto-save until the next change (never a retry loop).
 */
function isEligible(data: StudentFormData, academicYearId: string | null): academicYearId is string {
  return !!academicYearId && !!data.studentDetails.first_name.trim() && !!data.studentDetails.last_name.trim();
}

/** Network errors and 5xx are worth retrying; a 4xx (bad data) and dev bypass are not. */
function isRetryable(result: Exclude<CrudResult<unknown>, { ok: true }>): boolean {
  if (result.kind === "network") return true;
  return result.kind === "server" && (result.status === undefined || result.status >= 500);
}

function snapshotOf(data: StudentFormData, step: WizardStep, academicYearId: string | null): string {
  return JSON.stringify({ body: formDataToStudentBody(data, academicYearId ?? ""), step });
}

/**
 * Draft auto-save for the Add Student wizard (create mode: a new admission
 * or a resumed draft — never an active student's edit).
 *
 *   - Debounced DEBOUNCE_MS after the last field change; immediate on
 *     step navigation (step effect) and on close (saveNow). Skipped when nothing
 *     changed since the last successful save (snapshot of body + step).
 *   - The first save POSTs /drafts and creates the row; every later one
 *     PUTs /:id/draft.
 *   - EVERY save (auto, manual Save Draft) runs through one queue, so two
 *     saves never overlap. That matters most for the first save: a second
 *     POST while the first is in flight would create a duplicate draft.
 *     The final submit awaits whenIdle() first for the same reason.
 *   - Retryable failures retry with backoff (state "retrying") until one
 *     succeeds or the user changes something; a 4xx shows "failed" and
 *     waits for the next change.
 */
export function useDraftAutoSave({
  enabled,
  data,
  step,
  academicYearId,
  initialStudentId,
  initialStep,
}: {
  enabled: boolean;
  data: StudentFormData;
  step: WizardStep;
  academicYearId: string | null;
  initialStudentId: string | null;
  initialStep: WizardStep;
}) {
  const [state, setState] = useState<AutoSaveState>("idle");
  const [studentId, setStudentIdState] = useState<string | null>(initialStudentId);

  // Refs so queued saves always read the LATEST form/step, not the values
  // captured when they were queued.
  const dataRef = useRef(data);
  const stepRef = useRef(step);
  const yearRef = useRef(academicYearId);
  dataRef.current = data;
  stepRef.current = step;
  yearRef.current = academicYearId;

  const studentIdRef = useRef<string | null>(initialStudentId);
  // Starts at the opening state, so opening a resumed draft (or a blank
  // form) never saves by itself.
  const lastSavedRef = useRef<string>(snapshotOf(data, initialStep, academicYearId));
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const stoppedRef = useRef(false);
  const anySavedRef = useRef(false);

  const clearRetry = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  };

  const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined);
    return run;
  };

  /**
   * One save. `force` (manual Save Draft) saves even when unchanged and
   * ignores the eligibility gate (the backend then decides). `final` is
   * the close-time flush, which runs even though auto-save has just been
   * stopped. Resolves null when skipped.
   */
  const persist = useCallback(
    ({ force = false, final = false }: { force?: boolean; final?: boolean } = {}): Promise<CrudResult<Student> | null> =>
      enqueue(async () => {
        const yearId = yearRef.current;
        const current = dataRef.current;
        if (!yearId) return null;
        if (!force && ((stoppedRef.current && !final) || !isEligible(current, yearId))) return null;
        const snapshot = snapshotOf(current, stepRef.current, yearId);
        if (!force && snapshot === lastSavedRef.current) return null;

        clearRetry();
        setState("saving");
        const body = formDataToStudentBody(current, yearId);
        const id = studentIdRef.current;
        const result = id
          ? await saveStudentDraft(id, body, stepRef.current)
          : await createStudentDraft(body, stepRef.current);

        if (result.ok) {
          studentIdRef.current = result.data.id;
          setStudentIdState(result.data.id);
          lastSavedRef.current = snapshot;
          retryCountRef.current = 0;
          anySavedRef.current = true;
          setState("saved");
          return result;
        }
        if (!force && !final && isRetryable(result) && !stoppedRef.current) {
          setState("retrying");
          const delay = Math.min(RETRY_BASE_MS * 2 ** retryCountRef.current, RETRY_MAX_MS);
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(() => void persist(), delay);
        } else {
          setState("failed");
        }
        return result;
      }),
    // enqueue/clearRetry only touch refs; persist is stable for the hook's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Debounced save after field changes. Any change also restarts a
  // pending retry's clock (the next save carries the newer data anyway).
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      retryCountRef.current = 0;
      void persist();
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, data, persist]);

  // Immediate save on step navigation (Next/Back/stepper). Runs after the
  // render that committed the new step, so stepRef already holds it and
  // the save records it as current_step. Skipped on mount (unchanged).
  useEffect(() => {
    if (enabled) void persist();
  }, [enabled, step, persist]);

  useEffect(() => clearRetry, []);

  return {
    state,
    /** The draft's id once one exists (initial: the resumed draft's). */
    studentId,
    getStudentId: () => studentIdRef.current,
    /** Manual Save Draft: always sends, through the same queue. */
    saveDraftManually: () => persist({ force: true }),
    /** Waits for any in-flight/queued save to settle (final submit calls this first). */
    whenIdle: () => queueRef.current.then(() => undefined),
    /** Whether any save in this wizard session succeeded (the list needs a refetch on close). */
    hasSaved: () => anySavedRef.current,
    /**
     * Wizard close: stops auto-saving and flushes unsaved changes once
     * (skipped if ineligible or unchanged). Resolves when every queued
     * save has settled.
     */
    closeAndFlush: async (): Promise<void> => {
      stoppedRef.current = true;
      clearRetry();
      if (enabled) await persist({ final: true });
      await queueRef.current;
    },
    /** Stops auto-saving for good (after a successful submit). */
    stop: () => {
      stoppedRef.current = true;
      clearRetry();
    },
    /** Pauses retries while a final submit is in progress. */
    pauseRetries: clearRetry,
  };
}
