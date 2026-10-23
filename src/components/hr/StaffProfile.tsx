"use client";

import { useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import { useAcademicYear } from "@/lib/academicYear/AcademicYearContext";
import { useCountries, useStates } from "@/lib/onboarding/location/hooks";
import { throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import { SCHOOL_TWO_FACTOR_ENABLED } from "@/lib/hr/schoolSecurity";
import {
  getStaff,
  issueStaffCredentials,
  listStaffStatusEvents,
  resetStaffCredentials,
  setStaffLoginActive,
  staffFullName,
  staffListQueryKeyRoot,
  staffRecordQueryKey,
  staffStatusEventsQueryKey,
} from "@/lib/hr/staffRecordsApi";
import { isLeaverStatus, passwordSetupFor, type Staff, type StaffAddress, type StaffStatusEventType } from "@/lib/hr/hrTypes";
import { actorNamesByUserId, listStaff, staffQueryKey } from "@/lib/staff/staffApi";
import { useHrReferenceData } from "@/components/hr/useHrReferenceData";
import { ClassArmChip, StaffAvatar, StaffStatusBadge } from "@/components/hr/StaffBadges";

/**
 * The backend's default password — shown ONLY for staff without a usable
 * email (they can't receive a set-password link). The UI never shows,
 * stores or exports any other password.
 */
const DEFAULT_PASSWORD = "123456";

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="break-words text-sm text-text-primary">{value === null || value === "" ? "—" : value}</dd>
    </div>
  );
}

function ProfileSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddressView({ address }: { address: StaffAddress | null }) {
  const { countries } = useCountries();
  const { states } = useStates(address?.country_code ?? "");
  if (!address) return <p className="text-sm text-text-muted">—</p>;
  const country = countries.find((item) => item.code === address.country_code)?.name ?? address.country_code;
  const state = states.find((item) => item.code === address.state_code)?.name ?? address.state_code;
  return (
    <p className="text-sm text-text-primary">
      {[address.address_line, address.city, state, country, address.postal_code].filter(Boolean).join(", ") || "—"}
      {address.mobile ? <span className="block text-xs text-text-muted">{address.mobile}</span> : null}
    </p>
  );
}

type StaffProfileProps = {
  staffId: string;
  onClose: () => void;
  onEdit: (staff: Staff) => void;
  onResume: (staff: Staff) => void;
  onStatusAction: (staff: Staff, action: StaffStatusEventType) => void;
};

/**
 * Read-only staff profile (opened from a list row), mirroring the wizard's
 * sections. Teaching assignments are the staff's OWN rows for the header's
 * selected year (no data-scope roll-up — that's backend-computed later).
 * The Login section carries the credential actions — HYBRID by email: a
 * staff with a valid email gets a secure set-password link (Issue / Send
 * new link); one without gets the default password 123456 (Issue / Reset
 * to default). Forced-change copy shows only when the school has 2FA on.
 * No real password is ever shown or exported. Status history names who
 * recorded each event via acted_by_user_id -> the lookup's user_id.
 * Always loaded fresh (its own query, under the staff root key), so any
 * status / credential / edit change refreshes it.
 */
