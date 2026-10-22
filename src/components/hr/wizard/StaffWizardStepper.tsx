"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { STAFF_STEP_TITLE_KEYS, STAFF_WIZARD_STEPS, type StaffWizardStep } from "@/components/hr/wizard/staffForm";

type StaffWizardStepperProps = {
  activeStep: StaffWizardStep;
  /** Steps already reached — any of them can be jumped back to; jumping past the furthest one is disabled. */
  reachedSteps: ReadonlySet<StaffWizardStep>;
  onStepClick: (step: StaffWizardStep) => void;
};

/**
 * Horizontal stepper (Figma 3347:64541) — same visual language as the
 * Students wizard's WizardStepper (that one is hard-wired to its own 3
 * steps). Desktop: labels under each circle; mobile: circles only, the
 * active one scrolled into view, with a caption line below.
 */
export function StaffWizardStepper({ activeStep, reachedSteps, onStepClick }: StaffWizardStepperProps) {
  const t = useTranslations();
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeStep]);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex items-start overflow-x-auto pb-1">
        {STAFF_WIZARD_STEPS.map((step, index) => {
          const isActive = step === activeStep;
          const isComplete = step < activeStep;
          const isReachable = isActive || isComplete || reachedSteps.has(step);
          return (
            <li key={step} className="flex shrink-0 items-start">
              {index > 0 ? (
                <span
                  className={`mx-1 mt-4 h-px w-6 shrink-0 sm:w-10 ${isComplete || isActive ? "bg-status-done" : "bg-status-empty-border"}`}
                />
              ) : null}
              <div className="flex w-8 flex-col items-center gap-1.5 sm:w-24">
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  disabled={!isReachable}
                  onClick={() => onStepClick(step)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={t(STAFF_STEP_TITLE_KEYS[step])}
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                    isComplete
                      ? "bg-status-done text-white"
                      : isActive
                        ? "bg-accent text-on-accent"
                        : "border-2 border-status-empty-border text-text-muted"
                  }`}
                >
                  {isComplete ? <CheckIcon className="h-4 w-4" /> : step}
                </button>
                <span
                  className={`hidden text-center text-xs sm:block ${isActive ? "font-semibold text-text-primary" : "text-text-muted"}`}
                >
                  {t(STAFF_STEP_TITLE_KEYS[step])}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs font-medium text-text-secondary sm:hidden">
        {t("hr.wizard.stepCaption", { step: activeStep, total: STAFF_WIZARD_STEPS.length, title: t(STAFF_STEP_TITLE_KEYS[activeStep]) })}
      </p>
    </div>
  );
}
