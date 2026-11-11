"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { NAV_PERMISSIONS } from "@/lib/auth/navPermissions";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { failureMessage, MockActingAsPicker, Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { reportProgressionClassHref } from "@/components/exam/examTabsConfig";
import { reportProgressionQueryKeys, type ProgressionPoint } from "@/lib/exam/reportProgression/reportProgressionApi";
import {
  blockedReason,
  channelCarries,
  getSendRecipients,
  isSendable,
  reachable,
  SEND_CHANNELS,
  sendResultsToParents,
  sendToParentQueryKeys,
  type ChannelDispatch,
  type SendChannel,
  type SendOutcome,
  type SendRecipient,
} from "@/lib/exam/reportProgression/sendToParentApi";
import { SearchBox, StudentAvatar, useCanSee } from "@/components/exam/reportProgression/progressionShared";

const TH = "px-3 py-3 text-left text-xs font-semibold text-text-secondary align-middle";
const TD = "px-3 py-3 align-middle";

/**
 * Report Progression › Send Result to Parent (Stage 4; no Figma frame —
 * built from the brief). The class's students for the term + point (the
 * class view's scope), each with the parent's email and phone (the phone
 * serves WhatsApp and SMS). Only published reports on rows the caller
 * manages can be ticked. The Email / WhatsApp / SMS channels apply to the
 * whole send; a row missing a contact is skipped for that channel. Email
 * and WhatsApp carry the PDF file, SMS a link to it. What each channel
 * actually does comes from the backend (sendToParentApi.ts): email and SMS
 * are "recorded" until dispatch lands; WhatsApp is framework only.
 */

