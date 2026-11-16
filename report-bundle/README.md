# ZSMS report template bundle

The result-card templates the backend's PDF worker renders with headless Chrome
(DEC-008). Each template is a single self-contained HTML file: CSS, fonts and
template images are inlined, so **a render makes no network requests**. The only
external data is what the payload carries (see [Images](#images-in-the-payload)).

**Never edit files here by hand.** The frontend (`zsms_saas_frontend`) is the
single source. The templates live in `public/template-previews/` and this folder
is rebuilt from them by `scripts/report-bundle/build.mjs`.

## Contents

| Path | What |
| --- | --- |
| `manifest.json` | Bundle `version`, `content_sha256`, the template list (`template_key` → `file`, page counts, page sizes, fonts) and a sha256 for every file |
| `templates/*.html` | The six templates: `nigerian_terminal`, `british_progress`, `modern_generic`, `nigerian_primary`, `lela_blossom`, `white_pearl` |
| `contract/report-payload.ts` | The payload type (`window.__ZSMS_REPORT__`), generated from the frontend's `reportPayload.ts` |
| `samples/*.json` | Test payloads: stress (14 subjects, long accented text, extra CA column) and normal-class, General / LeLa / British, Full and Progress |
| `licenses/` | SIL Open Font License for every embedded font |

## Rendering a report

1. **Pick the template** by the class's `template_key` → `manifest.templates[].file`.
2. **Build the document** the same way the app does (`buildReportSrcDoc` in
   `src/lib/exam/report/reportSrcDoc.ts`). Put a boot script in front of the
   template's HTML, so it runs before the template's own scripts:

   ```html
   <!doctype html><html data-theme="light"><head><script>
   window.__ZSMS_REPORT__ = {…payload…};   // required: one student's report
   window.__ZSMS_LABELS__ = {…};           // optional: translated template text
   window.__ZSMS_PAGE__   = null;          // null = all pages (what a PDF wants)
   </script></head>
   …template file contents…
   ```

   When inlining the payload JSON, escape `<` as `<` and U+2028 / U+2029,
   so no value can close the script tag.
   - `data-theme="light"` is required. A report is a print artifact, so it renders as printed whatever the theme.
   - Without `__ZSMS_REPORT__` a template shows its built-in sample data (the catalog preview).
3. **Load it with the network disabled**, e.g. Puppeteer `setContent` with
   request interception that aborts everything except `data:` URLs. The
   templates need nothing else.
4. **Wait for fonts**: `await page.evaluate(() => document.fonts.ready)`
   before printing.
5. **Print**:
   `page.pdf({ printBackground: true, preferCSSPageSize: true, format: "A4" })`.
   - `preferCSSPageSize` is required. The templates declare their `@page` size, and the British card mixes portrait pages (cover, subject comments) with landscape pages (results grid, descriptors) through a named page.
   - `format: "A4"` is only the fallback for a template without `@page` (currently `modern_generic`; see Known limits).

**Page count.** The payload's `meta.pages` matches the template's
`<meta name="zsms-report-pages">` (and `zsms-report-pages-progress` where
Progress differs, e.g. British Full 4 / Progress 2). Long content (many subjects,
long comments) flows onto further sheets.

**File name.** The app names a download
`studentname_arm_term_point_session` (`reportFileName` in `reportSrcDoc.ts`).
Use the same rule so app and worker downloads match.

**Labels.** `__ZSMS_LABELS__` is a `{ key: text }` map of the template text the
app translates. The keys are under `exam.viewResults.report.templateLabels.*`
in the frontend's `src/messages/en.json` and `src/messages/fr.json`. A missing key falls
back to the template's English.

## Images in the payload

`school.logo_url`, `student.photo_url` and `signatures.*.signature_url` are URLs
the template puts into `<img>`. For a fully offline render, the worker should
fetch them itself and inject them as `data:` URIs. The samples do this.

## Fonts

All fonts are embedded as base64 `@font-face` rules (SIL OFL 1.1). They are the
same files Google Fonts served the templates before, so the output looks the
same. Coverage:

- Latin, Latin Extended and Vietnamese ranges of each template's families.
- Glyph-only Noto fallbacks for letters in Yoruba, Igbo and Hausa names that
  some families lack (ẹ ọ ṣ ị ụ ṅ ɓ ɗ ƙ ƴ ǹ ḿ ₦, combining tone marks and dot below).
- Template symbols (→ ▲ ● ▼ ≥ Σ).

Payload text in other scripts (Arabic, CJK, emoji…) still needs fonts on the
worker machine. Installing `fonts-noto-core` (and `fonts-noto-color-emoji`) in
the worker image is a cheap safety net.

## Versioning and drift

`manifest.version` is semver, bumped whenever any bundled file changes:

- **patch**: a template's look or layout.
- **minor**: a new template, or a new optional payload field.
- **major**: a breaking change to the payload or the injection convention.

`content_sha256` covers every file. `files` lists each file's own sha256.
Record the bundle version with every generated PDF, and verify file hashes
against the manifest on load to detect a partial or hand-edited copy.

Re-sync after any template change (frontend):

```sh
npm run report-bundle -- --bump patch   # rebuild + bump (patch | minor | major)
npm run report-bundle:check             # verify only; fails on drift
```

The build fails if a template references anything external, or if the bundle
changed without a version bump. How the bundle reaches the backend is still to
be agreed with the backend team.

## Known limits

- `modern_generic` has no `@page` rule and little print CSS: pass A4 (as above).
  It prints over several sheets.
- `nigerian_terminal` Full fits one A4 page up to about 11 subjects (3 CA
  columns, 9-band grade key). More subjects continue on a second page.
