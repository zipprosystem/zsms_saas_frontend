"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { CloseIcon } from "@/components/icons/CloseIcon";

export type MultiSearchableSelectOption = { value: string; label: string; searchText?: string };

type MultiSearchableSelectProps = {
  id: string;
  label?: string;
  placeholder?: string;
  options: MultiSearchableSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  noOptionsLabel?: string;
  hasError?: boolean;
  error?: string;
};

/**
 * Searchable multi-select — no equivalent existed for a multi-value
 * version of SearchableSelect.tsx (that component is single-value only).
 * Combines its filter-as-you-type input with a chip list of current
 * selections. Built for Siblings (Step 6) — searching existing students by
 * name/admission number and picking any number of them.
 */
export function MultiSearchableSelect({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  noOptionsLabel,
  hasError,
  error,
}: MultiSearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selected = useMemo(() => options.filter((option) => value.includes(option.value)), [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const notSelected = options.filter((option) => !value.includes(option.value));
    if (!q) return notSelected;
    return notSelected.filter((option) => `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(q));
  }, [options, query, value]);

  const add = (option: MultiSearchableSelectOption) => {
    onChange([...value, option.value]);
    setQuery("");
    setHighlightedIndex(0);
  };

  const remove = (optionValue: string) => {
    onChange(value.filter((current) => current !== optionValue));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[highlightedIndex];
      if (option) add(option);
    } else if (event.key === "Backspace" && !query && selected.length > 0) {
      remove(selected[selected.length - 1].value);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={containerRef} className="relative flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      ) : null}

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((option) => (
            <span
              key={option.value}
              className="flex items-center gap-1.5 rounded-full border border-accent bg-brand-tint px-3 py-1.5 text-sm font-medium text-accent"
            >
              {option.label}
              <button type="button" onClick={() => remove(option.value)} disabled={disabled}>
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className={`h-12 w-full rounded-md border bg-surface px-4 pr-10 text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
            hasError ? "border-error" : "border-border"
          }`}
        />
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      </div>

      {isOpen && !disabled ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-text-muted">{noOptionsLabel}</li>
          ) : (
            filtered.map((option, index) => (
              <li key={option.value} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => add(option)}
                  className={`block w-full truncate px-4 py-2 text-left text-sm transition-colors ${
                    index === highlightedIndex ? "bg-brand-tint text-accent" : "text-text-primary hover:bg-background"
                  }`}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {hasError && error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}
