"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { EyeIcon } from "@/components/icons/EyeIcon";
import { EyeOffIcon } from "@/components/icons/EyeOffIcon";

export interface InputFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label?: string;
  hasError?: boolean;
  error?: string;
}

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(
  ({ id, label, hasError, error, className, type, ...inputProps }, ref) => {
    const t = useTranslations();
    const [visible, setVisible] = useState(false);
    const isPassword = type === "password";
    const resolvedType = isPassword ? (visible ? "text" : "password") : type;

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
        <div className="relative">
          <input
            id={id}
            ref={ref}
            type={resolvedType}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError && error ? `${id}-error` : undefined}
            className={`h-12 w-full rounded-md border bg-surface px-4 text-text-primary placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              hasError ? "border-error" : "border-border"
            } ${isPassword ? "pr-11" : ""} ${className ?? ""}`}
            {...inputProps}
          />
          {isPassword ? (
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}
              aria-pressed={visible}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {visible ? (
                <EyeOffIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          ) : null}
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

InputField.displayName = "InputField";
