import type { ReactNode } from "react";

/** A titled block inside a step — heading + subtitle over a tinted card, as in the Figma wizard sections. */
export function StaffStepSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-background p-4">{children}</div>
    </section>
  );
}
