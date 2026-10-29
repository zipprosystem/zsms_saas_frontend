"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Select";
import { Segmented } from "@/components/ui/Segmented";
import { fetchPreviewHtml, templateHtmlQueryKey } from "@/components/setup/assessmentConfiguration/TemplatePreviewFrame";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { getReportPayload, REPORT_VARIANTS, reportQueryKeys, type ReportVariant } from "@/lib/exam/report/reportPayload";
import { buildReportSrcDoc, declaredPages, HEIGHT_MESSAGE, PRINT_MESSAGE, reportFileName } from "@/lib/exam/report/reportSrcDoc";

/** Template text the viewer translates (exam.viewResults.report.templateLabels.*), passed in as window.__ZSMS_LABELS__. */
const TEMPLATE_LABEL_KEYS = ["valueAdded", "vaHeader", "vaAbove", "vaBelow", "coverTerm", "schoolLogo", "gradeBookShort", "tutorComment", "boardingComment", "boardingGrade"] as const;
import { resultTemplatesQueryKey, resultTemplatesService } from "@/lib/setup/assessmentConfiguration/resultTemplatesApi";
import { failureMessage, Notice } from "@/components/exam/examEntryShared";

/** Below Tailwind's `sm`: the modal is full-screen and the report frame grows to its content (see useFrameAutoHeight). */
const PHONE_QUERY = "(max-width: 639.98px)";

/**
 * Phones: size the report frame to the report's own height (posted up by
 * the frame, reportSrcDoc.ts HEIGHT_MESSAGE), so the modal body is the only
 * vertical scroller. A scrolling iframe nested in the scrolling modal body
 * doesn't hand swipes on to the modal on mobile Safari, which left the
 * report unscrollable. Desktop keeps the fixed-height frame with its own
 * scrollbar. Returns null when the frame keeps its CSS height.
 */
function useFrameAutoHeight(frameRef: RefObject<HTMLIFrameElement>, srcDoc: string | null): number | null {
  const [isPhone, setIsPhone] = useState(false);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // A new document reports its own height.
  useEffect(() => setHeight(null), [srcDoc]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Only our frame (opaque origin, so match on the window, not the origin).
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; height?: unknown } | null;
      if (data?.type !== HEIGHT_MESSAGE || typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      // Plus the frame's own border, so its inner viewport is exactly the report: no leftover px for the frame to scroll (that would catch the swipe).
      const frame = frameRef.current;
      const border = frame ? frame.offsetHeight - frame.clientHeight : 0;
      setHeight(Math.min(Math.max(Math.round(data.height) + border, 200), 40000));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frameRef]);

  return isPhone ? height : null;
}

/** "all" = every page the template declares. */
type PageChoice = number | "all";

/**
 * DEV-ONLY: flip to true locally to get a template picker in the viewer
 * (preview the same payload in any catalog template). Never on in a
 * production build, and off by default — the viewer shows only the
 * template assigned to the class (the School Type's result template).
 */
const DEV_TEMPLATE_PICKER = false;
const showTemplatePicker = DEV_TEMPLATE_PICKER && process.env.NODE_ENV !== "production";

/**
 * View Report: one student's report payload poured into the result
 * template assigned to the class (payload meta.template_id), rendered here in the browser (see
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
  /** Dev only (DEV_TEMPLATE_PICKER): preview the same payload in another template. */
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
  const templateId = (showTemplatePicker && templateOverride) || payload?.meta.template_id || "";
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
  const pages = (html && declaredPages(html, payload?.meta.variant)) || payload?.meta.pages || 1;
  const shownPage: PageChoice = page !== "all" && page > pages ? 1 : page;

  // The print / PDF file name the browser suggests: built from the payload's student / arm / term / point / session.
  const documentTitle = payload ? reportFileName(payload) : "";
  const labels = useMemo(() => Object.fromEntries(TEMPLATE_LABEL_KEYS.map((key) => [key, t(`exam.viewResults.report.templateLabels.${key}`)])), [t]);
  const srcDoc = useMemo(
    () => (html && payload ? buildReportSrcDoc(html, payload, shownPage === "all" ? null : shownPage, documentTitle, labels) : null),
    [html, payload, shownPage, documentTitle, labels],
  );

  const print = () => frameRef.current?.contentWindow?.postMessage({ type: PRINT_MESSAGE }, "*");
  const phoneFrameHeight = useFrameAutoHeight(frameRef, srcDoc);

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
        // Phones: as tall as the report (the modal body scrolls); desktop: 70vh with the frame's own scrollbar.
        style={phoneFrameHeight ? { height: phoneFrameHeight } : undefined}
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
            {showTemplatePicker && templates.length > 0 ? (
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
