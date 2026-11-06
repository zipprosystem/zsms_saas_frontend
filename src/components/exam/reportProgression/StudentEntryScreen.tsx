"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { TextareaField } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { NAV_PERMISSIONS } from "@/lib/auth/navPermissions";
import { assessmentStructuresService } from "@/lib/setup/assessmentConfiguration/assessmentStructuresApi";
import { getStudentMarks, saveStudentMarks, studentMarksQueryKey } from "@/lib/exam/examApi";
import { resultsQueryKeys } from "@/lib/exam/resultsApi";
import {
  getClassProgression,
  isProgressionPoint,
  isPublishStatusFilter,
  reportProgressionQueryKeys,
  type ProgressionPoint,
  type PublishStatusFilter,
} from "@/lib/exam/reportProgression/reportProgressionApi";
import {
  getStudentEntry,
  REMARK_KEYS,
  saveReportFields,
  studentEntryQueryKey,
  type Attendance,
  type Remarks,
  type ReportField,
  type StudentEntry,
} from "@/lib/exam/reportProgression/studentEntryApi";
import { examOptionLabel, failureMessage, InfoItem, MockActingAsPicker, Notice, useMockActingAs, useUnsavedGuard } from "@/components/exam/examEntryShared";
import { reportProgressionClassHref } from "@/components/exam/examTabsConfig";
import { PointSelect, ProgressionBar, useCanSee, useMissingLabel } from "@/components/exam/reportProgression/progressionShared";
import { useStudentMarksEntry } from "@/components/exam/reportProgression/useStudentMarksEntry";

const REMARK_MAX = 500;

type FieldsDraft = { remarks: Remarks; present: string };

function fieldsBaseline(entry: StudentEntry | null): FieldsDraft {
  const remarks = Object.fromEntries(REMARK_KEYS.map((key) => [key, entry?.remarks?.[key] ?? ""])) as Remarks;
  const present = entry?.attendance?.present;
  return { remarks, present: typeof present === "number" ? String(present) : "" };
}

/** "" = not recorded; otherwise a whole number 0..total. NaN = invalid. */
function parsePresent(text: string, total: number): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 && value <= total ? value : Number.NaN;
}

/**
 * Report Progression › View Details (Stage 2, Figma 2499:354994): one
 * student's report for a term × point. The marks table is the subject-wise
 * entry pivoted to this student (useStudentMarksEntry — same grids, drafts,
 * auto-ticks and marks store, so it syncs both ways with Manage Exam Result
 * / Academic Report). Above it, the report-only fields the class's template
 * prints at this point (comments + attendance), editable per DEC-009.
 * Save Changes persists marks + comments + attendance. Scope follows Stage
 * 1: a subject teacher sees only their subject rows and no report fields.
 * URL: ?term&point&status&exam.
 */
