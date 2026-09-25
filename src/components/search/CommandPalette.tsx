"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SearchIcon } from "@/components/icons/header/SearchIcon";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { useSearchIndex } from "@/lib/search/useSearchIndex";
import type { SearchEntry, SearchGroup } from "@/lib/search/searchTypes";

function matchesQuery(entry: SearchEntry, query: string): boolean {
  return (
    entry.title.toLowerCase().includes(query) ||
    !!entry.description?.toLowerCase().includes(query) ||
    !!entry.keywords?.some((keyword) => keyword.toLowerCase().includes(query))
  );
}

/**
 * Only ever rendered while open (Header.tsx conditionally mounts this via
 * next/dynamic, ssr:false — see the comment there) — no `isOpen` prop, just
 * `onClose`. Substring match only (case-insensitive), not real
 * typo-tolerant fuzzy search — that would mean a new dependency (e.g.
 * Fuse.js) for phase 1's few dozen entries; flagged as a reasonable future
 * addition, not built now.
 */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const groups = useSearchIndex();

  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Prevents background scroll while the overlay is open — same reasoning
    // as SlideOverPanel's own body-scroll lock.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const trimmedQuery = query.trim().toLowerCase();

  // Empty query -> "a few common destinations" is just the Navigation
  // group as-is (already a short, top-level list) — Settings/Setup only
  // appear once the user actually types something, to avoid dumping every
  // entry in the index on first open.
  const visibleGroups: SearchGroup[] = useMemo(() => {
    if (!trimmedQuery) {
      const navigationGroup = groups.find((group) => group.key === "navigation");
      return navigationGroup ? [navigationGroup] : [];
    }
    return groups
      .map((group) => ({ ...group, entries: group.entries.filter((entry) => matchesQuery(entry, trimmedQuery)) }))
      .filter((group) => group.entries.length > 0);
  }, [groups, trimmedQuery]);

  const flatEntries = useMemo(() => visibleGroups.flatMap((group) => group.entries), [visibleGroups]);
  const indexById = useMemo(() => new Map(flatEntries.map((entry, index) => [entry.id, index])), [flatEntries]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [trimmedQuery]);

  const navigateTo = (entry: SearchEntry) => {
    router.push(entry.href);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, flatEntries.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = flatEntries[highlightedIndex] ?? flatEntries[0];
      if (entry) navigateTo(entry);
    }
    // Escape is handled by the document-level listener above, so it still
    // closes the palette even if focus ever ends up somewhere else.
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 sm:p-4 sm:pt-24"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.paletteLabel")}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-surface shadow-xl sm:h-auto sm:max-h-[70vh] sm:max-w-lg sm:rounded-xl sm:border sm:border-border"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-listbox"
            aria-activedescendant={flatEntries[highlightedIndex]?.id}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("common.searchPlaceholder")}
            className="w-full min-w-0 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-text-muted sm:block">
            Esc
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="shrink-0 text-text-muted transition-colors hover:text-text-primary sm:hidden"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div id="command-palette-listbox" role="listbox" className="flex-1 overflow-y-auto p-2">
          {flatEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <p className="text-sm text-text-primary">{t("search.noResults")}</p>
              <p className="text-xs text-text-muted">{t("search.noResultsHint")}</p>
            </div>
          ) : (
            visibleGroups.map((group) => (
              <div key={group.key} role="group" aria-label={group.label} className="mb-2 last:mb-0">
                <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {group.label}
                </p>
                {group.entries.map((entry) => {
                  const flatIndex = indexById.get(entry.id) ?? -1;
                  const isHighlighted = flatIndex === highlightedIndex;
                  return (
                    <button
                      key={entry.id}
                      id={entry.id}
                      role="option"
                      aria-selected={isHighlighted}
                      type="button"
                      onMouseEnter={() => setHighlightedIndex(flatIndex)}
                      onClick={() => navigateTo(entry)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                        isHighlighted ? "bg-brand-tint text-accent" : "text-text-primary hover:bg-background"
                      }`}
                    >
                      <span className="truncate">{entry.title}</span>
                      {entry.description ? (
                        <span className="shrink-0 truncate text-xs text-text-muted">{entry.description}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