export function StaffProfile({ staffId, onClose, onEdit, onResume, onStatusAction }: StaffProfileProps) {
  const t = useTranslations();
  const format = useFormatter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { years, selectedYearId } = useAcademicYear();
  const refs = useHrReferenceData(selectedYearId);

  const staffQuery = useQuery({
    queryKey: staffRecordQueryKey(staffId, selectedYearId),
    queryFn: () => getStaff(staffId, selectedYearId).then(throwIfTransient),
  });
  const eventsQuery = useQuery({
    queryKey: staffStatusEventsQueryKey(staffId),
    queryFn: () => listStaffStatusEvents(staffId).then(throwIfTransient),
  });
  const staff = staffQuery.data?.ok ? staffQuery.data.data : null;
  const events = eventsQuery.data?.ok ? eventsQuery.data.data : [];
  // Actor names: acted_by_user_id is a users.id, matched on the lookup's
  // user_id — the one place user_id is used (Option B).
  const lookupQuery = useQuery({
    queryKey: staffQueryKey,
    queryFn: listStaff,
    enabled: events.some((event) => !event.acted_by_name && !!event.acted_by_user_id),
  });
  const actorNames = actorNamesByUserId(lookupQuery.data ?? []);
  const actorName = (event: (typeof events)[number]) =>
    event.acted_by_name ?? (event.acted_by_user_id ? (actorNames.get(event.acted_by_user_id) ?? null) : null);

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueUsername, setIssueUsername] = useState("");
  const [issueError, setIssueError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const formatDate = (value: string | null) =>
    value ? format.dateTime(new Date(value), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";
  const yearName = (id: string | null) => years.find((year) => year.id === id)?.name ?? null;

  /** Shared tail of every credential action. */
  const finishCredentialAction = (result: CrudResult<Staff>, successKey: string): boolean => {
    if (!result.ok) {
      if (result.kind === "validation" && result.errors[0]?.field === "username") {
        setIssueError(result.errors[0].code === "USERNAME_TAKEN" ? t("hr.wizard.errors.usernameTaken") : (result.errors[0].message ?? t("hr.wizard.errors.invalidField")));
        return false;
      }
      showToast(resultErrorMessage(result, t));
      return false;
    }
    queryClient.invalidateQueries({ queryKey: staffListQueryKeyRoot });
    showToast(t(successKey));
    return true;
  };

  const handleIssue = async () => {
    if (!staff) return;
    setIsWorking(true);
    const result = await issueStaffCredentials(staff.id, issueUsername.trim() || null);
    setIsWorking(false);
    if (finishCredentialAction(result, "hr.profile.login.toast.issued")) setIssueOpen(false);
  };

  const handleReset = async () => {
    if (!staff) return;
    setIsWorking(true);
    const result = await resetStaffCredentials(staff.id);
    setIsWorking(false);
    setResetOpen(false);
    finishCredentialAction(result, viaLink ? "hr.profile.login.toast.linkSent" : "hr.profile.login.toast.reset");
  };

  const handleToggleLogin = async (active: boolean) => {
    if (!staff) return;
    setIsWorking(true);
    const result = await setStaffLoginActive(staff.id, active);
    setIsWorking(false);
    finishCredentialAction(result, active ? "hr.profile.login.toast.activated" : "hr.profile.login.toast.deactivated");
  };

  const footer = staff ? (
    <>
      <div className="flex flex-wrap gap-2">
        {staff.status === "active" || staff.status === "suspended" ? (
          <StatusButton label={t("hr.status.leaver.menu")} onClick={() => onStatusAction(staff, "leaver")} />
        ) : null}
        {isLeaverStatus(staff.status) ? (
          <StatusButton label={t("hr.status.reinstate.menu")} onClick={() => onStatusAction(staff, "reinstate")} neutral />
        ) : null}
      </div>
      {staff.status === "draft" ? (
        <Button type="button" onClick={() => onResume(staff)} className="px-4 text-sm">
          {t("hr.staffs.actions.resume")}
        </Button>
      ) : (
        <Button type="button" onClick={() => onEdit(staff)} className="px-4 text-sm">
          {t("common.edit")}
        </Button>
      )}
    </>
  ) : (
    <span />
  );

  const subjectsBySubject = staff
    ? Array.from(
        staff.subject_assignments.reduce((map, row) => map.set(row.subject_id, [...(map.get(row.subject_id) ?? []), row]), new Map<string, Staff["subject_assignments"]>()),
      )
    : [];
  const armLabel = (classId: string, sectionId: string) =>
    t("hr.staffs.classArm", { className: refs.className(classId), armName: refs.armName(sectionId) });
  const credentialsIssued = !!staff?.credentials_issued_at;
  const setup = staff ? passwordSetupFor(staff) : "default_password";
  const viaLink = setup === "email_link";

  return (
    <>
      <WideModal
        isOpen
        onClose={onClose}
        title={staff ? staffFullName(staff) || t("hr.profile.untitled") : t("hr.profile.title")}
        subtitle={staff?.staff_no ?? undefined}
        size="2xl"
        footer={footer}
      >
        {staffQuery.isPending ? (
          <p className="py-10 text-center text-sm text-text-muted">{t("hr.common.loading")}</p>
        ) : !staff ? (
          <p className="py-10 text-center text-sm text-error">{t("hr.profile.loadError")}</p>
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="scale-150 p-2">
                <StaffAvatar staff={staff} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-text-primary">
                    {[staff.title ? t(`hr.wizard.titles.${staff.title}`) : null, staffFullName(staff)].filter(Boolean).join(" ")}
                  </span>
                  <StaffStatusBadge status={staff.status} />
                </div>
                <p className="text-sm text-text-secondary">
                  {[staff.staff_no, refs.postName(staff.post_id), t(`hr.staffs.tabs.${staff.staff_type}`)].filter((part) => part && part !== "—").join(" · ")}
                </p>
                <p className="text-sm text-text-muted">
                  {staff.department_ids.length ? staff.department_ids.map(refs.departmentName).join(", ") : t("hr.profile.noDepartments")}
                </p>
                {staff.status !== "active" && staff.status !== "draft" && staff.status_reason ? (
                  <p className="text-xs text-warning">
                    {t("hr.profile.statusNote", {
                      status: t(`hr.staffs.status.${staff.status}`),
                      date: formatDate(staff.status_effective_date),
                      reason: staff.status_reason,
                    })}
                  </p>
                ) : null}
              </div>
            </div>

            <ProfileSection title={t("hr.wizard.sections.details.title")}>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <DetailItem label={t("hr.wizard.fields.initials.label")} value={staff.initials} />
                <DetailItem label={t("hr.wizard.fields.otherName.label")} value={staff.other_name} />
                <DetailItem label={t("hr.wizard.fields.email.label")} value={staff.email} />
                <DetailItem label={t("hr.wizard.fields.gender.label")} value={staff.gender ? t(`hr.wizard.fields.gender.${staff.gender}`) : null} />
                <DetailItem label={t("hr.wizard.fields.dateOfBirth.label")} value={formatDate(staff.date_of_birth)} />
                <DetailItem label={t("hr.wizard.fields.dateJoined.label")} value={formatDate(staff.date_joined)} />
                <DetailItem label={t("hr.wizard.fields.nationalId.label")} value={staff.national_id} />
              </dl>
            </ProfileSection>

            {staff.staff_type === "teaching" ? (
              <ProfileSection title={t("hr.wizard.sections.assignments.title")}>
                {!selectedYearId ? (
                  <p className="text-sm text-text-muted">{t("hr.profile.assignments.noYear")}</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-text-muted">
                      {t("hr.profile.assignments.forYear", { year: yearName(selectedYearId) ?? t("hr.wizard.assignments.selectedYear") })}
                      {staff.assignments_carried_forward_from
                        ? ` ${t("hr.profile.assignments.carried", { from: yearName(staff.assignments_carried_forward_from) ?? t("hr.wizard.assignments.priorYear") })}`
                        : ""}
                    </p>
                    {refs.academicUnavailable ? <DevBypassNotice /> : null}
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <DetailItem
                        label={t("hr.wizard.sections.subjects.title")}
                        value={
                          subjectsBySubject.length === 0 ? null : (
                            <span className="flex flex-col gap-2">
                              {subjectsBySubject.map(([subjectId, rows]) => (
                                <span key={subjectId} className="flex flex-col gap-1">
                                  {refs.subjectName(subjectId)}
                                  <span className="flex flex-wrap gap-1">
                                    {rows.map((row) => (
                                      <ClassArmChip key={`${row.class_id}-${row.section_id}`} label={armLabel(row.class_id, row.section_id)} colorIndex={refs.classIndex(row.class_id)} />
                                    ))}
                                  </span>
                                </span>
                              ))}
                            </span>
                          )
                        }
                      />
                      <DetailItem
                        label={t("hr.wizard.sections.classTeacher.title")}
                        value={
                          staff.class_teacher_assignments.length === 0 ? null : (
                            <span className="flex flex-wrap gap-1">
                              {staff.class_teacher_assignments.map((row) => (
                                <ClassArmChip key={`${row.class_id}-${row.section_id}`} label={armLabel(row.class_id, row.section_id)} colorIndex={refs.classIndex(row.class_id)} />
                              ))}
                            </span>
                          )
                        }
                      />
                    </dl>
                  </div>
                )}
              </ProfileSection>
            ) : null}

            <ProfileSection title={t("hr.wizard.sections.groups.title")}>
              {staff.permission_group_ids.length === 0 ? (
                <p className="text-sm text-text-muted">{t("hr.profile.noGroups")}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {staff.permission_group_ids.map((id) => (
                    <span key={id} className="rounded-full bg-accent-2 px-3 py-1 text-xs font-medium text-accent">
                      {refs.groups.find((group) => group.id === id)?.name ?? t("hr.profile.unknownGroup")}
                    </span>
                  ))}
                </div>
              )}
            </ProfileSection>

            <ProfileSection title={t("hr.wizard.steps.address")}>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailItem label={t("hr.wizard.sections.presentAddress.title")} value={<AddressView address={staff.present_address} />} />
                <DetailItem
                  label={t("hr.wizard.sections.permanentAddress.title")}
                  value={staff.permanent_same_as_present ? t("hr.wizard.fields.sameAsPresent.label") : <AddressView address={staff.permanent_address} />}
                />
              </dl>
            </ProfileSection>

            <ProfileSection title={t("hr.wizard.steps.background")}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <BackgroundList
                  title={t("hr.wizard.sections.qualifications.title")}
                  empty={t("hr.wizard.background.noQualifications")}
                  rows={staff.qualifications.map((q) => ({
                    primary: [q.degree, q.stream].filter(Boolean).join(" — "),
                    secondary: [q.institution ?? q.board, q.year, q.result].filter(Boolean).join(" · "),
                  }))}
                />
                <BackgroundList
                  title={t("hr.wizard.sections.references.title")}
                  empty={t("hr.wizard.background.noReferences")}
                  rows={staff.references.map((r) => ({
                    primary: r.name ?? "",
                    secondary: [r.designation, r.organization, r.phone, r.email].filter(Boolean).join(" · "),
                  }))}
                />
                <BackgroundList
                  title={t("hr.wizard.sections.experience.title")}
                  empty={t("hr.wizard.background.noExperience")}
                  rows={staff.experience.map((e) => ({
                    primary: [e.role, e.organization].filter(Boolean).join(" — "),
                    secondary: [e.tenure_from, e.tenure_to].filter(Boolean).join(" → "),
                  }))}
                />
              </div>
            </ProfileSection>

            <ProfileSection title={t("hr.wizard.sections.compensation.title")}>
              <p className="text-sm text-text-muted">{t("hr.wizard.compensation.placeholder")}</p>
            </ProfileSection>

            <ProfileSection
              title={t("hr.wizard.sections.login.title")}
              action={
                staff.status === "draft" ? null : credentialsIssued ? (
                  <Button type="button" variant="secondary" onClick={() => setResetOpen(true)} disabled={isWorking} className="h-9 px-3 text-sm">
                    {viaLink ? t("hr.profile.login.sendLink") : t("hr.profile.login.reset")}
                  </Button>
                ) : staff.status === "active" ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setIssueUsername(staff.username ?? staff.email ?? "");
                      setIssueError(null);
                      setIssueOpen(true);
                    }}
                    className="h-9 px-3 text-sm"
                  >
                    {t("hr.profile.login.issue")}
                  </Button>
                ) : null
              }
            >
              {staff.status === "draft" ? (
                <p className="text-sm text-text-muted">{t("hr.profile.login.draft")}</p>
              ) : !credentialsIssued ? (
                <p className="text-sm text-text-muted">
                  {staff.status === "active" ? t("hr.profile.login.notIssued") : t("hr.profile.login.notIssuedInactive")}
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <DetailItem label={t("hr.wizard.fields.username.label")} value={staff.username} />
                    <DetailItem label={t("hr.profile.login.issuedAt")} value={formatDate(staff.credentials_issued_at)} />
                    <DetailItem label={t("hr.profile.login.resetAt")} value={staff.password_reset_at ? formatDate(staff.password_reset_at) : t("hr.profile.login.neverReset")} />
                    {/* How the password is set — never the password itself (the UI never knows it). */}
                    <DetailItem
                      label={t("hr.profile.login.password")}
                      value={
                        viaLink
                          ? t("hr.credentials.method.emailLink", { email: staff.email ?? "" })
                          : t("hr.credentials.method.defaultPassword", { password: DEFAULT_PASSWORD })
                      }
                    />
                  </dl>
                  <Toggle
                    id="profile-login-active"
                    label={t("hr.wizard.fields.loginActive.label")}
                    helper={staff.status === "active" ? t("hr.wizard.fields.loginActive.helper") : t("hr.profile.login.offWhileInactive")}
                    checked={staff.login_active}
                    onChange={(checked) => {
                      if (isWorking) return;
                      if (checked && staff.status !== "active") {
                        showToast(t("hr.profile.login.offWhileInactive"));
                        return;
                      }
                      void handleToggleLogin(checked);
                    }}
                  />
                  {SCHOOL_TWO_FACTOR_ENABLED ? <p className="text-xs text-text-muted">{t("hr.credentials.forcedChange")}</p> : null}
                </div>
              )}
            </ProfileSection>

            <ProfileSection title={t("hr.profile.history.title")}>
              {events.length === 0 ? (
                <p className="text-sm text-text-muted">{t("hr.profile.history.empty")}</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {[...events].reverse().map((event, index) => (
                    <li key={`${event.created_at}-${index}`} className="flex flex-col gap-1 border-l-2 border-border py-1 pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {event.to_status ? <StaffStatusBadge status={event.to_status} /> : null}
                        <span className="text-sm font-medium text-text-primary">
                          {event.type === "leaver" && event.category
                            ? t("hr.status.leaver.event", { category: t(`hr.status.category.${event.category}`) })
                            : t("hr.status.reinstate.event")}
                        </span>
                      </div>
                      {event.reason ? <p className="text-sm text-text-secondary">{event.reason}</p> : null}
                      <p className="text-xs text-text-muted">
                        {t("hr.profile.history.dates", { effective: formatDate(event.effective_date), recorded: formatDate(event.created_at) })}
                        {actorName(event) ? ` · ${t("hr.profile.history.by", { name: actorName(event) ?? "" })}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </ProfileSection>
          </div>
        )}
      </WideModal>

      {issueOpen && staff ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIssueOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-labelledby="issue-credentials-title" className="relative flex w-full max-w-md flex-col gap-4 rounded-xl bg-surface p-6 shadow-xl">
            <div>
              <h2 id="issue-credentials-title" className="text-base font-semibold text-text-primary">
                {t("hr.profile.login.issueTitle")}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {viaLink
                  ? t("hr.profile.login.issueMessageLink", { email: staff.email ?? "" })
                  : t("hr.profile.login.issueMessage", { password: DEFAULT_PASSWORD })}
              </p>
            </div>
            <InputField
              id="issue-username"
              label={t("hr.wizard.fields.username.label")}
              placeholder={t("hr.wizard.fields.username.placeholder")}
              value={issueUsername}
              onChange={(event) => {
                setIssueUsername(event.target.value);
                setIssueError(null);
              }}
              hasError={!!issueError}
              error={issueError ?? undefined}
            />
            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setIssueOpen(false)} className="h-10 px-4 text-sm">
                {t("common.cancel")}
              </Button>
              <Button type="button" onClick={() => void handleIssue()} disabled={isWorking} className="h-10 px-4 text-sm">
                {isWorking ? t("common.saving") : t("hr.profile.login.issue")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={resetOpen}
        title={viaLink ? t("hr.profile.login.sendLinkTitle") : t("hr.profile.login.resetTitle")}
        message={
          viaLink
            ? t("hr.profile.login.sendLinkMessage", { name: staff ? staffFullName(staff) : "", email: staff?.email ?? "" })
            : t("hr.profile.login.resetMessage", { name: staff ? staffFullName(staff) : "", password: DEFAULT_PASSWORD })
        }
        isConfirming={isWorking}
        onConfirm={() => void handleReset()}
        onCancel={() => setResetOpen(false)}
      />
    </>
  );
}

function StatusButton({ label, onClick, neutral }: { label: string; onClick: () => void; neutral?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors hover:bg-background ${
        neutral ? "border-border text-text-primary" : "border-error text-error"
      }`}
    >
      {label}
    </button>
  );
}

function BackgroundList({ title, empty, rows }: { title: string; empty: string; rows: Array<{ primary: string; secondary: string }> }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-xs font-medium text-text-muted">{title}</span>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={index} className="rounded-md border border-border px-3 py-2">
              <p className="text-sm text-text-primary">{row.primary || "—"}</p>
              {row.secondary ? <p className="text-xs text-text-muted">{row.secondary}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
