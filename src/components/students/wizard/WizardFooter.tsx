"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { WizardStep } from "@/components/students/wizard/WizardStepper";

type WizardFooterProps = {
  step: WizardStep;
  mode: "create" | "edit";
  onBack: () => void;
  onSaveDraft: () => void;
  onNext: () => void;
  isSubmitting: boolean;
  isSavingDraft: boolean;
};

export function WizardFooter({ step, mode, onBack, onSaveDraft, onNext, isSubmitting, isSavingDraft }: WizardFooterProps) {
  const t = useTranslations();
  const isLastStep = step === 7;

  return (
    <>
      <div>
        {step > 1 ? (
          <Button type="button" variant="secondary" onClick={onBack} className="px-4 text-sm">
            {t("students.wizard.footer.back")}
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={onSaveDraft} disabled={isSavingDraft} className="px-4 text-sm">
          <span className="hidden sm:inline">{isSavingDraft ? t("common.saving") : t("students.wizard.footer.saveDraft")}</span>
          <span className="sm:hidden">{isSavingDraft ? t("common.saving") : t("students.wizard.footer.saveDraftShort")}</span>
        </Button>
        <Button type="button" onClick={onNext} disabled={isSubmitting} className="px-4 text-sm">
          {isLastStep
            ? isSubmitting
              ? t("common.saving")
              : mode === "edit"
                ? t("students.wizard.footer.saveChanges")
                : t("students.wizard.footer.addStudent")
            : t("students.wizard.footer.next")}
        </Button>
      </div>
    </>
  );
}
