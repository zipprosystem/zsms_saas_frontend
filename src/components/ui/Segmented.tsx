"use client";

const SEGMENT = "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const SEGMENT_ON = "bg-accent text-on-accent";
const SEGMENT_OFF = "text-text-secondary hover:bg-background hover:text-text-primary";

/** A small labelled toggle group (one choice, aria-pressed buttons). */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div role="group" aria-label={label} className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={`${SEGMENT} ${option.value === value ? SEGMENT_ON : SEGMENT_OFF}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
