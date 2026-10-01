"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { useDialogBehavior } from "@/components/ui/useDialogBehavior";

export type WideModalProps = {
  isOpen: boolean;
  /** Esc / backdrop click / X button all call this directly — if the caller wants a "discard changes?" confirm first, gate it inside this callback. */
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Scrollable body. */
  children: ReactNode;
  /** No built-in Cancel/Save footer (unlike SlideOverPanel) — the Add Student wizard needs three independent actions (Back / Save Draft / Next), not a fixed pair, so the caller always supplies its own. */
  footer: ReactNode;
  /** "xl" (max-w-4xl, default) | "2xl" (max-w-6xl) — widen a specific usage if its content ever feels cramped. */
  size?: "xl" | "2xl";
};

const SIZE_CLASSES: Record<NonNullable<WideModalProps["size"]>, string> = {
  xl: "sm:max-w-4xl",
  "2xl": "sm:max-w-6xl",
};

/**
 * Centered wide dialog — SlideOverPanel (max-w-md right-edge drawer, fixed
 * Cancel/Save footer) is the wrong shape for a long multi-step form.
 * Shares SlideOverPanel's proven overlay mechanics via useDialogBehavior.ts
 * rather than reimplementing them.
 *
 * Mobile (below `sm`): full-screen, edge-to-edge — the same "go full-bleed
 * on small screens rather than a shrunk floating card" choice
 * SlideOverPanel already makes for its own bottom-sheet, for the same
 * reason (a 4xl/6xl dialog scaled down to 375px would leave unreadable
 * margins). Header is sticky-top and footer sticky-bottom so both stay
 * reachable while the body scrolls.
 */
export function WideModal({ isOpen, onClose, title, subtitle, children, footer, size = "xl" }: WideModalProps) {
  const t = useTranslations();
  const { shouldRender, isSettled, panelRef, titleId } = useDialogBehavior(isOpen, onClose);

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
        className={`absolute inset-0 flex h-full w-full flex-col bg-surface shadow-xl outline-none sm:inset-x-0 sm:inset-y-6 sm:mx-auto sm:h-[calc(100%-3rem)] sm:w-full sm:rounded-2xl ${SIZE_CLASSES[size]} ${
          isSettled
            ? ""
            : `transition-all duration-300 ease-out ${isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"}`
        }`}
      >
        <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4 sm:px-8 sm:py-5">
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

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">{children}</div>

        <div className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 sm:px-8">
          {footer}
        </div>
      </div>
    </div>
  );
}
