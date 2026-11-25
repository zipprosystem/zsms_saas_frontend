"use client";

import { useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { isPrimaryParentOf } from "@/lib/parents/parentLinks";
import { parentsQueryKeyRoot, setParentStudents } from "@/lib/parents/parentsApi";
import { PARENT_ADDRESS_KEYS, type Parent, type ParentAddress } from "@/lib/parents/parentTypes";
import {
  EmailActiveIndicator,
  ParentAvatar,
  ParentStatusBadge,
  PrimaryBadge,
  RelationshipBadge,
  SourceLabel,
} from "@/components/parents/ParentBadges";
import { useParentChildren, useParentRecord, useStudentOptions, type ChildLookup } from "@/components/parents/useParentData";

/** Student statuses with a label under parents.studentStatus. */
const STUDENT_STATUS_KEYS = new Set(["active", "graduated", "withdrawn", "suspended", "expelled", "inactive", "draft"]);

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="break-words text-sm text-text-primary">{value === null || value === "" ? "—" : value}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddressBlock({ address }: { address: ParentAddress }) {
  const t = useTranslations("parents.fields.address");
  const filled = PARENT_ADDRESS_KEYS.filter((key) => address[key]);
  if (filled.length === 0) return <p className="text-sm text-text-muted">—</p>;
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {filled.map((key) => (
        <DetailItem key={key} label={t(key)} value={address[key]} />
      ))}
    </dl>
  );
}

type ParentDetailProps = {
  parentId: string;
  canManage: boolean;
  onClose: () => void;
  onEdit: (parent: Parent) => void;
  onDelete: (parent: Parent) => void;
};

/**
 * Parent detail (spec §4): the record + every linked student — siblings
 * grouped under the one parent — with the primary flag per child, and
 * link / unlink (PUT erp/parents/:id with the full student_ids set).
 */
