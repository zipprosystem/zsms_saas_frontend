"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CheckboxList } from "@/components/setup/CheckboxList";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { createClassesService, type SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import { fetchSectionsForClass, sectionsQueryKey, type Section } from "@/lib/setup/academicStructure/sectionsApi";
import { classTermsQueryKey, fetchTermsForClass, type ClassTerm, type TermType } from "@/lib/setup/academicStructure/classTermsApi";
import { classSubjectsQueryKey, fetchClassSubjectsForYear, type ClassSubject } from "@/lib/setup/academicStructure/classSubjectsApi";
import { subjectsMasterService, type SubjectMaster } from "@/lib/setup/academicStructure/subjectsMasterApi";
import {
  createStudentTermDetailService,
  type StudentTermDetail,
} from "@/lib/setup/academicStructure/studentTermDetailsApi";
import { listStudents, studentsQueryKey } from "@/lib/students/studentsApi";
import type { Student } from "@/lib/students/studentTypes";
import { studentFullName } from "@/lib/students/studentsTableHelpers";
import { enrolStudentsInElectives, subjectEnrolmentsQueryKey } from "@/lib/setup/academicStructure/subjectEnrolmentApi";

type EnrolSubjectsModalProps = {
  yearId: string;
  termType: TermType;
  onClose: () => void;
};

/**
 * Enrol New — a single scrollable form (not a literal multi-step wizard),
 * per Matthew's confirmed approach: each of the four sections below is
 * compact enough that step-gating would add friction without benefit.
 * Always targets the screen's currently-filtered term type, resolved per
 * class (a ClassTerm is a per-class row — see classTermsApi.ts).
 */
