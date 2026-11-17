/**
 * Preview-to-PDF parity references: renders every sample payload in a bundle
 * with each template it applies to, through headless Chrome, under the print
 * contract (config.mjs PRINT / PRINT-CONTRACT.md), with the network off. The
 * backend diffs its worker's output for the same inputs against these PDFs.
 *
 * Not committed: package.mjs calls renderParity() on the bundle extracted from
 * a release tag and ships the result only in that release's tarball, so its
 * index.json always describes the exact PDFs beside it.
 *
 * renderParity(bundleDir, chrome) reads bundleDir/manifest.json, templates/
 * and samples/, and writes bundleDir/parity/<sample>__<template_key>.pdf and
 * parity/index.json (Chrome version, settings, page count + page sizes per
 * PDF, and the sha256 of the template, sample and PDF each entry belongs to).
 *
 * Fails on any network request, script error or glyph drawn from a system
 * font (everything must come from the template's embedded fonts).
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PARITY_FAMILIES, PRINT } from "./config.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** The document a worker builds: the same as the app's buildReportSrcDoc (src/lib/exam/report/reportSrcDoc.ts), all pages. */
function reportDocument(html, payload) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html data-theme="light"><head><script>window.__ZSMS_REPORT__=${json};window.__ZSMS_LABELS__={};window.__ZSMS_PAGE__=null;</script></head>${html}<style></style>`;
}

/** Page sizes in page order, from each page object's MediaBox (Chrome writes pages in order). */
function pageSizes(pdf) {
  return [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b[^]*?\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(([, w, h]) => {
    const [a, b] = [Number(w), Number(h)].map((pt) => Math.round((pt / 72) * 25.4));
    const name = Math.min(a, b) === 210 && Math.max(a, b) === 297 ? "A4" : `${a}x${b}mm`;
    return `${name} ${a > b ? "landscape" : "portrait"}`;
  });
}

async function startChrome(binary) {
  const profile = await mkdtemp(join(tmpdir(), "zsms-parity-"));
  const chrome = spawn(binary, ["--headless", "--no-sandbox", "--hide-scrollbars", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--host-resolver-rules=MAP * ~NOTFOUND", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const port = await new Promise((resolve, reject) => {
    let err = "";
    chrome.stderr.on("data", (chunk) => {
      err += chunk;
      const match = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    chrome.on("exit", () => reject(new Error(`Chrome exited: ${err.slice(-500)}`)));
  });
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  return { chrome, profile, port, version: version.Browser };
}

/** One render: a fresh tab, network off, fonts ready, print to PDF. */
async function render(port, doc) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) events.push(data);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (data) => (data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  try {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const { frameTree } = await send("Page.getFrameTree");
    const loaded = new Promise((resolve) => {
      const timer = setInterval(() => {
        if (events.some((e) => e.method === "Page.loadEventFired")) {
          clearInterval(timer);
          resolve();
        }
      }, 20);
    });
    await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: doc });
    await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 3000))]);
    await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });

    // Glyphs from system fonts: every text-bearing element's platform fonts must be the embedded ones.
    await send("DOM.enable");
    await send("CSS.enable");
    const { nodes } = await send("DOM.getFlattenedDocument", { depth: -1 });
    const textParents = new Set(nodes.filter((n) => n.nodeType === 3 && n.nodeValue.trim() && n.parentId).map((n) => n.parentId));
    const systemFonts = new Set();
    for (const nodeId of textParents) {
      const result = await send("CSS.getPlatformFontsForNode", { nodeId }).catch(() => ({ fonts: [] }));
      for (const font of result.fonts) if (!font.isCustomFont) systemFonts.add(font.familyName);
    }
    const { data } = await send("Page.printToPDF", PRINT);
    const requests = events.filter((e) => e.method === "Network.requestWillBeSent").map((e) => e.params.request.url).filter((url) => !/^(data|about):/.test(url));
    const errors = events.filter((e) => e.method === "Runtime.exceptionThrown").map((e) => e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text);
    return { pdf: Buffer.from(data, "base64"), requests, errors, systemFonts: [...systemFonts] };
  } finally {
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
  }
}

export async function renderParity(bundleDir, chromeBinary) {
  if (!chromeBinary) throw new Error("no Chrome binary — set REPORT_CHROME to a Chrome / chrome-headless-shell binary");
  if (typeof WebSocket === "undefined") throw new Error("needs a global WebSocket — Node 22+, or Node 20 with --experimental-websocket");
  const manifest = JSON.parse(await readFile(join(bundleDir, "manifest.json"), "utf8"));
  const out = join(bundleDir, "parity");
  const samples = (await readdir(join(bundleDir, "samples"))).filter((name) => name.endsWith(".json")).sort();
  const { chrome, profile, port, version } = await startChrome(chromeBinary);
  const entries = [];
  const problems = [];
  try {
    await mkdir(out, { recursive: true });
    for (const sampleFile of samples) {
      const family = PARITY_FAMILIES.find((item) => sampleFile.startsWith(item.prefix));
      if (!family) throw new Error(`${sampleFile}: no template family (config.mjs PARITY_FAMILIES)`);
      const sampleText = await readFile(join(bundleDir, "samples", sampleFile), "utf8");
      for (const key of family.templates) {
        const template = manifest.templates.find((item) => item.template_key === key);
        if (!template) throw new Error(`${key}: not in the bundle manifest`);
        const html = await readFile(join(bundleDir, template.file), "utf8");
        const result = await render(port, reportDocument(html, JSON.parse(sampleText)));
        const file = `${sampleFile.replace(/\.json$/, "")}__${key}.pdf`;
        for (const url of result.requests) problems.push(`${file}: network request ${url}`);
        for (const error of result.errors) problems.push(`${file}: script error ${error}`);
        for (const font of result.systemFonts) problems.push(`${file}: text drawn from system font "${font}"`);
        await writeFile(join(out, file), result.pdf);
        const sizes = pageSizes(result.pdf);
        entries.push({ sample: `samples/${sampleFile}`, template_key: key, file: `parity/${file}`, pages: sizes.length, page_sizes: sizes, template_sha256: sha256(html), sample_sha256: sha256(sampleText), pdf_sha256: sha256(result.pdf) });
        console.log(`  ${file}: ${sizes.length} pages`);
      }
    }
  } finally {
    chrome.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true });
  }
  if (problems.length) throw new Error(`not offline / self-contained:\n  ${problems.join("\n  ")}`);
  const index = { bundle_version: manifest.version, chrome: version, print: PRINT, references: entries };
  await writeFile(join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
  return index;
}
