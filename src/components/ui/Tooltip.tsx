"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  /** Wrapper classes for the trigger (e.g. to match inline table-cell flow). */
  triggerClassName?: string;
};

type Coords = { top: number; left: number; openAbove: boolean };

const PANEL_MAX_WIDTH = 280;
const VIEWPORT_MARGIN = 8;

/**
 * Generic hover/focus/tap tooltip. Portaled into document.body and
 * positioned via `position: fixed` from the trigger's measured
 * getBoundingClientRect(), same technique as ActionsMenu.tsx and for the
 * same reason: a plain CSS-`absolute` panel would be clipped by
 * DataTable's `overflow-x-auto` table wrapper wherever this is used inside
 * a table cell (the CSS2.1 "mixed overflow" rule — see ActionsMenu.tsx's
 * own header comment for the full explanation).
 *
 * Accessible: opens on hover (mouse) AND focus (keyboard Tab) via a real
 * `<button>` trigger with `aria-describedby` pointing at the portaled
 * `role="tooltip"` panel; a tap toggles it open/closed on touch devices,
 * which have no hover state to begin with.
 */
export function Tooltip({ content, children, triggerClassName }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();

  const close = () => setIsOpen(false);
  const open = () => setIsOpen(true);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const openAbove = spaceAbove > 120;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left + rect.width / 2 - PANEL_MAX_WIDTH / 2),
      window.innerWidth - PANEL_MAX_WIDTH - VIEWPORT_MARGIN,
    );
    setCoords({ top: openAbove ? rect.top - 8 : rect.bottom + 8, left, openAbove });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  return (
    <button
      ref={triggerRef}
      type="button"
      className={`inline-flex cursor-default items-center text-left ${triggerClassName ?? ""}`}
      aria-describedby={isOpen ? tooltipId : undefined}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      onClick={() => setIsOpen((current) => !current)}
    >
      {children}
      {isOpen && coords
        ? createPortal(
            <div
              id={tooltipId}
              role="tooltip"
              style={{ position: "fixed", top: coords.top, left: coords.left, maxWidth: PANEL_MAX_WIDTH }}
              className={`z-50 rounded-md bg-text-primary px-3 py-2 text-xs text-white shadow-lg ${
                coords.openAbove ? "-translate-y-full" : ""
              }`}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </button>
  );
}
