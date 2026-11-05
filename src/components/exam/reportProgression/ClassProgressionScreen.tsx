"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { NAV_PERMISSIONS } from "@/lib/auth/navPermissions";
import { SelectField } from "@/components/ui/Select";
import { ActionsMenu, type ActionsMenuItem } from "@/components/ui/ActionsMenu";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/setup/ConfirmDialog";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { failureMessage, MockActingAsPicker, Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { StudentReportViewer } from "@/components/exam/results/StudentReportViewer";
import { REPORT_PROGRESSION_HREF, reportProgressionClassHref } from "@/components/exam/examTabsConfig";
import {
  getClassProgression,
  isProgressionPoint,
  isPublishStatusFilter,
  PUBLISH_STATUS_FILTERS,
  publishedPdfUrl,
  reportProgressionQueryKeys,
  runProgressionAction,
  variantOfPoint,
  type ProgressionAction,
  type ProgressionActivity,
  type ProgressionPoint,
  type ProgressionStudent,
  type PublishStatusFilter,
} from "@/lib/exam/reportProgression/reportProgressionApi";
import { PointSelect, ProgressionBar, SearchBox, useCanSee, useMissingLabel } from "@/components/exam/reportProgression/progressionShared";

const TH = "px-3 py-3 text-left text-xs font-semibold text-text-secondary align-middle";
const TD = "px-3 py-3 align-middle";
/** How many incomplete reports the publish warning lists before "+N more". */
const WARNING_LIST_MAX = 8;

type PendingPublish = { rows: ProgressionStudent[]; incomplete: ProgressionStudent[] };

/**
 * Report Progression › one class (Figma 2499:355150): every student of the
 * class (all arms in scope) for the term + point, with their derived
 * Progression %, latest activity and publish Time Stamp. Publish / Stamp
 * act on the ticked students, or on the whole list when none is ticked;
 * publishing is never blocked by completeness — under 100 % the user sees
 * what's unpopulated first and confirms. URL: ?term&point&status&q.
 */
