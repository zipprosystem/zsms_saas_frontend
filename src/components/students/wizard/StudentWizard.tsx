"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { WideModal } from "@/components/ui/WideModal";
import { useToast } from "@/components/ui/Toast";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { mockDelay } from "@/lib/onboarding/mockDelay";
import { WizardStepper, WIZARD_STEP_NUMBERS, type WizardStep } from "@/components/students/wizard/WizardStepper";
import { WizardFooter } from "@/components/students/wizard/WizardFooter";
import { StepErrorBoundary } from "@/components/students/wizard/StepErrorBoundary";
import { ClassDetailsStep } from "@/components/students/wizard/steps/ClassDetailsStep";
import { StudentDetailsStep } from "@/components/students/wizard/steps/StudentDetailsStep";
import { ParentGuardianStep } from "@/components/students/wizard/steps/ParentGuardianStep";
import { AddressStep } from "@/components/students/wizard/steps/AddressStep";
import { AgentStep } from "@/components/students/wizard/steps/AgentStep";
import { SiblingsStep } from "@/components/students/wizard/steps/SiblingsStep";
import { PastRecordsStep } from "@/components/students/wizard/steps/PastRecordsStep";
import { LoginDetailsSection } from "@/components/students/wizard/LoginDetailsSection";
import {
  emptyStudentFormData,
  type FieldErrors,
  type StudentFormData,
} from "@/components/students/wizard/studentFormTypes";
import {
  validateAddress,
  validateAllSteps,
  validateClassDetails,
  validateLoginDetails,
  validateParentGuardian,
  validateStudentDetails,
} from "@/lib/students/wizardValidation";
import { MOCK_SCHOOL_MODE } from "@/lib/students/studentsMockData";
import { studentToFormData } from "@/lib/students/studentFormMapping";
import type { Student } from "@/lib/students/studentTypes";

const STEP_VALIDATORS: Record<WizardStep, (data: StudentFormData) => FieldErrors> = {
  1: (data) => validateClassDetails(data.classDetails),
  2: (data) => validateStudentDetails(data.studentDetails),
  3: (data) => validateParentGuardian(data.parentGuardian),
  4: (data) => validateAddress(data.address),
  5: () => ({}),
  6: () => ({}),
  7: (data) => validateLoginDetails(data.loginDetails),
};

/** Routes a final-submit validation error back to the step that owns it, so the user lands on something they can actually fix. */
function stepForErrorField(field: string): WizardStep {
  if (field.startsWith("father.") || field.startsWith("mother.") || field.startsWith("guardian.")) return 3;
  if (field.startsWith("home.") || field.startsWith("other.")) return 4;
  if (field === "username" || field === "password") return 7;
  if (["school_type_id", "class_id", "class_arm_id", "class_term_id", "mode"].includes(field)) return 1;
  return 2;
}

export type StudentWizardProps = {
  mode: "create" | "edit";
  initialStudent?: Student;
  onClose: () => void;
};

