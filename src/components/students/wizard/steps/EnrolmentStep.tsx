"use client";

import { useTranslations } from "next-intl";
import { ClassDetailsStep } from "@/components/students/wizard/steps/ClassDetailsStep";
import { StudentDetailsStep } from "@/components/students/wizard/steps/StudentDetailsStep";
import { LoginDetailsSection } from "@/components/students/wizard/LoginDetailsSection";
import type {
  ClassDetailsForm,
  StudentDetailsForm,
  LoginDetailsForm,
  FieldErrors,
} from "@/components/students/wizard/studentFormTypes";

/**
 * Step 1 of 3 — "Enrolment & Student Details". Regroups the original
 * standalone Class Details / Student Details / Login Details steps onto
 * one screen; none of their field logic changed, this is purely a layout
 * container. Login Details moving here (off the old final step) means an
 * admin editing a student reaches the account/password on the FIRST
 * screen instead of the last.
 */
export function EnrolmentStep({
  yearId,
  mode,
  classDetails,
  studentDetails,
  loginDetails,
  errors,
  onClassDetailsChange,
  onStudentDetailsChange,
  onLoginDetailsChange,
}: {
  yearId: string;
  mode: "create" | "edit";
  classDetails: ClassDetailsForm;
  studentDetails: StudentDetailsForm;
  loginDetails: LoginDetailsForm;
  errors: FieldErrors;
  onClassDetailsChange: (patch: Partial<ClassDetailsForm>) => void;
  onStudentDetailsChange: (patch: Partial<StudentDetailsForm>) => void;
  onLoginDetailsChange: (patch: Partial<LoginDetailsForm>) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.classDetails")}</p>
        <ClassDetailsStep yearId={yearId} mode={mode} data={classDetails} errors={errors} onChange={onClassDetailsChange} />
      </section>

      <section className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.studentDetails")}</p>
        <StudentDetailsStep data={studentDetails} errors={errors} onChange={onStudentDetailsChange} />
      </section>

      {/* LoginDetailsSection brings its own top divider/spacing — no extra wrapper needed. */}
      <LoginDetailsSection
        data={loginDetails}
        errors={errors}
        admissionNumber={studentDetails.admission_number}
        onChange={onLoginDetailsChange}
      />
    </div>
  );
}
