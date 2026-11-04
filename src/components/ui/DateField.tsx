"use client";

import { useRef, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { DateIcon } from "@/components/icons/DateIcon";

export interface DateFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  id: string;
  label?: string;
  hasError?: boolean;
  error?: string;
  /** Smaller (h-10, text-sm) for table rows. */
  compact?: boolean;
}

/** Keys that open the calendar; printable keys are blocked so the date is only ever picked. */
const OPEN_KEYS = new Set([" ", "Enter", "ArrowDown"]);

/**
 * A date picked from a calendar, not typed: the browser's date input, where
 * a click (or Space / Enter / ↓) anywhere on the field opens its calendar
 * and typing is blocked. Backspace / Delete still clear it. Value is
 * YYYY-MM-DD, like <input type="date">. Same look as InputField.
 */
export function DateField({ id, label, hasError, error, compact, className, disabled, onClick, onKeyDown, ...inputProps }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input || disabled) return;
    try {
      input.showPicker();
    } catch {
      // Older browsers, or no user gesture: the field still focuses and the native control works.
      input.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (OPEN_KEYS.has(event.key)) {
      event.preventDefault();
      openPicker();
    } else if (event.key.length === 1) {
      event.preventDefault();
    }
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          type="date"
          disabled={disabled}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError && error ? `${id}-error` : undefined}
          onClick={(event) => {
            onClick?.(event);
            openPicker();
          }}
          onKeyDown={handleKeyDown}
          className={`w-full cursor-pointer rounded-md border bg-surface text-text-primary ${compact ? "h-10 pl-2 pr-9 text-sm" : "h-12 pl-4 pr-10"} transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-calendar-picker-indicator]:hidden ${
            hasError ? "border-error" : "border-border"
          } ${className ?? ""}`}
          {...inputProps}
        />
        <DateIcon className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${compact ? "right-2.5 h-4 w-4" : "right-3 h-5 w-5"} text-text-muted ${disabled ? "opacity-50" : ""}`} />
      </div>
      {hasError && error ? (
        <p id={`${id}-error`} className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
