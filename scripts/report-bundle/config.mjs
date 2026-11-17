/**
 * Shared settings for the report bundle scripts (build.mjs, parity.mjs).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SOURCE = join(ROOT, "public", "template-previews");
export const HERE = join(ROOT, "scripts", "report-bundle");
export const BUNDLE = join(ROOT, "report-bundle");

/** The bundled templates, by backend template_key (src/lib/setup/assessmentConfiguration/resultTemplatesApi.ts). */
export const TEMPLATES = [
  { template_key: "nigerian_terminal", name: "Nigerian Terminal Report", file: "result-template-nigerian.html" },
  { template_key: "british_progress", name: "British Progress Report", file: "result-template-british.html" },
  { template_key: "modern_generic", name: "Modern Generic Report", file: "result-template-modern.html" },
  { template_key: "nigerian_primary", name: "Primary Terminal Report", file: "result-template-primary.html" },
  { template_key: "lela_blossom", name: "LeLa Blossom Report", file: "result-template-lela.html" },
  { template_key: "white_pearl", name: "White Pearl Report", file: "result-template-whitepearl.html" },
];

/** Which templates each sample payload family is rendered with for the parity references (by file-name prefix). */
export const PARITY_FAMILIES = [
  { prefix: "general-", templates: ["nigerian_terminal", "modern_generic", "nigerian_primary", "white_pearl"] },
  { prefix: "lela-", templates: ["lela_blossom"] },
  { prefix: "british-", templates: ["british_progress"] },
];

/**
 * The Chrome build the parity references are rendered with — the same build as
 * the backend's PDF worker. Page breaks can shift between Chrome versions, so
 * parity.mjs refuses any other build.
 */
export const CHROME = {
  product: "chrome-headless-shell",
  version: "156.0.8078.79",
  install: "npx @puppeteer/browsers install chrome-headless-shell@156.0.8078.79",
};

/**
 * The print contract (PRINT-CONTRACT.md): the Page.printToPDF / Puppeteer
 * page.pdf settings a worker must use. Sizes in inches, as both APIs take them.
 * Page size and margins only apply to a template without its own @page rule —
 * a template's @page size, orientation and margins always win.
 */
export const PRINT = {
  preferCSSPageSize: true,
  printBackground: true,
  scale: 1,
  landscape: false,
  displayHeaderFooter: false,
  paperWidth: 8.2677, // A4 210mm
  paperHeight: 11.6929, // A4 297mm
  marginTop: 0.4,
  marginBottom: 0.4,
  marginLeft: 0.4,
  marginRight: 0.4,
};
