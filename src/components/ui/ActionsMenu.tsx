"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ActionsMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
};

type MenuCoords = { top: number; left: number; openUpward: boolean };

type ActionsMenuProps = {
  /** Renders the trigger button — ActionsMenu owns open/close state and wires it in. */
  trigger: (args: { isOpen: boolean; toggle: () => void }) => ReactNode;
  items: ActionsMenuItem[];
  /** Wrapper classes for the trigger (e.g. "w-full sm:w-auto" to match sibling toolbar buttons). */
  triggerClassName?: string;
  menuLabel?: string;
};

const PANEL_WIDTH = 224; // w-56
const PANEL_ESTIMATED_HEIGHT = 280;
const VIEWPORT_MARGIN = 8;

/**
 * Generic "button that opens a small menu of actions" — shared by the
 * Students toolbar's "More" bulk-actions button and each row's "⋮" actions
 * menu (src/components/students/{MoreActionsMenu,StudentRowActionsMenu}.tsx).
 *
 * Renders its panel through a portal into document.body, positioned via
 * `position: fixed` from the trigger's measured getBoundingClientRect(),
 * rather than a CSS-relative `absolute` panel (ExportMenu.tsx's simpler
 * pattern). That's necessary here specifically because the row-level
 * trigger lives inside DataTable's `overflow-x-auto` table wrapper — an
 * absolute-positioned panel would be clipped by that scroll container
 * (overflow-x-auto implicitly computes overflow-y as "auto" too per the
 * CSS2.1 "mixed overflow" rule, not "visible"). Portaling to body sidesteps
 * that entirely, which is what "viewport-safe" means for this one.
 */
export function ActionsMenu({ trigger, items, triggerClassName, menuLabel }: ActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((current) => !current);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < PANEL_ESTIMATED_HEIGHT && rect.top > PANEL_ESTIMATED_HEIGHT;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - PANEL_WIDTH),
      window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN,
    );
    setCoords({
      top: openUpward ? rect.top - 8 : rect.bottom + 8,
      left,
      openUpward,
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    // Scroll/resize invalidates the measured position — close rather than
    // track continuously, same tradeoff a native <select> menu makes.
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
    <div ref={triggerRef} className={triggerClassName}>
      {trigger({ isOpen, toggle })}
      {isOpen && coords
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={menuLabel}
              style={{ position: "fixed", top: coords.top, left: coords.left, width: PANEL_WIDTH }}
              className={`z-50 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg ${
                coords.openUpward ? "-translate-y-full" : ""
              }`}
            >
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onClick();
                  }}
                  className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                    item.variant === "danger" ? "text-error" : "text-text-primary"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