export function ClassProgressionScreen({ classId }: { classId: string }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.reportProgression.${key}`, values);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const missingLabel = useMissingLabel();
  const [actingAs, setActingAs] = useMockActingAs();

  const canView = useCanSee(NAV_PERMISSIONS.examReportProgression);
  const canPublish = useCanSee(NAV_PERMISSIONS.examReportProgressionPublish);
  const canStamp = useCanSee(NAV_PERMISSIONS.examReportProgressionStamp);
  const canSend = useCanSee(NAV_PERMISSIONS.examReportProgressionSend);

  const term = searchParams.get("term") ?? "";
  const pointParam = searchParams.get("point");
  const point: ProgressionPoint = isProgressionPoint(pointParam) ? pointParam : "ca";
  const statusParam = searchParams.get("status");
  const status: PublishStatusFilter = isPublishStatusFilter(statusParam) ? statusParam : "all";
  const search = searchParams.get("q") ?? "";

  const navigate = (patch: Record<string, string>, basePath = pathname) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<{ student: { id: string; name: string } | null; open: boolean }>({ student: null, open: false });
  const [pendingPublish, setPendingPublish] = useState<PendingPublish | null>(null);

  useEffect(() => setSelected(new Set()), [classId, term, point, status, actingAs]);

  const query = useQuery({
    queryKey: [...reportProgressionQueryKeys.classView(classId, term, point, status), actingAs],
    queryFn: () => getClassProgression(classId, term, point, status).then(throwIfTransient),
    enabled: canView,
  });
  const data = query.data?.ok ? query.data.data : null;
  const termId = data?.term_id ?? term;

  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (data?.items ?? [])
        .map((row, index) => ({ row, serial: index + 1 }))
        .filter(({ row }) => !needle || [row.student_name, row.admission_no, row.arm_name].some((text) => text.toLowerCase().includes(needle))),
    [data, needle],
  );

  const mutation = useMutation({
    mutationFn: ({ action, ids }: { action: ProgressionAction; ids: string[] }) =>
      runProgressionAction(action, { term_id: termId, point, student_ids: ids }),
    onSuccess: (result, { action, ids }) => {
      if (!result.ok) {
        showToast(failureMessage(result, t) ?? k("toast.failed"), "error");
        return;
      }
      showToast(k(`toast.${action}`, { count: ids.length }));
      setSelected(new Set());
      setPendingPublish(null);
      void queryClient.invalidateQueries({ queryKey: reportProgressionQueryKeys.all });
    },
    onError: () => showToast(k("toast.failed"), "error"),
  });

  const backHref = `${REPORT_PROGRESSION_HREF}?${new URLSearchParams({ term: termId, point })}`;
  const back = (
    <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
      <span aria-hidden>←</span> {k("class.back")}
    </Link>
  );

  if (!canView) return <Notice tone="warning">{k("noAccess")}</Notice>;

  const run = (action: ProgressionAction, targets: ProgressionStudent[]) => {
    if (targets.length > 0) mutation.mutate({ action, ids: targets.map((row) => row.student_id) });
  };

  /** Bulk always confirms; a single complete report publishes straight away. */
  const requestPublish = (targets: ProgressionStudent[], bulk: boolean) => {
    if (targets.length === 0) return;
    const incomplete = targets.filter((row) => row.progression_percent < 100);
    if (!bulk && incomplete.length === 0) run("publish", targets);
    else setPendingPublish({ rows: targets, incomplete });
  };

  const openReport = (row: ProgressionStudent) => setReport({ student: { id: row.student_id, name: row.student_name }, open: true });
  const viewPdf = (row: ProgressionStudent) => {
    const url = publishedPdfUrl(row);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else openReport(row);
  };

  const visibleRows = rows.map(({ row }) => row);
  const ticked = visibleRows.filter((row) => selected.has(row.student_id));
  // Report management only ever targets rows the caller manages (subject-scoped rows are view-only).
  const targets = (ticked.length > 0 ? ticked : (data?.items ?? [])).filter((row) => row.can_manage);
  const publishTargets = targets.filter((row) => !row.published);
  const stampTargets = targets.filter((row) => !row.stamped);
  const allTicked = visibleRows.length > 0 && ticked.length === visibleRows.length;

  const sendHref = `${reportProgressionClassHref(classId)}/send?${new URLSearchParams({ term: termId, point })}`;
  const studentHref = (row: ProgressionStudent) =>
    `${reportProgressionClassHref(classId)}/students/${encodeURIComponent(row.student_id)}?${new URLSearchParams({ term: termId, point })}`;

  let body;
  if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!data) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else if (data.items.length === 0) {
    body = <Notice>{status === "all" ? k("class.empty.noStudents") : k("class.empty.noStatus")}</Notice>;
  } else if (rows.length === 0) {
    body = <Notice>{k("class.empty.noMatch")}</Notice>;
  } else {
    body = (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <caption className="sr-only">{k("class.caption", { class: data.class_name })}</caption>
          <thead className="bg-brand-tint">
            <tr>
              <th className={`${TH} w-10`}>
                <input
                  type="checkbox"
                  checked={allTicked}
                  onChange={(event) => setSelected(event.target.checked ? new Set(visibleRows.map((row) => row.student_id)) : new Set())}
                  aria-label={k("class.selectAll")}
                  className="h-4 w-4 accent-accent"
                />
              </th>
              <th className={TH}>{k("columns.sn")}</th>
              <th className={TH}>{k("columns.students", { count: rows.length })}</th>
              <th className={TH}>{k("columns.arm")}</th>
              <th className={`${TH} min-w-[220px]`}>{k("columns.progression")}</th>
              <th className={TH}>{k("columns.latestActivity")}</th>
              <th className={TH}>{k("columns.timeStamp")}</th>
              <th className={`${TH} text-right`}>{k("columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, serial }) => {
              const items: ActionsMenuItem[] = [
                { key: "details", label: k("menu.viewDetails"), onClick: () => router.push(studentHref(row)) },
                { key: "report", label: k("menu.viewReport"), onClick: () => openReport(row) },
                ...(canPublish && row.can_manage
                  ? [
                      row.published
                        ? { key: "unpublish", label: k("menu.unpublish"), onClick: () => run("unpublish", [row]) }
                        : { key: "publish", label: k("menu.publish"), onClick: () => requestPublish([row], false) },
                    ]
                  : []),
                ...(canStamp && row.can_manage
                  ? [{ key: "stamp", label: row.stamped ? k("menu.stamped") : k("menu.stamp"), disabled: !!row.stamped, onClick: () => run("stamp", [row]) }]
                  : []),
              ];
              return (
                <tr key={row.student_id} className="border-t border-border">
                  <td className={TD}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.student_id)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.student_id);
                          else next.delete(row.student_id);
                          return next;
                        })
                      }
                      aria-label={k("class.selectRow", { name: row.student_name })}
                      className="h-4 w-4 accent-accent"
                    />
                  </td>
                  <td className={`${TD} text-text-secondary`}>{serial}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-2.5">
                      <Avatar row={row} />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-text-primary">{row.student_name}</span>
                        <span className="text-xs text-text-muted">{row.admission_no}</span>
                      </span>
                    </span>
                  </td>
                  <td className={`${TD} text-text-secondary`}>{row.arm_name}</td>
                  <td className={TD}>
                    <ProgressionBar percent={row.progression_percent} label={k("class.progressionOf", { name: row.student_name })} />
                  </td>
                  <td className={TD}>
                    <ActivityCell activity={row.latest_activity} />
                  </td>
                  <td className={TD}>
                    <TimeStampCell row={row} onViewPdf={() => viewPdf(row)} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <ActionsMenu
                      menuLabel={k("class.rowActions", { name: row.student_name })}
                      items={items}
                      trigger={({ isOpen, toggle }) => (
                        <button
                          type="button"
                          onClick={toggle}
                          aria-haspopup="menu"
                          aria-expanded={isOpen}
                          aria-label={k("class.rowActions", { name: row.student_name })}
                          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                        >
                          <MoreVerticalIcon className="h-4 w-4" />
                        </button>
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const shown = pendingPublish?.incomplete.slice(0, WARNING_LIST_MAX) ?? [];
  const hidden = (pendingPublish?.incomplete.length ?? 0) - shown.length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {back}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-text-primary sm:text-2xl">{k("class.title", { class: data?.class_name ?? "…" })}</h2>
        {data ? <p className="text-sm text-text-secondary">{k("class.subtitle", { term: data.term_name, point: k(`points.${point}`) })}</p> : null}
      </div>

      <MockActingAsPicker value={actingAs} onChange={setActingAs} />

      {data?.subject_scoped ? <Notice>{data.can_manage ? k("class.mixedScope") : k("class.subjectScope")}</Notice> : null}

      {data?.can_manage && (canPublish || canStamp || canSend) ? (
        <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {canPublish ? (
            <button
              type="button"
              disabled={mutation.isPending || publishTargets.length === 0}
              onClick={() => requestPublish(publishTargets, true)}
              className="flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ticked.length > 0 ? k("actions.publishSelected", { count: publishTargets.length }) : k("actions.publishAll")}
            </button>
          ) : null}
          {canStamp ? (
            <button
              type="button"
              disabled={mutation.isPending || stampTargets.length === 0}
              onClick={() => run("stamp", stampTargets)}
              className="flex h-10 items-center justify-center rounded-md bg-text-primary px-4 text-sm text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ticked.length > 0 ? k("actions.stampSelected", { count: stampTargets.length }) : k("actions.stamp")}
            </button>
          ) : null}
          {canSend ? (
            <Link
              href={sendHref}
              className="flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm text-text-primary transition-colors hover:bg-background"
            >
              {k("actions.send")}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <SearchBox id="class-progression-search" value={search} onChange={(value) => navigate({ q: value })} placeholder={k("filters.searchStudent")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            id="class-progression-class"
            label={t("exam.marks.filters.class")}
            value={classId}
            disabled={!data}
            onChange={(event) => navigate({ q: "" }, reportProgressionClassHref(event.target.value))}
          >
            {(data?.classes ?? [{ id: classId, name: "…" }]).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField id="class-progression-term" label={t("exam.marks.filters.term")} value={termId} disabled={!data} onChange={(event) => navigate({ term: event.target.value })}>
            {(data?.terms ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <PointSelect id="class-progression-point" value={point} onChange={(value) => navigate({ point: value })} />
          <SelectField id="class-progression-status" label={k("filters.status")} value={status} onChange={(event) => navigate({ status: event.target.value === "all" ? "" : event.target.value })}>
            {PUBLISH_STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {k(`status.${value}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3">{body}</div>

      <ConfirmDialog
        isOpen={!!pendingPublish}
        title={pendingPublish?.incomplete.length ? k("warning.title") : k("warning.confirmTitle")}
        message={
          pendingPublish?.incomplete.length
            ? pendingPublish.rows.length === 1
              ? k("warning.introOne")
              : k("warning.intro", { count: pendingPublish.incomplete.length, total: pendingPublish.rows.length })
            : k("warning.confirmBody", { count: pendingPublish?.rows.length ?? 0 })
        }
        confirmLabel={pendingPublish?.incomplete.length ? k("warning.publishAnyway") : k("warning.publish")}
        isConfirming={mutation.isPending}
        onCancel={() => setPendingPublish(null)}
        onConfirm={() => pendingPublish && run("publish", pendingPublish.rows)}
      >
        {shown.length > 0 ? (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-md border border-border p-3 text-sm">
            {shown.map((row) => (
              <li key={row.student_id} className="flex flex-col gap-0.5">
                <span className="font-medium text-text-primary">{k("warning.studentLine", { name: row.student_name, percent: row.progression_percent })}</span>
                <span className="text-xs text-text-secondary">{row.missing.map(missingLabel).join(" · ")}</span>
              </li>
            ))}
            {hidden > 0 ? <li className="text-xs text-text-muted">{k("warning.more", { count: hidden })}</li> : null}
          </ul>
        ) : null}
      </ConfirmDialog>

      <StudentReportViewer
        student={report.student}
        termId={termId}
        isOpen={report.open}
        defaultVariant={variantOfPoint(point)}
        onClose={() => setReport((current) => ({ ...current, open: false }))}
      />
    </div>
  );
}

