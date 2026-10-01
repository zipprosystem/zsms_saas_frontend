"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import { classTermsQueryKey, fetchTermsForClass, type ClassTerm } from "@/lib/setup/academicStructure/classTermsApi";
import { MOCK_HOUSES, MOCK_EXTRA_CURRICULAR } from "@/lib/students/studentsMockData";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import type { ClassDetailsForm } from "@/components/students/wizard/studentFormTypes";
import type { FieldErrors } from "@/components/students/wizard/studentFormTypes";

/** Today's date is compared against each term's [start_date, end_date] — ClassTerm has no is_active/is_current flag. */
function findActiveTermId(terms: ClassTerm[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return terms.find((term) => term.start_date <= today && today <= term.end_date)?.id ?? "";
}

export function ClassDetailsStep({
  yearId,
  data,
  errors,
  onChange,
}: {
  yearId: string;
  data: ClassDetailsForm;
  errors: FieldErrors;
  onChange: (patch: Partial<ClassDetailsForm>) => void;
}) {
  const t = useTranslations();

  const schoolTypesQuery = useQuery({
    queryKey: schoolTypesService.queryKey,
    queryFn: () => schoolTypesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const schoolTypes: SchoolType[] = schoolTypesQuery.data?.ok ? schoolTypesQuery.data.data : [];
  const schoolTypesDevBypass = isDevBypassUnavailable(schoolTypesQuery.data);

  const classesService = createClassesService(yearId);
  const classesQuery = useQuery({
    queryKey: classesService.queryKey,
    queryFn: () => classesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classes: SchoolClass[] = classesQuery.data?.ok ? classesQuery.data.data : [];
  const classesDevBypass = isDevBypassUnavailable(classesQuery.data);
  const activeClassesOfType = classes.filter(
    (cls) => cls.is_active && (!data.school_type_id || cls.school_type_id === data.school_type_id),
  );

  const sectionsQuery = useQuery({
    queryKey: data.class_id ? sectionsQueryKey(data.class_id) : ["setup", "sections", "class", "none"],
    queryFn: () => fetchSectionsForClass(data.class_id).then(throwIfTransient),
    enabled: !!data.class_id,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const sections: Section[] = data.class_id && sectionsQuery.data?.ok ? sectionsQuery.data.data.filter((s) => s.is_active) : [];
  const sectionsDevBypass = isDevBypassUnavailable(sectionsQuery.data);

  const termsQuery = useQuery({
    queryKey: data.class_id ? classTermsQueryKey(data.class_id) : ["setup", "classTerms", "class", "none"],
    queryFn: () => fetchTermsForClass(data.class_id).then(throwIfTransient),
    enabled: !!data.class_id,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const terms: ClassTerm[] = data.class_id && termsQuery.data?.ok ? termsQuery.data.data : [];
  const termsDevBypass = isDevBypassUnavailable(termsQuery.data);

  // Default to the active term by date (ClassTerm has no is_active flag) —
  // committed into form state via onChange, not just shown as the select's
  // visual value, so it actually satisfies validateClassDetails() if the
  // user never touches this field themselves.
  useEffect(() => {
    if (!data.class_id || data.class_term_id || terms.length === 0) return;
    const activeId = findActiveTermId(terms);
    if (activeId) onChange({ class_term_id: activeId });
    // onChange intentionally omitted — StudentWizard hands down a fresh
    // closure each render; including it would re-run this every keystroke
    // elsewhere in the form, which is harmless here but needless churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.class_id, data.class_term_id, terms]);

  return (
    <div className="flex flex-col gap-5">
      <SelectField
        id="wizard-school-type"
        label={t("students.wizard.fields.schoolType.label")}
        value={data.school_type_id}
        onChange={(event) => onChange({ school_type_id: event.target.value, class_id: "", class_arm_id: "", class_term_id: "" })}
        hasError={!!errors.school_type_id}
        error={errors.school_type_id ? t(errors.school_type_id) : undefined}
      >
        <option value="" disabled>
          {t("students.wizard.fields.schoolType.placeholder")}
        </option>
        {schoolTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </SelectField>
      {schoolTypesDevBypass ? <DevBypassNotice /> : null}

      <SelectField
        id="wizard-class"
        label={t("students.wizard.fields.class.label")}
        value={data.class_id}
        onChange={(event) => onChange({ class_id: event.target.value, class_arm_id: "", class_term_id: "" })}
        disabled={!data.school_type_id}
        hasError={!!errors.class_id}
        error={errors.class_id ? t(errors.class_id) : undefined}
      >
        <option value="" disabled>
          {t("students.wizard.fields.class.placeholder")}
        </option>
        {activeClassesOfType.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.name}
          </option>
        ))}
      </SelectField>
      {classesDevBypass ? <DevBypassNotice /> : null}

      <SelectField
        id="wizard-class-arm"
        label={t("students.wizard.fields.classArm.label")}
        value={data.class_arm_id}
        onChange={(event) => onChange({ class_arm_id: event.target.value })}
        disabled={!data.class_id}
        hasError={!!errors.class_arm_id}
        error={errors.class_arm_id ? t(errors.class_arm_id) : undefined}
      >
        <option value="" disabled>
          {data.class_id && sections.length === 0 && !sectionsQuery.isLoading && !sectionsDevBypass
            ? t("students.wizard.fields.classArm.empty")
            : t("students.wizard.fields.classArm.placeholder")}
        </option>
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </SelectField>
      {sectionsDevBypass ? <DevBypassNotice /> : null}

      <SelectField
        id="wizard-class-term"
        label={t("students.wizard.fields.classTerm.label")}
        value={data.class_term_id}
        onChange={(event) => onChange({ class_term_id: event.target.value })}
        disabled={!data.class_id}
        hasError={!!errors.class_term_id}
        error={errors.class_term_id ? t(errors.class_term_id) : undefined}
      >
        <option value="" disabled>
          {data.class_id && terms.length === 0 && !termsQuery.isLoading && !termsDevBypass
            ? t("students.wizard.fields.classTerm.empty")
            : t("students.wizard.fields.classTerm.placeholder")}
        </option>
        {terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.term_name}
          </option>
        ))}
      </SelectField>
      {termsDevBypass ? <DevBypassNotice /> : null}

      <SelectField
        id="wizard-academic-house"
        label={t("students.wizard.fields.academicHouse.label")}
        value={data.academic_house_id}
        onChange={(event) => onChange({ academic_house_id: event.target.value })}
      >
        <option value="">{t("students.wizard.fields.academicHouse.none")}</option>
        {MOCK_HOUSES.map((house) => (
          <option key={house.id} value={house.id}>
            {house.name}
          </option>
        ))}
      </SelectField>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">{t("students.wizard.fields.mode.label")}</span>
        <ChipGroup
          multiple={false}
          options={[
            { value: "day", label: t("students.mode.day") },
            { value: "boarding", label: t("students.mode.boarding") },
          ]}
          value={data.mode ? [data.mode] : []}
          onChange={(values) => onChange({ mode: (values[0] as ClassDetailsForm["mode"]) ?? "" })}
          hasError={!!errors.mode}
          error={errors.mode ? t(errors.mode) : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">{t("students.wizard.fields.extraCurricular.label")}</span>
        <ChipGroup
          multiple
          options={MOCK_EXTRA_CURRICULAR.map((activity) => ({ value: activity.id, label: activity.name }))}
          value={data.extra_curricular_ids}
          onChange={(values) => onChange({ extra_curricular_ids: values })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">{t("students.wizard.fields.fee.label")}</span>
        <p className="rounded-md border border-border bg-background px-4 py-3 text-sm text-text-muted">
          {t("students.wizard.fields.fee.pending")}
        </p>
      </div>
    </div>
  );
}
