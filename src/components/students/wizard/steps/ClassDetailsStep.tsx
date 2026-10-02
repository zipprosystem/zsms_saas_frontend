"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { schoolTypesService, type SchoolType } from "@/lib/setup/academicStructure/schoolTypesApi";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import { classTermsQueryKey, fetchTermsForClass, findActiveClassTerm, type ClassTerm } from "@/lib/setup/academicStructure/classTermsApi";
import { MOCK_HOUSES, MOCK_BOARDING_HOUSES, MOCK_EXTRA_CURRICULAR } from "@/lib/students/studentsMockData";
import { isBoardingHouseVisible } from "@/lib/students/studentsTableHelpers";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import type { ClassDetailsForm } from "@/components/students/wizard/studentFormTypes";
import type { FieldErrors } from "@/components/students/wizard/studentFormTypes";

export function ClassDetailsStep({
  yearId,
  mode,
  data,
  errors,
  onChange,
}: {
  yearId: string;
  /** EDIT: class/arm/term enrolment fields lock to read-only (see the file-level note below) — everything else here stays editable either way. */
  mode: "create" | "edit";
  data: ClassDetailsForm;
  errors: FieldErrors;
  onChange: (patch: Partial<ClassDetailsForm>) => void;
}) {
  const t = useTranslations();
  const { activeYear } = useAcademicYear();
  // school_mode is real/confirmed (academicYearsApi.ts) — this only
  // defaults to "both" while activeYear itself is still null (loading, or
  // no active year yet), never because the field might be missing.
  const boardingHouseAllowed = isBoardingHouseVisible(activeYear?.school_mode ?? "both");

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
  // Unfiltered — needed to resolve the read-only EDIT display's arm name
  // even if that section has since been deactivated; `sections` (active
  // only) is what the CREATE-mode dropdown's options are drawn from.
  const allSections: Section[] = data.class_id && sectionsQuery.data?.ok ? sectionsQuery.data.data : [];
  const sections: Section[] = allSections.filter((s) => s.is_active);
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
  // user never touches this field themselves. Skipped entirely in EDIT
  // mode: these fields are read-only there (CLASS DETAILS READ-ONLY AFTER
  // SAVE, below), so this effect has no field to write into and must not
  // silently mutate a saved student's enrolment out from under them.
  useEffect(() => {
    if (mode === "edit" || !data.class_id || data.class_term_id || terms.length === 0) return;
    const activeTerm = findActiveClassTerm(terms);
    if (activeTerm) onChange({ class_term_id: activeTerm.id });
    // onChange intentionally omitted — StudentWizard hands down a fresh
    // closure each render; including it would re-run this every keystroke
    // elsewhere in the form, which is harmless here but needless churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.class_id, data.class_term_id, terms]);

  // CLASS DETAILS READ-ONLY AFTER SAVE: once a student is saved, their
  // class/arm/term placement belongs to the Student Term Details
  // enrolment record (single source of truth) — the profile only DISPLAYS
  // it from then on; changing it happens on that screen instead, not here.
  // Only applies to these 4 fields; House/Mode/Boarding House/Extra-
  // curricular/Login stay editable in edit mode same as always.
  if (mode === "edit") {
    const schoolTypeName = schoolTypes.find((type) => type.id === data.school_type_id)?.name ?? "—";
    const className = classes.find((cls) => cls.id === data.class_id)?.name ?? "—";
    const armName = allSections.find((section) => section.id === data.class_arm_id)?.name ?? "—";
    const termName = terms.find((term) => term.id === data.class_term_id)?.term_name ?? "—";

    return (
      <div className="flex flex-col gap-5">
        <InputField id="wizard-school-type" label={t("students.wizard.fields.schoolType.label")} value={schoolTypeName} disabled readOnly />
        <InputField id="wizard-class" label={t("students.wizard.fields.class.label")} value={className} disabled readOnly />
        <InputField id="wizard-class-arm" label={t("students.wizard.fields.classArm.label")} value={armName} disabled readOnly />
        <InputField id="wizard-class-term" label={t("students.wizard.fields.classTerm.label")} value={termName} disabled readOnly />
        <p className="text-xs text-text-muted">
          {t("students.wizard.classDetails.readOnlyNote")}{" "}
          <Link href="/admin/setup/academic-structure/student-term-details" className="font-semibold text-accent hover:underline">
            {t("students.wizard.classDetails.readOnlyLink")}
          </Link>
        </p>

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
            onChange={(values) =>
              onChange({ mode: (values[0] as ClassDetailsForm["mode"]) ?? "", boarding_house_id: values[0] === "boarding" ? data.boarding_house_id : "" })
            }
            hasError={!!errors.mode}
            error={errors.mode ? t(errors.mode) : undefined}
          />
        </div>

        {boardingHouseAllowed && data.mode === "boarding" ? (
          <SelectField
            id="wizard-boarding-house"
            label={t("students.wizard.fields.boardingHouse.label")}
            value={data.boarding_house_id}
            onChange={(event) => onChange({ boarding_house_id: event.target.value })}
          >
            <option value="">{t("students.wizard.fields.boardingHouse.placeholder")}</option>
            {MOCK_BOARDING_HOUSES.map((house) => (
              <option key={house.id} value={house.id}>
                {house.name}
              </option>
            ))}
          </SelectField>
        ) : null}

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
          onChange={(values) =>
            onChange({ mode: (values[0] as ClassDetailsForm["mode"]) ?? "", boarding_house_id: values[0] === "boarding" ? data.boarding_house_id : "" })
          }
          hasError={!!errors.mode}
          error={errors.mode ? t(errors.mode) : undefined}
        />
      </div>

      {boardingHouseAllowed && data.mode === "boarding" ? (
        <SelectField
          id="wizard-boarding-house"
          label={t("students.wizard.fields.boardingHouse.label")}
          value={data.boarding_house_id}
          onChange={(event) => onChange({ boarding_house_id: event.target.value })}
        >
          <option value="">{t("students.wizard.fields.boardingHouse.placeholder")}</option>
          {MOCK_BOARDING_HOUSES.map((house) => (
            <option key={house.id} value={house.id}>
              {house.name}
            </option>
          ))}
        </SelectField>
      ) : null}

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
