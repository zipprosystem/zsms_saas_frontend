import { CheckIcon } from "@/components/icons/CheckIcon";

type SetupItemRowProps = {
  name: string;
  description?: string;
  done: boolean;
  doneLabel: string;
  isLast: boolean;
};

export function SetupItemRow({
  name,
  description,
  done,
  doneLabel,
  isLast,
}: SetupItemRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 px-6 py-3.5 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {done ? (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-status-done text-white">
            <CheckIcon className="h-3 w-3" />
          </span>
        ) : (
          <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-status-empty-border" />
        )}
        <span className="min-w-0">
          <span
            className={`block text-[13px] ${done ? "text-text-muted" : "text-text-primary"}`}
          >
            {name}
          </span>
          {description && (
            <span className="mt-0.5 block text-[11px] text-text-muted">
              {description}
            </span>
          )}
        </span>
      </div>

      {done && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-category-green-tint px-2 py-0.5 text-[11px] font-semibold text-status-done-text">
          <CheckIcon className="h-3 w-3" />
          {doneLabel}
        </span>
      )}
    </div>
  );
}
