"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableSelectProps = {
  id: string;
  label?: string;
  placeholder?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  noOptionsLabel?: string;
  hasError?: boolean;
  error?: string;
};

export function SearchableSelect({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  loading,
  loadingLabel,
  noOptionsLabel,
  hasError,
  error,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  // Keep the displayed text in sync with the selection when not actively typing.
  useEffect(() => {
    if (!isOpen) setQuery(selectedOption?.label ?? "");
  }, [selectedOption, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedOption?.label ?? "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, selectedOption]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || query === selectedOption?.label) return options;
    return options.filter((option) =>
      `${option.label} ${option.searchText ?? ""}`.toLowerCase().includes(q),
    );
  }, [options, query, selectedOption]);

  const commit = (option: SearchableSelectOption) => {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
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
      if (option) commit(option);
    } else if (event.key === "Escape") {
      setIsOpen(false);
      setQuery(selectedOption?.label ?? "");
    }
  };

  return (
    <div ref={containerRef} className="relative flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
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
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(Math.max(options.findIndex((o) => o.value === value), 0));
          }}
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
          {loading ? (
            <li className="px-4 py-2 text-sm text-text-muted">{loadingLabel}</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-text-muted">{noOptionsLabel}</li>
          ) : (
            filtered.map((option, index) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(option)}
                  className={`block w-full truncate px-4 py-2 text-left text-sm transition-colors ${
                    index === highlightedIndex
                      ? "bg-brand-tint text-accent"
                      : "text-text-primary hover:bg-background"
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
