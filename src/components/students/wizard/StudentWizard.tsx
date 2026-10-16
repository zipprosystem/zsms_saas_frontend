"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { useToast } from "@/components/ui/Toast";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { WizardStepper, WIZARD_STEP_NUMBERS, type WizardStep } from "@/components/students/wizard/WizardStepper";
import { WizardFooter } from "@/components/students/wizard/WizardFooter";
import { StepErrorBoundary } from "@/components/students/wizard/StepErrorBoundary";
import { EnrolmentStep } from "@/components/students/wizard/steps/EnrolmentStep";
import { GuardianAddressStep } from "@/components/students/wizard/steps/GuardianAddressStep";
import { AdditionalStep } from "@/components/students/wizard/steps/AdditionalStep";
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
import { formDataToStudentBody, studentToFormData } from "@/lib/students/studentFormMapping";
import {
  createStudent,
  createStudentDraft,
  saveStudentDraft,
  studentsQueryKey,
  submitStudentDraft,
  updateStudent,
} from "@/lib/students/studentsApi";
import type { CrudResult } from "@/lib/setup/crudTypes";
import { studentTermDetailsQueryKey } from "@/lib/setup/academicStructure/studentTermDetailsApi";
import type { Student } from "@/lib/students/studentTypes";

// 3 steps, each a regroup of the original 7 — see WizardStepper.tsx's
// STEP_TITLE_KEYS doc comment for exactly which original step landed where.
const STEP_VALIDATORS: Record<WizardStep, (data: StudentFormData) => FieldErrors> = {
  1: (data) => ({
    ...validateClassDetails(data.classDetails),
    ...validateStudentDetails(data.studentDetails),
    ...validateLoginDetails(data.loginDetails),
  }),
  2: (data) => ({
    ...validateParentGuardian(data.parentGuardian),
    ...validateAddress(data.address),
  }),
  3: () => ({}), // Agent/Siblings/Past Records are all optional
};

/** i18n key shown under a field the BACKEND rejected (studentsApi.ts's field-mapped errors: a 422 VALIDATION_ERROR naming the field, or a code below) — the backend's own message goes in the toast. */
const SERVER_FIELD_ERROR_KEYS: Record<string, string> = {
  username: "students.wizard.errors.usernameRejected",
  email: "students.wizard.errors.emailRejected",
  class_id: "students.wizard.errors.placementRejected",
  class_arm_id: "students.wizard.errors.placementRejected",
  class_term_id: "students.wizard.errors.placementRejected",
  mode: "students.wizard.errors.placementRejected",
};

/** The 409 duplicates get their own hint (overrides the field's generic "invalid" one). */
const SERVER_CODE_ERROR_KEYS: Record<string, string> = {
  USERNAME_TAKEN: "students.wizard.errors.usernameTaken",
  EMAIL_TAKEN: "students.wizard.errors.emailTaken",
};

/** Routes a final-submit validation error back to the step that owns it, so the user lands on something they can actually fix. */
function stepForErrorField(field: string): WizardStep {
  if (field.startsWith("father.") || field.startsWith("mother.") || field.startsWith("guardian.")) return 2;
  if (field.startsWith("home.") || field.startsWith("other.")) return 2;
  return 1; // class details, student details, username/password all live on step 1
}

export type StudentWizardProps = {
  /**
   * "edit" = an already-ACTIVE student (PUT /:id, placement read-only, no
   * Save Draft). "create" = a new student OR a resumed draft — a draft is
   * still an unfinished admission, so it keeps editable placement, Save
   * Draft, and finishes via POST /:id/submit.
   */
  mode: "create" | "edit";
  /** Edit: the active student. Create: the draft being resumed (fetched fresh via GET /:id), or absent for a brand-new admission. */
  initialStudent?: Student;
  /** Reopens at the step a draft was last saved from (Resume), with every step up to it marked reached so the user can move freely across what they'd already filled. Defaults to 1. */
  initialStep?: WizardStep;
  onClose: () => void;
};

