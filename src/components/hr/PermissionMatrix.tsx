"use client";

import { useTranslations } from "next-intl";
import type { PermissionCatalog } from "@/lib/hr/hrTypes";

type PermissionMatrixProps = {
  /** The backend catalog (GET erp/permission-catalog) — the only list of permissions the UI offers. */
  catalog: PermissionCatalog;
  value: string[];
  onChange: (permissions: string[]) => void;
};

function humanize(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key;
}

/**
 * One row per catalog module, with that module's own permissions as
 * checkboxes (modules can differ — e.g. staff is just View + Manage). A
 * row's own checkbox toggles the whole module. Labels: our EN/FR string
 * when we have one for the key, else the backend's label, else the key.
 */
export function PermissionMatrix({ catalog, value, onChange }: PermissionMatrixProps) {
  const t = useTranslations();
  const selected = new Set(value);

  const moduleLabel = (key: string, label: string | null) =>
    t.has(`hr.permissions.modules.${key}`) ? t(`hr.permissions.modules.${key}`) : (label ?? humanize(key));
  const actionLabel = (action: string, label: string | null) =>
    t.has(`hr.permissions.actions.${action}`) ? t(`hr.permissions.actions.${action}`) : (label ?? humanize(action));

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  const toggleModule = (keys: string[]) => {
    const allOn = keys.every((key) => selected.has(key));
    const next = new Set(selected);
    for (const key of keys) {
      if (allOn) next.delete(key);
      else next.add(key);
    }
    onChange(Array.from(next));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-text-primary">{t("hr.permissionGroups.fields.permissions.label")}</legend>
      <p className="-mt-1 text-xs text-text-muted">{t("hr.permissionGroups.fields.permissions.helper")}</p>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {catalog.modules.map((module) => {
          const keys = module.permissions.map((entry) => entry.key);
          const onCount = keys.filter((key) => selected.has(key)).length;
          const name = moduleLabel(module.key, module.label);
          return (
            <li key={module.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2.5 text-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={keys.length > 0 && onCount === keys.length}
                  ref={(node) => {
                    if (node) node.indeterminate = onCount > 0 && onCount < keys.length;
                  }}
                  onChange={() => toggleModule(keys)}
                  className="h-4 w-4 shrink-0 rounded border-border accent-accent"
                />
                {name}
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-6 sm:pl-0">
                {module.permissions.map((entry) => (
                  <label key={entry.key} className="flex items-center gap-1.5 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      aria-label={`${name} — ${actionLabel(entry.action, entry.label)}`}
                      checked={selected.has(entry.key)}
                      onChange={() => toggle(entry.key)}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                    {actionLabel(entry.action, entry.label)}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
