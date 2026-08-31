"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label?: string;
  hasError?: boolean;
  error?: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ id, label, hasError, error, className, ...inputProps }, ref) => {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={id}
            className="text-sm font-medium text-text-primary"
          >
            {label}
          </label>
        ) : null}
        <input
          id={id}
          ref={ref}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError && error ? `${id}-error` : undefined}
          className={`h-12 w-full rounded-md border bg-surface px-4 text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
            hasError ? "border-error" : "border-border"
          } ${className ?? ""}`}
          {...inputProps}
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

InputField.displayName = "InputField";
