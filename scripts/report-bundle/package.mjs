/**
 * Release tarball for a tagged report bundle: report-bundle-v<version>.tar.gz.
 *
 * Git holds the bundle's source (templates, samples, contract, licences,
 * manifest, PRINT-CONTRACT.md), not the parity PDFs. This script adds those
 * at package time, so a tarball is always internally consistent: its
 * parity/index.json describes exactly the PDFs it ships, whether or not
 * Chrome's PDF output is byte-for-byte repeatable.
 *
 *   1. extracts the tag's committed tree (git archive — never the working tree);
 *   2. runs the tag's own build.mjs --check there: the tagged report-bundle/
 *      must equal a fresh build of the tagged source;
 *   3. checks every bundle file against manifest.json;
 *   4. renders the parity references into that copy (parity.mjs, also the
 *      tag's own), then refuses to package unless every reference was rendered
 *      from the manifest's template and sample hashes, every sample is
 *      covered, and every PDF matches its index.json hash;
 *   5. writes <out>/report-bundle-v<version>.tar.gz (folder
 *      report-bundle-v<version>/) and prints its sha256.
 *
 *   REPORT_CHROME=/path/to/chrome-headless-shell \
 *     npm run report-bundle:package -- [tag] [--out dir]
 *
 * REPORT_CHROME must be chrome-headless-shell 156.0.8078.79 (config.mjs
 * CHROME — the worker's build); any other build is refused.
 *
 * tag defaults to report-bundle-v<version in the working manifest>; --out
 * defaults to the system temp folder.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BUNDLE, ROOT } from "./config.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
function fail(message) {
  console.error(`report-bundle package: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = resolve(outIndex >= 0 ? args[outIndex + 1] ?? fail("--out needs a folder") : tmpdir());
const positional = args.filter((_, i) => outIndex < 0 || (i !== outIndex && i !== outIndex + 1));
const tag = positional[0] ?? `report-bundle-v${JSON.parse(await readFile(join(BUNDLE, "manifest.json"), "utf8")).version}`;
const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8" }).trim();
try {
  git("rev-parse", "--verify", "--quiet", `${tag}^{commit}`);
} catch {
  fail(`no tag or commit "${tag}" — commit and tag the bundle first`);
}

// 1. The tag's committed tree: the bundle plus everything its build reads.
const stage = await mkdtemp(join(tmpdir(), "zsms-report-bundle-"));
try {
  const archive = execFileSync("git", ["archive", tag, "report-bundle", "scripts/report-bundle", "public/template-previews", "src"], { cwd: ROOT, maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", stage], { input: archive });
  const bundle = join(stage, "report-bundle");
  const manifest = JSON.parse(await readFile(join(bundle, "manifest.json"), "utf8"));
  const tagVersion = tag.match(/^report-bundle-v(\d+\.\d+\.\d+)$/)?.[1];
  if (tagVersion && tagVersion !== manifest.version) fail(`${tag} holds manifest v${manifest.version}`);
  console.log(`report-bundle package: ${tag} (v${manifest.version}, ${git("rev-parse", "--short", `${tag}^{commit}`)})`);

  // 2. The tagged bundle is a fresh build of the tagged source.
  const check = spawnSync(process.execPath, [join(stage, "scripts", "report-bundle", "build.mjs"), "--check"], { stdio: "inherit" });
  if (check.status !== 0) fail(`${tag}: report-bundle:check failed`);

  // 3. Every file is the one the manifest lists, and nothing else is there (README.md is hand-written, unlisted).
  const onDisk = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(dir, entry.name));
      else onDisk.push(relative(bundle, join(dir, entry.name)));
    }
  };
  await walk(bundle);
  const listed = Object.keys(manifest.files);
  const unlisted = onDisk.filter((file) => !listed.includes(file) && !["manifest.json", "README.md"].includes(file));
  const missing = listed.filter((file) => !onDisk.includes(file));
  if (unlisted.length || missing.length) fail(`${tag}: bundle files don't match the manifest (unlisted: ${unlisted.join(", ") || "none"}; missing: ${missing.join(", ") || "none"})`);
  for (const file of listed) if (sha256(await readFile(join(bundle, file))) !== manifest.files[file]) fail(`${tag}: ${file} doesn't match its manifest hash`);

  // 4. Parity references, rendered from this copy, tied to the manifest's hashes.
  const { renderParity } = await import(pathToFileURL(join(stage, "scripts", "report-bundle", "parity.mjs")).href);
  const index = await renderParity(bundle, process.env.REPORT_CHROME).catch((error) => fail(error.message));
  const stale = [];
  for (const ref of index.references) {
    const template = manifest.templates.find((item) => item.template_key === ref.template_key);
    if (!template || ref.template_sha256 !== manifest.files[template.file]) stale.push(`${ref.file}: template`);
    if (ref.sample_sha256 !== manifest.files[ref.sample]) stale.push(`${ref.file}: sample`);
    if (sha256(await readFile(join(bundle, ref.file))) !== ref.pdf_sha256) stale.push(`${ref.file}: pdf`);
  }
  const covered = new Set(index.references.map((ref) => ref.sample));
  for (const sample of listed.filter((file) => file.startsWith("samples/") && !covered.has(file))) stale.push(`${sample}: no reference`);
  if (stale.length) fail(`parity references don't match the bundle:\n  ${stale.join("\n  ")}`);

  // 5. The tarball: stable order, owner and timestamps (the tag's commit time).
  const name = `report-bundle-v${manifest.version}`;
  const tarball = join(outDir, `${name}.tar.gz`);
  const mtime = git("log", "-1", "--format=%ct", `${tag}^{commit}`);
  const tar = execFileSync("tar", ["--sort=name", "--owner=0", "--group=0", "--numeric-owner", `--mtime=@${mtime}`, `--transform=s,^report-bundle,${name},`, "-C", stage, "-cf", "-", "report-bundle"], { maxBuffer: 1 << 30 });
  execFileSync("sh", ["-c", 'gzip -n -9 > "$1"', "sh", tarball], { input: tar });
  console.log(`report-bundle package: ${index.references.length} parity references (${index.chrome}).`);
  console.log(`${tarball}\nsha256 ${sha256(await readFile(tarball))}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
