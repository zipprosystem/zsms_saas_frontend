/**
 * Phase 1 (this file): client-side only, built from existing app config —
 * sidebar nav, Settings sections, Setup screens. No fetches.
 *
 * PHASE 2 SEAM: `SearchGroup` is a plain { key, label, entries } shape, not
 * three hardcoded fields — a future backend search API (Students/Staff/
 * Classes by name) plugs in as additional SearchGroup entries (e.g.
 * { key: "students", label: t("search.groups.students"), entries: [...] })
 * returned alongside these client-side groups, with no change needed to
 * CommandPalette's rendering/keyboard-nav logic, which already just maps
 * over whatever groups it's given.
 */
export type SearchEntry = {
  /** Stable React key — also becomes the option's DOM id for aria-activedescendant. */
  id: string;
  /** Already-translated display text. */
  title: string;
  href: string;
  /** e.g. a "Coming soon" badge for an unbuilt Setup screen, or a short hint. */
  description?: string;
  /** Extra match terms beyond the title — e.g. "WAEC" for Award Bodies. Not shown, only matched against. */
  keywords?: string[];
};

export type SearchGroup = {
  key: string;
  label: string;
  entries: SearchEntry[];
};
