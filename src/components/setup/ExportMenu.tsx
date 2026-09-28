"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import type { ExportConfig } from "@/lib/export/exportTypes";

type ExportMenuProps<T> = {
  config: ExportConfig<T>;
};

/**
 * Reusable "Export ▾" button for any list screen's SetupToolbar — an
 * "include all rows" checkbox plus Excel/PDF actions. Both export
 * implementations are dynamically imported right here, in the click
 * handler, so xlsx/jspdf never enter a page's bundle until a user actually
 * clicks one of these buttons (same lazy-loading principle as Subject
 * Master's TipTap editor).
 */
export function ExportMenu<T>({ config }: ExportMenuProps<T>) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [includeAll, setIncludeAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const rows = includeAll ? config.allRows : config.filteredRows;
  const disabled = config.allRows.length === 0;

  const exportExcel = async () => {
    setIsOpen(false);
    const { exportRowsAsExcel } = await import("@/lib/export/exportExcel");
    exportRowsAsExcel(config, rows);
  };

  const exportPdf = async () => {
    setIsOpen(false);
    const { exportRowsAsPdf } = await import("@/lib/export/exportPdf");
    exportRowsAsPdf(config, rows);
  };

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {t("setup.export.label")}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-4 py-2.5 text-sm text-text-primary hover:bg-background">
            <input
              type="checkbox"
              checked={includeAll}
              onChange={(event) => setIncludeAll(event.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-border accent-accent"
            />
            {t("setup.export.includeAll")}
          </label>
          <button
            type="button"
            role="menuitem"
            onClick={exportExcel}
            className="block w-full px-4 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-background"
          >
            {t("setup.export.asExcel")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={exportPdf}
            className="block w-full px-4 py-2.5 text-left text-sm text-text-primary transition-colors hover:bg-background"
          >
            {t("setup.export.asPdf")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
