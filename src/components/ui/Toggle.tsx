"use client";

type ToggleProps = {
  id: string;
  label: string;
  helper?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ id, label, helper, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-text-primary">
          {label}
        </label>
        {helper ? <p className="mt-0.5 text-xs text-text-muted">{helper}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
          checked ? "bg-accent" : "bg-subtle-track"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
