// Only ever reached via a dynamic import() from ExportMenu.tsx's click
// handler — never import this module statically, or jspdf/jspdf-autotable
// (both genuinely heavy) end up in the main page bundle.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { buildExportFilename } from "@/lib/export/exportFilename";
import type { ExportConfig } from "@/lib/export/exportTypes";

const BRAND_PURPLE: [number, number, number] = [133, 43, 153];

export function exportRowsAsPdf<T>(config: ExportConfig<T>, rows: T[]): void {
  // Landscape by default — Setup tables tend to have more columns than a
  // portrait page comfortably fits. Deliberately theme-neutral (plain
  // black text on white) regardless of the app's own dark mode — a PDF is
  // for printing/sharing, not for matching the viewer's current theme.
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(14);
  doc.text(config.schoolName, 14, 15);
  doc.setFontSize(11);
  doc.text(config.periodLabel ? `${config.title} — ${config.periodLabel}` : config.title, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(new Date().toLocaleDateString(), 14, 28);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 33,
    head: [config.columns.map((column) => column.header)],
    body: rows.map((row) => config.columns.map((column) => String(column.value(row)))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: BRAND_PURPLE, textColor: 255 },
  });

  doc.save(buildExportFilename(config, "pdf"));
}
