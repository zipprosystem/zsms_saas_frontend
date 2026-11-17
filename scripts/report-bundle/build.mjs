/**
 * Report template bundle — the self-contained, versioned copy of the result
 * templates that the backend's headless-Chrome PDF worker renders (DEC-008).
 *
 * The frontend stays the single source: the templates live in
 * public/template-previews/ (the in-app preview and View Report use them as
 * they are). This script:
 *
 *   1. embeds the fonts — fills each template's
 *      <style data-zsms-fonts="Family min-max, …"> block with base64
 *      @font-face rules from scripts/report-bundle/fonts/ (vendor-fonts.mjs);
 *   2. audits every template for external references (stylesheets, fonts,
 *      scripts, images, @import, url()) — any found fails the build, so a
 *      template can't reach the network at render time;
 *   3. writes report-bundle/: the templates, the payload contract (generated
 *      from src/lib/exam/report/reportPayload.ts), sample payloads (stress +
 *      normal-class, from scripts/report-bundle/samples/), the font licences
 *      and manifest.json (version, template_key → file, page counts, sha256
 *      per file). README.md there is hand-written and not generated;
 *   4. adds parity/PRINT-CONTRACT.md (the worker's print settings). The
 *      parity reference PDFs + index.json are not committed: package.mjs
 *      renders them from a release tag into that release's tarball only, and
 *      checks them against this manifest's template and sample hashes.
 *
 *   npm run report-bundle                  rebuild; fails if anything changed
 *                                          without a version bump
 *   npm run report-bundle -- --bump patch  rebuild + bump (patch|minor|major)
 *   npm run report-bundle:check            verify, write nothing; fails on
 *                                          drift (a template edited without
 *                                          re-syncing the bundle)
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { BUNDLE, HERE, ROOT, SOURCE, TEMPLATES } from "./config.mjs";

const FONTS = join(HERE, "fonts");
const SAMPLES = join(HERE, "samples");
const PRINT_CONTRACT = join(HERE, "PRINT-CONTRACT.md");
const PAYLOAD_SOURCE = join(ROOT, "src", "lib", "exam", "report", "reportPayload.ts");

const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const BUMP = args.includes("--bump") ? args[args.indexOf("--bump") + 1] : null;
if (BUMP && !["patch", "minor", "major"].includes(BUMP)) fail(`--bump takes patch, minor or major (got ${BUMP})`);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
function fail(message) {
  console.error(`report-bundle: ${message}`);
  process.exit(1);
}

// ---- 1. Fonts ---------------------------------------------------------------

const FONT_BLOCK = /(<style data-zsms-fonts="([^"]+)">)[\s\S]*?(<\/style>)/;
const faces = JSON.parse(await readFile(join(FONTS, "faces.json"), "utf8"));
const fontData = new Map();

/** "IBM Plex Sans 400-600, Libre Baskerville 400-700" → [{ family, weight: [400, 600] }, …] */
function parseFontSpec(spec) {
  return spec.split(",").map((part) => {
    const match = part.trim().match(/^(.+?)\s+(\d+)(?:-(\d+))?$/);
    if (!match) fail(`bad data-zsms-fonts entry "${part.trim()}"`);
    return { family: match[1], weight: [Number(match[2]), Number(match[3] ?? match[2])] };
  });
}

/**
 * The @font-face rules for a template. Each face declares the template's own
 * weight range (what it asked Google Fonts for), so font matching is
 * unchanged; the file is the variable font Google served for that family.
 *
 * The glyph-only fallbacks (vendor-fonts.mjs FALLBACKS) join each family
 * under its name and weight range — Chrome groups a family's faces by
 * weight/style, so a wider range would win the match alone and drop the
 * family's own text — and are declared FIRST: Chrome tries a family's
 * later-declared faces first, so the family's own glyphs win and a fallback
 * only draws what the family lacks.
 */
async function fontCss(spec) {
  const rules = [];
  for (const { family, weight } of parseFontSpec(spec)) {
    const own = faces.filter((face) => face.family === family);
    if (!own.length) fail(`no vendored font "${family}" — add it to vendor-fonts.mjs and re-run it`);
    const fallbacks = faces.filter((face) => face.family.startsWith("fallback:") && (face.for === "all" || face.for === own[0].kind));
    for (const face of [...fallbacks, ...own]) {
      if (!fontData.has(face.file)) fontData.set(face.file, (await readFile(join(FONTS, face.file))).toString("base64"));
      const w = weight[0] === weight[1] ? weight[0] : `${weight[0]} ${weight[1]}`;
      // A fallback's vertical metrics are pinned below every family's own, so a line holding one
      // of its glyphs (Noto Sans Math is very tall) is no taller than the family alone would make it.
      const metrics = face.family.startsWith("fallback:") ? "ascent-override:85%;descent-override:20%;line-gap-override:0%;" : "";
      rules.push(
        `@font-face{font-family:"${family}";font-style:${face.style};font-weight:${w};font-display:swap;${metrics}` +
          `unicode-range:${face.unicodeRange};src:url(data:font/woff2;base64,${fontData.get(face.file)}) format("woff2")}`,
      );
    }
  }
  return `\n/* Generated by scripts/report-bundle/build.mjs from scripts/report-bundle/fonts (SIL OFL 1.1) — edit data-zsms-fonts, not these rules. */\n${rules.join("\n")}\n`;
}

