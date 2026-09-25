"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "@/components/icons/header/SearchIcon";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { Button } from "@/components/ui/Button";
import type { FilterDef } from "@/lib/setup/crudTypes";

export type ActiveFilter = { def: FilterDef; value: string; onChange: (value: string) => void };

export type SetupToolbarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  filters?: ActiveFilter[];
  onAddNew?: () => void;
  addNewLabel?: string;
};

/**
 * Shared by DataTable and CardGrid — search box, filter dropdowns, and the
 * Add New button. Mobile-first: everything stacks full-width below `sm`,
 * so no single item's min-width (the search box, a filter dropdown) can
 * ever force the row — and therefore the page — wider than the viewport.
 * At `sm` and up it becomes a wrapping row.
 */
export function SetupToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  onAddNew,
  addNewLabel,
}: SetupToolbarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative w-full min-w-0 sm:min-w-[200px] sm:flex-1">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-11 w-full rounded-md border border-border bg-surface pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      {filters?.map(({ def, value, onChange }) => (
        <FilterDropdown key={def.key} def={def} value={value} onChange={onChange} />
      ))}

      {onAddNew ? (
        <Button
          type="button"
          onClick={onAddNew}
          icon={<PlusIcon className="h-4 w-4" />}
          className="w-full px-4 text-sm sm:ml-auto sm:w-auto"
        >
          {addNewLabel}
        </Button>
      ) : null}
    </div>
  );
}

export type FilterDropdownProps = {
  def: FilterDef;
  value: string;
  onChange: (value: string) => void;
};

// A native <select>'s open dropdown is rendered by the browser/OS, not by
// this page's CSS — there is no reliable way to constrain its width or
// position from here, and on mobile (or a narrow desktop-emulated
// viewport) it can render wider than the screen regardless of how the
// closed trigger is styled. This custom dropdown renders its own menu, so
// its width and position are ordinary CSS: `left-0 right-0` ties the menu
// to its own trigger's width, which is itself already viewport-safe (full
// width on mobile, per the toolbar layout above) — it can never be wider
// than its parent, on any screen size.
//
// Exported (not just used internally by SetupToolbar) — Class-arms' School
// Type selector sits outside any CrudScreen's own filter row entirely (it
// drives which multi-class dataset gets fetched, not a client-side filter
// over an already-fetched list) but hits the exact same native-<select>
// overflow problem, so it reuses this rather than reintroducing the bug.
export function FilterDropdown({ def, value, onChange }: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedLabel = def.options.find((option) => option.value === value)?.label ?? def.label;

  return (
    <div ref={containerRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={def.label}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 text-sm text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto sm:min-w-[160px]"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg sm:right-auto sm:w-max sm:min-w-full"
        >
          {def.options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`block w-full truncate px-4 py-2 text-left text-sm transition-colors ${
                  option.value === value
                    ? "bg-brand-tint text-accent"
                    : "text-text-primary hover:bg-background"
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
