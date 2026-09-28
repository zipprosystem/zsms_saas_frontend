import type { ExportConfig } from "@/lib/export/exportTypes";

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "school"
  );
}

export function buildExportFilename(
  config: Pick<ExportConfig<unknown>, "schoolName" | "filenamePrefix" | "periodLabel">,
  extension: "xlsx" | "pdf",
): string {
  const date = new Date().toISOString().slice(0, 10);
  const parts = [
    slugify(config.schoolName),
    config.filenamePrefix,
    config.periodLabel ? slugify(config.periodLabel) : null,
    date,
  ].filter((part): part is string => !!part);
  return `${parts.join("-")}.${extension}`;
}
