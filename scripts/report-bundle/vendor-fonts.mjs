/**
 * One-off font vendoring for the report templates (re-run only to add or
 * change a font). Downloads the exact faces the templates used to pull from
 * Google Fonts at view time — latin, latin-ext and vietnamese subsets — into
 * scripts/report-bundle/fonts/, with each family's OFL licence, and writes
 * fonts/faces.json (the @font-face rules, pointing at the local files).
 *
 * build.mjs then embeds these faces in the templates as base64, so a report
 * renders with no network: the backend's headless-Chrome PDF worker runs
 * offline, and the in-app preview no longer depends on Google.
 *
 *   node scripts/report-bundle/vendor-fonts.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FONTS = join(dirname(fileURLToPath(import.meta.url)), "fonts");

/** Family → the axes/weights the templates requested (as in the old Google Fonts links). */
const FAMILIES = {
  "IBM Plex Sans": { css: "IBM+Plex+Sans:wght@400;500;600;700", ofl: "ibmplexsans", kind: "sans" },
  "Libre Baskerville": { css: "Libre+Baskerville:wght@400;700", ofl: "librebaskerville", kind: "serif" },
  Fraunces: { css: "Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700", ofl: "fraunces", kind: "serif" },
  Mulish: { css: "Mulish:wght@400;600;700;800", ofl: "mulish", kind: "sans" },
  "Playfair Display": { css: "Playfair+Display:wght@700;800", ofl: "playfairdisplay", kind: "serif" },
  "Libre Franklin": { css: "Libre+Franklin:wght@600;700;800", ofl: "librefranklin", kind: "sans" },
  Archivo: { css: "Archivo:wght@600;700;800", ofl: "archivo", kind: "sans" },
};
const SUBSETS = ["vietnamese", "latin-ext", "latin"];

/**
 * Glyph-only fallbacks for characters the families above don't carry, so
 * nothing falls through to the machine's fonts (on a bare render server:
 * empty boxes). build.mjs declares them BEFORE each family's own faces, so
 * the family's glyphs still win wherever it has them.
 *   symbols   — template text: Modern's →, British VA ▲ ● ▼ and ≥, White Pearl's Σ
 *   nigerian  — letters in Yoruba / Igbo / Hausa names and comments that some
 *               families lack (e.g. Libre Baskerville has no ẹ ọ ị ụ ₦, IBM
 *               Plex Sans no ṣ, most have no ɓ ɗ ƙ ƴ ṅ ǹ ḿ), plus the combining
 *               tone marks and dot below; serif families get Noto Serif, sans Noto Sans
 */
const NIGERIAN = "ẸẹỌọṢṣỊịỤụṄṅƁɓƊɗƘƙƳƴǸǹḾḿ₦" + "\u0300\u0301\u0304\u0323"; // + combining grave, acute, macron, dot below
const FALLBACKS = [
  { id: "symbols", for: "all", css: "Noto+Sans+Math", ofl: "notosansmath", text: "→≥Σ▲▼●" },
  { id: "nigerian-sans", for: "sans", css: "Noto+Sans:wght@100..900", ofl: "notosans", text: NIGERIAN },
  { id: "nigerian-serif", for: "serif", css: "Noto+Serif:wght@100..900", ofl: "notoserif", text: NIGERIAN },
];

// A current Chrome UA, so the CSS API serves woff2 with unicode-range subsets.
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const codepoints = (text) => [...text].map((ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(", ");

async function get(url, binary = false) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return binary ? Buffer.from(await res.arrayBuffer()) : res.text();
}

async function licence(ofl, name) {
  await writeFile(join(FONTS, `OFL-${slug(name)}.txt`), await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${ofl}/OFL.txt`));
}

await mkdir(FONTS, { recursive: true });
const faces = [];
for (const [family, spec] of Object.entries(FAMILIES)) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${spec.css}`);
  const byUrl = new Map();
  for (const [, subset, body] of css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    if (!SUBSETS.includes(subset)) continue;
    const prop = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    const url = body.match(/url\(([^)]+)\)/)[1];
    const weight = Number(prop("font-weight"));
    const seen = byUrl.get(url);
    // A variable font serves several weights from one file: one face, a weight range.
    if (seen) {
      seen.weight = [Math.min(seen.weight[0], weight), Math.max(seen.weight[1], weight)];
      continue;
    }
    byUrl.set(url, { family, kind: spec.kind, style: prop("font-style"), weight: [weight, weight], subset, unicodeRange: prop("unicode-range"), url });
  }
  for (const face of byUrl.values()) {
    const w = face.weight[0] === face.weight[1] ? String(face.weight[0]) : `${face.weight[0]}-${face.weight[1]}`;
    face.file = `${slug(family)}-${face.style}-${w}-${face.subset}.woff2`;
    await writeFile(join(FONTS, face.file), await get(face.url, true));
    delete face.url;
    faces.push(face);
  }
  await licence(spec.ofl, family);
  console.log(`${family}: ${byUrl.size} faces`);
}
for (const fallback of FALLBACKS) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${fallback.css}&text=${encodeURIComponent(fallback.text)}`);
  const source = decodeURIComponent(fallback.css.split(":")[0].replace(/\+/g, " "));
  const file = `fallback-${fallback.id}.woff2`;
  await writeFile(join(FONTS, file), await get(css.match(/url\(([^)]+)\)/)[1], true));
  await licence(fallback.ofl, source);
  faces.push({ family: `fallback:${fallback.id}`, source, for: fallback.for, style: "normal", weight: null, subset: fallback.id, unicodeRange: codepoints(fallback.text), file });
  console.log(`${source}: fallback ${fallback.id} ${fallback.text}`);
}
await writeFile(join(FONTS, "faces.json"), JSON.stringify(faces, null, 2) + "\n");
