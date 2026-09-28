"use client";

import type { ReactNode } from "react";

/**
 * Generalized from ClassTermsScreen's original ClassesCheckboxList (Class
 * Terms' "Apply to" checklist) — C2 needs this exact shape four times
 * (Classes + Subjects on Class Subjects' create form, Classes + Class
 * Subjects on Grouping's form), so it's pulled out here rather than
 * copy-pasted. ClassTermsScreen's own inline version is left as-is
 * (untouched, still working) — not worth a risky refactor of already-
 * shipped code just to point it at this.
 */
export type CheckboxListOption = {
  id: string;
  label: string;
  /** Rendered before the label — e.g. Subject Master's color dot. */
  leading?: ReactNode;
};

type CheckboxListProps = {
  options: CheckboxListOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  selectAllLabel: string;
};

export function CheckboxList({ options, selectedIds, onChange, selectAllLabel }: CheckboxListProps) {
  const allChecked = options.length > 0 && selectedIds.length === options.length;
  const someChecked = selectedIds.length > 0 && !allChecked;

  const toggleAll = () => {
    onChange(allChecked ? [] : options.map((option) => option.id));
  };
  const toggleOne = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((current) => current !== id) : [...selectedIds, id]);
  };

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border">
      <label className="flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5 text-sm font-semibold text-text-primary">
        <input
          type="checkbox"
          checked={allChecked}
          ref={(node) => {
            if (node) node.indeterminate = someChecked;
          }}
          onChange={toggleAll}
          className="h-4 w-4 shrink-0 rounded border-border accent-accent"
        />
        {selectAllLabel}
      </label>
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto p-1.5">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-primary hover:bg-background"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(option.id)}
              onChange={() => toggleOne(option.id)}
              className="h-4 w-4 shrink-0 rounded border-border accent-accent"
            />
            {option.leading}
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
