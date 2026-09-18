"use client";

import { useEffect, useRef, useState } from "react";
import { InputField } from "@/components/ui/Input";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { checkSlugAvailability } from "@/lib/onboarding/onboardingApi";
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN } from "@/lib/onboarding/validation";
import type { SlugStatus } from "@/lib/onboarding/types";

type SubdomainFieldProps = {
  label: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
  onStatusChange: (status: SlugStatus) => void;
  helper: string;
  checkingLabel: string;
  availableLabel: string;
  takenLabel: string;
  unknownLabel: string;
  hasError?: boolean;
  error?: string;
};

export function SubdomainField({
  label,
  suffix,
  value,
  onChange,
  onStatusChange,
  helper,
  checkingLabel,
  availableLabel,
  takenLabel,
  unknownLabel,
  hasError,
  error,
}: SubdomainFieldProps) {
  const [status, setStatus] = useState<SlugStatus>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const slug = value.trim().toLowerCase();

    if (
      !slug ||
      slug.length < SLUG_MIN_LENGTH ||
      slug.length > SLUG_MAX_LENGTH ||
      !SLUG_PATTERN.test(slug)
    ) {
      requestId.current += 1;
      setStatus("idle");
      setReason(null);
      onStatusChange("idle");
      return;
    }

    const currentRequest = ++requestId.current;
    setStatus("checking");
    setReason(null);
    onStatusChange("checking");

    const timeout = setTimeout(() => {
      checkSlugAvailability(slug)
        .then(({ available, reason: availabilityReason }) => {
          if (requestId.current !== currentRequest) return; // stale response
          const next: SlugStatus = available ? "available" : "taken";
          setStatus(next);
          setReason(available ? null : availabilityReason);
          onStatusChange(next);
        })
        .catch(() => {
          if (requestId.current !== currentRequest) return;
          // Soft UX check only — a failed/timed-out lookup shouldn't claim
          // the slug is taken, and must not block the user either. Real
          // enforcement happens on submit (409). "unknown" (not "idle")
          // so the field shows a soft note instead of just going quiet.
          setStatus("unknown");
          setReason(null);
          onStatusChange("unknown");
        });
    }, 500);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor="school-slug" className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <InputField
            id="school-slug"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            hasError={hasError}
            className="pr-24"
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {status === "checking" && (
              <span className="text-xs text-text-muted">{checkingLabel}</span>
            )}
            {status === "available" && (
              <span className="flex items-center gap-1 rounded-full bg-category-green-tint px-2 py-0.5 text-xs font-semibold text-status-done-text">
                <CheckIcon className="h-3 w-3" />
                {availableLabel}
              </span>
            )}
            {status === "taken" && (
              <span className="flex items-center gap-1 rounded-full bg-error/10 px-2 py-0.5 text-xs font-semibold text-error">
                <CloseIcon className="h-3 w-3" />
                {reason || takenLabel}
              </span>
            )}
            {status === "unknown" && (
              <span className="text-xs text-text-muted">{unknownLabel}</span>
            )}
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-border bg-background px-3 py-3 text-sm text-text-muted">
          {suffix}
        </span>
      </div>
      {hasError && error ? (
        <p className="text-sm text-error">{error}</p>
      ) : (
        <p className="text-xs text-text-muted">{helper}</p>
      )}
    </div>
  );
}
