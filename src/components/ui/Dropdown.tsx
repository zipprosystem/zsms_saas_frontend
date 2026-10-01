"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

/**
 * Shared mechanics behind every custom (non-native) dropdown in this app —
 * originally just SetupToolbar's FilterDropdown, now also SelectField
 * (src/components/ui/Select.tsx). A native <select>'s open menu is drawn
 * by the browser/OS and can't be constrained by CSS at all — on mobile
 * this let it render past the SlideOverPanel/viewport edge. Every
 * consumer here instead renders its OWN listbox as a normal, CSS-
 * positioned DOM child (`left-0 right-0` ties its width to its own
 * trigger, never wider than the parent), so it can never overshoot.
 *
 * Extracted so FilterDropdown and SelectField share ONE implementation of
 * click-outside, Escape, ArrowUp/Down/Enter, and the open-upward-near-the-
 * bottom-of-the-viewport flip, rather than two separately-maintained ones.
 */
export type DropdownOption = { value: string; label: string; disabled?: boolean };

type UseDropdownArgs = {
  options: DropdownOption[];
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
};

export function useDropdown({ options, value, onCommit, disabled }: UseDropdownArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Decided once per open, against the viewport — not the nearest
  // scrolling ancestor (e.g. SlideOverPanel's own overflow-y-auto body),
  // so a dropdown low in a long form still opens downward if the *page*
  // has room, and only flips up once it's genuinely near the bottom of
  // the visible screen. max-h-60 on the list (~240px) keeps either
  // direction reasonably contained even close to an edge.
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const estimatedMenuHeight = Math.min(options.length, 6) * 36 + 16;
    setOpenUpward(
      rect.bottom + estimatedMenuHeight > window.innerHeight && rect.top - estimatedMenuHeight > 0,
    );
  }, [isOpen, options.length]);

  const open = () => {
    if (disabled || options.length === 0) return;
    const currentIndex = options.findIndex((option) => option.value === value);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    setIsOpen(true);
  };
  const close = () => setIsOpen(false);
  const toggle = () => (isOpen ? close() : open());

  const commitIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onCommit(option.value);
    close();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) open();
    } else if (event.key === "Escape") {
      close();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitIndex(highlightedIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  };

  return {
    isOpen,
    openUpward,
    highlightedIndex,
    setHighlightedIndex,
    containerRef,
    open,
    close,
    toggle,
    commitIndex,
    handleTriggerKeyDown,
    handleListKeyDown,
  };
}

type DropdownListProps = {
  id?: string;
  options: DropdownOption[];
  value: string;
  highlightedIndex: number;
  openUpward: boolean;
  onHover: (index: number) => void;
  onCommit: (index: number) => void;
  /** Extra classes appended to the base positioning — e.g. FilterDropdown letting its list grow wider than its (narrower) trigger on desktop. */
  listClassName?: string;
};

/** The positioned `<ul role="listbox">` itself — same markup for every consumer. */
export function DropdownList({
  id,
  options,
  value,
  highlightedIndex,
  openUpward,
  onHover,
  onCommit,
  listClassName,
}: DropdownListProps) {
  return (
    <ul
      id={id}
      role="listbox"
      className={`absolute left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg ${
        openUpward ? "bottom-full mb-1" : "top-full mt-1"
      } ${listClassName ?? ""}`}
    >
      {options.map((option, index) => (
        <li key={option.value} role="option" aria-selected={option.value === value}>
          <button
            type="button"
            disabled={option.disabled}
            // Prevents the trigger from losing focus (which would fire the
            // click-outside handler) before the click itself registers.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onCommit(index)}
            className={`block w-full truncate px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              index === highlightedIndex ? "bg-brand-tint text-accent" : "text-text-primary hover:bg-background"
            }`}
          >
            {option.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