const DEFAULT_DISPATCH: Record<SendChannel, ChannelDispatch> = { email: "recorded", whatsapp: "unavailable", sms: "recorded" };
export function SendToParentScreen({ classId, term, point }: { classId: string; term: string; point: ProgressionPoint }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.reportProgression.send.${key}`, values);
  const p = (key: string, values?: Record<string, string | number>) => t(`exam.reportProgression.${key}`, values);
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [actingAs, setActingAs] = useMockActingAs();

  const canSend = useCanSee(NAV_PERMISSIONS.examReportProgressionSend);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<Set<SendChannel>>(new Set<SendChannel>(["email"]));
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setSelected(new Set()), [classId, term, point, actingAs]);

  const query = useQuery({
    queryKey: [...sendToParentQueryKeys.recipients(classId, term, point), actingAs],
    queryFn: () => getSendRecipients(classId, term, point).then(throwIfTransient),
    enabled: canSend,
  });
  const data = query.data?.ok ? query.data.data : null;
  const termId = data?.term_id ?? term;
  const dispatch: Record<SendChannel, ChannelDispatch> = { ...DEFAULT_DISPATCH, ...data?.channels };
  const channelName = (channel: SendChannel) => k(`channels.${channel}`);
  const channelList = (list: SendChannel[]) => format.list(list.map(channelName), { type: "conjunction" });

  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (data?.items ?? [])
        .map((row, index) => ({ row, serial: index + 1 }))
        .filter(
          ({ row }) =>
            !needle ||
            [row.student_name, row.admission_no, row.arm_name, row.contact.name ?? "", row.contact.email ?? "", row.contact.phone ?? ""].some((text) => text.toLowerCase().includes(needle)),
        ),
    [data, needle],
  );

  const mutation = useMutation({
    mutationFn: (ids: string[]) => sendResultsToParents({ term_id: termId, point, student_ids: ids, channels: SEND_CHANNELS.filter((c) => channels.has(c)) }),
    onSuccess: (result) => {
      if (!result.ok) {
        showToast(failureMessage(result, t) ?? p("toast.failed"), "error");
        return;
      }
      // One line per requested channel that does something: "Email: 8 recorded, 2 skipped (no parent email)."
      const lines = SEND_CHANNELS.filter((channel) => channels.has(channel) && isSendable(result.data.channels[channel] ?? "unavailable")).map((channel) => {
        const outcomes = result.data.items.map((item: SendOutcome) => item[channel]);
        const done = outcomes.filter((outcome) => outcome === "queued" || outcome === "recorded").length;
        const skipped = outcomes.filter((outcome) => outcome === "no_email" || outcome === "no_number").length;
        const doneText = k(result.data.channels[channel] === "live" ? "toast.sent" : "toast.recorded", { channel: channelName(channel), count: done });
        return `${doneText}${skipped > 0 ? `, ${k(channel === "email" ? "toast.skippedEmail" : "toast.skippedPhone", { count: skipped })}` : ""}.`;
      });
      showToast(lines.join(" "));
      setSelected(new Set());
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: reportProgressionQueryKeys.all });
    },
    onError: () => showToast(p("toast.failed"), "error"),
  });

  const backHref = `${reportProgressionClassHref(classId)}?${new URLSearchParams({ term: termId, point })}`;
  const back = (
    <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
      <span aria-hidden>←</span> {k("back")}
    </Link>
  );

  if (!canSend) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        {back}
        <Notice tone="warning">{k("noAccess")}</Notice>
      </div>
    );
  }

  const visibleRows = rows.map(({ row }) => row);
  const selectable = visibleRows.filter((row) => !blockedReason(row));
  const ticked = (data?.items ?? []).filter((row) => selected.has(row.student_id) && !blockedReason(row));
  const allTicked = selectable.length > 0 && selectable.every((row) => selected.has(row.student_id));
  const publishedCount = (data?.items ?? []).filter((row) => !blockedReason(row)).length;

  // Derived per channel: which are on, which of those actually do something, how many ticked rows each reaches.
  const active = SEND_CHANNELS.filter((channel) => channels.has(channel));
  const sendable = active.filter((channel) => isSendable(dispatch[channel]));
  const reach = (channel: SendChannel) => ticked.filter((row) => reachable(row, channel)).length;
  const phoneChannelsOn = active.filter((channel) => channel !== "email");
  const recordedChannels = SEND_CHANNELS.filter((channel) => dispatch[channel] === "recorded");

  // Send is blocked only when no channel that does something is on (or nothing it can reach is ticked).
  let sendHint: string | null = null;
  if (active.length === 0) sendHint = k("hint.noChannel");
  else if (sendable.length === 0) sendHint = k("hint.onlyUnavailable", { channels: channelList(active) });
  else if (ticked.length === 0) sendHint = k("hint.noSelection");
  else if (sendable.every((channel) => reach(channel) === 0)) sendHint = k("hint.noneReachable", { channels: channelList(sendable) });
  const canSubmit = !sendHint && !mutation.isPending;

  const toggleChannel = (channel: SendChannel, on: boolean) =>
    setChannels((current) => {
      const next = new Set(current);
      if (on) next.add(channel);
      else next.delete(channel);
      return next;
    });

  let body;
  if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!data) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>{failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}</Notice>
    );
  } else if (data.items.length === 0) {
    body = <Notice>{p("class.empty.noStudents")}</Notice>;
  } else if (rows.length === 0) {
    body = <Notice>{p("class.empty.noMatch")}</Notice>;
  } else {
    body = (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{k("caption", { class: data.class_name })}</caption>
          <thead className="bg-brand-tint">
            <tr>
              <th className={`${TH} w-10`}>
                <input
                  type="checkbox"
                  checked={allTicked}
                  disabled={selectable.length === 0}
                  onChange={(event) => setSelected(event.target.checked ? new Set(selectable.map((row) => row.student_id)) : new Set())}
                  aria-label={k("selectAll")}
                  className="h-4 w-4 accent-accent disabled:cursor-not-allowed"
                />
              </th>
              <th className={TH}>{p("columns.sn")}</th>
              <th className={TH}>{p("columns.students", { count: rows.length })}</th>
              <th className={TH}>{p("columns.arm")}</th>
              <th className={TH}>{k("columns.parent")}</th>
              <th className={TH}>{k("columns.email")}</th>
              <th className={TH}>{k("columns.phone")}</th>
              <th className={TH}>{k("columns.report")}</th>
              <th className={TH}>{k("columns.lastSent")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, serial }) => {
              const blocked = blockedReason(row);
              return (
                <tr key={row.student_id} className={`border-t border-border ${blocked ? "bg-background" : ""}`}>
                  <td className={TD}>
                    <input
                      type="checkbox"
                      checked={!blocked && selected.has(row.student_id)}
                      disabled={!!blocked}
                      title={blocked ? k(`blocked.${blocked}`) : undefined}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.student_id);
                          else next.delete(row.student_id);
                          return next;
                        })
                      }
                      aria-label={p("class.selectRow", { name: row.student_name })}
                      className="h-4 w-4 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>
                  <td className={`${TD} text-text-secondary`}>{serial}</td>
                  <td className={TD}>
                    <span className={`flex items-center gap-2.5 ${blocked ? "opacity-60" : ""}`}>
                      <StudentAvatar name={row.student_name} photoUrl={row.photo_url} size="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-text-primary">{row.student_name}</span>
                        <span className="text-xs text-text-muted">{row.admission_no}</span>
                      </span>
                    </span>
                  </td>
                  <td className={`${TD} text-text-secondary`}>{row.arm_name}</td>
                  <td className={TD}>
                    <span className="flex flex-col">
                      <span className="text-text-primary">{row.contact.name ?? "—"}</span>
                      {row.contact.relationship ? <span className="text-xs text-text-muted">{k(`relationship.${row.contact.relationship}`)}</span> : null}
                    </span>
                  </td>
                  <td className={TD}>
                    <ContactCell value={row.contact.email} missing={k("missing.email")} dimmed={!channels.has("email")} />
                  </td>
                  <td className={TD}>
                    <ContactCell
                      value={row.contact.phone}
                      missing={phoneChannelsOn.length > 0 ? k("missing.phoneFor", { channels: channelList(phoneChannelsOn) }) : k("missing.phone")}
                      dimmed={phoneChannelsOn.length === 0}
                    />
                  </td>
                  <td className={TD}>
                    <ReportStatus row={row} />
                  </td>
                  <td className={TD}>
                    {row.last_sent ? (
                      <span className="flex flex-col whitespace-nowrap">
                        <span className="text-text-primary">{format.dateTime(new Date(row.last_sent.at), { dateStyle: "medium", timeStyle: "short" })}</span>
                        <span className="text-xs text-text-muted">
                          {SEND_CHANNELS.flatMap((channel) => {
                            const via = row.last_sent?.via[channel];
                            return via ? [k(`lastSent.${via.outcome}`, { channel: channelName(channel) })] : [];
                          }).join(" · ")}
                          {row.last_sent.by ? ` · ${row.last_sent.by.name ?? p("activity.byAdmin")}` : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-text-muted">{k("lastSent.never")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {back}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-text-primary sm:text-2xl">{k("title")}</h2>
        {data ? <p className="text-sm text-text-secondary">{k("subtitle", { class: data.class_name, term: data.term_name, point: p(`points.${point}`) })}</p> : null}
      </div>

      <MockActingAsPicker value={actingAs} onChange={setActingAs} />

      {recordedChannels.length > 0 ? <Notice tone="warning">{k("recordedNotice", { channels: channelList(recordedChannels) })}</Notice> : null}
      {data && data.items.length > 0 && publishedCount === 0 ? <Notice>{k("nonePublished")}</Notice> : null}

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold text-text-primary">{k("channels.title")}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SEND_CHANNELS.map((channel) => (
            <ChannelOption key={channel} channel={channel} dispatch={dispatch[channel]} checked={channels.has(channel)} onChange={(on) => toggleChannel(channel, on)} />
          ))}
        </div>
      </fieldset>

      <SearchBox id="send-to-parent-search" value={search} onChange={setSearch} placeholder={k("search")} />

      <div className="flex min-w-0 flex-col gap-3">{body}</div>

      {data && data.items.length > 0 ? (
        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-border bg-background py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5 text-sm">
            <span className="text-text-primary">{k("summary.selected", { count: ticked.length })}</span>
            {ticked.length > 0 && sendable.length > 0 ? (
              <span className="text-xs text-text-secondary">
                {sendable.map((channel) => k("summary.reach", { channel: channelName(channel), count: reach(channel), total: ticked.length })).join(" · ")}
              </span>
            ) : null}
            {sendHint ? <span className="text-xs text-text-muted">{sendHint}</span> : null}
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => setConfirming(true)}
            className="flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {k("sendButton", { count: ticked.length })}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirming}
        title={k("confirm.title")}
        message={k("confirm.body", { count: ticked.length })}
        confirmLabel={k("confirm.send")}
        isConfirming={mutation.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => mutation.mutate(ticked.map((row) => row.student_id))}
      >
        <ul className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          {active.map((channel) => {
            const count = reach(channel);
            const missing = ticked.length - count;
            const state = dispatch[channel];
            return (
              <li key={channel} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{channelName(channel)}</span>
                  <CarriesBadge channel={channel} />
                </span>
                <span className="text-xs text-text-secondary">
                  {state === "unavailable"
                    ? k("confirm.soon", { channel: channelName(channel) })
                    : k(`confirm.${state}.${channelCarries(channel)}`, { count })}
                  {state !== "unavailable" && missing > 0 ? ` ${k(channel === "email" ? "confirm.noEmail" : "confirm.noPhone", { count: missing })}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-text-muted">{k("confirm.carriesNote")}</p>
      </ConfirmDialog>
    </div>
  );
}

