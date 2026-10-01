"use client";

import { useEffect, useRef, useState } from "react";

export const DIALOG_TRANSITION_MS = 300;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared overlay mechanics, extracted out of SlideOverPanel.tsx (its
 * original home) so WideModal.tsx can reuse the exact same proven
 * behavior — focus trap, Esc-to-close, body-scroll-lock, and the
 * shouldRender/isSettled transform-removal-after-settle trick (Firefox for
 * Android fails to open a native <input type="date">/"time" picker when
 * any ancestor carries a CSS `transform`, even an at-rest
 * `translateY(0)`/`scale(1)` from `transition-transform` while open — both
 * dialogs have date inputs, so both need this) — rather than copy-pasting
 * the effect block a second time.
 */
export function useDialogBehavior(isOpen: boolean, onClose: () => void) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isSettled, setIsSettled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`).current;

  // Read via a ref inside the effect below instead of depending on
  // `onClose` directly — a caller that keeps its own form state in the
  // SAME component that defines `onClose` hands this a fresh function
  // identity on every keystroke; depending on it would tear down and
  // re-run focus-trap setup after every character typed, which includes an
  // imperative panelRef.current.focus() that yanks focus off whatever
  // input the user is actively typing into.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      return;
    }
    const timeout = setTimeout(() => setShouldRender(false), DIALOG_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsSettled(false);
      return;
    }
    const timeout = setTimeout(() => setIsSettled(true), DIALOG_TRANSITION_MS);
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
    // effect should only ever re-run when the dialog opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return { shouldRender, isSettled, panelRef, titleId };
}