function Avatar({ row }: { row: ProgressionStudent }) {
  if (row.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element -- a data URL / signed photo URL, not an optimizable static asset
    return <img src={row.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />;
  }
  const initials = row.student_name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2);
  return (
    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-accent">
      {initials}
    </span>
  );
}

function ActivityCell({ activity }: { activity: ProgressionActivity | null }) {
  const t = useTranslations("exam.reportProgression.activity");
  const format = useFormatter();
  if (!activity) return <span className="text-text-muted">{t("none")}</span>;
  const by = activity.by ? (activity.by.name ?? t("byAdmin")) : null;
  return (
    <span className="flex flex-col whitespace-nowrap">
      <span className="text-text-primary">
        {format.dateTime(new Date(activity.at), { dateStyle: "medium" })} · {t(`kinds.${activity.kind}`)}
      </span>
      {by ? <span className="text-xs text-text-muted">{by}</span> : null}
    </span>
  );
}

/** Published / Unpublished · Stamped · View PDF (published only), in that order. */
function TimeStampCell({ row, onViewPdf }: { row: ProgressionStudent; onViewPdf: () => void }) {
  const t = useTranslations("exam.reportProgression");
  const format = useFormatter();
  return (
    <span className="flex flex-col gap-1 whitespace-nowrap">
      {row.published ? (
        <span className="text-text-primary">{format.dateTime(new Date(row.published.at), { dateStyle: "medium", timeStyle: "short" })}</span>
      ) : (
        <span className="text-text-muted">—</span>
      )}
      <span className="flex items-center gap-1">
        {row.published ? <Pill tone="success">{t("status.published")}</Pill> : <Pill tone="muted">{t("status.unpublished")}</Pill>}
        {row.stamped ? <Pill tone="accent">{t("badge.stamped")}</Pill> : null}
        {row.published ? (
          <button
            type="button"
            onClick={onViewPdf}
            aria-label={t("class.viewPdfOf", { name: row.student_name })}
            className="ml-1 rounded text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("menu.viewPdf")}
          </button>
        ) : null}
      </span>
    </span>
  );
}

const PILL_CLASSES = {
  success: "bg-category-green-tint text-success",
  accent: "bg-brand-tint text-accent",
  muted: "border border-dashed border-border text-text-muted",
} as const;

function Pill({ tone, children }: { tone: keyof typeof PILL_CLASSES; children: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PILL_CLASSES[tone]}`}>{children}</span>
  );
}