export function StudentEntryScreen({ classId, studentId }: { classId: string; studentId: string }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.reportProgression.entry.${key}`, values);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const missingLabel = useMissingLabel();
  const [actingAs, setActingAs] = useMockActingAs();
  const canView = useCanSee(NAV_PERMISSIONS.examReportProgression);

  const term = searchParams.get("term") ?? "";
  const pointParam = searchParams.get("point");
  const point: ProgressionPoint = isProgressionPoint(pointParam) ? pointParam : "ca";
  const statusParam = searchParams.get("status");
  const status: PublishStatusFilter = isPublishStatusFilter(statusParam) ? statusParam : "all";
  const examParam = searchParams.get("exam") ?? "";

  // --- Report context ------------------------------------------------------------
  const entryKey = [...studentEntryQueryKey(studentId, term, point, status), actingAs];
  const entryQuery = useQuery({
    queryKey: entryKey,
    queryFn: () => getStudentEntry(studentId, term, point, status).then(throwIfTransient),
    enabled: canView,
    // A background refetch must never wipe unsaved typing.
    refetchOnWindowFocus: false,
  });
  const entry = entryQuery.data?.ok ? entryQuery.data.data : null;
  const termId = entry?.term_id ?? term;
  const exams = entry?.exams ?? [];
  const examId = exams.some((exam) => exam.id === examParam) ? examParam : (exams[0]?.id ?? "");

  // The scoped class list (same query as the class view) — the "search student" jump.
  const classQuery = useQuery({
    queryKey: [...reportProgressionQueryKeys.classView(classId, termId, point, status), actingAs],
    queryFn: () => getClassProgression(classId, termId, point, status).then(throwIfTransient),
    enabled: canView && !!entry,
  });

  // --- Marks ---------------------------------------------------------------------
  const structuresQuery = useQuery({
    queryKey: assessmentStructuresService.queryKey,
    queryFn: () => assessmentStructuresService.list().then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const sheetKey = [...studentMarksQueryKey(examId, studentId), actingAs];
  const sheetQuery = useQuery({
    queryKey: sheetKey,
    queryFn: () => getStudentMarks(examId, studentId).then(throwIfTransient),
    enabled: canView && !!examId,
    refetchOnWindowFocus: false,
  });
  const sheet = sheetQuery.data?.ok ? sheetQuery.data.data : null;
  const marks = useStudentMarksEntry(sheet, structuresQuery.data?.ok ? structuresQuery.data.data : null);

  // --- Report-only fields --------------------------------------------------------
  const baseline = useMemo(() => fieldsBaseline(entry), [entry]);
  const [fields, setFields] = useState<FieldsDraft>(baseline);
  useEffect(() => setFields(baseline), [baseline]);

  const reportFields = entry?.report_fields ?? [];
  const attendanceField = reportFields.find((field) => field.kind === "attendance") ?? null;
  const commentFields = reportFields.filter((field): field is Extract<ReportField, { kind: "comment" }> => field.kind === "comment");
  // The attendance box goes in front of the class-teacher / form-tutor comment (else the first comment).
  const attendancePairKey = attendanceField && entry?.attendance ? (commentFields.find((field) => field.key === "class_teacher") ?? commentFields[0])?.key : undefined;
  const total = entry?.attendance?.total_sessions ?? 0;
  const presentValue = parsePresent(fields.present, total);
  const presentInvalid = Number.isNaN(presentValue);
  const changedRemarks = commentFields.filter((field) => field.editable && fields.remarks[field.key].trim() !== baseline.remarks[field.key].trim());
  const presentChanged = !!attendanceField?.editable && fields.present.trim() !== baseline.present.trim();
  const fieldsDirty = changedRemarks.length + (presentChanged ? 1 : 0);
  const dirtyCount = marks.dirtyCount + fieldsDirty;
  const invalidCount = marks.invalidCount + (presentChanged && presentInvalid ? 1 : 0);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [traitsDialog, setTraitsDialog] = useState<"psychomotor" | "affective" | null>(null);
  const { guarded, dialog } = useUnsavedGuard(dirtyCount);
  useEffect(() => setSaveError(null), [studentId, termId, point, examId, actingAs]);

  const navigate = (patch: Record<string, string>, basePath = pathname) =>
    guarded(() => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const query = next.toString();
      router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
    });

  const listQuery = new URLSearchParams({ term: termId, point });
  if (status !== "all") listQuery.set("status", status);
  const backHref = `${reportProgressionClassHref(classId)}?${listQuery}`;
  const studentPath = (id: string) => `${reportProgressionClassHref(classId)}/students/${encodeURIComponent(id)}`;

  const handleSave = async () => {
    if (!entry || dirtyCount === 0 || invalidCount > 0) return;
    setSaving(true);
    setSaveError(null);
    const fail = (message: string) => {
      setSaving(false);
      setSaveError(message);
      showToast(message, "error");
    };
    if (marks.dirtyCount > 0 && sheet) {
      const result = await saveStudentMarks(sheet.exam.id, studentId, { class_arm_id: sheet.class_arm_id, rows: marks.saveRows() });
      if (!result.ok) return fail(failureMessage(result, t) ?? t("setup.crudScreen.errors.saveFailed"));
      queryClient.setQueryData(sheetKey, result);
    }
    if (fieldsDirty > 0) {
      const remarks: Partial<Remarks> = Object.fromEntries(changedRemarks.map((field) => [field.key, fields.remarks[field.key].trim()]));
      const result = await saveReportFields(studentId, {
        term_id: entry.term_id,
        point,
        ...(changedRemarks.length > 0 ? { remarks } : {}),
        ...(presentChanged ? { attendance_present: presentValue } : {}),
      });
      if (!result.ok) return fail(failureMessage(result, t) ?? t("setup.crudScreen.errors.saveFailed"));
    }
    setSaving(false);
    showToast(k("toast.saved"));
    // The subject-wise sheets, results, reports and the progression bars all read what was just saved.
    void queryClient.invalidateQueries({ queryKey: ["exam", "marks"] });
    void queryClient.invalidateQueries({ queryKey: resultsQueryKeys.all });
    void queryClient.invalidateQueries({ queryKey: reportProgressionQueryKeys.all });
  };

  if (!canView) return <Notice tone="warning">{t("exam.reportProgression.noAccess")}</Notice>;

  const back = (
    <button
      type="button"
      onClick={() => guarded(() => router.push(backHref))}
      className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline"
    >
      <span aria-hidden>←</span> {k("back")}
    </button>
  );

  if (entryQuery.isPending) return <div className="flex flex-col gap-5">{back}<Notice>{t("exam.marks.loading")}</Notice></div>;
  if (!entry) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <MockActingAsPicker value={actingAs} onChange={setActingAs} />
        <Notice tone={isDevBypassUnavailable(entryQuery.data) ? "warning" : "error"}>
          {failureMessage(entryQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}
        </Notice>
      </div>
    );
  }

  // --- Marks body ------------------------------------------------------------------
  let table: ReactNode;
  if (exams.length === 0) table = <Notice>{k("empty.noExams")}</Notice>;
  else if (sheetQuery.isPending || structuresQuery.isPending) table = <Notice>{t("exam.marks.loading")}</Notice>;
  else if (!sheet) table = <Notice tone="error">{failureMessage(sheetQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}</Notice>;
  else if (marks.blocker) table = <Notice tone={marks.blocker === "noSubjects" ? "muted" : "warning"}>{k(`notices.${marks.blocker}`)}</Notice>;
  else table = marks.grid;

  const summary = marks.summary;
  const { previous, next } = entry.navigation;
  const sections = entry.progression.sections.filter((section) => section.required > 0);
  const selectedExam = exams.find((exam) => exam.id === examId) ?? null;
  const tableTitle = exams.length > 1 && selectedExam ? `${entry.term_name} ${selectedExam.name}` : `${entry.term_name} ${t(`exam.reportProgression.points.${point}`)}`;
  const setPresent = (value: string) => setFields((current) => ({ ...current, present: value }));
  const attendanceBox =
    attendanceField && entry.attendance ? (
      <AttendanceBox attendance={entry.attendance} editable={attendanceField.editable} value={fields.present} invalid={presentInvalid} onChange={setPresent} />
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {back}

      <MockActingAsPicker value={actingAs} onChange={(id) => guarded(() => setActingAs(id))} />

      {/* Toolbar (Figma): find a student · term · point (· exam) … Prev / Next */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-4">
          <SearchableSelect
            id="student-entry-search"
            label={k("search.label")}
            placeholder={k("search.placeholder")}
            options={(classQuery.data?.ok ? classQuery.data.data.items : []).map((row) => ({ value: row.student_id, label: row.student_name, searchText: `${row.admission_no} ${row.arm_name}` }))}
            loading={classQuery.isPending}
            value={studentId}
            onChange={(id) => id && id !== studentId && navigate({}, studentPath(id))}
          />
          <SelectField id="student-entry-term" label={t("exam.marks.filters.term")} value={termId} onChange={(event) => navigate({ term: event.target.value, exam: "" })}>
            {entry.terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <PointSelect id="student-entry-point" value={point} onChange={(value) => navigate({ point: value, exam: "" })} />
          {exams.length > 1 ? (
            <SelectField id="student-entry-exam" label={t("exam.marks.filters.exam")} value={examId} onChange={(event) => navigate({ exam: event.target.value })}>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {examOptionLabel(exam, t)}
                </option>
              ))}
            </SelectField>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={!previous} onClick={() => previous && navigate({}, studentPath(previous.id))} className="h-10 px-3 text-sm" title={previous?.name}>
            ← {k("nav.previous")}
          </Button>
          <span className="whitespace-nowrap text-xs text-text-muted">{k("nav.position", { index: entry.navigation.index + 1, count: entry.navigation.count })}</span>
          <Button type="button" variant="secondary" disabled={!next} onClick={() => next && navigate({}, studentPath(next.id))} className="h-10 px-3 text-sm" title={next?.name}>
            {k("nav.next")} →
          </Button>
        </div>
      </div>

      {/* Student card: identity · marks / subjects summary · trait entries (Exam point) */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <StudentAvatar name={entry.student.name} photoUrl={entry.student.photo_url} />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-text-primary">{entry.student.name}</h2>
                <span className="rounded-md bg-category-amber-tint px-2 py-0.5 text-xs font-medium text-text-primary">
                  {k("classArm", { class: entry.class_name, arm: entry.arm_name })}
                </span>
                <span className="text-xs text-text-muted">{entry.student.admission_no}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
                {summary?.mode === "grade_based" ? (
                  <InfoItem label={k("summary.attainment")} value={k("summary.ofSubjects", { done: summary.attained, total: summary.subjects })} />
                ) : (
                  <>
                    <InfoItem label={k("summary.passMarks")} value={k("summary.marksValue", { marks: summary?.mode === "component_based" ? summary.passMark : "—" })} />
                    <InfoItem label={k("summary.totalMarks")} value={k("summary.marksValue", { marks: summary?.mode === "component_based" ? summary.outOf : "—" })} />
                  </>
                )}
                <InfoItem
                  label={k("summary.subjects")}
                  value={summary ? k("summary.subjectsValue", { count: summary.subjects, done: summary.completed }) : "—"}
                />
              </div>
            </div>
          </div>
          {entry.traits_apply ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => setTraitsDialog("psychomotor")} className="h-10 bg-text-primary px-4 text-sm text-surface hover:opacity-90">
                {k("traits.psychomotor")}
              </Button>
              <Button type="button" onClick={() => setTraitsDialog("affective")} className="h-10 bg-text-primary px-4 text-sm text-surface hover:opacity-90">
                {k("traits.affective")}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs text-text-muted">{k("summary.progression")}</span>
          <ProgressionBar percent={entry.progression.percent} label={k("summary.progressionOf", { name: entry.student.name })} />
          {sections.length > 1 ? (
            <p className="text-xs text-text-muted">
              {sections.map((section) => k("summary.section", { section: k(`sections.${section.key}`), filled: section.filled, required: section.required })).join(" · ")}
            </p>
          ) : null}
          {entry.progression.missing.length > 0 ? (
            <p className="text-xs text-text-secondary">{k("summary.missing", { items: entry.progression.missing.map(missingLabel).join(" · ") })}</p>
          ) : null}
        </div>
      </div>

      {!entry.can_manage ? <Notice>{k("subjectScope")}</Notice> : null}

      {sheet && !sheet.entry_open ? (
        <div role="status" className="rounded-md border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary">
          {t("exam.marks.notices.entryClosed", { date: sheet.exam.entry_closes_on ?? "" })}
        </div>
      ) : null}
      {invalidCount > 0 ? (
        <div role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
          {k("errors.invalidCount", { count: invalidCount })}
        </div>
      ) : null}
      {saveError ? (
        <div role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
          {saveError}
        </div>
      ) : null}

      {/* Marks (the subject-wise grid, one row per subject), then the report-only fields */}
      <section aria-labelledby="student-entry-table-title" className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h3 id="student-entry-table-title" className="text-base font-semibold text-text-primary">{tableTitle}</h3>
          {!marks.readOnly ? <p className="text-xs text-text-muted">{t("exam.marks.info.autoTick")}</p> : null}
        </div>
        {table}

        {/* Exactly what the template prints at this point; the attendance box sits in front of the class-teacher comment (§7.23). */}
        {reportFields.length > 0 ? (
          <div aria-labelledby="report-fields-title" className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-0.5">
              <h4 id="report-fields-title" className="text-sm font-semibold text-text-primary">{k("fields.title")}</h4>
              <p className="text-xs text-text-muted">{k("fields.subtitle")}</p>
            </div>
            {attendanceBox && commentFields.length === 0 ? attendanceBox : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {commentFields.map((field) => {
                const comment = (
                  <CommentField
                    field={field}
                    value={fields.remarks[field.key]}
                    onChange={(value) => setFields((current) => ({ ...current, remarks: { ...current.remarks, [field.key]: value } }))}
                  />
                );
                if (field.key !== attendancePairKey || !attendanceBox) return <div key={field.key} className="min-w-0">{comment}</div>;
                return (
                  <div key={field.key} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start md:col-span-2">
                    {attendanceBox}
                    <div className="min-w-0 flex-1">{comment}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {!marks.readOnly || reportFields.some((field) => field.editable) ? (
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">{dirtyCount > 0 ? k("saveBar.unsaved", { count: dirtyCount }) : k("saveBar.allSaved")}</p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={dirtyCount === 0 || saving}
              onClick={() => {
                marks.discard();
                setFields(baseline);
              }}
              className="h-10 px-4 text-sm"
            >
              {k("saveBar.discard")}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={dirtyCount === 0 || invalidCount > 0 || saving} className="h-10 px-4 text-sm">
              {saving ? t("common.saving") : k("saveBar.save")}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={traitsDialog !== null}
        title={traitsDialog ? k(`traits.${traitsDialog}`) : ""}
        message={k("traits.comingSoon")}
        confirmLabel={k("traits.close")}
        onConfirm={() => setTraitsDialog(null)}
        onCancel={() => setTraitsDialog(null)}
      />
      {dialog}
    </div>
  );
}

function CommentField({ field, value, onChange }: { field: Extract<ReportField, { kind: "comment" }>; value: string; onChange: (value: string) => void }) {
  const t = useTranslations("exam.reportProgression.entry.fields");
  const id = `report-comment-${field.key}`;
  return (
    <div className="flex flex-col gap-1">
      <TextareaField
        id={id}
        label={t(`roles.${field.role}`)}
        value={value}
        maxLength={REMARK_MAX}
        rows={3}
        readOnly={!field.editable}
        disabled={!field.editable}
        placeholder={field.editable ? t("placeholder") : t("empty")}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="text-xs text-text-muted">
        {field.editable ? t("count", { count: value.length, max: REMARK_MAX }) : t(field.key === "class_teacher" ? "readOnlyClassTeacher" : "readOnlyOther")}
      </span>
    </div>
  );
}

/** Present-count entry; total and absent are derived (open days × sessions per day; total − present). */
function AttendanceBox({
  attendance,
  editable,
  value,
  invalid,
  onChange,
}: {
  attendance: Attendance;
  editable: boolean;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("exam.reportProgression.entry.attendance");
  const parsed = value.trim() && !invalid ? Number(value) : null;
  const absent = parsed === null ? null : attendance.total_sessions - parsed;
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 md:w-56">
      <label htmlFor="report-attendance-present" className="text-sm font-medium text-text-primary">
        {t("label")}
      </label>
      <div className="flex items-center gap-2">
        <input
          id="report-attendance-present"
          type="number"
          inputMode="numeric"
          min={0}
          max={attendance.total_sessions}
          step={1}
          value={value}
          disabled={!editable}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          className={`h-10 w-24 rounded-md border bg-surface px-2 text-center text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
            invalid ? "border-error text-error" : "border-border"
          }`}
        />
        <span className="text-sm text-text-secondary">{t("outOf", { total: attendance.total_sessions })}</span>
      </div>
      <span className="text-xs text-text-muted">{t("absent", { absent: absent ?? "—" })}</span>
      <span className="text-xs text-text-muted">{t("basis", { days: attendance.open_days, sessions: attendance.sessions_per_day })}</span>
      {invalid ? <span className="text-xs text-error">{t("invalid", { total: attendance.total_sessions })}</span> : null}
      {!editable ? <span className="text-xs text-text-muted">{t("readOnly")}</span> : null}
    </div>
  );
}

function StudentAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL / signed photo URL, not an optimizable static asset
    return <img src={photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  }
  const initials = name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2);
  return (
    <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-accent">
      {initials}
    </span>
  );
}