export function StudentWizard({ mode, initialStudent, onClose }: StudentWizardProps) {
  const t = useTranslations();
  const { showToast } = useToast();
  const { selectedYearId, isLoading: isYearLoading } = useAcademicYear();

  const [step, setStep] = useState<WizardStep>(1);
  const [reachedSteps, setReachedSteps] = useState<Set<WizardStep>>(new Set<WizardStep>([1]));
  const [data, setData] = useState<StudentFormData>(() =>
    initialStudent ? studentToFormData(initialStudent) : emptyStudentFormData(MOCK_SCHOOL_MODE),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateGroup = <K extends keyof StudentFormData>(key: K, patch: Partial<StudentFormData[K]>) => {
    setData((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const goToStep = (next: WizardStep) => {
    setStep(next);
    setReachedSteps((current) => new Set(current).add(next));
    setErrors({});
  };

  const handleBack = () => {
    if (step === 1) return;
    goToStep((step - 1) as WizardStep);
  };

  const handleSaveDraft = () => {
    showToast(t("students.wizard.footer.saveDraftComingSoon"));
  };

  const handleSubmit = async () => {
    const allErrors = validateAllSteps(data);
    if (Object.keys(allErrors).length > 0) {
      const firstField = Object.keys(allErrors)[0];
      const targetStep = stepForErrorField(firstField);
      if (targetStep !== step) {
        goToStep(targetStep);
        setErrors(allErrors);
        return;
      }
      setErrors(allErrors);
      return;
    }

    setIsSubmitting(true);
    await mockDelay(500);
    setIsSubmitting(false);
    showToast(t("students.wizard.footer.submitComingSoon"));
    onClose();
  };

  const handleNext = () => {
    if (step === 7) {
      void handleSubmit();
      return;
    }
    const stepErrors = STEP_VALIDATORS[step](data);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) {
      goToStep((step + 1) as WizardStep);
    }
  };

  const title = mode === "edit" ? t("students.wizard.titleEdit") : t("students.wizard.titleCreate");

  return (
    <WideModal
      isOpen
      onClose={onClose}
      title={title}
      subtitle={t("students.wizard.subtitle", { step, total: WIZARD_STEP_NUMBERS.length })}
      footer={
        <WizardFooter
          step={step}
          mode={mode}
          onBack={handleBack}
          onSaveDraft={handleSaveDraft}
          onNext={handleNext}
          isSubmitting={isSubmitting}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <WizardStepper
          activeStep={step}
          reachedSteps={reachedSteps}
          onStepClick={(target) => {
            if (target === step || (!reachedSteps.has(target) && target > step)) return;
            goToStep(target);
          }}
        />

        <StepErrorBoundary key={step} title={t("students.wizard.stepError.title")} message={t("students.wizard.stepError.message")}>
          {step === 1 ? (
            isYearLoading ? (
              <p className="text-sm text-text-muted">{t("setup.dataTable.loading")}</p>
            ) : selectedYearId ? (
              // The academic year is never a wizard field — it's whatever
              // the session's already scoped to (header SessionPill, same
              // as Classes/Class Terms), same here as everywhere else it's
              // consumed. Only a genuinely year-less school (or the local
              // dev-bypass short-circuit, which also resolves to zero years
              // — expected locally, see crudTypes.ts's
              // isDevBypassUnavailable) falls through to the prompt below.
              <ClassDetailsStep
                yearId={selectedYearId}
                data={data.classDetails}
                errors={errors}
                onChange={(patch) => updateGroup("classDetails", patch)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-4 py-10 text-center">
                <p className="text-sm text-text-secondary">{t("students.wizard.noYear.message")}</p>
                <Link
                  href="/admin/setup/academic-structure/academic-years"
                  className="text-sm font-semibold text-accent hover:underline"
                >
                  {t("students.wizard.noYear.linkLabel")}
                </Link>
              </div>
            )
          ) : null}
          {step === 2 ? (
            <StudentDetailsStep data={data.studentDetails} errors={errors} onChange={(patch) => updateGroup("studentDetails", patch)} />
          ) : null}
          {step === 3 ? (
            <ParentGuardianStep data={data.parentGuardian} errors={errors} onChange={(patch) => updateGroup("parentGuardian", patch)} />
          ) : null}
          {step === 4 ? <AddressStep data={data.address} errors={errors} onChange={(patch) => updateGroup("address", patch)} /> : null}
          {step === 5 ? <AgentStep data={data.agent} onChange={(patch) => updateGroup("agent", patch)} /> : null}
          {step === 6 ? (
            <SiblingsStep
              data={data.siblings}
              onChange={(patch) => updateGroup("siblings", patch)}
              excludeStudentId={initialStudent?.id}
            />
          ) : null}
          {step === 7 ? (
            <>
              <PastRecordsStep data={data.pastRecords} onChange={(patch) => updateGroup("pastRecords", patch)} />
              <LoginDetailsSection
                data={data.loginDetails}
                errors={errors}
                admissionNumber={data.studentDetails.admission_number}
                onChange={(patch) => updateGroup("loginDetails", patch)}
              />
            </>
          ) : null}
        </StepErrorBoundary>
      </div>
    </WideModal>
  );
}