function ChannelOption({ channel, dispatch, checked, onChange }: { channel: SendChannel; dispatch: ChannelDispatch; checked: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations("exam.reportProgression.send.channels");
  const id = `send-channel-${channel}`;
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors ${checked ? "border-accent bg-brand-tint" : "border-border bg-surface hover:bg-background"}`}
    >
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
          {t(channel)}
          <CarriesBadge channel={channel} />
          {dispatch === "unavailable" ? (
            <span className="rounded-full bg-category-amber-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-primary">{t("soon")}</span>
          ) : null}
        </span>
        <span className="text-xs text-text-muted">{t(`help.${channel}.${dispatch}`)}</span>
      </span>
    </label>
  );
}

/** What the channel sends: the PDF file (Email / WhatsApp) or a link to it (SMS). */
function CarriesBadge({ channel }: { channel: SendChannel }) {
  const t = useTranslations("exam.reportProgression.send.carries");
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">{t(channelCarries(channel))}</span>
  );
}

/** The address / number, or a flag when it's missing (dimmed when that channel is off). */
function ContactCell({ value, missing, dimmed }: { value: string | null; missing: string; dimmed: boolean }) {
  if (value) return <span className={`whitespace-nowrap ${dimmed ? "text-text-muted" : "text-text-primary"}`}>{value}</span>;
  return (
    <span className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${dimmed ? "text-text-muted" : "bg-category-amber-tint text-text-primary"}`}>
      <span aria-hidden>!</span>
      {missing}
    </span>
  );
}

function ReportStatus({ row }: { row: SendRecipient }) {
  const t = useTranslations("exam.reportProgression");
  const blocked = blockedReason(row);
  if (blocked === "subjectOnly") return <span className="text-xs text-text-muted">{t("send.blocked.subjectOnly")}</span>;
  if (blocked === "unpublished") {
    return (
      <span className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          {t("status.unpublished")}
        </span>
        <span className="text-xs text-text-muted">{t("send.blocked.unpublished")}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-category-green-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
      {t("status.published")}
    </span>
  );
}