export function ParentDetail({ parentId, canManage, onClose, onEdit, onDelete }: ParentDetailProps) {
  const t = useTranslations();
  const p = useTranslations("parents");
  const format = useFormatter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const record = useParentRecord(parentId);
  const parent = record.data?.ok ? record.data.data : null;
  const lookups = useParentChildren(parent?.student_ids ?? []);
  const students = useStudentOptions(canManage);
  const [linkId, setLinkId] = useState("");
  const [unlinkTarget, setUnlinkTarget] = useState<ChildLookup | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const formatDate = (value: string | null) =>
    value ? format.dateTime(new Date(`${value}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

  const saveLinks = async (studentIds: string[], successKey: "linked" | "unlinked") => {
    if (!parent) return false;
    setIsSaving(true);
    const result = await setParentStudents(parent.id, studentIds);
    setIsSaving(false);
    if (!result.ok) {
      showToast(resultErrorMessage(result, t));
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: parentsQueryKeyRoot });
    showToast(p(`toast.${successKey}`));
    return true;
  };

  const handleLink = async () => {
    if (!parent || !linkId || parent.student_ids.includes(linkId)) return;
    if (await saveLinks([...parent.student_ids, linkId], "linked")) setLinkId("");
  };

  const handleUnlink = async () => {
    if (!parent || !unlinkTarget) return;
    const target = unlinkTarget;
    setUnlinkTarget(null);
    await saveLinks(
      parent.student_ids.filter((id) => id !== target.id),
      "unlinked",
    );
  };

  const linkOptions = students.options
    .filter((option) => !parent?.student_ids.includes(option.id))
    .map((option) => ({
      value: option.id,
      label: option.student_no ? `${option.full_name} · ${option.student_no}` : option.full_name,
    }));

  const unlinkIsPrimary = !!(parent && unlinkTarget?.child && isPrimaryParentOf(parent, unlinkTarget.child));
  const unlinkName = unlinkTarget?.child?.full_name ?? p("children.unavailable");

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <div>
        {canManage && parent ? (
          <button type="button" onClick={() => onDelete(parent)} className="text-sm font-semibold text-error hover:underline">
            {p("actions.delete")}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
        {canManage && parent ? <Button onClick={() => onEdit(parent)}>{p("actions.edit")}</Button> : null}
      </div>
    </div>
  );

  return (
    <WideModal isOpen onClose={onClose} title={parent?.full_name ?? p("detail.title")} subtitle={p("detail.subtitle")} footer={footer}>
      {record.isPending ? (
        <p className="py-10 text-center text-sm text-text-muted">{p("loading")}</p>
      ) : !parent ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-error">
            {record.data && !record.data.ok ? resultErrorMessage(record.data, t) : p("detail.loadError")}
          </p>
          <Button variant="secondary" onClick={() => void record.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <ParentAvatar name={parent.full_name} />
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words text-base font-semibold text-text-primary">{parent.full_name}</span>
                <RelationshipBadge relationship={parent.relationship} />
                <ParentStatusBadge status={parent.status} />
              </div>
              <SourceLabel createdFrom={parent.created_from} />
            </div>
          </div>

          <Section title={p("detail.sections.contact")}>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <DetailItem
                label={p("fields.email")}
                value={
                  parent.email ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="break-all">{parent.email}</span>
                      <EmailActiveIndicator email={parent.email} emailActive={parent.email_active} />
                    </span>
                  ) : null
                }
              />
              <DetailItem label={p("fields.phone")} value={parent.phone} />
              <DetailItem label={p("fields.username")} value={<span className="break-all">{parent.username}</span>} />
              <DetailItem label={p("fields.occupation")} value={parent.occupation} />
              <DetailItem label={p("fields.dateOfBirth")} value={formatDate(parent.date_of_birth)} />
              <DetailItem label={p("fields.weddingAnniversary")} value={formatDate(parent.wedding_anniversary)} />
            </dl>
          </Section>

          <Section title={p("detail.sections.children", { count: parent.student_ids.length })}>
            {lookups.length === 0 ? (
              <p className="text-sm text-text-muted">{p("children.noneLinked")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {lookups.map((lookup) => {
                  const isPrimary = !!lookup.child && isPrimaryParentOf(parent, lookup.child);
                  return (
                    <li key={lookup.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        {lookup.isLoading ? (
                          <span className="h-4 w-40 animate-pulse rounded bg-background" aria-hidden />
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">
                              {lookup.child?.full_name ?? p("children.unavailable")}
                            </span>
                            {isPrimary ? <PrimaryBadge /> : null}
                          </span>
                        )}
                        <span className="text-xs text-text-muted">
                          {lookup.child
                            ? [lookup.child.student_no, STUDENT_STATUS_KEYS.has(lookup.child.status) ? p(`studentStatus.${lookup.child.status}`) : null]
                                .filter(Boolean)
                                .join(" · ")
                            : lookup.failed
                              ? p("children.unavailableHint")
                              : null}
                        </span>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setUnlinkTarget(lookup)}
                          disabled={isSaving}
                          className="text-sm font-semibold text-error hover:underline disabled:opacity-50"
                        >
                          {p("actions.unlink")}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {canManage ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <SearchableSelect
                    id="parent-link-student"
                    label={p("link.label")}
                    placeholder={p("link.placeholder")}
                    options={linkOptions}
                    value={linkId}
                    onChange={setLinkId}
                    onQueryChange={students.setTyped}
                    loading={students.isFetching && linkOptions.length === 0}
                    loadingLabel={p("loading")}
                    noOptionsLabel={students.failed ? p("link.searchFailed") : students.search ? p("link.noMatches") : p("link.typeToSearch")}
                  />
                </div>
                <Button onClick={() => void handleLink()} disabled={!linkId || isSaving}>
                  {isSaving ? t("common.saving") : p("actions.link")}
                </Button>
              </div>
            ) : null}
            <p className="text-xs text-text-muted">{p("primary.derivedNote")}</p>
          </Section>

          <Section title={p("detail.sections.presentAddress")}>
            <AddressBlock address={parent.present_address} />
          </Section>
          <Section title={p("detail.sections.otherAddress")}>
            <AddressBlock address={parent.other_address} />
          </Section>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!unlinkTarget}
        title={p("confirmUnlink.title")}
        message={
          unlinkIsPrimary
            ? p("confirmUnlink.messagePrimary", { child: unlinkName, parent: parent?.full_name ?? "" })
            : p("confirmUnlink.message", { child: unlinkName, parent: parent?.full_name ?? "" })
        }
        confirmLabel={p("actions.unlink")}
        isDangerous
        isConfirming={isSaving}
        onConfirm={() => void handleUnlink()}
        onCancel={() => setUnlinkTarget(null)}
      />
    </WideModal>
  );
}
