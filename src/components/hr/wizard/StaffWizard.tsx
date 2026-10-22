"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import type { CrudResult } from "@/lib/setup/crudTypes";
import {
  createStaff,
  createStaffDraft,
  saveStaffDraft,
  staffListQueryKeyRoot,
  submitStaffDraft,
  updateStaff,
} from "@/lib/hr/staffRecordsApi";
import { permissionGroupsQueryKey } from "@/lib/hr/permissionGroupsApi";
import { staffPostsQueryKey } from "@/lib/hr/staffPostsApi";
import type { Staff } from "@/lib/hr/hrTypes";
import { useHrReferenceData } from "@/components/hr/useHrReferenceData";
import { StaffWizardStepper } from "@/components/hr/wizard/StaffWizardStepper";
import { StaffProfileStep } from "@/components/hr/wizard/steps/StaffProfileStep";
import { StaffRoleStep } from "@/components/hr/wizard/steps/StaffRoleStep";
import { StaffCredentialsStep } from "@/components/hr/wizard/steps/StaffCredentialsStep";
import {
  emptyStaffForm,
  formToWire,
  isDraftEligible,
  STAFF_STEP_VALIDATORS,
  STAFF_WIZARD_STEPS,
  staffToForm,
  stepForField,
  type FieldErrors,
  type StaffForm,
  type StaffWizardStep,
} from "@/components/hr/wizard/staffForm";

export type StaffWizardProps = {
  /** "create" = a new staff or a resumed draft (still unfinished); "edit" = a non-draft staff. */
  mode: "create" | "edit";
  /** Loaded fresh (GET /staff/:id) for the selected year — never a list row. */
  initialStaff?: Staff;
  initialStep?: StaffWizardStep;
  onClose: () => void;
};

const LAST_STEP = STAFF_WIZARD_STEPS[STAFF_WIZARD_STEPS.length - 1];

/** Backend field-error codes the form has its own message for (hrHttp.ts FIELD_ERROR_CODES). */
const SERVER_ERROR_KEYS: Record<string, string> = {
  DUPLICATE_EMAIL: "hr.wizard.errors.emailTaken",
  USERNAME_TAKEN: "hr.wizard.errors.usernameTaken",
  DUPLICATE_SUBJECT_ASSIGNMENT: "hr.wizard.errors.duplicateSubjectAssignment",
  DUPLICATE_CLASS_TEACHER_ASSIGNMENT: "hr.wizard.errors.duplicateClassTeacher",
};

/**
 * Add / Edit Staff (Figma 3347:64541), mock-backed via staffRecordsApi.
 * Only Staff Details core + Staff Post are required. Every save sends the
 * COMPLETE record for the year the wizard opened on (the header's
 * selected year at open time — switching the header mid-edit doesn't
 * re-target it).
 *
 * Drafts (create mode only): Save Draft creates/updates a status=draft
 * staff; moving to the next step also auto-saves once first + last name
 * are filled in. Saves are serialized so a slow first save can't spawn a
 * second draft. Edit mode has no drafts — an existing staff is updated.
 */