// ---- 2. External-reference audit -------------------------------------------

/** Anything that would make the browser fetch: the render must need nothing but the file + payload. */
const EXTERNAL = [
  { what: "<link> element", re: /<link\b[^>]*>/gi },
  { what: "external <script src>", re: /<script\b[^>]*\bsrc\s*=/gi },
  { what: "@import", re: /@import\b/gi },
  { what: "non-data url()", re: /url\(\s*(?!["']?data:)[^)]*\)/gi },
  { what: "non-data src/href attribute", re: /\b(?:src|href|poster|srcset)\s*=\s*["'](?!data:|#|["'])[^"']*["']/gi },
  // Any absolute URL left in the markup or scripts (the SVG namespace is an identifier, not a fetch).
  { what: "absolute URL", re: /(?:https?:)?\/\/(?!www\.w3\.org\/(?:2000\/svg|1999\/xlink))[a-z0-9-]+\.[a-z0-9.-]+[^\s"'<>)]*/gi },
];

function audit(file, html) {
  const scan = html.replace(FONT_BLOCK, "$1$3"); // the generated data: fonts are known-good
  const found = [];
  for (const { what, re } of EXTERNAL) for (const match of scan.matchAll(re)) found.push(`${what}: ${match[0].slice(0, 120)}`);
  if (found.length) fail(`${file} still references external resources:\n  ${found.join("\n  ")}`);
}

// ---- 3. Contract + manifest -------------------------------------------------

/** A standalone copy of the payload types (no app imports), for the render worker. */
async function payloadContract() {
  const source = await readFile(PAYLOAD_SOURCE, "utf8");
  const start = source.indexOf("/**\n * REPORT PAYLOAD");
  const end = source.indexOf("export const CLASS_PDF_STATUSES");
  if (start < 0 || end < 0) fail("reportPayload.ts layout changed — update payloadContract() in build.mjs");
  const constList = async (path, re) => {
    const match = (await readFile(join(ROOT, path), "utf8")).match(re);
    if (!match) fail(`can't read ${re} from ${path}`);
    return match[1].trim();
  };
  const attainment = await constList("src/lib/exam/settings/examSettingsApi.ts", /ATTAINMENT_DISPLAYS = \[([^\]]+)\] as const/);
  const domains = await constList("src/lib/setup/assessmentConfiguration/progressGradesApi.ts", /british: \[([^\]]+)\]/);
  const union = (list) => list.split(",").map((item) => item.trim()).join(" | ");
  return [
    "/**",
    " * GENERATED by scripts/report-bundle/build.mjs from src/lib/exam/report/reportPayload.ts",
    " * (zsms_saas_frontend) — do not edit; the frontend file is the source.",
    " *",
    " * The data a template renders: one student's report, injected before the",
    " * template's own scripts run as window.__ZSMS_REPORT__ (see README.md).",
    " */",
    "",
    "/* Inlined from the app so this file stands alone. */",
    `export type AttainmentDisplay = ${union(attainment)};`,
    `export type ProgressDomain = ${union(domains)};`,
    "",
    source.slice(start, end).trimEnd(),
    "",
  ].join("\n");
}

function declaredPages(html, variant) {
  const read = (name) => Number(html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["'](\\d+)["']`, "i"))?.[1]) || null;
  return (variant ? read(`zsms-report-pages-${variant}`) : null) ?? read("zsms-report-pages");
}

const pageSizes = (html) => [...new Set([...html.matchAll(/@page\b[^{]*\{[^}]*?\bsize:\s*([^;}]+)/g)].map((m) => m[1].trim()))];

function bumped(version, part) {
  const [major, minor, patch] = version.split(".").map(Number);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ---- Build -------------------------------------------------------------------

const out = new Map(); // bundle-relative path → content
const sourceDrift = [];
const entries = [];
for (const template of TEMPLATES) {
  const path = join(SOURCE, template.file);
  const original = await readFile(path, "utf8");
  const block = original.match(FONT_BLOCK);
  if (!block) fail(`${template.file} has no <style data-zsms-fonts="…"> block`);
  const css = await fontCss(block[2]);
  const html = original.replace(FONT_BLOCK, (_, open, spec, close) => open + css + close);
  if (html !== original) {
    if (CHECK) sourceDrift.push(template.file);
    else await writeFile(path, html);
  }
  audit(template.file, html);
  const bundlePath = `templates/${template.file}`;
  out.set(bundlePath, html);
  entries.push({
    template_key: template.template_key,
    name: template.name,
    file: bundlePath,
    sha256: sha256(html),
    bytes: Buffer.byteLength(html),
    pages: { full: declaredPages(html, "full"), progress: declaredPages(html, "progress") },
    page_sizes: pageSizes(html),
    fonts: parseFontSpec(block[2]).map(({ family, weight }) => `${family} ${weight.join("-")}`),
  });
}
if (sourceDrift.length) fail(`fonts out of date in ${sourceDrift.join(", ")} — run npm run report-bundle`);

const contract = await payloadContract();
out.set("contract/report-payload.ts", contract);
for (const file of (await readdir(SAMPLES)).filter((name) => name.endsWith(".json")).sort()) {
  out.set(`samples/${file}`, await readFile(join(SAMPLES, file), "utf8"));
}
// The reference PDFs + index.json join parity/ only in the release tarball (package.mjs).
out.set("parity/PRINT-CONTRACT.md", await readFile(PRINT_CONTRACT, "utf8"));

for (const file of (await readdir(FONTS)).filter((name) => name.startsWith("OFL-")).sort()) {
  out.set(`licenses/${file}`, await readFile(join(FONTS, file), "utf8"));
}

// The version covers every bundled file; the manifest's own hash list lets the worker detect drift.
const contentSha = sha256([...out.keys()].sort().map((key) => `${key}\0${sha256(out.get(key))}`).join("\n"));
let previous = null;
try {
  previous = JSON.parse(await readFile(join(BUNDLE, "manifest.json"), "utf8"));
} catch {
  /* first build */
}
let version = previous?.version ?? "1.0.0";
const changed = previous?.content_sha256 !== contentSha;
if (previous && changed) {
  if (CHECK) fail(`report-bundle/ is out of date with the templates (v${version}) — run npm run report-bundle -- --bump <patch|minor|major>`);
  if (!BUMP) fail(`templates changed since v${version} — re-run with --bump patch|minor|major`);
  version = bumped(version, BUMP);
} else if (BUMP && !changed) {
  fail(`nothing changed since v${version} — no bump needed`);
}

const manifest = {
  name: "zsms-report-templates",
  version,
  content_sha256: contentSha,
  source: "zsms_saas_frontend — public/template-previews/ (rebuilt by scripts/report-bundle/build.mjs; never edit the bundle by hand)",
  injection: {
    report: "window.__ZSMS_REPORT__",
    page: "window.__ZSMS_PAGE__",
    labels: "window.__ZSMS_LABELS__",
    contract: "contract/report-payload.ts",
  },
  templates: entries,
  files: Object.fromEntries([...out.keys()].sort().map((key) => [key, sha256(out.get(key))])),
  fonts_license: "SIL Open Font License 1.1 — see licenses/",
};
const manifestJson = JSON.stringify(manifest, null, 2) + "\n";

if (CHECK) {
  const stale = [];
  for (const [key, content] of [...out, ["manifest.json", manifestJson]]) {
    const onDisk = await readFile(join(BUNDLE, key)).catch(() => null);
    if (!onDisk || sha256(onDisk) !== sha256(content)) stale.push(key);
  }
  // Nothing else may sit in the bundle (e.g. parity PDFs — those belong only in a release tarball).
  const extra = (await readdir(BUNDLE, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(BUNDLE, join(entry.parentPath ?? entry.path, entry.name)))
    .filter((key) => !out.has(key) && !["manifest.json", "README.md"].includes(key));
  if (extra.length) fail(`report-bundle/ has files a build doesn't make: ${extra.join(", ")}`);
  if (stale.length) fail(`report-bundle/ differs from a fresh build: ${stale.join(", ")}`);
  console.log(`report-bundle: v${version} is up to date (${entries.length} templates).`);
} else {
  for (const dir of ["templates", "contract", "samples", "parity", "licenses"]) await rm(join(BUNDLE, dir), { recursive: true, force: true });
  for (const [key, content] of out) {
    await mkdir(dirname(join(BUNDLE, key)), { recursive: true });
    await writeFile(join(BUNDLE, key), content);
  }
  await writeFile(join(BUNDLE, "manifest.json"), manifestJson);
  console.log(`report-bundle: v${version}${changed && previous ? ` (was v${previous.version})` : ""} — ${entries.length} templates written to report-bundle/.`);
}
