"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Select";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import type { HrReferenceData } from "@/components/hr/useHrReferenceData";
import {
  classTeacherKey,
  isTakenBy,
  rowKey,
  subjectAssignmentKey,
  type ClassTeacherRow,
  type FieldErrors,
  type StaffForm,
  type SubjectAssignmentRow,
} from "@/components/hr/wizard/staffForm";

type StepProps = {
  form: StaffForm;
  onChange: (patch: Partial<StaffForm>) => void;
  errors: FieldErrors;
  refs: HrReferenceData;
  /** The header's selected year — every row here belongs to it. Null = no year selected. */
  yearName: string | null;
  /** Set when these rows were pre-filled from a prior year (nothing saved for this year yet). */
  carriedFromYearName: string | null;
};

function RemoveRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-md border border-border text-error transition-colors hover:bg-surface"
    >
      <CloseIcon className="h-4 w-4" />
    </button>
  );
}

/**
 * Role step — year-scoped Subject assignments {class + arm + subject} and
 * Class-teacher arms, both teaching staff only (the Role step doesn't
 * render this for non-teaching staff). Rows belong to the SELECTED year;
 * when it has none yet the backend pre-fills the most recent prior year's
 * as editable defaults (carry-forward), and saving writes this year only.
 *
 * Unique within the year: subject + class-arm, and class-arm for
 * class-teacher. Options another row already holds are disabled; a change
 * that would still repeat one is rejected with an inline notice on that
 * row (the backend 409s the same — see staffForm.ts).
 *
 * Classes / arms / class subjects are the real Academic APIs — empty under
 * dev-bypass, and there's no selected year there either.
 */
