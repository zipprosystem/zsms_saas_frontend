"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { SubjectSearchSelect } from "@/components/hr/wizard/sections/SubjectSearchSelect";
import { useHrReferenceData, type HrReferenceData } from "@/components/hr/useHrReferenceData";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { isDevBypassUnavailable, throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import {
  assignmentReviewsQueryKey,
  discardAssignmentReview,
  listAssignmentReviews,
  remapAssignmentReview,
  staffListQueryKeyRoot,
} from "@/lib/hr/staffRecordsApi";
import type { AssignmentReviewItem } from "@/lib/hr/hrTypes";

const KNOWN_REASONS = new Set(["CLASS_NOT_FOUND", "ARM_NOT_FOUND", "SUBJECT_NOT_OFFERED"]);

/** Shared with the Staff list's banner — same cache entry. */
export function useAssignmentReviewsQuery(yearId: string | null) {
  return useQuery({
    queryKey: assignmentReviewsQueryKey(yearId),
    queryFn: () => listAssignmentReviews(yearId!).then(throwIfTransient),
    enabled: !!yearId,
  });
}

/**
 * HR › Assignment Review — carried-forward subject / class-teacher
 * assignments the backend couldn't match into the selected (new) academic
 * year, e.g. the arm was renamed or the class no longer offers the
 * subject. The backend keeps them aside; here an admin remaps each one to
 * this year's class / arm (/ subject) or discards it. Nothing is written
 * to the new year until one of those happens.
 *
 * The remap pickers start from a DERIVED suggestion — this year's class
 * and arm with the same names as the old ones, and the same subject — so
 * a simple rename is one click. Real API only (dev-bypass: notice).
 */
export function AssignmentReviewScreen() {
  const t = useTranslations();
  const { years, selectedYearId } = useAcademicYear();
  const refs = useHrReferenceData(selectedYearId);
  const reviewsQuery = useAssignmentReviewsQuery(selectedYearId);
  const yearName = (id: string | null) => years.find((year) => year.id === id)?.name ?? null;

  const result = reviewsQuery.data;
  const items = result?.ok ? result.data : [];

  let body: React.ReactNode;
  if (!selectedYearId) {
    body = <EmptyNote>{t("hr.assignmentReview.noYear")}</EmptyNote>;
  } else if (reviewsQuery.isPending) {
    body = <EmptyNote>{t("hr.common.loading")}</EmptyNote>;
  } else if (reviewsQuery.isError) {
    body = (
      <EmptyNote tone="error">
        <p>{t("setup.dataTable.errors.loadFailed")}</p>
        <Button type="button" variant="secondary" onClick={() => reviewsQuery.refetch()} className="mx-auto mt-3 h-9 px-4 text-sm">
          {t("common.retry")}
        </Button>
      </EmptyNote>
    );
  } else if (result && !result.ok) {
    body = (
      <EmptyNote tone={isDevBypassUnavailable(result) ? "muted" : "error"}>
        {isDevBypassUnavailable(result) ? t("setup.crudScreen.errors.devBypassUnavailable") : resultErrorMessage(result, t)}
      </EmptyNote>
    );
  } else if (items.length === 0) {
    body = <EmptyNote>{t("hr.assignmentReview.empty", { year: yearName(selectedYearId) ?? "" })}</EmptyNote>;
  } else {
    body = (
      <ul className="flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.id}>
            <ReviewCard item={item} refs={refs} fromYearName={yearName(item.from_academic_year_id)} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{t("hr.assignmentReview.title")}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("hr.assignmentReview.subtitle", { year: yearName(selectedYearId) ?? t("hr.wizard.assignments.selectedYear") })}
        </p>
      </div>
      {result?.ok && items.length > 0 ? (
        <p className="text-sm text-text-secondary">{t("hr.assignmentReview.count", { count: items.length })}</p>
      ) : null}
      {body}
    </div>
  );
}

function EmptyNote({ tone = "muted", children }: { tone?: "muted" | "error"; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-border bg-surface px-5 py-8 text-center text-sm ${tone === "error" ? "text-error" : "text-text-muted"}`}>
      {children}
    </div>
  );
}

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function ReviewCard({ item, refs, fromYearName }: { item: AssignmentReviewItem; refs: HrReferenceData; fromYearName: string | null }) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const activeClasses = refs.classes.filter((cls) => cls.is_active);
  const suggestedClass = activeClasses.find((cls) => sameName(cls.name, item.class_name))?.id ?? "";
  const armsFor = (classId: string) => refs.sections.filter((section) => section.class_id === classId && section.is_active);
  const suggestedArm = suggestedClass ? (armsFor(suggestedClass).find((arm) => sameName(arm.name, item.section_name))?.id ?? "") : "";

  const [classId, setClassId] = useState(suggestedClass);
  const [sectionId, setSectionId] = useState(suggestedArm);
  const [subjectId, setSubjectId] = useState(item.kind === "subject" ? (item.subject_id ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<"remap" | "discard" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Reference data arrives after first render — adopt the suggestion once it can be computed, unless the admin already chose.
  if (!classId && suggestedClass) setClassId(suggestedClass);
  if (classId === suggestedClass && !sectionId && suggestedArm) setSectionId(suggestedArm);

  const isSubject = item.kind === "subject";
  const canRemap = !!classId && !!sectionId && (!isSubject || !!subjectId);

  const finish = (result: CrudResult<void>, successKey: string) => {
    setWorking(null);
    if (!result.ok) {
      const message =
        result.kind === "validation" ? (result.errors[0]?.message ?? t("hr.assignmentReview.errors.duplicate")) : resultErrorMessage(result, t);
      setError(message);
      return;
    }
    showToast(t(successKey));
    queryClient.invalidateQueries({ queryKey: staffListQueryKeyRoot });
  };

  const remap = async () => {
    if (!canRemap) return;
    setWorking("remap");
    setError(null);
    finish(
      await remapAssignmentReview(item.id, { class_id: classId, section_id: sectionId, ...(isSubject ? { subject_id: subjectId } : {}) }),
      "hr.assignmentReview.toast.remapped",
    );
  };

  const discard = async () => {
    setConfirmDiscard(false);
    setWorking("discard");
    setError(null);
    finish(await discardAssignmentReview(item.id), "hr.assignmentReview.toast.discarded");
  };

  const was = [item.class_name, item.section_name].filter(Boolean).join(" ");
  const reasonKey = item.reason && KNOWN_REASONS.has(item.reason) ? `hr.assignmentReview.reasons.${item.reason}` : "hr.assignmentReview.reasons.other";

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">{item.staff_name || "—"}</p>
          <p className="mt-0.5 text-sm text-text-secondary">
            {isSubject
              ? t("hr.assignmentReview.wasSubject", { subject: item.subject_name ?? "—", arm: was || "—" })
              : t("hr.assignmentReview.wasClassTeacher", { arm: was || "—" })}
            {fromYearName ? ` · ${t("hr.assignmentReview.fromYear", { year: fromYearName })}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-category-amber-tint px-2.5 py-1 text-xs font-medium text-warning">{t(reasonKey)}</span>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${isSubject ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <SelectField
          id={`review-class-${item.id}`}
          label={t("hr.wizard.fields.class.label")}
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setSectionId("");
          }}
        >
          <option value="" disabled>
            {t("hr.wizard.fields.class.placeholder")}
          </option>
          {activeClasses.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={`review-arm-${item.id}`}
          label={t("hr.wizard.fields.arm.label")}
          value={sectionId}
          disabled={!classId}
          onChange={(event) => setSectionId(event.target.value)}
        >
          <option value="" disabled>
            {t("hr.wizard.fields.arm.placeholder")}
          </option>
          {armsFor(classId).map((arm) => (
            <option key={arm.id} value={arm.id}>
              {arm.name}
            </option>
          ))}
        </SelectField>
        {isSubject ? (
          <SubjectSearchSelect
            id={`review-subject-${item.id}`}
            yearId={item.academic_year_id}
            classId={classId}
            value={subjectId}
            valueName={item.subject_name}
            onChange={setSubjectId}
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => setConfirmDiscard(true)} disabled={working !== null} className="h-10 px-4 text-sm">
          {working === "discard" ? t("common.saving") : t("hr.assignmentReview.discard")}
        </Button>
        <Button type="button" onClick={() => void remap()} disabled={!canRemap || working !== null} className="h-10 px-4 text-sm">
          {working === "remap" ? t("common.saving") : t("hr.assignmentReview.remap")}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={confirmDiscard}
        title={t("hr.assignmentReview.discardConfirm.title")}
        message={t("hr.assignmentReview.discardConfirm.message", { name: item.staff_name || "—" })}
        isDangerous
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => void discard()}
      />
    </div>
  );
}
