"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Select";
import { fetchPreviewHtml, templateHtmlQueryKey } from "@/components/setup/assessmentConfiguration/TemplatePreviewFrame";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { EXAM_USES_MOCK } from "@/lib/exam/examApi";
import { getReportPayload, REPORT_VARIANTS, reportQueryKeys, type ReportVariant } from "@/lib/exam/report/reportPayload";
import { buildReportSrcDoc, declaredPages, PRINT_MESSAGE } from "@/lib/exam/report/reportSrcDoc";
import { resultTemplatesQueryKey, resultTemplatesService } from "@/lib/setup/assessmentConfiguration/resultTemplatesApi";
import { failureMessage, Notice } from "@/components/exam/examEntryShared";

const SEGMENT = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const SEGMENT_ON = "bg-accent text-on-accent";
const SEGMENT_OFF = "text-text-secondary hover:bg-background hover:text-text-primary";

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div role="group" aria-label={label} className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`${SEGMENT} ${option.value === value ? SEGMENT_ON : SEGMENT_OFF}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "all" = every page the template declares. */
type PageChoice = number | "all";

/**
 * View Report: one student's report payload poured into the class's
 * selected result template, rendered here in the browser (see
 * reportSrcDoc.ts). Page-aware — one view + print per page the template
 * declares. Print is the browser's print dialog, which also saves as PDF.
 * The payload is role-scoped by the backend: a subject teacher's comes
 * with the other subjects redacted.
 */
export function StudentReportViewer({
  student,
  termId,
  isOpen,
  onClose,
}: {
  student: { id: string; name: string } | null;
  termId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.viewResults.report.${key}`, values);
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** null = the backend's default for what's been entered. */
  const [variant, setVariant] = useState<ReportVariant | null>(null);
  const [page, setPage] = useState<PageChoice>(1);
  /** Mock only: preview the same payload in another template. */
  const [templateOverride, setTemplateOverride] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setVariant(null);
      setPage(1);
      setTemplateOverride("");
    }
  }, [isOpen]);

  const payloadQuery = useQuery({
    queryKey: reportQueryKeys.payload(student?.id ?? "", termId, variant),
    queryFn: () => getReportPayload(student?.id ?? "", termId, variant).then(throwIfTransient),
    enabled: isOpen && !!student && !!termId,
    // Switching variant keeps the current report up (and the controls in place) until the new one arrives.
    placeholderData: (previous) => previous,
  });
  const payload = payloadQuery.data?.ok ? payloadQuery.data.data : null;

  const templatesQuery = useQuery({
    queryKey: resultTemplatesQueryKey,
    queryFn: () => resultTemplatesService.list().then(throwIfTransient),
    enabled: isOpen,
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const templates = useMemo(
    () => (templatesQuery.data?.ok ? templatesQuery.data.data.filter((template) => template.status !== "archived" && template.preview_path) : []),
    [templatesQuery.data],
  );
  const templateId = (EXAM_USES_MOCK && templateOverride) || payload?.meta.template_id || "";
  const template = templates.find((item) => item.id === templateId) ?? null;
  const previewPath = template?.preview_path ?? null;

  const htmlQuery = useQuery({
    queryKey: templateHtmlQueryKey(previewPath),
    queryFn: () => fetchPreviewHtml(previewPath as string),
    enabled: isOpen && !!previewPath,
    staleTime: Infinity,
    retry: false,
  });
  const html = htmlQuery.data ?? null;
  // The template file's own declaration wins; the payload's count is the fallback.
  const pages = (html && declaredPages(html)) || payload?.meta.pages || 1;
  const shownPage: PageChoice = page !== "all" && page > pages ? 1 : page;

  // The print / PDF file name the browser suggests.
  const documentTitle = student && payload ? k("documentTitle", { name: student.name, term: payload.meta.term.name }) : "";
  const srcDoc = useMemo(
    () => (html && payload ? buildReportSrcDoc(html, payload, shownPage === "all" ? null : shownPage, documentTitle) : null),
    [html, payload, shownPage, documentTitle],
  );

  const print = () => frameRef.current?.contentWindow?.postMessage({ type: PRINT_MESSAGE }, "*");

  let body: ReactNode;
  if (payloadQuery.isPending || (payload && templatesQuery.isPending)) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!payload) {
    body = (
      <Notice tone={isDevBypassUnavailable(payloadQuery.data) ? "warning" : "error"}>
        {failureMessage(payloadQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else if (!template) {
    body = <Notice tone="warning">{k("noTemplate")}</Notice>;
  } else if (htmlQuery.isError) {
    body = <Notice tone="error">{k("templateLoadFailed")}</Notice>;
  } else if (!srcDoc) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else {
    body = (
      <iframe
        ref={frameRef}
        title={k("frameTitle", { name: student?.name ?? "" })}
        srcDoc={srcDoc}
        // allow-modals: the frame opens its own print dialog (see reportSrcDoc.ts).
        sandbox="allow-scripts allow-modals"
        className="h-[70vh] w-full rounded-lg border border-border bg-surface"
      />
    );
  }

  const variantNow = variant ?? payload?.meta.variant ?? "full";
  const pageOptions: Array<{ value: PageChoice; label: string }> = [
    ...Array.from({ length: pages }, (_, index) => ({ value: index + 1, label: k("pages.page", { n: index + 1 }) })),
    { value: "all", label: k("pages.all") },
  ];

  return (
    <WideModal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title={k("title", { name: student?.name ?? "" })}
      subtitle={payload ? [template?.name, payload.meta.term.name, payload.meta.academic_year.name].filter(Boolean).join(" · ") : undefined}
      footer={
        <>
          <p className="hidden text-xs text-text-muted sm:block">{k("printHelp")}</p>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} className="h-10 px-4 text-sm">
              {t("common.close")}
            </Button>
            <Button type="button" onClick={print} disabled={!srcDoc} className="h-10 px-4 text-sm">
              {shownPage === "all" || pages === 1 ? k("print") : k("printPage", { n: shownPage })}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {payload ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
            <Segmented<ReportVariant>
              label={k("variant.label")}
              options={REPORT_VARIANTS.map((value) => ({ value, label: k(`variant.${value}`) }))}
              value={variantNow}
              onChange={setVariant}
            />
            {pages > 1 ? <Segmented<PageChoice> label={k("pages.label")} options={pageOptions} value={shownPage} onChange={setPage} /> : null}
            {EXAM_USES_MOCK && templates.length > 0 ? (
              <div className="flex min-w-0 flex-col gap-1 sm:w-64">
                <SelectField
                  id="report-template-override"
                  label={k("template.label")}
                  value={templateId}
                  onChange={(event) => {
                    setTemplateOverride(event.target.value);
                    setPage(1);
                  }}
                >
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id === payload.meta.template_id ? k("template.assigned", { name: item.name }) : item.name}
                    </option>
                  ))}
                </SelectField>
                <p className="text-xs text-text-muted">{k("template.help")}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        {payload?.meta.scope === "own_subjects" ? <Notice tone="warning">{k("ownScope")}</Notice> : null}
        {body}
      </div>
    </WideModal>
  );
}
