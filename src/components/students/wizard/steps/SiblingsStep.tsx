"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { MultiSearchableSelect } from "@/components/ui/MultiSearchableSelect";
import { listStudents, studentsQueryKey } from "@/lib/students/studentsApi";
import { studentFullName } from "@/lib/students/studentsTableHelpers";
import type { SiblingsForm } from "@/components/students/wizard/studentFormTypes";

/** Entirely optional — links existing students as siblings. Auto-linking to the same parent/guardian account is a later increment, not built here. */
export function SiblingsStep({
  data,
  onChange,
  excludeStudentId,
}: {
  data: SiblingsForm;
  onChange: (patch: Partial<SiblingsForm>) => void;
  excludeStudentId?: string;
}) {
  const t = useTranslations();

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: () => listStudents(),
    staleTime: 0,
  });
  const students = studentsQuery.data?.ok ? studentsQuery.data.data : [];
  const candidates = students.filter((student) => student.id !== excludeStudentId);

  return (
    <div className="flex flex-col gap-5">
      <MultiSearchableSelect
        id="wizard-siblings"
        label={t("students.wizard.fields.siblings.label")}
        placeholder={t("students.wizard.fields.siblings.placeholder")}
        options={candidates.map((student) => ({
          value: student.id,
          label: studentFullName(student),
          searchText: student.admission_number ?? "",
        }))}
        value={data.sibling_student_ids}
        onChange={(sibling_student_ids) => onChange({ sibling_student_ids })}
        noOptionsLabel={t("onboarding.common.noResults")}
      />
    </div>
  );
}