export function EnrolSubjectsModal({ yearId, termType, onClose }: EnrolSubjectsModalProps) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [classId, setClassId] = useState("");
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [electiveIds, setElectiveIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const classesService = createClassesService(yearId);
  const classesQuery = useQuery({
    queryKey: classesService.queryKey,
    queryFn: () => classesService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const activeClasses: SchoolClass[] = classesQuery.data?.ok ? classesQuery.data.data.filter((cls) => cls.is_active) : [];

  const sectionsQuery = useQuery({
    queryKey: classId ? sectionsQueryKey(classId) : ["setup", "sections", "class", "none"],
    queryFn: () => fetchSectionsForClass(classId).then(throwIfTransient),
    enabled: !!classId,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const sectionsForClass: Section[] =
    classId && sectionsQuery.data?.ok ? sectionsQuery.data.data.filter((section) => section.is_active) : [];

  const termsQuery = useQuery({
    queryKey: classId ? classTermsQueryKey(classId) : ["setup", "classTerms", "class", "none"],
    queryFn: () => fetchTermsForClass(classId).then(throwIfTransient),
    enabled: !!classId,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const termsForClass: ClassTerm[] = classId && termsQuery.data?.ok ? termsQuery.data.data : [];
  const resolvedTerm = termsForClass.find((term) => term.term_type === termType) ?? null;

  const classSubjectsQuery = useQuery({
    queryKey: classSubjectsQueryKey(yearId),
    queryFn: () => fetchClassSubjectsForYear(yearId).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const classSubjects: ClassSubject[] = classSubjectsQuery.data?.ok ? classSubjectsQuery.data.data : [];
  const classSubjectsForClass = classSubjects.filter((cs) => cs.class_id === classId);
  const coreSubjects = classSubjectsForClass.filter((cs) => cs.subject_group === "Core");
  const electiveSubjects = classSubjectsForClass.filter((cs) => cs.subject_group === "Elective");

  const subjectsMasterQuery = useQuery({
    queryKey: subjectsMasterService.queryKey,
    queryFn: () => subjectsMasterService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const subjectsMaster: SubjectMaster[] = subjectsMasterQuery.data?.ok ? subjectsMasterQuery.data.data : [];
  const subjectName = (subjectMasterId: string) => subjectsMaster.find((s) => s.id === subjectMasterId)?.name ?? "—";

  const termDetailService = createStudentTermDetailService(yearId);
  const termDetailsQuery = useQuery({
    queryKey: termDetailService.queryKey,
    queryFn: () => termDetailService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const termDetails: StudentTermDetail[] = termDetailsQuery.data?.ok ? termDetailsQuery.data.data : [];

  const studentsQuery = useQuery({
    queryKey: studentsQueryKey,
    queryFn: () => listStudents(),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const students: Student[] = studentsQuery.data?.ok ? studentsQuery.data.data : [];
  const studentById = (id: string) => students.find((s) => s.id === id) ?? null;

  const eligibleTermDetails = resolvedTerm
    ? termDetails.filter((row) => row.class_term_id === resolvedTerm.id && sectionIds.includes(row.section_id))
    : [];
  const eligibleStudents = eligibleTermDetails
    .map((row) => ({ row, student: studentById(row.student_id) }))
    .filter((entry): entry is { row: StudentTermDetail; student: Student } => !!entry.student && entry.student.status === "active");

  const handleSubmit = async () => {
    setTouched(true);
    if (!classId || sectionIds.length === 0 || studentIds.length === 0 || !resolvedTerm) return;

    setIsSubmitting(true);
    const result = await enrolStudentsInElectives({
      academic_year_id: yearId,
      class_term_id: resolvedTerm.id,
      students: eligibleStudents
        .filter((entry) => studentIds.includes(entry.student.id))
        .map((entry) => ({ student_id: entry.student.id, section_id: entry.row.section_id })),
      elective_class_subject_ids: electiveIds,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      showToast(t("setup.subjectEnrolment.enrolModal.failed"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: subjectEnrolmentsQueryKey(yearId) });
    showToast(t("setup.subjectEnrolment.enrolModal.success", { count: result.data.created_count }));
    onClose();
  };

  return (
    <WideModal
      isOpen
      onClose={onClose}
      title={t("setup.subjectEnrolment.enrolModal.title")}
      subtitle={t("setup.subjectEnrolment.enrolModal.subtitle")}
      size="xl"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? t("setup.subjectEnrolment.enrolModal.submitting") : t("setup.subjectEnrolment.enrolModal.submit")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary" htmlFor="enrol-class">
            {t("setup.subjectEnrolment.enrolModal.fields.class")}
          </label>
          <select
            id="enrol-class"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setSectionIds([]);
              setElectiveIds([]);
              setStudentIds([]);
            }}
            className="h-12 w-full rounded-md border border-border bg-surface px-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">{t("setup.subjectEnrolment.enrolModal.fields.classPlaceholder")}</option>
            {activeClasses.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          {touched && !classId ? <p className="text-sm text-error">{t("setup.subjectEnrolment.enrolModal.errors.classRequired")}</p> : null}
        </div>

        {classId ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{t("setup.subjectEnrolment.enrolModal.fields.arms")}</span>
            {sectionsForClass.length === 0 ? (
              <p className="text-xs text-text-muted">
                {t("setup.subjectEnrolment.enrolModal.fields.armsEmptyHint")}{" "}
                <Link href="/admin/setup/academic-structure/class-arms" className="font-semibold text-accent hover:underline">
                  {t("setup.subjectEnrolment.enrolModal.fields.armsEmptyHintLink")}
                </Link>
              </p>
            ) : (
              <CheckboxList
                options={sectionsForClass.map((section) => ({ id: section.id, label: section.name }))}
                selectedIds={sectionIds}
                onChange={(ids) => {
                  setSectionIds(ids);
                  setStudentIds([]);
                }}
                selectAllLabel={t("setup.subjectEnrolment.enrolModal.fields.selectAllArms")}
              />
            )}
            {touched && sectionIds.length === 0 ? (
              <p className="text-sm text-error">{t("setup.subjectEnrolment.enrolModal.errors.armsRequired")}</p>
            ) : null}
          </div>
        ) : null}

        {classId ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">{t("setup.subjectEnrolment.enrolModal.fields.coreSubjects")}</span>
              {coreSubjects.length === 0 ? (
                <p className="text-xs text-text-muted">{t("setup.subjectEnrolment.enrolModal.fields.coreEmptyHint")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {coreSubjects.map((cs) => (
                    <span key={cs.id} className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-text-muted">
                      {subjectName(cs.subject_master_id)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-text-muted">{t("setup.subjectEnrolment.enrolModal.fields.coreNote")}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-primary">{t("setup.subjectEnrolment.enrolModal.fields.electiveSubjects")}</span>
              {electiveSubjects.length === 0 ? (
                <p className="text-xs text-text-muted">{t("setup.subjectEnrolment.enrolModal.fields.electiveEmptyHint")}</p>
              ) : (
                <CheckboxList
                  options={electiveSubjects.map((cs) => ({ id: cs.id, label: subjectName(cs.subject_master_id) }))}
                  selectedIds={electiveIds}
                  onChange={setElectiveIds}
                  selectAllLabel={t("setup.subjectEnrolment.enrolModal.fields.selectAllElectives")}
                />
              )}
            </div>
          </div>
        ) : null}

        {classId && sectionIds.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{t("setup.subjectEnrolment.enrolModal.fields.students")}</span>
            {!resolvedTerm ? (
              <p className="text-xs text-text-muted">
                {t("setup.subjectEnrolment.enrolModal.fields.noTermHint")}{" "}
                <Link href="/admin/setup/academic-structure/class-terms" className="font-semibold text-accent hover:underline">
                  {t("setup.subjectEnrolment.enrolModal.fields.noTermHintLink")}
                </Link>
              </p>
            ) : eligibleStudents.length === 0 ? (
              <p className="text-xs text-text-muted">
                {t("setup.subjectEnrolment.enrolModal.fields.studentsEmptyHint")}{" "}
                <Link href="/admin/setup/academic-structure/student-term-details" className="font-semibold text-accent hover:underline">
                  {t("setup.subjectEnrolment.enrolModal.fields.studentsEmptyHintLink")}
                </Link>
              </p>
            ) : (
              <CheckboxList
                options={eligibleStudents.map((entry) => ({
                  id: entry.student.id,
                  label: studentFullName(entry.student) || "—",
                }))}
                selectedIds={studentIds}
                onChange={setStudentIds}
                selectAllLabel={t("setup.subjectEnrolment.enrolModal.fields.selectAllStudents")}
              />
            )}
            {touched && resolvedTerm && eligibleStudents.length > 0 && studentIds.length === 0 ? (
              <p className="text-sm text-error">{t("setup.subjectEnrolment.enrolModal.errors.studentsRequired")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </WideModal>
  );
}