function reachedStepsUpTo(step: WizardStep): Set<WizardStep> {
  return new Set(WIZARD_STEP_NUMBERS.filter((n) => n <= step));
}

export function StudentWizard({ mode, initialStudent, initialStep, onClose }: StudentWizardProps) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedYearId, isLoading: isYearLoading } = useAcademicYear();

  const [step, setStep] = useState<WizardStep>(initialStep ?? 1);
  const [reachedSteps, setReachedSteps] = useState<Set<WizardStep>>(() => reachedStepsUpTo(initialStep ?? 1));
  const [data, setData] = useState<StudentFormData>(() =>
    initialStudent ? studentToFormData(initialStudent) : emptyStudentFormData(MOCK_SCHOOL_MODE),
  );
  // Tracks the record a Save Draft call created, across subsequent saves in
  // the SAME wizard session, so the second+ Save Draft (and the eventual
  // final submit) upserts that exact row instead of creating a duplicate.
  // Starts at initialStudent's id when editing/resuming.
  const [studentId, setStudentId] = useState<string | null>(initialStudent?.id ?? null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // The list is year-filtered and drops any student without an
  // academic_year_id, so every save MUST carry one or a draft would vanish
  // from the list. A resumed draft / edited student keeps the year it was
  // saved under; a new admission takes the session's selected year.
  const academicYearId = initialStudent?.academic_year_id ?? selectedYearId;

  const updateGroup = <K extends keyof StudentFormData>(key: K, patch: Partial<StudentFormData[K]>) => {
    setData((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  // SURNAME AUTO-FILL: editing the student's own Last Name pre-fills
  // Father's/Mother's/Guardian's Last Name with the same value — same
  // "prefill then stop on manual edit" pattern as Subject Master's
  // short-name (SubjectsMasterScreen.tsx). Each block tracks its own
  // lastNameTouched independently, so e.g. overriding Mother's surname
  // doesn't stop Father's from continuing to sync.
  //
  // USERNAME AUTO-FILL: same pattern — the student's Email pre-fills
  // Username (lowercased, matching the backend's own blank-username
  // default) until the admin types a username of their own.
  const handleStudentDetailsChange = (patch: Partial<StudentFormData["studentDetails"]>) => {
    setData((current) => {
      const studentDetails = { ...current.studentDetails, ...patch };
      const loginDetails =
        patch.email !== undefined && !current.loginDetails.usernameTouched
          ? { ...current.loginDetails, username: patch.email.trim().toLowerCase() }
          : current.loginDetails;
      if (patch.last_name === undefined) return { ...current, studentDetails, loginDetails };
      const lastName = patch.last_name;
      const syncBlock = (block: StudentFormData["parentGuardian"]["father"]) =>
        block.lastNameTouched ? block : { ...block, last_name: lastName };
      return {
        ...current,
        studentDetails,
        loginDetails,
        parentGuardian: {
          ...current.parentGuardian,
          father: syncBlock(current.parentGuardian.father),
          mother: syncBlock(current.parentGuardian.mother),
          guardian: syncBlock(current.parentGuardian.guardian),
        },
      };
    });
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

  /** Shared failure handling for every save path: field-mapped backend errors land on (and jump to) their field; everything else toasts the backend's own message when it sent one. */
  const handleSaveFailure = (result: Exclude<CrudResult<unknown>, { ok: true }>) => {
    if (result.kind === "validation" && result.errors.length > 0) {
      const fieldErrors: FieldErrors = {};
      for (const error of result.errors) {
        const key = (error.code && SERVER_CODE_ERROR_KEYS[error.code]) || SERVER_FIELD_ERROR_KEYS[error.field];
        if (key) fieldErrors[error.field] = key;
      }
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField) {
        const targetStep = stepForErrorField(firstField);
        if (targetStep !== step) goToStep(targetStep);
        setErrors(fieldErrors);
      }
      showToast(result.errors[0].message ?? t("students.wizard.footer.saveFailed"));
      return;
    }
    const message = "message" in result ? result.message : undefined;
    showToast(message ?? t("students.wizard.footer.saveFailed"));
  };

  const handleSaveDraft = async () => {
    if (!academicYearId) {
      showToast(t("students.wizard.errors.noYear"));
      return;
    }
    setIsSavingDraft(true);
    const body = formDataToStudentBody(data, academicYearId);
    const result = studentId ? await saveStudentDraft(studentId, body, step) : await createStudentDraft(body, step);
    setIsSavingDraft(false);

    if (!result.ok) {
      handleSaveFailure(result);
      return;
    }
    setStudentId(result.data.id);
    // Only the year this student belongs to — never every cached year.
    queryClient.invalidateQueries({ queryKey: studentsQueryKey(academicYearId) });
    showToast(t("students.wizard.footer.draftSaved"));
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

    if (!academicYearId) {
      showToast(t("students.wizard.errors.noYear"));
      return;
    }
    setIsSubmitting(true);
    const body = formDataToStudentBody(data, academicYearId);
    // Three final-save routes: an already-active student is edited in place
    // (PUT /:id); a draft — resumed, or created by Save Draft earlier in this
    // same session — is submitted (POST /:id/submit); otherwise it's a
    // straight create (POST /students).
    const result =
      mode === "edit" && initialStudent
        ? await updateStudent(initialStudent.id, body)
        : studentId
          ? await submitStudentDraft(studentId, body)
          : await createStudent(body);
    setIsSubmitting(false);

    if (!result.ok) {
      handleSaveFailure(result);
      return;
    }
    queryClient.invalidateQueries({ queryKey: studentsQueryKey(academicYearId) });
    // AUTO-POPULATE: submit/create creates the student's initial Student
    // Term Details record server-side (same transaction) when placement is
    // complete — invalidate so that screen reflects it immediately.
    queryClient.invalidateQueries({ queryKey: studentTermDetailsQueryKey(academicYearId) });
    showToast(mode === "edit" ? t("students.wizard.footer.studentUpdated") : t("students.wizard.footer.studentCreated"));
    onClose();
  };

  const handleNext = () => {
    if (step === WIZARD_STEP_NUMBERS[WIZARD_STEP_NUMBERS.length - 1]) {
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
      size="2xl"
      footer={
        <WizardFooter
          step={step}
          mode={mode}
          onBack={handleBack}
          onSaveDraft={() => void handleSaveDraft()}
          onNext={handleNext}
          isSubmitting={isSubmitting}
          isSavingDraft={isSavingDraft}
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
              <EnrolmentStep
                yearId={selectedYearId}
                mode={mode}
                classDetails={data.classDetails}
                studentDetails={data.studentDetails}
                loginDetails={data.loginDetails}
                studentDisplayId={initialStudent?.student_id ?? null}
                errors={errors}
                onClassDetailsChange={(patch) => updateGroup("classDetails", patch)}
                onStudentDetailsChange={handleStudentDetailsChange}
                onLoginDetailsChange={(patch) => updateGroup("loginDetails", patch)}
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
            <GuardianAddressStep
              parentGuardian={data.parentGuardian}
              address={data.address}
              errors={errors}
              onParentGuardianChange={(patch) => updateGroup("parentGuardian", patch)}
              onAddressChange={(patch) => updateGroup("address", patch)}
            />
          ) : null}
          {step === 3 ? (
            <AdditionalStep
              agent={data.agent}
              siblings={data.siblings}
              pastRecords={data.pastRecords}
              excludeStudentId={initialStudent?.id}
              onAgentChange={(patch) => updateGroup("agent", patch)}
              onSiblingsChange={(patch) => updateGroup("siblings", patch)}
              onPastRecordsChange={(patch) => updateGroup("pastRecords", patch)}
            />
          ) : null}
        </StepErrorBoundary>
      </div>
    </WideModal>
  );
}
