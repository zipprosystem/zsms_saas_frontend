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
export type CrudResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "forbidden" }
  | { ok: false; kind: "validation"; errors: Array<{ field: string; message?: string }> }
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "network" }
  | { ok: false; kind: "server" }
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
