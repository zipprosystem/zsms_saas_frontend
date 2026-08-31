"use client";

import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/icons/CheckIcon";

const STEP_NUMBERS = [1, 2, 3] as const;

const STEP_KEYS: Record<(typeof STEP_NUMBERS)[number], { title: string; caption: string }> = {
  1: {
    title: "onboarding.stepIndicator.step1Title",
    caption: "onboarding.stepIndicator.step1Caption",
  },
  2: {
    title: "onboarding.stepIndicator.step2Title",
    caption: "onboarding.stepIndicator.step2Caption",
  },
  3: {
    title: "onboarding.stepIndicator.step3Title",
    caption: "onboarding.stepIndicator.step3Caption",
  },
};

export function StepIndicator({ activeStep }: { activeStep: 1 | 2 | 3 }) {
  const t = useTranslations();

  return (
    <aside className="w-full shrink-0 border-b border-border bg-surface px-6 py-6 lg:w-[280px] lg:border-b-0 lg:border-r lg:px-8 lg:py-10">
      <div className="hidden lg:block">
        <h1 className="font-display text-2xl font-medium text-text-primary">
          {t("onboarding.stepIndicator.welcomeTitle")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {t("onboarding.stepIndicator.welcomeSubtitle")}
        </p>
      </div>

      <ol className="flex gap-4 overflow-x-auto lg:mt-8 lg:flex-col lg:gap-6 lg:overflow-visible">
        {STEP_NUMBERS.map((number) => {
          const isComplete = number < activeStep;
          const isActive = number === activeStep;
          return (
            <li key={number} className="flex shrink-0 items-center gap-3 lg:items-start">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  isComplete
                    ? "bg-status-done text-white"
                    : isActive
                      ? "bg-accent text-on-accent"
                      : "border-2 border-status-empty-border text-text-muted"
                }`}
              >
                {isComplete ? <CheckIcon className="h-4 w-4" /> : number}
              </span>
              <span className="hidden flex-col lg:flex">
                <span
                  className={`text-sm font-semibold ${
                    isActive ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {t(STEP_KEYS[number].title)}
                </span>
                <span className="text-xs text-text-muted">
                  {t(STEP_KEYS[number].caption)}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
