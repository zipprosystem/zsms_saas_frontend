"use client";

import { hasUsableEmail } from "@/lib/hr/hrTypes";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import type { HrReferenceData } from "@/components/hr/useHrReferenceData";
import { effectiveUsername, type StaffForm, type StaffWizardStep } from "@/components/hr/wizard/staffForm";

type ReviewProps = {
  form: StaffForm;
  refs: HrReferenceData;
  mode: "create" | "edit";
  credentialsIssued: boolean;
  isActiveStaff: boolean;
  onEditStep: (step: StaffWizardStep) => void;
};

function ReviewItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function ReviewGroup({ title, editLabel, onEdit, children }: { title: string; editLabel: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-text-primary">{title}</h4>
        <button type="button" onClick={onEdit} className="shrink-0 text-sm font-medium text-accent hover:underline">
          {editLabel}
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</dl>
    </div>
  );
}

/**
 * Read-only summary of what Add Staff / Update will save — one group per
 * wizard step, each with an Edit link back to that step. Reflects the
 * form as sent (teaching-only rows aren't shown for non-teaching staff,
 * since none are sent). Never shows a password.
 */
export function StaffReviewSection({ form, refs, mode, credentialsIssued, isActiveStaff, onEditStep }: ReviewProps) {
  const t = useTranslations();
  const format = useFormatter();
  const isTeaching = form.staff_type === "teaching";
  const edit = t("hr.wizard.review.edit");

  const orDash = (value: string) => value.trim() || "—";
  const date = (value: string) => (value ? format.dateTime(new Date(`${value}T00:00:00`), { dateStyle: "medium" }) : "—");
  const list = (values: string[]) => (values.length ? values.join(", ") : "—");
  const rows = (count: number) => t("hr.wizard.review.rows", { count });
  /** Empty add-many rows are dropped on save — count only what's sent. */
  const filled = (items: Array<{ key: string }>) =>
    items.filter((row) => Object.entries(row).some(([field, value]) => field !== "key" && String(value).trim())).length;
  const fullName = [form.title, form.first_name, form.other_name, form.last_name].map((part) => part.trim()).filter(Boolean).join(" ");
  const groupNames = form.permission_group_ids.map((id) => refs.groups.find((group) => group.id === id)?.name ?? "—");
  const completeSubjects = form.subject_assignments.filter((row) => row.class_id && row.section_id && row.subject_id).length;
  const completeArms = form.class_teacher_assignments.filter((row) => row.class_id && row.section_id).length;
  const loginIssued = mode === "create" || credentialsIssued;
  const loginOn = form.login_active && !(mode === "edit" && !isActiveStaff);

  return (
    <StaffStepSection title={t("hr.wizard.sections.review.title")} subtitle={t("hr.wizard.sections.review.subtitle")}>
      <ReviewGroup title={t("hr.wizard.steps.profile")} editLabel={edit} onEdit={() => onEditStep(1)}>
        <ReviewItem label={t("hr.wizard.review.name")} value={orDash(fullName)} />
        <ReviewItem label={t("hr.wizard.fields.email.label")} value={orDash(form.email)} />
        <ReviewItem label={t("hr.wizard.fields.nationalId.label")} value={orDash(form.national_id)} />
        <ReviewItem label={t("hr.wizard.fields.gender.label")} value={form.gender ? t(`hr.wizard.fields.gender.${form.gender}`) : "—"} />
        <ReviewItem label={t("hr.wizard.fields.dateOfBirth.label")} value={date(form.date_of_birth)} />
        <ReviewItem label={t("hr.wizard.fields.dateJoined.label")} value={date(form.date_joined)} />
      </ReviewGroup>

      <ReviewGroup title={t("hr.wizard.steps.role")} editLabel={edit} onEdit={() => onEditStep(2)}>
        <ReviewItem label={t("hr.wizard.fields.staffType.label")} value={t(`hr.staffs.tabs.${form.staff_type}`)} />
        <ReviewItem label={t("hr.wizard.fields.post.label")} value={refs.postName(form.post_id || null)} />
        <ReviewItem label={t("hr.wizard.fields.departments.label")} value={list(form.department_ids.map(refs.departmentName))} />
        {isTeaching ? (
          <>
            <ReviewItem label={t("hr.wizard.sections.subjects.title")} value={rows(completeSubjects)} />
            <ReviewItem label={t("hr.wizard.sections.classTeacher.title")} value={rows(completeArms)} />
          </>
        ) : null}
        <ReviewItem label={t("hr.wizard.sections.groups.title")} value={list(groupNames)} />
      </ReviewGroup>

      <ReviewGroup title={t("hr.wizard.steps.credentials")} editLabel={edit} onEdit={() => onEditStep(3)}>
        <ReviewItem
          label={t("hr.wizard.fields.username.label")}
          value={loginIssued ? orDash(effectiveUsername(form)) : t("hr.wizard.review.notIssued")}
        />
        <ReviewItem label={t("hr.wizard.fields.loginActive.label")} value={loginOn ? t("hr.wizard.review.on") : t("hr.wizard.review.off")} />
        {mode === "create" ? (
          <ReviewItem
            label={t("hr.credentials.reviewLabel")}
            value={hasUsableEmail(form.email) ? t("hr.credentials.reviewLink", { email: form.email.trim() }) : t("hr.credentials.reviewDefault")}
          />
        ) : null}
        <ReviewItem label={t("hr.wizard.sections.qualifications.title")} value={rows(filled(form.qualifications))} />
        <ReviewItem label={t("hr.wizard.sections.references.title")} value={rows(filled(form.references))} />
        <ReviewItem label={t("hr.wizard.sections.experience.title")} value={rows(filled(form.experience))} />
      </ReviewGroup>
    </StaffStepSection>
  );
}
