import type { ReactNode } from "react";

type SettingsCardProps = {
  title: string;
  editLabel?: string;
  onEdit?: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function SettingsCard({ title, editLabel, onEdit, headerExtra, children }: SettingsCardProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        <div className="flex items-center gap-3">
          {headerExtra}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="text-sm font-semibold text-accent hover:underline"
            >
              {editLabel}
            </button>
          ) : null}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

type SettingsFieldProps = {
  label: string;
  value: ReactNode;
};

export function SettingsField({ label, value }: SettingsFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="break-words text-sm text-text-primary">{value}</span>
    </div>
  );
}
