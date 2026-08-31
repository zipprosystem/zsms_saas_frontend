"use client";

import { useRef, useState } from "react";
import { CloseIcon } from "@/components/icons/CloseIcon";

export type ChipOption = { value: string; label: string };

type ChipGroupProps = {
  label?: string;
  options: ChipOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  hasError?: boolean;
  error?: string;
  /** Lets the user add values not in `options` — they render as extra chips (derived from `value`, no separate state needed). */
  allowCustom?: boolean;
  addLabel?: string;
  addPlaceholder?: string;
};

export function ChipGroup({
  label,
  options,
  value,
  onChange,
  multiple = true,
  hasError,
  error,
  allowCustom,
  addLabel = "Add",
  addPlaceholder = "Add custom…",
}: ChipGroupProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (optionValue: string) => {
    if (multiple) {
      onChange(
        value.includes(optionValue)
          ? value.filter((current) => current !== optionValue)
          : [...value, optionValue],
      );
    } else {
      onChange([optionValue]);
    }
  };

  const customChips = value
    .filter((current) => !options.some((option) => option.value === current))
    .map((current) => ({ value: current, label: current }));

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      const exists = [...options, ...customChips].some(
        (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
      );
      if (!exists) {
        onChange(multiple ? [...value, trimmed] : [trimmed]);
      }
    }
    setDraft("");
    inputRef.current?.focus();
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <span className="text-sm font-medium text-text-primary">{label}</span>
      ) : null}
      <div
        className="flex flex-wrap items-center gap-2"
        role={multiple ? "group" : "radiogroup"}
      >
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={multiple ? selected : undefined}
              role={multiple ? undefined : "radio"}
              aria-checked={multiple ? undefined : selected}
              onClick={() => toggle(option.value)}
              className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected
                  ? "border-accent bg-brand-tint text-accent"
                  : "border-border bg-surface text-text-secondary hover:bg-background"
              }`}
            >
              {option.label}
            </button>
          );
        })}

        {customChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => toggle(chip.value)}
            className="flex items-center gap-1.5 rounded-full border border-accent bg-brand-tint px-3.5 py-2 text-sm font-medium text-accent transition-colors"
          >
            {chip.label}
            <CloseIcon className="h-3 w-3" />
          </button>
        ))}

        {allowCustom && !isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="rounded-full border border-dashed border-border px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            + {addLabel}
          </button>
        )}

        {allowCustom && isAdding && (
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            placeholder={addPlaceholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDraft();
              } else if (event.key === "Escape") {
                setDraft("");
                setIsAdding(false);
              }
            }}
            onBlur={() => {
              commitDraft();
              setIsAdding(false);
            }}
            className="h-[38px] w-40 rounded-full border border-accent bg-surface px-3.5 text-sm text-text-primary focus:outline-none"
          />
        )}
      </div>
      {hasError && error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}