export function StaffTeachingAssignments({ form, onChange, errors, refs, yearName, carriedFromYearName }: StepProps) {
  const t = useTranslations();
  /** Row key -> i18n key of a rejected duplicate change; cleared by that row's next accepted change. */
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const setRowNotice = (key: string, notice: string | null) =>
    setRejected((current) => {
      if (!notice && !(key in current)) return current;
      const next = { ...current };
      if (notice) next[key] = notice;
      else delete next[key];
      return next;
    });

  if (form.staff_type !== "teaching") return null;

  if (!yearName) {
    return (
      <StaffStepSection title={t("hr.wizard.sections.assignments.title")}>
        <p className="text-sm text-text-muted">{t("hr.wizard.assignments.noYear")}</p>
        {refs.academicUnavailable ? <DevBypassNotice /> : null}
      </StaffStepSection>
    );
  }

  const classOptions = refs.classes.filter((cls) => cls.is_active);
  const armsFor = (classId: string) =>
    refs.sections.filter((section) => section.class_id === classId && section.is_active);
  const subjectsFor = (classId: string) =>
    refs.classSubjects
      .filter((classSubject) => classSubject.class_id === classId)
      .map((classSubject) => ({
        id: classSubject.subject_master_id,
        name: refs.subjectName(classSubject.subject_master_id),
      }));

  const updateSubjectRow = (key: string, patch: Partial<SubjectAssignmentRow>) => {
    const current = form.subject_assignments.find((row) => row.key === key);
    if (!current) return;
    if (isTakenBy(form.subject_assignments, key, subjectAssignmentKey({ ...current, ...patch }), subjectAssignmentKey)) {
      setRowNotice(key, "hr.wizard.errors.duplicateSubjectAssignment");
      return;
    }
    setRowNotice(key, null);
    onChange({
      subject_assignments: form.subject_assignments.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    });
  };
  const updateClassTeacherRow = (key: string, patch: Partial<ClassTeacherRow>) => {
    const current = form.class_teacher_assignments.find((row) => row.key === key);
    if (!current) return;
    if (isTakenBy(form.class_teacher_assignments, key, classTeacherKey({ ...current, ...patch }), classTeacherKey)) {
      setRowNotice(key, "hr.wizard.errors.duplicateClassTeacher");
      return;
    }
    setRowNotice(key, null);
    onChange({
      class_teacher_assignments: form.class_teacher_assignments.map((row) =>
        row.key === key ? { ...row, ...patch } : row,
      ),
    });
  };

  /** A rejected change (this session) wins over the validator's error for the same row. */
  const rowError = (field: string, key: string) => {
    const message = rejected[key] ?? errors[field];
    return message ? <p className="text-xs text-error">{t(message)}</p> : null;
  };
  /** A save the backend rejected (409 DUPLICATE_*) — pinned to the whole set, not a row. */
  const setError = (field: string) =>
    errors[field] ? (
      <p role="alert" className="text-xs text-error">
        {t(errors[field])}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-secondary">
        {t("hr.wizard.assignments.yearScope", { year: yearName })}
        {carriedFromYearName ? (
          <p className="mt-1 text-xs text-warning">
            {t("hr.wizard.assignments.carriedForward", {
              from: carriedFromYearName,
              year: yearName,
            })}
          </p>
        ) : null}
        {refs.academicUnavailable ? (
          <div className="mt-1">
            <DevBypassNotice />
          </div>
        ) : null}
      </div>

      <StaffStepSection
        title={t("hr.wizard.sections.subjects.title")}
        subtitle={t("hr.wizard.sections.subjects.subtitle")}
        action={
          <Button
            type="button"
            variant="secondary"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={() =>
              onChange({
                subject_assignments: [
                  ...form.subject_assignments,
                  {
                    key: rowKey("subject"),
                    class_id: "",
                    section_id: "",
                    subject_id: "",
                  },
                ],
              })
            }
            className="shrink-0 px-3 text-sm"
          >
            {t("hr.wizard.assignments.addSubject")}
          </Button>
        }
      >
        {setError("subject_assignments")}
        {form.subject_assignments.length === 0 ? (
          <p className="text-sm text-text-muted">{t("hr.wizard.assignments.noSubjects")}</p>
        ) : (
          form.subject_assignments.map((row, index) => {
            const subjectOptions = row.class_id ? subjectsFor(row.class_id) : [];
            return (
              <div key={row.key} className="flex flex-col gap-1">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
                    <SelectField
                      id={`subject-class-${row.key}`}
                      label={t("hr.wizard.fields.class.label")}
                      value={row.class_id}
                      onChange={(event) =>
                        updateSubjectRow(row.key, {
                          class_id: event.target.value,
                          section_id: "",
                          subject_id: "",
                        })
                      }
                    >
                      <option value="" disabled>
                        {t("hr.wizard.fields.class.placeholder")}
                      </option>
                      {classOptions.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      id={`subject-arm-${row.key}`}
                      label={t("hr.wizard.fields.arm.label")}
                      value={row.section_id}
                      disabled={!row.class_id}
                      onChange={(event) =>
                        updateSubjectRow(row.key, {
                          section_id: event.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        {t("hr.wizard.fields.arm.placeholder")}
                      </option>
                      {armsFor(row.class_id).map((section) => (
                        <option
                          key={section.id}
                          value={section.id}
                          disabled={isTakenBy(
                            form.subject_assignments,
                            row.key,
                            subjectAssignmentKey({ section_id: section.id, subject_id: row.subject_id }),
                            subjectAssignmentKey,
                          )}
                        >
                          {section.name}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      id={`subject-subject-${row.key}`}
                      label={t("hr.wizard.fields.subject.label")}
                      value={row.subject_id}
                      disabled={!row.class_id}
                      onChange={(event) =>
                        updateSubjectRow(row.key, {
                          subject_id: event.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        {row.class_id && subjectOptions.length === 0
                          ? t("hr.wizard.fields.subject.noneForClass")
                          : t("hr.wizard.fields.subject.placeholder")}
                      </option>
                      {subjectOptions.map((subject) => (
                        <option
                          key={subject.id}
                          value={subject.id}
                          disabled={isTakenBy(
                            form.subject_assignments,
                            row.key,
                            subjectAssignmentKey({ section_id: row.section_id, subject_id: subject.id }),
                            subjectAssignmentKey,
                          )}
                        >
                          {subject.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <RemoveRowButton
                    label={t("hr.wizard.assignments.removeRow", {
                      index: index + 1,
                    })}
                    onClick={() =>
                      onChange({
                        subject_assignments: form.subject_assignments.filter((item) => item.key !== row.key),
                      })
                    }
                  />
                </div>
                {rowError(`subject_assignments.${row.key}`, row.key)}
              </div>
            );
          })
        )}
      </StaffStepSection>

      <StaffStepSection
        title={t("hr.wizard.sections.classTeacher.title")}
        subtitle={t("hr.wizard.sections.classTeacher.subtitle")}
        action={
          <Button
            type="button"
            variant="secondary"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={() =>
              onChange({
                class_teacher_assignments: [
                  ...form.class_teacher_assignments,
                  {
                    key: rowKey("class-teacher"),
                    class_id: "",
                    section_id: "",
                  },
                ],
              })
            }
            className="shrink-0 px-3 text-sm"
          >
            {t("hr.wizard.assignments.addArm")}
          </Button>
        }
      >
        {setError("class_teacher_assignments")}
        {form.class_teacher_assignments.length === 0 ? (
          <p className="text-sm text-text-muted">{t("hr.wizard.assignments.noArms")}</p>
        ) : (
          form.class_teacher_assignments.map((row, index) => (
            <div key={row.key} className="flex flex-col gap-1">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <SelectField
                    id={`class-teacher-class-${row.key}`}
                    label={t("hr.wizard.fields.class.label")}
                    value={row.class_id}
                    onChange={(event) =>
                      updateClassTeacherRow(row.key, {
                        class_id: event.target.value,
                        section_id: "",
                      })
                    }
                  >
                    <option value="" disabled>
                      {t("hr.wizard.fields.class.placeholder")}
                    </option>
                    {classOptions.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    id={`class-teacher-arm-${row.key}`}
                    label={t("hr.wizard.fields.arm.label")}
                    value={row.section_id}
                    disabled={!row.class_id}
                    onChange={(event) =>
                      updateClassTeacherRow(row.key, {
                        section_id: event.target.value,
                      })
                    }
                  >
                    <option value="" disabled>
                      {t("hr.wizard.fields.arm.placeholder")}
                    </option>
                    {armsFor(row.class_id).map((section) => (
                      <option
                        key={section.id}
                        value={section.id}
                        disabled={isTakenBy(form.class_teacher_assignments, row.key, classTeacherKey({ section_id: section.id }), classTeacherKey)}
                      >
                        {section.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <RemoveRowButton
                  label={t("hr.wizard.assignments.removeRow", {
                    index: index + 1,
                  })}
                  onClick={() =>
                    onChange({
                      class_teacher_assignments: form.class_teacher_assignments.filter((item) => item.key !== row.key),
                    })
                  }
                />
              </div>
              {rowError(`class_teacher_assignments.${row.key}`, row.key)}
            </div>
          ))
        )}
      </StaffStepSection>
    </div>
  );
}
