import type { ReactNode } from "react";

/**
 * Shared shape for the ~29 Setup CRUD screens (Setup-1 establishes the
 * pattern with Academic Years). A new screen provides: columns, a
 * CrudService, a form-fields renderer, and rowActions — everything else
 * (table, search, filters, pagination, add/edit panel, confirm dialog) is
 * generic. See CrudScreen.tsx, DataTable.tsx, useCrudTable.ts.
 */

export type ColumnDef<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

/** A card's fixed layout (title/description/badge/tags), for screens whose Figma is a card grid rather than a table — e.g. School Types. */
export type CardFieldsDef<T> = {
  title: (row: T) => string;
  description?: (row: T) => string | null | undefined;
  badge?: (row: T) => ReactNode;
  /** Rendered as a row of small pill chips between the description and the actions footer — e.g. School Types' active class chips. */
  tags?: (row: T) => string[];
};

// A discriminated union rather than two optional props on CrudScreen — a
// screen provides exactly one display shape, enforced at the type level
// (can't accidentally pass both `columns` and `card`, or neither).
export type CrudDisplay<T> =
  | { mode: "table"; columns: ColumnDef<T>[] }
  | { mode: "cards"; card: CardFieldsDef<T> };

export type FilterOption = { value: string; label: string };
export type FilterDef = { key: string; label: string; options: FilterOption[] };

export type RowAction<T> = {
  key: string;
  label: string;
  onClick: (row: T) => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  /** Shown as the button's title attribute when disabled — e.g. "Can't delete the active year". */
  disabledReason?: string;
  /** Present -> ConfirmDialog shows before onClick runs. Absent -> onClick runs immediately. */
  confirm?: { title: string; message: string };
};

// 409 gets its own kind (distinct from a generic 4xx/5xx "server" error)
// because at least one mutation per screen tends to have a real, explained
// conflict case (e.g. "can't delete the active year") that deserves a
// specific message, not a generic failure banner.
//
// `message`, where present, is the backend's own error text (from an ERP
// `{success:false, error:{code,message}}` body — see erpError.ts) — kinds
// that can carry one prefer it over their generic i18n fallback in
// CrudScreen's resultErrorMessage(), so e.g. "can't delete: 3 school types
// still reference this award body" reaches the user verbatim instead of a
// generic "conflict" banner. Kinds with no realistic per-request backend
// text (network failure, the dev-bypass guard) don't carry one.
export type CrudResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "forbidden"; message?: string }
  | { ok: false; kind: "validation"; errors: Array<{ field: string; message?: string }> }
  | { ok: false; kind: "conflict"; message?: string }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "server"; message?: string }
  // DEV-ONLY: same guard as settingsApi.ts — the local dev-auth-bypass
  // token must never reach a real endpoint.
  | { ok: false; kind: "devBypassUnavailable" };

/**
 * `customActions` covers per-entity actions beyond create/update/delete —
 * e.g. Academic Years' POST /:id/activate. Keyed by an action name the
 * screen's rowActions() choose to invoke via the `runCustom` helper
 * CrudScreen passes down.
 */
export type CrudService<T, CreateInput, UpdateInput> = {
  list: () => Promise<CrudResult<T[]>>;
  create: (data: CreateInput) => Promise<CrudResult<T>>;
  update: (id: string, data: UpdateInput) => Promise<CrudResult<T>>;
  remove: (id: string) => Promise<CrudResult<void>>;
  customActions?: Record<string, (id: string) => Promise<CrudResult<T>>>;
};

/**
 * Everything DataTable and CardGrid have in common — both are just a
 * presentation of the same useCrudTable state, wrapped in the same
 * SetupToolbar/SetupPagination. Each extends this with only its own
 * display-specific prop (`columns` or `card`).
 */
export type SetupListBaseProps<T> = {
  rows: T[];
  getRowId: (row: T) => string;
  rowActions?: (row: T) => RowAction<T>[];

  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;

  filters?: Array<{ def: FilterDef; value: string; onChange: (value: string) => void }>;

  onAddNew?: () => void;
  addNewLabel?: string;

  isLoading: boolean;
  errorMessage: string | null;
  onRetry?: () => void;
  emptyMessage: string;

  page: number;
  totalPages: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};
