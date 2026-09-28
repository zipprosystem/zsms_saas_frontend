// Shared types only — deliberately import-free of xlsx/jspdf, so anything
// that just needs to build an ExportConfig (CrudScreen, individual
// screens) never pulls the heavy export libraries into its own module
// graph. Only ExportMenu.tsx's click handlers ever import the modules
// that actually use these.
export type ExportColumn<T> = { header: string; value: (row: T) => string | number };

export type ExportConfig<T> = {
  /** Already filtered/searched — "export what you see" is the default. */
  filteredRows: T[];
  /** Full unfiltered list — used when the user opts into "export all". */
  allRows: T[];
  columns: ExportColumn<T>[];
  /** Sheet/table title, e.g. "Class Subjects". */
  title: string;
  /** Filename segment, e.g. "class-subjects". */
  filenamePrefix: string;
  schoolName: string;
  /** e.g. the selected academic year's name ("2026/2027"). */
  periodLabel?: string;
};
