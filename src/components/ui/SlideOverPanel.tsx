"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { Button } from "@/components/ui/Button";

const TRANSITION_MS = 300;
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type SlideOverPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Overrides the default Cancel/Save footer entirely. */
  footer?: ReactNode;
  onSave?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  saveDisabled?: boolean;
};

/**
 * Reusable right-side slide-over drawer (bottom sheet on mobile). Used by
 * every settings edit panel and intended for reuse by future edit flows
 * elsewhere in the app.
 */
export function SlideOverPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  onSave,
  saveLabel,
  cancelLabel,
  isSaving,
  saveDisabled,
}: SlideOverPanelProps) {
  const t = useTranslations();
  const [shouldRender, setShouldRender] = useState(isOpen);
  // True once the open animation has finished and the panel is just
  // sitting still. Firefox for Android has a long-standing bug where a
  // native <input type="date">/"time" picker fails to open when the
  // input's ancestor chain has ANY CSS `transform`, even an at-rest
  // `translateY(0)` from `transition-transform` — which this panel always
  // carries while open, for the slide animation. Chrome isn't affected,
  // matching the reported "works on Chrome mobile, not Firefox mobile".
  // Once settled, translateY(0)/translateX(0) and "no transform at all"
  // render identically (the box doesn't move), so it's safe to drop the
  // transform classes entirely at that point — Firefox then sees no
  // transformed ancestor when the field is tapped. The classes come back
  // the instant `isOpen` goes false, so the closing slide-out is untouched.
  const [isSettled, setIsSettled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`slide-over-title-${Math.random().toString(36).slice(2)}`).current;

  // Read via a ref inside the effect below instead of depending on `onClose`
  // directly. A caller that keeps its own form state in the SAME component
  // that defines `onClose` (e.g. CrudScreen) hands this a fresh function
  // identity on every keystroke — if the effect depended on it, it would
  // tear down and re-run its focus-trap setup after every character typed,
  // which includes an imperative panelRef.current.focus() that yanks focus
  // off whatever input the user is actively typing into. This ref sync is
  // a plain assignment with no side effects, so it's safe to re-run on
  // every render regardless of how often `onClose` changes identity.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      return;
    }
    const timeout = setTimeout(() => setShouldRender(false), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsSettled(false);
      return;
    }
    const timeout = setTimeout(() => setIsSettled(true), TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
    // Deliberately NOT depending on onClose — see onCloseRef above. This
    // effect should only ever re-run when the panel opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-2xl bg-surface shadow-xl outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:max-w-md sm:rounded-t-none ${
          isSettled
            ? ""
            : `transition-transform duration-300 ease-out ${
                isOpen
                  ? "translate-y-0 sm:translate-x-0"
                  : "translate-y-full sm:translate-x-full sm:translate-y-0"
              }`
        }`}
      >
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1.5 w-10 rounded-full bg-border" />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-text-secondary">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
          {footer ?? (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                {cancelLabel ?? t("common.cancel")}
              </Button>
              {onSave ? (
                <Button
                  type="button"
                  variant="accent"
                  onClick={onSave}
                  disabled={isSaving || saveDisabled}
                >
                  {isSaving ? t("common.saving") : saveLabel ?? t("common.save")}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
