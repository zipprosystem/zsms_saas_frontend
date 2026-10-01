"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";

export interface TextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label?: string;
  hasError?: boolean;
  error?: string;
}

/** Same visual language as InputField/SelectField — no plain <textarea> existed in the design system yet. */
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ id, label, hasError, error, className, rows = 3, ...textareaProps }, ref) => {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <label htmlFor={id} className="text-sm font-medium text-text-primary">
            {label}
          </label>
        ) : null}
        <textarea
          id={id}
          ref={ref}
          rows={rows}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError && error ? `${id}-error` : undefined}
          className={`w-full resize-y rounded-md border bg-surface px-4 py-3 text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
            hasError ? "border-error" : "border-border"
          } ${className ?? ""}`}
          {...textareaProps}
        />
        {hasError && error ? (
          <p id={`${id}-error`} className="text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

TextareaField.displayName = "TextareaField";
