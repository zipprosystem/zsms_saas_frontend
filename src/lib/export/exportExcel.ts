// Only ever reached via a dynamic import() from ExportMenu.tsx's click
// handler — never import this module statically from anywhere, or xlsx
// (a genuinely heavy library) ends up in the main page bundle.
//
// SECURITY NOTE: xlsx@0.18.5 (npm's last-published SheetJS build) carries
// two known high-severity advisories — Prototype Pollution and a ReDoS —
// both in the PARSING path (reading an untrusted .xlsx/.csv). This module
// only ever WRITES a workbook built from our own in-memory rows via
// XLSX.utils.aoa_to_sheet/XLSX.writeFile; it never calls XLSX.read or
// parses external file content, so that vulnerable path is never
// exercised here. Revisit (switch to SheetJS's patched CDN build, or
// upgrade once npm carries a fixed version) if spreadsheet IMPORT is ever
// added anywhere in this app.
import * as XLSX from "xlsx";
import { buildExportFilename } from "@/lib/export/exportFilename";
import type { ExportConfig } from "@/lib/export/exportTypes";

export function exportRowsAsExcel<T>(config: ExportConfig<T>, rows: T[]): void {
  const header = config.columns.map((column) => column.header);
  const body = rows.map((row) => config.columns.map((column) => column.value(row)));
  const titleLine = config.periodLabel ? `${config.schoolName} — ${config.periodLabel}` : config.schoolName;

  const sheet = XLSX.utils.aoa_to_sheet([[titleLine], [config.title], [], header, ...body]);
  const workbook = XLSX.utils.book_new();
  // Sheet names are capped at 31 characters by the xlsx format itself.
  XLSX.utils.book_append_sheet(workbook, sheet, config.title.slice(0, 31));
  XLSX.writeFile(workbook, buildExportFilename(config, "xlsx"));
}
