import type { ReportPayload } from "@/lib/exam/report/reportPayload";

/**
 * Pours one student's report payload into a shared static result
 * template, for a sandboxed srcdoc iframe (no allow-same-origin: the
 * template's scripts run in an opaque origin, away from the app).
 *
 *   window.__ZSMS_REPORT__  the payload — the template renders from it
 *                           instead of its sample data
 *   window.__ZSMS_PAGE__    the page to show (null = every page); pages
 *                           are the template's [data-zsms-page] sections
 *   message "zsms:print"    the parent's Print — the opaque-origin frame
 *                           can't be printed from outside, so it prints
 *                           itself (needs sandbox allow-modals)
 *
 * data-theme="light": a report card is a print artifact, so it renders as
 * printed whatever the app's theme (same as TemplatePreviewFrame).
 */

export const PRINT_MESSAGE = "zsms:print";

/** JSON safe to inline in a <script>: no "</script>", no U+2028/2029 line breaks. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** The page count the template declares: <meta name="zsms-report-pages" content="N">. */
export function declaredPages(html: string): number | null {
  const match = html.match(/<meta\s+name=["']zsms-report-pages["']\s+content=["'](\d+)["']/i);
  const pages = match ? Number(match[1]) : NaN;
  return Number.isInteger(pages) && pages > 0 ? pages : null;
}

export function buildReportSrcDoc(html: string, payload: ReportPayload, page: number | null, documentTitle: string): string {
  const boot = [
    `window.__ZSMS_REPORT__=${inlineJson(payload)};`,
    `window.__ZSMS_PAGE__=${page === null ? "null" : String(page)};`,
    `window.addEventListener("message",function(e){if(e.data&&e.data.type===${inlineJson(PRINT_MESSAGE)})window.print();});`,
    `window.addEventListener("load",function(){document.title=${inlineJson(documentTitle)};});`,
  ].join("");
  const pageCss = page === null ? "" : `[data-zsms-page]:not([data-zsms-page="${page}"]){display:none!important}`;
  return `<!doctype html><html data-theme="light"><head><script>${boot}</script></head>${html}<style>${pageCss}</style>`;
}
