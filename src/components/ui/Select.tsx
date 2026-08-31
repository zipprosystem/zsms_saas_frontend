"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  id: string;
  label?: string;
  hasError?: boolean;
  error?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ id, label, hasError, error, className, children, ...selectProps }, ref) => {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <label htmlFor={id} className="text-sm font-medium text-text-primary">
            {label}
          </label>
        ) : null}
        <div className="relative">
          <select
            id={id}
            ref={ref}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError && error ? `${id}-error` : undefined}
            className={`h-12 w-full appearance-none rounded-md border bg-surface px-4 pr-10 text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent ${
              hasError ? "border-error" : "border-border"
            } ${className ?? ""}`}
            {...selectProps}
          >
            {children}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        </div>
        {hasError && error ? (
          <p id={`${id}-error`} className="text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

SelectField.displayName = "SelectField";
