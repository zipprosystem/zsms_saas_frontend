import type { ReportPayload, ReportVariant } from "@/lib/exam/report/reportPayload";

/**
 * Pours one student's report payload into a shared static result
 * template, for a sandboxed srcdoc iframe (no allow-same-origin: the
 * template's scripts run in an opaque origin, away from the app).
 *
 *   window.__ZSMS_REPORT__  the payload — the template renders from it
 *                           instead of its sample data
 *   window.__ZSMS_PAGE__    the page to show (null = every page); pages
 *                           are the template's [data-zsms-page] sections
 *   window.__ZSMS_LABELS__  the viewer's translations for template text
 *                           that has them ({ key: text }); a template
 *                           falls back to its own English
 *   message "zsms:print"    the parent's Print — the opaque-origin frame
 *                           can't be printed from outside, so it prints
 *                           itself (needs sandbox allow-modals)
 *   message "zsms:height"   posted UP to the parent: the report's content
 *                           height, on load and whenever it changes — the
 *                           viewer sizes the frame to it on phones, so the
 *                           modal body is the only scroller (a scrolling
 *                           iframe inside a scrolling modal doesn't pass
 *                           swipes on to the modal on mobile Safari)
 *
 * data-theme="light": a report card is a print artifact, so it renders as
 * printed whatever the app's theme (same as TemplatePreviewFrame).
 */

export const PRINT_MESSAGE = "zsms:print";
export const HEIGHT_MESSAGE = "zsms:height";

/** JSON safe to inline in a <script>: no "</script>", no U+2028/2029 line breaks. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * The page count the template declares for a variant:
 * <meta name="zsms-report-pages-<variant>" content="N"> when the variant has
 * its own count (e.g. British Progress has no cover / comments pages), else
 * <meta name="zsms-report-pages" content="N">.
 */
export function declaredPages(html: string, variant?: ReportVariant | null): number | null {
  const read = (name: string) => {
    const match = html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["'](\\d+)["']`, "i"));
    const pages = match ? Number(match[1]) : NaN;
    return Number.isInteger(pages) && pages > 0 ? pages : null;
  };
  return (variant ? read(`zsms-report-pages-${variant}`) : null) ?? read("zsms-report-pages");
}

/**
 * The downloaded file's name (the print dialog's "Save as PDF" suggests
 * the document title): studentname_arm_termname_pointname_session, each
 * token from the payload with spaces and punctuation dropped (accents
 * folded; "/" in the session becomes "-") — e.g.
 * SadiqMarzuqOluwatofarati_10A_Term3_3B_2025-2026. The point is the
 * report's point (British: meta.current_point_index; General: the last
 * point the report covers).
 */
export function reportFileName(payload: ReportPayload): string {
  const token = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[/\\]+/g, "-")
      .replace(/[^A-Za-z0-9-]+/g, "");
  const points = payload.meta.points ?? [];
  const point = points[payload.meta.current_point_index ?? points.length - 1] ?? null;
  return [payload.student.full_name, payload.student.arm, payload.meta.term.name, point?.label, payload.meta.academic_year.name]
    .map(token)
    .filter(Boolean)
    .join("_");
}

export function buildReportSrcDoc(html: string, payload: ReportPayload, page: number | null, documentTitle: string, labels: Record<string, string> = {}): string {
  const boot = [
    `window.__ZSMS_REPORT__=${inlineJson(payload)};`,
    `window.__ZSMS_LABELS__=${inlineJson(labels)};`,
    `window.__ZSMS_PAGE__=${page === null ? "null" : String(page)};`,
    `window.addEventListener("message",function(e){if(e.data&&e.data.type===${inlineJson(PRINT_MESSAGE)})window.print();});`,
    `window.addEventListener("load",function(){document.title=${inlineJson(documentTitle)};});`,
    // The content height (html's box, not the viewport) — stays correct once the frame is sized to it.
    `(function(){var last=0;function post(){var h=Math.ceil(document.documentElement.getBoundingClientRect().height);if(h&&h!==last){last=h;parent.postMessage({type:${inlineJson(HEIGHT_MESSAGE)},height:h},"*");}}`,
    `window.addEventListener("load",function(){post();if(window.ResizeObserver)new ResizeObserver(post).observe(document.documentElement);});})();`,
  ].join("");
  const pageCss = page === null ? "" : `[data-zsms-page]:not([data-zsms-page="${page}"]){display:none!important}`;
  return `<!doctype html><html data-theme="light"><head><script>${boot}</script></head>${html}<style>${pageCss}</style>`;
}
