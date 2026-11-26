"use client";

import { useTranslations } from "next-intl";

type ToggleProps = {
  id: string;
  label: string;
  helper?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * The app's one on/off switch. A pill track with a white knob that slides
 * left (off) → right (on); grey track off, purple on. ON/OFF sits inside
 * the track on the side opposite the knob, so it's always visible.
 *
 * The knob is pinned with left-0.5 and moved only by translate — without
 * an explicit `left`, an absolute child of a <button> starts from the
 * button's centred static position, which pushed the knob off the track.
 *
 * Track 60×28, knob 24 + 2px inset each side → travel 60 − 24 − 4 = 32px (translate-x-8).
 */
export function Toggle({ id, label, helper, checked, onChange }: ToggleProps) {
  const t = useTranslations("common");
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
        className={`relative h-7 w-[60px] shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-reduce:transition-none ${
          checked ? "bg-accent dark:bg-accent-hover" : "bg-switch-track"
        }`}
      >
        {/* State text on the side opposite the knob; the state itself is announced via aria-checked. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 flex items-center text-[10px] font-bold uppercase leading-none tracking-wide ${
            checked ? "left-2 text-white" : "right-2 text-text-primary"
          }`}
        >
          {checked ? t("switchOn") : t("switchOff")}
        </span>
        <span
          aria-hidden
          className={`pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-md ring-1 ring-black/10 transition-transform duration-200 motion-reduce:transition-none ${
            checked ? "translate-x-8" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
