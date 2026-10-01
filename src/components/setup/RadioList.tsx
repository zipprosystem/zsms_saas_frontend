"use client";

import type { ReactNode } from "react";

/**
 * Single-select sibling of CheckboxList, same visual shell (bordered list,
 * scrollable body) minus the "select all" header, which makes no sense for
 * a single choice. Introduced for Class Subject Grouping's Class field
 * (product owner: single class via radio, not a multi-select checklist —
 * see classSubjectGroupingApi.ts for why a group only ever derives one
 * class's worth of class-subjects).
 */
export type RadioListOption = {
  id: string;
  label: string;
  /** Rendered before the label — e.g. Subject Master's color dot. */
  leading?: ReactNode;
};

type RadioListProps = {
  name: string;
  options: RadioListOption[];
  selectedId: string;
  onChange: (id: string) => void;
};

export function RadioList({ name, options, selectedId, onChange }: RadioListProps) {
  return (
    <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1.5">
      {options.map((option) => (
        <label
          key={option.id}
          className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-primary hover:bg-background"
        >
          <input
            type="radio"
            name={name}
            checked={selectedId === option.id}
            onChange={() => onChange(option.id)}
            className="h-4 w-4 shrink-0 border-border accent-accent"
          />
          {option.leading}
          <span className="truncate">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
