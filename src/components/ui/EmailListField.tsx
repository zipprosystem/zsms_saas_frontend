"use client";

import { useState } from "react";
import { ChipGroup } from "@/components/ui/ChipGroup";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type EmailListFieldProps = {
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  addLabel: string;
  addPlaceholder: string;
  invalidEmailError: string;
};

/**
 * A list of email addresses edited as chips — wraps ChipGroup (already
 * handles the add/remove chip UX for working days and additional
 * languages) with `options={[]}` and `allowCustom`, adding email-format
 * validation on top: a newly-typed entry that isn't a valid email is
 * rejected with an inline error instead of becoming a chip.
 */
export function EmailListField({
  label,
  value,
  onChange,
  addLabel,
  addPlaceholder,
  invalidEmailError,
}: EmailListFieldProps) {
  const [error, setError] = useState<string | null>(null);

  const handleChange = (next: string[]) => {
    // ChipGroup only ever adds or removes exactly one entry per call.
    if (next.length > value.length) {
      const added = next.find((email) => !value.includes(email));
      if (added && !EMAIL_REGEX.test(added.trim())) {
        setError(invalidEmailError);
        return;
      }
    }
    setError(null);
    onChange(next);
  };

  return (
    <ChipGroup
      label={label}
      options={[]}
      value={value}
      onChange={handleChange}
      allowCustom
      addLabel={addLabel}
      addPlaceholder={addPlaceholder}
      hasError={!!error}
      error={error ?? undefined}
    />
  );
}
