"use client";

import { Children, forwardRef, isValidElement, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { useDropdown, DropdownList, type DropdownOption } from "@/components/ui/Dropdown";

// Deliberately NOT SelectHTMLAttributes<HTMLSelectElement> — there is no
// real <select> underneath any more (see the header comment below), and
// no caller in this app ever passed anything beyond these props (grepped
// every SelectField usage before this rewrite).
export interface SelectFieldProps {
  id: string;
  label?: string;
  value: string;
  /**
   * Structurally compatible with a native onChange handler — every caller
   * reads only `event.target.value`, never anything else off the event,
   * so this needs no real Event object and no caller needs to change.
   */
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  hasError?: boolean;
  error?: string;
  /** <option> elements, same as a native <select> — parsed into options below. */
  children?: ReactNode;
}

// A native <select>'s open menu is rendered by the browser/OS and can't be
// constrained by CSS — on mobile this let it open past the SlideOverPanel/
// viewport edge (the same root cause FilterDropdown was already built to
// avoid, in SetupToolbar.tsx). This is that same custom-dropdown mechanism
// (see Dropdown.tsx) wearing the InputField-matching visual SelectField has
// always had. The <option>-children API is kept EXACTLY as before so every
// existing call site (11 files) needs zero changes.
function parseOptions(children: ReactNode): DropdownOption[] {
  const options: DropdownOption[] = [];
  const visit = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === "option") {
        const optionProps = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
        const value = optionProps.value !== undefined ? String(optionProps.value) : "";
        const label =
          typeof optionProps.children === "string" || typeof optionProps.children === "number"
            ? String(optionProps.children)
            : "";
        options.push({ value, label, disabled: optionProps.disabled });
        return;
      }
      // Fragments (<>...</>) from a ternary/&& branch — recurse so their
      // <option> children are still found.
      const childProps = child.props as { children?: ReactNode } | undefined;
      if (childProps && "children" in childProps) {
        visit(childProps.children);
      }
    });
  };
  visit(children);
  return options;
}

export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(
  ({ id, label, value, onChange, disabled, hasError, error, children }, ref) => {
    const options = parseOptions(children);
    const {
      isOpen,
      openUpward,
      highlightedIndex,
      setHighlightedIndex,
      containerRef,
      toggle,
      commitIndex,
      handleTriggerKeyDown,
      handleListKeyDown,
    } = useDropdown({
      options,
      value,
      onCommit: (next) => onChange({ target: { value: next } }),
      disabled,
    });

    const selected = options.find((option) => option.value === value);
    const listboxId = `${id}-listbox`;

    return (
      <div ref={containerRef} className="flex w-full flex-col gap-1.5">
        {label ? (
          <label htmlFor={id} className="text-sm font-medium text-text-primary">
            {label}
          </label>
        ) : null}
        <div className="relative">
          <button
            id={id}
            ref={ref}
            type="button"
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError && error ? `${id}-error` : undefined}
            disabled={disabled}
            onClick={toggle}
            onKeyDown={(event) => (isOpen ? handleListKeyDown(event) : handleTriggerKeyDown(event))}
            className={`flex h-12 w-full items-center rounded-md border bg-surface px-4 pr-10 text-left text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
              hasError ? "border-error" : "border-border"
            }`}
          >
            <span className="truncate">{selected?.label ?? ""}</span>
          </button>
          <ChevronDownIcon
            className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            }`}
          />

          {isOpen ? (
            <DropdownList
              id={listboxId}
              options={options}
              value={value}
              highlightedIndex={highlightedIndex}
              openUpward={openUpward}
              onHover={setHighlightedIndex}
              onCommit={commitIndex}
            />
          ) : null}
        </div>
        {hasError && error ? (
          <p id={`${id}-error`} className="text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

SelectField.displayName = "SelectField";
