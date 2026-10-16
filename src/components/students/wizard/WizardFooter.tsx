"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { WIZARD_STEP_NUMBERS, type WizardStep } from "@/components/students/wizard/WizardStepper";
import type { AutoSaveState } from "@/components/students/wizard/useDraftAutoSave";

type WizardFooterProps = {
  step: WizardStep;
  mode: "create" | "edit";
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
  isSubmitting: boolean;
  isSavingDraft: boolean;
  autoSaveState: AutoSaveState;
};

const AUTO_SAVE_CLASSES: Record<Exclude<AutoSaveState, "idle">, string> = {
  saving: "text-text-muted",
  saved: "text-text-muted",
  retrying: "text-warning",
  failed: "text-error",
};

/** Edit mode has no Save Draft — drafts only exist for incomplete NEW records; an existing student is updated, not drafted. */
export function WizardFooter({
  step,
  mode,
  onBack,
  onSaveDraft,
  onNext,
  isSubmitting,
  isSavingDraft,
  autoSaveState,
}: WizardFooterProps) {
  const t = useTranslations();
  const isLastStep = step === WIZARD_STEP_NUMBERS[WIZARD_STEP_NUMBERS.length - 1];

  return (
    <>
      <div>
        {step > 1 ? (
          <Button type="button" variant="secondary" onClick={onBack} className="px-4 text-sm">
            {t("students.wizard.footer.back")}
          </Button>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-3">
        {/* Subtle inline auto-save state; announced politely to screen readers. */}
        <span role="status" aria-live="polite" className="min-w-0 truncate text-xs">
          {mode === "create" && autoSaveState !== "idle" ? (
            <span className={AUTO_SAVE_CLASSES[autoSaveState]}>{t(`students.wizard.autoSave.${autoSaveState}`)}</span>
          ) : null}
        </span>
        {mode === "create" ? (
          <Button type="button" variant="secondary" onClick={onSaveDraft} disabled={isSavingDraft} className="px-4 text-sm">
            <span className="hidden sm:inline">{isSavingDraft ? t("common.saving") : t("students.wizard.footer.saveDraft")}</span>
            <span className="sm:hidden">{isSavingDraft ? t("common.saving") : t("students.wizard.footer.saveDraftShort")}</span>
          </Button>
        ) : null}
        <Button type="button" onClick={onNext} disabled={isSubmitting} className="px-4 text-sm">
          {isLastStep
            ? isSubmitting
              ? t("common.saving")
              : mode === "edit"
                ? t("students.wizard.footer.update")
                : t("students.wizard.footer.addStudent")
            : t("students.wizard.footer.next")}
        </Button>
      </div>
    </>
  );
}