export function StaffWizard({ mode, initialStaff, initialStep, onClose }: StaffWizardProps) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { years, selectedYearId } = useAcademicYear();
  const [yearId] = useState(selectedYearId);
  const yearName = years.find((year) => year.id === yearId)?.name ?? null;
  const carriedFromYearName = initialStaff?.assignments_carried_forward_from
    ? (years.find((year) => year.id === initialStaff.assignments_carried_forward_from)?.name ?? t("hr.wizard.assignments.priorYear"))
    : null;
  const refs = useHrReferenceData(yearId);

  const [form, setForm] = useState<StaffForm>(() => (initialStaff ? staffToForm(initialStaff) : emptyStaffForm()));
  const [step, setStep] = useState<StaffWizardStep>(initialStep ?? 1);
  const [reached, setReached] = useState<Set<StaffWizardStep>>(
    () => new Set(STAFF_WIZARD_STEPS.filter((item) => item <= (initialStep ?? 1))),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const draftIdRef = useRef<string | null>(initialStaff?.status === "draft" ? initialStaff.id : null);
  const staffNo = initialStaff?.staff_no ?? null;
  /** Serializes every save — the first draft save must finish before anything else, or it'd create a second draft. */
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: staffListQueryKeyRoot });
    queryClient.invalidateQueries({ queryKey: permissionGroupsQueryKey });
    queryClient.invalidateQueries({ queryKey: staffPostsQueryKey });
  };

  const change = (patch: Partial<StaffForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => {
      const next = { ...current };
      for (const field of Object.keys(patch)) delete next[field];
      return next;
    });
  };

  const goToStep = (next: StaffWizardStep) => {
    setStep(next);
    setReached((current) => new Set(current).add(next));
  };

  /** Field errors from a failed save -> the form, jumping to the first one's step. Anything else -> a toast. */
  const handleFailure = (result: Extract<CrudResult<unknown>, { ok: false }>) => {
    if (result.kind === "validation" && result.errors.length > 0) {
      const fieldErrors: FieldErrors = {};
      for (const error of result.errors) {
        fieldErrors[error.field] = SERVER_ERROR_KEYS[error.code ?? ""] ?? "hr.wizard.errors.invalidField";
      }
      setErrors(fieldErrors);
      goToStep(stepForField(result.errors[0].field));
      // Plain-text backend message alongside, for fields the form doesn't label (e.g. a VALIDATION_ERROR it pinned).
      if (result.errors[0].message) showToast(result.errors[0].message);
      return;
    }
    showToast(resultErrorMessage(result, t));
  };

  /** One draft save (create or update), queued behind any in-flight save. */
  const saveDraft = (atStep: StaffWizardStep): Promise<CrudResult<Staff>> => {
    const run = async () => {
      const body = formToWire(form, yearId);
      const result = draftIdRef.current
        ? await saveStaffDraft(draftIdRef.current, body, atStep)
        : await createStaffDraft(body, atStep);
      if (result.ok) {
        draftIdRef.current = result.data.id;
        invalidate();
      }
      return result;
    };
    const next = saveQueueRef.current.then(run, run);
    saveQueueRef.current = next.catch(() => undefined);
    return next;
  };

  const handleSaveDraft = async () => {
    if (!isDraftEligible(form)) {
      setErrors(STAFF_STEP_VALIDATORS[1](form));
      goToStep(1);
      showToast(t("hr.wizard.errors.draftNeedsName"));
      return;
    }
    setIsSavingDraft(true);
    const result = await saveDraft(step);
    setIsSavingDraft(false);
    if (!result.ok) {
      handleFailure(result);
      return;
    }
    showToast(t("hr.wizard.toast.draftSaved"));
  };

  const handleSubmit = async () => {
    // Validate every step; jump to the first one with a problem.
    for (const candidate of STAFF_WIZARD_STEPS) {
      const stepErrors = STAFF_STEP_VALIDATORS[candidate](form);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        goToStep(candidate);
        return;
      }
    }
    setIsSubmitting(true);
    await saveQueueRef.current; // let any in-flight draft save settle first
    const body = formToWire(form, yearId);
    const result =
      mode === "edit" && initialStaff
        ? await updateStaff(initialStaff.id, body)
        : draftIdRef.current
          ? await submitStaffDraft(draftIdRef.current, body)
          : await createStaff(body);
    setIsSubmitting(false);
    if (!result.ok) {
      handleFailure(result);
      return;
    }
    invalidate();
    showToast(mode === "edit" ? t("hr.wizard.toast.updated") : t("hr.wizard.toast.created"));
    onClose();
  };

  const handleNext = () => {
    if (step === LAST_STEP) {
      void handleSubmit();
      return;
    }
    const stepErrors = STAFF_STEP_VALIDATORS[step](form);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    const nextStep = (step + 1) as StaffWizardStep;
    goToStep(nextStep);
    // Quiet auto-save on step progression (create mode, once identifiable).
    if (mode === "create" && isDraftEligible(form)) {
      void saveDraft(nextStep).then((result) => {
        setDraftNotice(result.ok ? t("hr.wizard.autoSave.saved") : t("hr.wizard.autoSave.failed"));
      });
    }
  };

  const title = mode === "edit" ? t("hr.wizard.titleEdit") : t("hr.wizard.titleCreate");

  return (
    <WideModal
      isOpen
      onClose={onClose}
      title={title}
      subtitle={t("hr.wizard.subtitle")}
      size="2xl"
      footer={
        <>
          <div>
            {step > 1 ? (
              <Button type="button" variant="secondary" onClick={() => goToStep((step - 1) as StaffWizardStep)} className="px-4 text-sm">
                {t("hr.wizard.footer.back")}
              </Button>
            ) : null}
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <span role="status" aria-live="polite" className="min-w-0 truncate text-xs text-text-muted">
              {mode === "create" ? draftNotice : null}
            </span>
            {mode === "create" ? (
              <Button type="button" variant="secondary" onClick={() => void handleSaveDraft()} disabled={isSavingDraft} className="px-4 text-sm">
                {isSavingDraft ? t("common.saving") : t("hr.wizard.footer.saveDraft")}
              </Button>
            ) : null}
            <Button type="button" onClick={handleNext} disabled={isSubmitting} className="px-4 text-sm">
              {step === LAST_STEP
                ? isSubmitting
                  ? t("common.saving")
                  : mode === "edit"
                    ? t("hr.wizard.footer.update")
                    : t("hr.wizard.footer.addStaff")
                : t("hr.wizard.footer.next")}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        <StaffWizardStepper activeStep={step} reachedSteps={reached} onStepClick={goToStep} />
        {step === 1 ? <StaffProfileStep form={form} onChange={change} errors={errors} staffNo={staffNo} /> : null}
        {step === 2 ? (
          <StaffRoleStep
            form={form}
            onChange={change}
            errors={errors}
            refs={refs}
            yearName={yearId ? (yearName ?? t("hr.wizard.assignments.selectedYear")) : null}
            carriedFromYearName={carriedFromYearName}
          />
        ) : null}
        {step === 3 ? (
          <StaffCredentialsStep
            form={form}
            onChange={change}
            errors={errors}
            refs={refs}
            mode={mode}
            credentialsIssued={!!initialStaff?.credentials_issued_at}
            isActiveStaff={initialStaff?.status === "active"}
            onEditStep={goToStep}
          />
        ) : null}
      </div>
    </WideModal>
  );
}
