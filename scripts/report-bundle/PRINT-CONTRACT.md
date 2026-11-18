# Print contract

The settings that turn a template plus a payload into the authoritative PDF.
The reference PDFs beside this file in a release tarball were rendered with
exactly these settings (`npm run report-bundle:package`; they aren't kept in
git). A worker that follows them should match the references page for page.

## 1. Document

Use the template file from `templates/`, with this boot script in front of it
(same as the app's `buildReportSrcDoc`):

```html
<!doctype html><html data-theme="light"><head><script>
window.__ZSMS_REPORT__ = <payload JSON, with < → \u003c and U+2028/2029 escaped>;
window.__ZSMS_LABELS__ = {};      // or the school's translated labels
window.__ZSMS_PAGE__   = null;    // all pages
</script></head>
<template file contents>
<style></style>
```

## 2. Load

- **Network off.** Abort every request except `data:` URLs. The templates need
  nothing else; payload images must already be `data:` URIs (see README).
- **Wait for fonts:** `await document.fonts.ready` after the document loads,
  before printing.

## 3. Print

**Chrome build: chrome-headless-shell 156.0.8078.79 (linux64).** The
references were rendered with this exact build, the same as the worker's.
Page breaks can move between Chrome versions, so render with this build
when comparing. Install it with
`npx @puppeteer/browsers install chrome-headless-shell@156.0.8078.79`.
`npm run report-bundle:package` refuses any other build.

Chrome DevTools `Page.printToPDF`, or Puppeteer `page.pdf` with the same values:

| Setting | Value | Why |
| --- | --- | --- |
| `preferCSSPageSize` | `true` | The template's `@page` rules set each page's size and orientation. Required for British Full's mixed pages. |
| `printBackground` | `true` | Headers, bands and grade pills are backgrounds. |
| `scale` | `1` | Never shrink to fit; the templates are laid out for 100%. |
| `landscape` | `false` | Orientation comes from `@page`, not this flag. |
| `displayHeaderFooter` | `false` | No browser header or footer. |
| Paper | A4: `paperWidth 8.2677`, `paperHeight 11.6929` (inches) | Fallback only: every template now declares its own `@page`. Puppeteer: `format: "A4"`. |
| Margins | `0.4in` on all four sides | Fallback only: a template's `@page` margin always overrides it. Set it explicitly, because Puppeteer defaults to 0 and DevTools to 0.4in. |

### Page size, margins and orientation per template

| Template | Pages | Size | Margins (from `@page`) |
| --- | --- | --- | --- |
| `nigerian_terminal` | 1 | A4 portrait | 9mm |
| `nigerian_primary` | 1 | A4 portrait | 0 (the sheet draws its own) |
| `white_pearl` | 1 | A4 portrait | 0 (the sheet draws its own) |
| `lela_blossom` | 2 | A4 portrait | 0 (the sheet draws its own) |
| `modern_generic` | 2 (its `zsms-report-pages` meta still says 1) | A4 portrait | 0.4in |
| `british_progress` Full | 4 | cover + subject comments A4 portrait; results + descriptors A4 landscape | portrait 12mm, landscape 7mm |
| `british_progress` Progress | 2 | A4 landscape | 7mm |

**How per-page orientation is honoured.** The British template's default
`@page` is A4 landscape. The cover and subject-comment sections set
`page: portrait`, a named page (`@page portrait { size: A4 portrait }`).
With `preferCSSPageSize: true`, Chrome gives each printed sheet the size of
the page rule its content uses. A single PDF therefore mixes portrait and
landscape sheets. With `preferCSSPageSize: false`, Chrome keeps the
orientation but takes the sheet size from the paper setting. If no paper is
given, that's US Letter instead of A4.

**Page counts.** "Pages" above is the baseline for normal content. Long
content (many subjects, long comments) adds sheets:

- **British Full.** The cover is always exactly one page. Subject comments
  flow over as many portrait pages as they need; a subject's card never
  splits. The results page fills its sheet, and the descriptors start the
  next one. When the subject list pushes the comment strip off the results
  page, the descriptors share that overflow page.
- **Modern Generic.** The grade key never splits; it stays whole on the
  last page.
- **LeLa Blossom Full.** The remarks and all signatures stay together. If
  they don't fit under the results on sheet 1, they move as one block to the
  next page. The subject teachers' comments are always the last sheet.
- **Primary.** One page up to 14 subjects with long comments (about 21
  with short ones). Past that, the comments and signatures move to page 2
  together.

## 4. Comparing against the references

`index.json` lists each reference: sample, template_key, page count, page
sizes in order, and the sha256 of the template, the sample and the PDF itself.
It also records the bundle version, the Chrome build used and the print
settings. Compare:

1. **Page count and the page-size sequence:** must be equal.
2. **Each page rasterised (e.g. 100 dpi):** a near-zero pixel difference.
   Small anti-aliasing differences between Chrome versions are expected.
   Moved or missing content is not.

Don't compare PDF bytes. Chrome stamps a creation date and its own object
layout, so two correct renders are never byte-identical.
