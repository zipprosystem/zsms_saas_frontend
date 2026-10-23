"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { listStudentStatusEvents, studentStatusEventsQueryKey } from "@/lib/students/studentsApi";
import { actorNamesByUserId, listStaff, staffQueryKey } from "@/lib/staff/staffApi";
import {
  genderLabelKey,
  modeLabelKey,
  resolveArmName,
  resolveClassName,
  studentFullName,
} from "@/lib/students/studentsTableHelpers";
import type { SchoolClass } from "@/lib/setup/academicStructure/classesApi";
import type { Section } from "@/lib/setup/academicStructure/sectionsApi";
import type { Student, StudentStatus, StudentStatusEvent } from "@/lib/students/studentTypes";

const KNOWN_STATUSES: readonly string[] = ["active", "graduated", "withdrawn", "suspended", "expelled", "draft", "inactive"];

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="break-words text-sm text-text-primary">{value || "—"}</dd>
    </div>
  );
}

function asKnownStatus(value: string | null): StudentStatus | null {
  return value && KNOWN_STATUSES.includes(value) ? (value as StudentStatus) : null;
}

/** One event: to_status is the outcome (there's no category field). actorName is null when acted_by_user_id can't be resolved — a raw id is never shown. */
function StatusEventRow({ event, actorName }: { event: StudentStatusEvent; actorName: string | null }) {
  const t = useTranslations();
  const toStatus = asKnownStatus(event.to_status);
  const fromStatus = asKnownStatus(event.from_status);

  return (
    <li className="flex flex-col gap-1 border-l-2 border-border py-1 pl-4">
      <div className="flex flex-wrap items-center gap-2">
        {toStatus ? <StudentStatusBadge status={toStatus} /> : <span className="text-sm font-medium">—</span>}
        {fromStatus ? (
          <span className="text-xs text-text-muted">
            {t("students.view.history.from", { status: t(`students.status.${fromStatus}`) })}
          </span>
        ) : null}
        {actorName ? <span className="text-xs text-text-muted">{t("students.view.history.by", { name: actorName })}</span> : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-muted">
        {event.effective_on ? <span>{t("students.view.history.effectiveOn", { date: event.effective_on })}</span> : null}
        {event.created_at ? (
          <span>{t("students.view.history.recordedOn", { date: event.created_at.slice(0, 10) })}</span>
        ) : null}
      </div>
      {event.reason ? <p className="break-words text-sm text-text-secondary">{event.reason}</p> : null}
    </li>
  );
}

/**
 * Read-only student profile — what "View" opens (Edit opens the wizard).
 * Includes the status-change history (GET /:id/status-events, oldest
 * first — shown in that order, as a timeline), fetched fresh each time the
 * panel opens. Edit is offered from here only for an
 * ACTIVE student; any other status isn't editable backend-side
 * (STUDENT_NOT_EDITABLE).
 */
export function StudentViewPanel({
  student,
  classes,
  sections,
  onClose,
  onEdit,
}: {
  student: Student;
  classes: SchoolClass[];
  sections: Section[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations();

  const historyQuery = useQuery({
    queryKey: studentStatusEventsQueryKey(student.id),
    queryFn: () => listStudentStatusEvents(student.id).then(throwIfTransient),
    staleTime: 0,
  });
  const events = historyQuery.data?.ok ? historyQuery.data.data : [];

  // acted_by_user_id is a users.id — matched against the lookup's user_id
  // (NOT its id, which is staff.id under Option B).
  // too, so it doubles as the name lookup. Anyone not in it (no access,
  // a non-staff actor, dev bypass) just shows no "by" line.
  const staffQuery = useQuery({ queryKey: staffQueryKey, queryFn: listStaff, enabled: events.length > 0 });
  const staffNames = actorNamesByUserId(staffQuery.data ?? []);

  const primary = student.primary_contact ? student[student.primary_contact] : (student.guardian ?? student.father ?? student.mother);

  return (
    <WideModal
      isOpen
      onClose={onClose}
      title={studentFullName(student) || "—"}
      subtitle={student.student_id ?? undefined}
      footer={
        <>
          <div />
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={onClose} className="px-4 text-sm">
              {t("common.close")}
            </Button>
            {student.status === "active" ? (
              <Button type="button" onClick={onEdit} className="px-4 text-sm">
                {t("students.actions.edit")}
              </Button>
            ) : null}
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-4">
          <StudentStatusBadge status={student.status} />
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label={t("students.wizard.fields.studentId.label")} value={student.student_id ?? ""} />
            <DetailItem label={t("students.columns.admissionNumber")} value={student.admission_number ?? ""} />
            <DetailItem label={t("students.columns.class")} value={resolveClassName(student.class_id, classes)} />
            <DetailItem label={t("students.columns.arm")} value={resolveArmName(student.class_arm_id, sections)} />
            <DetailItem label={t("students.columns.mode")} value={t(modeLabelKey(student))} />
            <DetailItem label={t("students.columns.gender")} value={t(genderLabelKey(student))} />
            <DetailItem label={t("students.columns.dob")} value={student.date_of_birth} />
            <DetailItem label={t("students.wizard.fields.email.label")} value={student.email ?? ""} />
            <DetailItem label={t("students.wizard.login.username.label")} value={student.username} />
            <DetailItem label={t("students.columns.guardianPhone")} value={primary?.phone ?? ""} />
          </dl>
        </section>

        <section className="flex flex-col gap-3 border-t border-border pt-6">
          <p className="text-sm font-semibold text-text-primary">{t("students.view.history.title")}</p>
          {historyQuery.isPending ? (
            <p className="text-sm text-text-muted">{t("setup.dataTable.loading")}</p>
          ) : isDevBypassUnavailable(historyQuery.data) ? (
            <DevBypassNotice />
          ) : historyQuery.isError || (historyQuery.data && !historyQuery.data.ok) ? (
            <p className="text-sm text-error">{t("students.view.history.loadError")}</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-text-muted">{t("students.view.history.empty")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {events.map((event, index) => (
                <StatusEventRow
                  // No event id in the contract; the list is append-only and oldest-first, so index is stable.
                  key={index}
                  event={event}
                  actorName={(event.acted_by_user_id && staffNames.get(event.acted_by_user_id)) || null}
                />
              ))}
            </ol>
          )}
        </section>
      </div>
    </WideModal>
  );
}
