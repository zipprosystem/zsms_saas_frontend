"use client";

import { InputField } from "@/components/ui/Input";
import type { LocationCountry } from "@/lib/onboarding/location/types";

type PhoneFieldProps = {
  id: string;
  label: string;
  placeholder?: string;
  dialCode: string;
  number: string;
  countries: LocationCountry[];
  onDialCodeChange: (value: string) => void;
  onNumberChange: (value: string) => void;
};

export function PhoneField({
  id,
  label,
  placeholder,
  dialCode,
  number,
  countries,
  onDialCodeChange,
  onNumberChange,
}: PhoneFieldProps) {
  const dialCodes = Array.from(new Set(countries.map((country) => country.phone))).filter(
    Boolean,
  );
  // The selected country's dial code might not have loaded yet (still fetching
  // countries.json) — keep it selectable even before it appears in the list.
  if (dialCode && !dialCodes.includes(dialCode)) dialCodes.unshift(dialCode);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={`${id}-number`} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          id={`${id}-dial-code`}
          aria-label={`${label} dial code`}
          value={dialCode}
          onChange={(event) => onDialCodeChange(event.target.value)}
          className="h-12 w-24 shrink-0 rounded-md border border-border bg-surface px-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {dialCodes.map((code) => (
            <option key={code} value={code}>
              +{code}
            </option>
          ))}
        </select>
        <InputField
          id={`${id}-number`}
          type="tel"
          value={number}
          placeholder={placeholder}
          onChange={(event) => onNumberChange(event.target.value)}
          className="flex-1"
        />
      </div>
    </div>
  );
}
