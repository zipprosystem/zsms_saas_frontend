"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/icons/CheckIcon";

export const WIZARD_STEP_NUMBERS = [1, 2, 3] as const;
export type WizardStep = (typeof WIZARD_STEP_NUMBERS)[number];

/** Clamps a stored draft_last_step (number | null, no upper bound guaranteed) into a valid WizardStep — used when Resume reopens a draft. */
export function clampToWizardStep(step: number | null | undefined): WizardStep {
  const n = step ?? 1;
  return Math.min(Math.max(Math.round(n), 1), WIZARD_STEP_NUMBERS.length) as WizardStep;
}

/**
 * 3 steps, each a regroup of the original 7 (field logic unchanged, just
 * which step renders which existing step component — see
 * EnrolmentStep/GuardianAddressStep/AdditionalStep):
 *   1. Enrolment & Student Details — Class Details + Student Details +
 *      Login Details. Everything the admin touches most, including the
 *      account, lands on the first screen instead of the last.
 *   2. Parent/Guardian & Address.
 *   3. Additional — Agent + Siblings + Past Records (all optional).
 */
const STEP_TITLE_KEYS: Record<WizardStep, string> = {
  1: "students.wizard.steps.enrolment",
  2: "students.wizard.steps.guardianAddress",
  3: "students.wizard.steps.additional",
};

type WizardStepperProps = {
  activeStep: WizardStep;
  /** Steps already visited/validated — lets the user jump back to any of them freely (same "Back is always free" rule, extended to "jump to any already-reached step"). Jumping ahead of the furthest-reached step is disabled. */
  reachedSteps: ReadonlySet<WizardStep>;
  onStepClick: (step: WizardStep) => void;
};

/**
 * New horizontal stepper — onboarding's StepIndicator.tsx is a hardcoded
 * 3-step, 280px LEFT SIDEBAR, the wrong shape for 7 steps inside a modal.
 * Same visual language (accent-filled circle, checkmark when complete).
 * Desktop: full row with labels under each circle. Mobile: circles +
 * connecting line only, current step auto-scrolled into view, with a
 * single caption line substituting for the hidden per-circle labels.
 */
export function WizardStepper({ activeStep, reachedSteps, onStepClick }: WizardStepperProps) {
  const t = useTranslations();
  const activeCircleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeCircleRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeStep]);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex items-center overflow-x-auto">
        {WIZARD_STEP_NUMBERS.map((number, index) => {
          const isComplete = number < activeStep;
          const isActive = number === activeStep;
          const isReachable = isComplete || isActive || reachedSteps.has(number);

          return (
            <li key={number} className="flex shrink-0 items-center">
              {index > 0 ? (
                <span className={`mx-1 h-px w-6 shrink-0 sm:w-10 ${isComplete || isActive ? "bg-accent" : "bg-status-empty-border"}`} />
              ) : null}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  ref={isActive ? activeCircleRef : undefined}
                  type="button"
                  disabled={!isReachable}
                  onClick={() => onStepClick(number)}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                    isComplete
                      ? "bg-status-done text-white"
                      : isActive
                        ? "bg-accent text-on-accent"
                        : "border-2 border-status-empty-border text-text-muted"
                  }`}
                >
                  {isComplete ? <CheckIcon className="h-4 w-4" /> : number}
                </button>
                <span
                  className={`hidden max-w-[140px] truncate text-center text-xs font-medium sm:block ${
                    isActive ? "text-text-primary" : "text-text-muted"
                  }`}
                >
                  {t(STEP_TITLE_KEYS[number])}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-text-muted sm:hidden">
        {t("students.wizard.stepOfTotal", { step: activeStep, total: WIZARD_STEP_NUMBERS.length, title: t(STEP_TITLE_KEYS[activeStep]) })}
      </p>
    </div>
  );
}
